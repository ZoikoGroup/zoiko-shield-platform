import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { ObjectStorageService } from '../../evidence/storage/object-storage.service';
import { EvaluatorRegistryService } from '../evaluators/evaluator-registry.service';
import { EvidenceBundleService } from '../evidence-bundles/evidence-bundle.service';

/**
 * Reuses the identical frozen EvidenceBundle + evaluator version +
 * deterministic profile as the original run — never "whatever evidence
 * exists now" (spec §16/§17). A mismatched output hash is recorded as
 * NON_DETERMINISTIC on a NEW row; the original EvaluationRun is never
 * overwritten.
 */
@Injectable()
export class EvaluationReplayService {
  private readonly logger = new Logger(EvaluationReplayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
    private readonly storageService: ObjectStorageService,
    private readonly evaluatorRegistry: EvaluatorRegistryService,
    private readonly evidenceBundleService: EvidenceBundleService,
  ) {}

  async replay(evaluationRunId: string) {
    const original = await this.prisma.evaluationRun.findUnique({ where: { id: evaluationRunId } });
    if (!original) {
      throw new NotFoundException(`EvaluationRun '${evaluationRunId}' not found`);
    }
    if (!original.replayable) {
      throw new NotFoundException(`EvaluationRun '${evaluationRunId}' is not marked replayable`);
    }

    const bundle = await this.evidenceBundleService.getById(original.evidence_bundle_id);
    const evaluatorVersion = await this.evaluatorRegistry.getVersionWithEvaluator(original.evaluator_version_id);

    const evidenceRefs: string[] = JSON.parse(bundle.evidence_refs);
    const records = await this.prisma.evidenceRecord.findMany({ where: { id: { in: evidenceRefs } } });
    const evidenceWithContent = await Promise.all(
      records.map(async (r) => {
        let content: Record<string, unknown> = {};
        if (r.vault_reference) {
          try {
            const bytes = await this.storageService.getObject(r.vault_reference);
            content = JSON.parse(bytes.toString('utf-8'));
          } catch (err) {
            this.logger.warn(`Failed to load evidence content for ${r.id} during replay: ${(err as Error).message}`);
          }
        }
        return { id: r.id, content_hash: r.content_hash, source_object_id: r.source_object_id, period_start: r.period_start, period_end: r.period_end, content };
      }),
    );

    const configuration = JSON.parse(evaluatorVersion.configuration);
    const { contentHash: inputBundleHash } = this.hashService.hashCanonicalJson({ bundleHash: bundle.bundle_hash, configuration });

    let outcome: { result: string; rationale: string; limitations: string[]; confidence?: number };
    try {
      const runner = this.evaluatorRegistry.getRunner(evaluatorVersion.evaluator.key);
      outcome = await runner.run({ evidenceRecords: evidenceWithContent, configuration });
    } catch (err) {
      outcome = { result: 'ERROR', rationale: `Evaluator threw during replay: ${(err as Error).message}`, limitations: ['evaluator execution failed'] };
    }

    const { contentHash: outputHash } = this.hashService.hashCanonicalJson({ result: outcome.result, rationale: outcome.rationale });

    const finalResult = inputBundleHash === original.input_bundle_hash && outputHash === original.output_hash ? outcome.result : 'NON_DETERMINISTIC';

    return this.prisma.evaluationRun.create({
      data: {
        id: randomUUID(),
        tenant_id: original.tenant_id,
        control_test_version_id: original.control_test_version_id,
        evaluator_version_id: original.evaluator_version_id,
        evidence_bundle_id: original.evidence_bundle_id,
        input_bundle_hash: inputBundleHash,
        output_hash: outputHash,
        started_at: new Date(),
        completed_at: new Date(),
        result: finalResult,
        rationale: outcome.rationale,
        limitations: JSON.stringify(outcome.limitations),
        confidence: outcome.confidence,
        replayable: true,
        replay_of_id: original.id,
        deterministic_profile: original.deterministic_profile,
        correlation_id: randomUUID(),
      },
    });
  }
}
