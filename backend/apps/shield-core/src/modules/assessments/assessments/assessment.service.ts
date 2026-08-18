import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { ExpectedEvidenceRuleService } from '../expected-evidence/expected-evidence-rule.service';
import { EvidenceMatcherService } from '../evidence-matcher/evidence-matcher.service';
import { EvidenceGapService } from '../evidence-gaps/evidence-gap.service';
import { EvidenceBundleService } from '../evidence-bundles/evidence-bundle.service';
import { EvaluationRunService } from '../evaluation-runs/evaluation-run.service';

export interface RunAssessmentInput {
  tenantId: string;
  controlImplementationId: string;
  controlTestVersionId: string;
  assessmentPeriodStart: Date;
  assessmentPeriodEnd: Date;
  performerId?: string;
  correlationId?: string;
}

const EFFECTIVENESS_FROM_RESULT: Record<string, string> = {
  PASS: 'EFFECTIVE',
  PARTIAL: 'PARTIALLY_EFFECTIVE',
  FAIL: 'INEFFECTIVE',
  UNKNOWN: 'UNKNOWN',
  ERROR: 'UNKNOWN',
  NON_DETERMINISTIC: 'UNKNOWN',
};

/**
 * Orchestrates the full per-control-per-period pipeline. Incomplete
 * evidence stops here — the assessment never silently proceeds to
 * evaluation on partial/missing evidence (spec §19/§21 no-green-rule).
 * completeness/freshness/integrity/effectiveness are kept as separate
 * fields throughout, never collapsed into one status.
 */
@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly expectedEvidenceRuleService: ExpectedEvidenceRuleService,
    private readonly evidenceMatcher: EvidenceMatcherService,
    private readonly evidenceGapService: EvidenceGapService,
    private readonly evidenceBundleService: EvidenceBundleService,
    private readonly evaluationRunService: EvaluationRunService,
  ) {}

  async run(input: RunAssessmentInput) {
    const controlTestVersion =
      await this.prisma.controlTestVersion.findUniqueOrThrow({
        where: { id: input.controlTestVersionId },
      });

    const assessment = await this.prisma.assessment.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        control_implementation_id: input.controlImplementationId,
        control_test_version_id: input.controlTestVersionId,
        assessment_period_start: input.assessmentPeriodStart,
        assessment_period_end: input.assessmentPeriodEnd,
        performer_id: input.performerId,
        status: 'PENDING',
      },
    });
    await this.publishEvent(
      CANONICAL_TOPICS.ASSESSMENT_STARTED,
      'assessment.started',
      input.tenantId,
      { assessmentId: assessment.id },
      input.correlationId,
    );

    const rules =
      await this.expectedEvidenceRuleService.listForControlTestVersion(
        input.controlTestVersionId,
      );
    if (rules.length === 0) {
      return this.prisma.assessment.update({
        where: { id: assessment.id },
        data: {
          status: 'EVIDENCE_INCOMPLETE',
          completeness_state: 'UNKNOWN',
          limitations: JSON.stringify([
            'No ExpectedEvidenceRule configured for this control test',
          ]),
        },
      });
    }

    const matchResults = await Promise.all(
      rules.map((rule) =>
        this.evidenceMatcher.match({
          tenantId: input.tenantId,
          ruleId: rule.id,
          periodStart: input.assessmentPeriodStart,
          periodEnd: input.assessmentPeriodEnd,
        }),
      ),
    );

    const allComplete = matchResults.every(
      (m) => m.coverageState === 'COMPLETE',
    );
    const anyStale = matchResults.some((m) => m.freshnessState === 'STALE');
    const anyIntegrityFailed = matchResults.some(
      (m) => m.integrityState === 'FAILED',
    );

    if (!allComplete) {
      for (let i = 0; i < rules.length; i++) {
        if (matchResults[i].coverageState !== 'COMPLETE') {
          await this.evidenceGapService.detect({
            tenantId: input.tenantId,
            expectedEvidenceRuleId: rules[i].id,
            controlTestVersionId: input.controlTestVersionId,
            reason:
              matchResults[i].coverageState === 'MISSING'
                ? 'MISSING_SOURCE'
                : matchResults[i].coverageState === 'COLLECTOR_UNHEALTHY'
                  ? 'CONNECTOR_UNHEALTHY'
                  : matchResults[i].coverageState === 'PERMISSION_CHANGED'
                    ? 'PERMISSION_REVOKED'
                    : 'PARTIAL_POPULATION',
            periodStart: input.assessmentPeriodStart,
            periodEnd: input.assessmentPeriodEnd,
          });
        }
      }
      return this.prisma.assessment.update({
        where: { id: assessment.id },
        data: {
          status: 'EVIDENCE_INCOMPLETE',
          completeness_state: matchResults.some(
            (m) => m.coverageState === 'MISSING',
          )
            ? 'MISSING'
            : 'PARTIAL',
          freshness_state: anyStale ? 'STALE' : 'CURRENT',
          integrity_state: anyIntegrityFailed ? 'FAILED' : 'UNKNOWN',
          limitations: JSON.stringify([
            'Evidence incomplete — evaluation not attempted',
          ]),
        },
      });
    }

    // Complete evidence — freeze a bundle and run the bound evaluator.
    const allRecords = matchResults.flatMap((m) => m.records);
    const bundle = await this.evidenceBundleService.freeze({
      tenantId: input.tenantId,
      purpose: 'CONTROL_ASSESSMENT',
      controlTestVersionId: input.controlTestVersionId,
      expectedEvidenceResultId: matchResults[0].result.id,
      evidenceRecords: allRecords.map((r) => ({
        id: r.id,
        content_hash: r.content_hash,
      })),
    });

    let evaluationRun = null;
    let effectiveness = 'UNKNOWN';
    if (controlTestVersion.evaluator_version_id) {
      evaluationRun = await this.evaluationRunService.run({
        tenantId: input.tenantId,
        controlTestVersionId: input.controlTestVersionId,
        evaluatorVersionId: controlTestVersion.evaluator_version_id,
        evidenceBundleId: bundle.id,
        correlationId: input.correlationId,
      });
      effectiveness =
        EFFECTIVENESS_FROM_RESULT[evaluationRun.result] ?? 'UNKNOWN';
    }

    const updated = await this.prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        status: 'EVALUATED',
        evidence_bundle_id: bundle.id,
        evaluation_run_id: evaluationRun?.id,
        effectiveness,
        completeness_state: 'COMPLETE',
        freshness_state: anyStale ? 'STALE' : 'CURRENT',
        integrity_state: anyIntegrityFailed ? 'FAILED' : 'VERIFIED',
        limitations: evaluationRun
          ? evaluationRun.limitations
          : JSON.stringify([]),
      },
    });
    await this.publishEvent(
      CANONICAL_TOPICS.ASSESSMENT_COMPLETED,
      'assessment.completed',
      input.tenantId,
      { assessmentId: assessment.id, effectiveness },
      input.correlationId,
    );

    return updated;
  }

  async getById(tenantId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenantId },
    });
    if (!assessment) {
      throw new NotFoundException(`Assessment '${assessmentId}' not found`);
    }
    return assessment;
  }

  private async publishEvent(
    topic: string,
    eventType: string,
    tenantId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ) {
    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId,
        topic,
        eventType,
        payload,
        correlationId,
      }),
    });
  }
}
