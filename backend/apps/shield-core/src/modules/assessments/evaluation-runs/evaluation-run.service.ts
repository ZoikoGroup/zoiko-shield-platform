import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { ObjectStorageService } from '../../evidence/storage/object-storage.service';
import { EvaluatorRegistryService } from '../evaluators/evaluator-registry.service';
import { EvidenceBundleService } from '../evidence-bundles/evidence-bundle.service';

const DETERMINISTIC_PROFILE = 'zs-eval-v1';

export interface RunEvaluationInput {
  tenantId: string;
  controlTestVersionId: string;
  evaluatorVersionId: string;
  evidenceBundleId: string;
  correlationId?: string;
}

/**
 * A thrown/caught evaluator exception is always ERROR, never silently
 * FAIL — FAIL means "the evaluator ran and found a real failure," ERROR
 * means "we don't know" (spec §15).
 */
@Injectable()
export class EvaluationRunService {
  private readonly logger = new Logger(EvaluationRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
    private readonly storageService: ObjectStorageService,
    private readonly evaluatorRegistry: EvaluatorRegistryService,
    private readonly evidenceBundleService: EvidenceBundleService,
  ) {}

  async run(input: RunEvaluationInput) {
    const bundle = await this.evidenceBundleService.getById(
      input.evidenceBundleId,
    );
    const evaluatorVersion =
      await this.evaluatorRegistry.getVersionWithEvaluator(
        input.evaluatorVersionId,
      );
    if (evaluatorVersion.status !== 'PUBLISHED') {
      throw new NotFoundException(
        `EvaluatorVersion '${input.evaluatorVersionId}' is not PUBLISHED`,
      );
    }

    const evidenceRefs: string[] = JSON.parse(bundle.evidence_refs);
    const records = await this.prisma.evidenceRecord.findMany({
      where: { id: { in: evidenceRefs }, tenant_id: input.tenantId },
    });

    const evidenceWithContent = await Promise.all(
      records.map(async (r) => {
        let content: Record<string, unknown> = {};
        if (r.vault_reference) {
          try {
            const bytes = await this.storageService.getObject(
              r.vault_reference,
            );
            content = JSON.parse(bytes.toString('utf-8'));
          } catch (err) {
            this.logger.warn(
              `Failed to load evidence content for ${r.id}: ${(err as Error).message}`,
            );
          }
        }
        return {
          id: r.id,
          content_hash: r.content_hash,
          source_object_id: r.source_object_id,
          period_start: r.period_start,
          period_end: r.period_end,
          content,
        };
      }),
    );

    const configuration = JSON.parse(evaluatorVersion.configuration);
    const { contentHash: inputBundleHash } = this.hashService.hashCanonicalJson(
      { bundleHash: bundle.bundle_hash, configuration },
    );

    const startedAt = new Date();
    let outcome: {
      result: string;
      rationale: string;
      limitations: string[];
      confidence?: number;
    };
    try {
      const runner = this.evaluatorRegistry.getRunner(
        evaluatorVersion.evaluator.key,
      );
      outcome = await runner.run({
        evidenceRecords: evidenceWithContent,
        configuration,
      });
    } catch (err) {
      this.logger.error(
        `Evaluator '${evaluatorVersion.evaluator.key}' threw during run: ${(err as Error).message}`,
      );
      outcome = {
        result: 'ERROR',
        rationale: `Evaluator threw: ${(err as Error).message}`,
        limitations: ['evaluator execution failed'],
      };
    }

    const { contentHash: outputHash } = this.hashService.hashCanonicalJson({
      result: outcome.result,
      rationale: outcome.rationale,
    });

    return this.prisma.evaluationRun.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        control_test_version_id: input.controlTestVersionId,
        evaluator_version_id: input.evaluatorVersionId,
        evidence_bundle_id: input.evidenceBundleId,
        input_bundle_hash: inputBundleHash,
        output_hash: outputHash,
        started_at: startedAt,
        completed_at: new Date(),
        result: outcome.result,
        rationale: outcome.rationale,
        limitations: JSON.stringify(outcome.limitations),
        confidence: outcome.confidence,
        replayable: true,
        deterministic_profile: DETERMINISTIC_PROFILE,
        correlation_id: input.correlationId ?? randomUUID(),
      },
    });
  }
}
