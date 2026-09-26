import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Exposure findings (W30, G2).
 *
 * The service's job is not to return rows — it is to return rows together
 * with what is wrong with them. Two derivations do that work and are done
 * here rather than in the UI, so every consumer gets the same answer:
 *
 *  - assertionState: whether the scanner's claim is still current. A finding
 *    nobody has re-confirmed within its own reassertion interval is a
 *    historical claim, and treating it as present-tense is how a remediated
 *    issue stays "open" for months and a regressed one looks handled.
 *
 *  - priorityIntegrity: whether the priority score was computed over complete
 *    inputs. A score derived with unknown factors is not wrong, but it is not
 *    comparable with one that was not, and the difference has to travel with
 *    the number.
 */

/** Fallback when a source does not declare how often it re-checks. */
const DEFAULT_REASSERTION_HOURS = 24 * 7;
/** Multiple of the reassertion interval past which a claim is stale. */
const STALE_MULTIPLIER = 2;

export type AssertionState = 'CURRENT' | 'AGEING' | 'STALE';

export interface FindingAssertion {
  state: AssertionState;
  ageHours: number;
  expectedWithinHours: number;
  /** Plain-language reason, carried to the surface rather than re-derived. */
  reason: string;
}

export interface PriorityIntegrity {
  scored: boolean;
  unknownInputs: string[];
  resolvedFactors: number;
  /** True when the score was computed over at least one unresolved input. */
  computedOverUnknowns: boolean;
}

type FindingWithRelations = {
  last_confirmed_at: Date;
  reassertion_interval_hours: number | null;
  priority_score: number | null;
  status: string;
  factors: { factor: string; unknown_input: boolean }[];
};

@Injectable()
export class FindingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * How old the newest confirmation is, against how old it should be.
   *
   * RESOLVED and FALSE_POSITIVE findings are not aged: they are closed
   * records, and nothing is expected to keep re-asserting them.
   */
  deriveAssertion(finding: FindingWithRelations, now = new Date()): FindingAssertion {
    const expectedWithinHours =
      finding.reassertion_interval_hours ?? DEFAULT_REASSERTION_HOURS;
    const ageHours =
      (now.getTime() - new Date(finding.last_confirmed_at).getTime()) / 3_600_000;

    if (['RESOLVED', 'FALSE_POSITIVE'].includes(finding.status)) {
      return {
        state: 'CURRENT',
        ageHours,
        expectedWithinHours,
        reason: `Closed as ${finding.status}; no further confirmation is expected.`,
      };
    }

    if (ageHours > expectedWithinHours * STALE_MULTIPLIER) {
      return {
        state: 'STALE',
        ageHours,
        expectedWithinHours,
        reason:
          `Last confirmed ${Math.round(ageHours)}h ago against a ${expectedWithinHours}h ` +
          `reassertion interval. This is a historical claim: no source has said it still holds.`,
      };
    }

    if (ageHours > expectedWithinHours) {
      return {
        state: 'AGEING',
        ageHours,
        expectedWithinHours,
        reason:
          `Last confirmed ${Math.round(ageHours)}h ago, past the ${expectedWithinHours}h ` +
          `reassertion interval but within the ${STALE_MULTIPLIER}x staleness budget.`,
      };
    }

    return {
      state: 'CURRENT',
      ageHours,
      expectedWithinHours,
      reason: `Confirmed ${Math.round(ageHours)}h ago, within the ${expectedWithinHours}h interval.`,
    };
  }

  derivePriorityIntegrity(finding: FindingWithRelations): PriorityIntegrity {
    const unknownInputs = finding.factors
      .filter((factor) => factor.unknown_input)
      .map((factor) => factor.factor);
    const resolvedFactors = finding.factors.length - unknownInputs.length;
    return {
      scored: finding.priority_score !== null,
      unknownInputs,
      resolvedFactors,
      computedOverUnknowns: finding.priority_score !== null && unknownInputs.length > 0,
    };
  }

  private decorate<T extends FindingWithRelations>(finding: T) {
    return {
      ...finding,
      assertion: this.deriveAssertion(finding),
      priorityIntegrity: this.derivePriorityIntegrity(finding),
    };
  }

  async list(
    tenantId: string,
    filters: { status?: string; severity?: string; assetId?: string } = {},
    limit = 100,
  ) {
    const findings = await this.prisma.finding.findMany({
      where: {
        tenant_id: tenantId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.assetId ? { asset_id: filters.assetId } : {}),
      },
      take: limit,
      orderBy: [{ priority_score: 'desc' }, { last_confirmed_at: 'desc' }],
      include: { factors: true, acceptance: true },
    });
    return findings.map((finding) => this.decorate(finding));
  }

  /**
   * A single finding with everything needed to defend or dispute it: the
   * factor breakdown, the attack path, remediation, acceptance and the raw
   * evidence the scanner produced.
   */
  async getById(tenantId: string, findingId: string) {
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId, tenant_id: tenantId },
      include: {
        factors: { orderBy: { contribution: 'desc' } },
        attackPath: { orderBy: { step_index: 'asc' } },
        remediations: { orderBy: { created_at: 'desc' } },
        evidenceLinks: { orderBy: { collected_at: 'desc' } },
        acceptance: true,
      },
    });
    if (!finding) {
      throw new NotFoundException(`Finding '${findingId}' not found`);
    }
    return this.decorate(finding);
  }

  /**
   * Accept a finding. expires_at is required by the schema, so an acceptance
   * cannot be open-ended — the caller has to say when this decision gets
   * looked at again.
   */
  async accept(params: {
    tenantId: string;
    findingId: string;
    acceptedBy: string;
    rationale: string;
    authority: string;
    expiresAt: Date;
    reviewAt?: Date;
    compensatingControls?: string[];
    riskRef?: string;
    authorizationDecisionId?: string;
  }) {
    await this.getById(params.tenantId, params.findingId);
    return this.prisma.$transaction(async (tx) => {
      const acceptance = await tx.findingAcceptance.upsert({
        where: { finding_id: params.findingId },
        create: {
          tenant_id: params.tenantId,
          finding_id: params.findingId,
          rationale: params.rationale,
          authority: params.authority,
          accepted_by: params.acceptedBy,
          authorization_decision_id: params.authorizationDecisionId,
          compensating_controls: JSON.stringify(params.compensatingControls ?? []),
          risk_ref: params.riskRef,
          expires_at: params.expiresAt,
          review_at: params.reviewAt,
          status: 'ACTIVE',
        },
        update: {
          rationale: params.rationale,
          authority: params.authority,
          accepted_by: params.acceptedBy,
          compensating_controls: JSON.stringify(params.compensatingControls ?? []),
          risk_ref: params.riskRef,
          expires_at: params.expiresAt,
          review_at: params.reviewAt,
          status: 'ACTIVE',
          revoked_at: null,
          revoked_by: null,
          revoke_reason: null,
        },
      });
      await tx.finding.update({
        where: { id: params.findingId },
        data: { status: 'ACCEPTED' },
      });
      return acceptance;
    });
  }

  /**
   * Acceptances that have run out. An expired acceptance does not quietly
   * become a non-decision: the finding returns to TRIAGED so it is back in
   * front of someone, and the acceptance is marked EXPIRED rather than
   * deleted, so the record of what was accepted survives.
   */
  async expireLapsedAcceptances(tenantId: string, now = new Date()) {
    const lapsed = await this.prisma.findingAcceptance.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE', expires_at: { lte: now } },
    });
    if (lapsed.length === 0) return { expired: 0 };

    await this.prisma.$transaction([
      this.prisma.findingAcceptance.updateMany({
        where: { id: { in: lapsed.map((a) => a.id) } },
        data: { status: 'EXPIRED' },
      }),
      this.prisma.finding.updateMany({
        where: {
          tenant_id: tenantId,
          id: { in: lapsed.map((a) => a.finding_id) },
          status: 'ACCEPTED',
        },
        data: { status: 'TRIAGED' },
      }),
    ]);
    return { expired: lapsed.length };
  }

  /**
   * Population-level summary for the inventory and executive surfaces, with
   * the counts that qualify the rest: how many findings rest on a stale
   * assertion, and how many priorities were computed over unknown inputs.
   */
  async summary(tenantId: string) {
    const findings = await this.prisma.finding.findMany({
      where: { tenant_id: tenantId },
      include: { factors: true },
    });
    const decorated = findings.map((finding) => this.decorate(finding));
    const open = decorated.filter(
      (f) => !['RESOLVED', 'FALSE_POSITIVE'].includes(f.status),
    );
    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      metrics: {
        total: decorated.length,
        open: open.length,
        staleAssertions: open.filter((f) => f.assertion.state === 'STALE').length,
        ageingAssertions: open.filter((f) => f.assertion.state === 'AGEING').length,
        unscored: open.filter((f) => !f.priorityIntegrity.scored).length,
        scoredOverUnknowns: open.filter((f) => f.priorityIntegrity.computedOverUnknowns)
          .length,
        unresolvedAsset: open.filter((f) => !f.asset_id).length,
      },
      definition:
        'Live counts over findings rows; assertion state derived from last_confirmed_at against each source’s declared reassertion interval',
      limitations: [
        'Findings are only as complete as the scanners feeding them; this count cannot show what no connected source looks for',
      ],
    };
  }
}
