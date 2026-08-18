import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { EvaluatorRunner } from './evaluator-runner.interface';
import { MfaCoverageEvaluator } from './mfa-coverage/mfa-coverage.evaluator';

export interface CreateEvaluatorInput {
  key: string;
  owner: string;
  controlScope?: Record<string, unknown>;
}

export interface CreateEvaluatorVersionInput {
  evaluatorId: string;
  version: number;
  acceptedEvidenceSchemas?: string[];
  requiredFields?: string[];
  runtimeProfile?: string;
  configuration: Record<string, unknown>;
}

/**
 * Registers EvaluatorRunner implementations by key (new evaluators
 * register themselves in the constructor map, mirroring
 * DetectionRegistryService) and manages the Evaluator/EvaluatorVersion
 * publish-once-immutable registry — same DetectionVersion/PromptProfile
 * precedent.
 */
@Injectable()
export class EvaluatorRegistryService {
  private readonly runners = new Map<string, EvaluatorRunner>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
    mfaCoverageEvaluator: MfaCoverageEvaluator,
  ) {
    this.registerRunner(mfaCoverageEvaluator);
  }

  registerRunner(runner: EvaluatorRunner): void {
    this.runners.set(runner.key, runner);
  }

  getRunner(key: string): EvaluatorRunner {
    const runner = this.runners.get(key);
    if (!runner) {
      throw new NotFoundException(
        `No EvaluatorRunner registered for key '${key}'`,
      );
    }
    return runner;
  }

  async createEvaluator(input: CreateEvaluatorInput) {
    return this.prisma.evaluator.create({
      data: {
        id: randomUUID(),
        key: input.key,
        owner: input.owner,
        control_scope: JSON.stringify(input.controlScope ?? {}),
        status: 'ACTIVE',
      },
    });
  }

  async createVersion(input: CreateEvaluatorVersionInput) {
    const { contentHash } = this.hashService.hashCanonicalJson({
      configuration: input.configuration,
      requiredFields: input.requiredFields ?? [],
    });
    return this.prisma.evaluatorVersion.create({
      data: {
        id: randomUUID(),
        evaluator_id: input.evaluatorId,
        version: input.version,
        accepted_evidence_schemas: JSON.stringify(
          input.acceptedEvidenceSchemas ?? [],
        ),
        required_fields: JSON.stringify(input.requiredFields ?? []),
        runtime_profile: input.runtimeProfile ?? 'node',
        configuration: JSON.stringify(input.configuration),
        content_hash: contentHash,
        status: 'DRAFT',
      },
    });
  }

  async publishVersion(evaluatorVersionId: string) {
    const version = await this.prisma.evaluatorVersion.findUniqueOrThrow({
      where: { id: evaluatorVersionId },
    });
    if (version.status === 'PUBLISHED') {
      throw new ConflictException(
        `EvaluatorVersion '${evaluatorVersionId}' is already PUBLISHED and cannot be republished`,
      );
    }
    return this.prisma.evaluatorVersion.update({
      where: { id: evaluatorVersionId },
      data: { status: 'PUBLISHED', published_at: new Date() },
    });
  }

  async getVersionWithEvaluator(evaluatorVersionId: string) {
    const version = await this.prisma.evaluatorVersion.findUnique({
      where: { id: evaluatorVersionId },
      include: { evaluator: true },
    });
    if (!version) {
      throw new NotFoundException(
        `EvaluatorVersion '${evaluatorVersionId}' not found`,
      );
    }
    return version;
  }
}
