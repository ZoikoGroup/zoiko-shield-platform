import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface MatchParams {
  tenantId: string;
  ruleId: string;
  periodStart: Date;
  periodEnd: Date;
  /** Optional external signal — e.g. a connector-health lookup — used to narrow an absence into COLLECTOR_UNHEALTHY/PERMISSION_CHANGED rather than a bare MISSING guess. */
  sourceHealthState?: 'HEALTHY' | 'UNHEALTHY' | 'PERMISSION_CHANGED';
}

/**
 * "No error" is never silently mapped to "COMPLETE" (spec §12/§56).
 * Absence of matching EvidenceRecords is MISSING by default, narrowed only
 * by an explicit health signal — never inferred as healthy from silence.
 */
@Injectable()
export class EvidenceMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  async match(params: MatchParams) {
    const rule = await this.prisma.expectedEvidenceRule.findUniqueOrThrow({
      where: { id: params.ruleId },
    });

    const records = await this.prisma.evidenceRecord.findMany({
      where: {
        tenant_id: params.tenantId,
        evidence_type: rule.evidence_type,
        source_system_id: rule.expected_source,
        OR: [
          {
            period_start: { lte: params.periodEnd },
            period_end: { gte: params.periodStart },
          },
          {
            period_start: null,
            received_at: { gte: params.periodStart, lte: params.periodEnd },
          },
        ],
      },
    });

    const observedCount = records.length;

    // Coverage
    let coverageState: string;
    if (observedCount === 0) {
      if (params.sourceHealthState === 'UNHEALTHY')
        coverageState = 'COLLECTOR_UNHEALTHY';
      else if (params.sourceHealthState === 'PERMISSION_CHANGED')
        coverageState = 'PERMISSION_CHANGED';
      else coverageState = 'MISSING';
    } else if (
      rule.minimum_coverage != null &&
      observedCount < rule.minimum_coverage
    ) {
      coverageState = 'PARTIAL';
    } else {
      coverageState = 'COMPLETE';
    }

    // Freshness — never silently treat a stale record as current.
    let freshnessState: string;
    if (observedCount === 0) {
      freshnessState = 'UNKNOWN';
    } else {
      const anyStale = records.some((r) => r.freshness_state !== 'CURRENT');
      freshnessState = anyStale ? 'STALE' : 'CURRENT';
    }

    // Integrity — cryptographically valid but incomplete evidence must
    // remain incomplete; this dimension only ever reports on the records
    // that exist, it never upgrades coverage.
    let integrityState: string;
    if (observedCount === 0) {
      integrityState = 'UNKNOWN';
    } else {
      const allVerified = records.every(
        (r) => r.integrity_state === 'VERIFIED',
      );
      const anyFailed = records.some((r) => r.integrity_state === 'FAILED');
      integrityState = anyFailed
        ? 'FAILED'
        : allVerified
          ? 'VERIFIED'
          : 'PENDING';
    }

    const gapCount =
      coverageState === 'COMPLETE' &&
      freshnessState === 'CURRENT' &&
      integrityState === 'VERIFIED'
        ? 0
        : 1;

    const result = await this.prisma.expectedEvidenceResult.create({
      data: {
        id: randomUUID(),
        tenant_id: params.tenantId,
        rule_id: rule.id,
        assessment_period_start: params.periodStart,
        assessment_period_end: params.periodEnd,
        observed_count: observedCount,
        coverage_state: coverageState,
        freshness_state: freshnessState,
        integrity_state: integrityState,
        gap_count: gapCount,
      },
    });

    return { result, records, coverageState, freshnessState, integrityState };
  }
}
