import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { AuditPackageService } from '../audit-package.service';
import { AuditPackageStateMachineService } from '../audit-package-state-machine.service';

/**
 * ContentHashService's canonicalization treats any object via
 * Object.keys() — a raw Date has no enumerable own properties, so it
 * silently collapses to {} instead of its value. Every Date going into
 * hashed content must be pre-stringified, matching the established
 * convention from Part 9+10 (e.g. ActionApproval's approvalExpiresAt).
 * The bug this guards against: hashing the same logical content once as
 * live Date objects (at build time) and once as JSON.parse'd ISO strings
 * (at freeze time) produces two different hashes for identical data.
 */
function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

const VERIFIER_PROFILE = {
  minVerifierVersion: '1.0.0',
  verifierSourceVersion: '1.0.0',
  treeProfile: 'ZS-MERKLE-V1',
  hashAlgorithm: 'SHA-256',
  canonicalizationProfile: 'zs-manifest-v1',
};

/**
 * Assembles ManifestCore only — no anchor proof yet (spec correction #1/#6).
 * The content list here is exhaustive on purpose so the offline verifier
 * never needs to trust the live platform for anything (correction #6).
 */
@Injectable()
export class AuditPackageBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
    private readonly auditPackageService: AuditPackageService,
    private readonly stateMachine: AuditPackageStateMachineService,
  ) {}

  async build(tenantId: string, packageId: string) {
    const pkg = await this.auditPackageService.assertMutable(tenantId, packageId);
    this.stateMachine.assertValidTransition(pkg.status, 'BUILDING');
    await this.prisma.auditPackage.update({ where: { id: pkg.id }, data: { status: 'BUILDING' } });

    const assessments = await this.prisma.assessment.findMany({
      where: { tenant_id: tenantId, assessment_period_start: { gte: pkg.period_start }, assessment_period_end: { lte: pkg.period_end } },
    });

    const evidenceBundleIds = assessments.map((a) => a.evidence_bundle_id).filter((id): id is string => !!id);
    const evaluationRunIds = assessments.map((a) => a.evaluation_run_id).filter((id): id is string => !!id);

    const [evidenceBundles, evaluationRuns, deficiencies] = await Promise.all([
      this.prisma.evidenceBundle.findMany({ where: { id: { in: evidenceBundleIds } } }),
      this.prisma.evaluationRun.findMany({ where: { id: { in: evaluationRunIds } } }),
      this.prisma.controlDeficiency.findMany({ where: { assessment_id: { in: assessments.map((a) => a.id) } } }),
    ]);

    const evidenceRefsUnion = Array.from(new Set(evidenceBundles.flatMap((b) => JSON.parse(b.evidence_refs) as string[])));
    const evidenceRecords = await this.prisma.evidenceRecord.findMany({ where: { id: { in: evidenceRefsUnion } } });
    const ledgerEntries = await this.prisma.evidenceLedgerEntry.findMany({
      where: { tenant_id: tenantId, evidence_id: { in: evidenceRefsUnion } },
      orderBy: { sequence: 'asc' },
    });

    const risks = await this.prisma.risk.findMany({ where: { tenant_id: tenantId, source_id: { in: deficiencies.map((d) => d.id) } } });
    const riskIds = risks.map((r) => r.id);
    const exceptions = await this.prisma.exception.findMany({ where: { tenant_id: tenantId, risk_id: { in: riskIds } } });
    const gaps = await this.prisma.evidenceGap.findMany({ where: { tenant_id: tenantId, period_start: { gte: pkg.period_start }, period_end: { lte: pkg.period_end } } });

    const evidenceIndex = evidenceRecords.map((e) => ({
      evidenceId: e.id,
      contentHash: e.content_hash,
      mediaType: e.media_type,
      source: e.source_system_id,
      collector: e.collector_id,
      collectorVersion: e.collector_version,
      periodStart: toIso(e.period_start),
      periodEnd: toIso(e.period_end),
      integrityState: e.integrity_state,
      freshnessState: e.freshness_state,
      completenessState: e.completeness_state,
      vaultReference: e.vault_reference,
      reasonForInclusion: 'Referenced by an EvidenceBundle within this package scope/period',
    }));

    const evaluationIndex = evaluationRuns.map((r) => ({
      controlTestVersionId: r.control_test_version_id,
      evaluatorVersionId: r.evaluator_version_id,
      inputBundleHash: r.input_bundle_hash,
      outputHash: r.output_hash,
      result: r.result,
      limitations: JSON.parse(r.limitations),
      replayOfId: r.replay_of_id,
      deterministicProfile: r.deterministic_profile,
    }));

    const assessmentIndex = assessments.map((a) => ({
      assessmentId: a.id,
      controlImplementationId: a.control_implementation_id,
      controlTestVersionId: a.control_test_version_id,
      status: a.status,
      effectiveness: a.effectiveness,
      completenessState: a.completeness_state,
      freshnessState: a.freshness_state,
      integrityState: a.integrity_state,
      performerId: a.performer_id,
      reviewerId: a.reviewer_id,
      reviewedAt: toIso(a.reviewed_at),
    }));

    const knownGaps = [
      ...gaps.map((g) => ({ type: 'EVIDENCE_GAP', reason: g.reason, periodStart: toIso(g.period_start), periodEnd: toIso(g.period_end), status: g.status })),
      ...assessments.filter((a) => a.status === 'EVIDENCE_INCOMPLETE').map((a) => ({ type: 'INCOMPLETE_ASSESSMENT', assessmentId: a.id })),
    ];

    const limitations: string[] = [];
    for (const a of assessments) {
      const parsed: string[] = JSON.parse(a.limitations || '[]');
      limitations.push(...parsed);
    }
    for (const exception of exceptions) {
      if (exception.status === 'EXPIRED') limitations.push(`Exception ${exception.id} expired ${exception.expires_at.toISOString()}`);
    }

    const manifestCore = {
      tenantId,
      scope: { frameworkScope: JSON.parse(pkg.framework_scope), legalEntityScope: pkg.legal_entity_scope, environmentScope: pkg.environment_scope },
      period: { start: toIso(pkg.period_start), end: toIso(pkg.period_end) },
      schemaBundle: { id: 'zs-audit-package-manifest-v1', hash: 'zs-audit-package-manifest-v1-hash' },
      frameworkVersions: [],
      mappingVersions: [],
      evidenceIndex,
      // Ledger range/head proof (spec correction #6). This is the segment
      // of the tenant's evidence ledger covering the evidence included
      // here, not the whole chain — sufficient for the verifier to walk
      // previous_entry_hash -> entry_hash link consistency (the same
      // structural check EvidenceLedgerService.verifyChain performs
      // live). Note this is a link-consistency check, not a from-scratch
      // entry_hash recomputation — the raw evidenceMetadata baked into
      // each entry_hash at write time isn't persisted verbatim, so it
      // can't be independently re-derived; the verifier's report says so
      // explicitly rather than overclaiming.
      ledgerEntries: ledgerEntries.map((e) => ({ sequence: e.sequence, evidenceId: e.evidence_id, previousEntryHash: e.previous_entry_hash, entryHash: e.entry_hash })),
      evaluationIndex,
      assessmentIndex,
      riskIndex: risks.map((r) => ({ riskId: r.id, title: r.title, likelihood: r.likelihood, impact: r.impact, status: r.status })),
      exceptionIndex: exceptions.map((e) => ({ exceptionId: e.id, status: e.status, expiresAt: toIso(e.expires_at) })),
      knownGaps,
      limitations,
      verifierProfile: VERIFIER_PROFILE,
      exportMetadata: { builtAt: new Date().toISOString(), packageVersion: pkg.version },
    };

    const { contentHash: manifestCoreHash } = this.hashService.hashCanonicalJson(manifestCore);

    await this.prisma.auditPackageManifest.upsert({
      where: { package_id: pkg.id },
      create: {
        id: randomUUID(),
        package_id: pkg.id,
        package_version: pkg.version,
        manifest_core_content: JSON.stringify(manifestCore),
        manifest_core_hash: manifestCoreHash,
      },
      update: {
        manifest_core_content: JSON.stringify(manifestCore),
        manifest_core_hash: manifestCoreHash,
        // A rebuild after a previous approval invalidates that approval —
        // freeze will detect the hash drift and require reapproval.
      },
    });

    this.stateMachine.assertValidTransition('BUILDING', 'VALIDATING');
    return this.prisma.auditPackage.update({ where: { id: pkg.id }, data: { status: 'VALIDATING' } });
  }
}
