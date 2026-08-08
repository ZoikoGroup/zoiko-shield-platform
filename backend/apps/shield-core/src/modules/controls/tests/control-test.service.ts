import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateControlTestInput {
  controlObjectiveId: string;
  key: string;
  title: string;
  description: string;
  testType: 'AUTOMATED' | 'MANUAL' | 'HYBRID';
  owner: string;
}

export interface CreateControlTestVersionInput {
  controlTestId: string;
  version: number;
  inputSchema?: Record<string, unknown>;
  evaluatorVersionId?: string;
  evaluationPolicy?: Record<string, unknown>;
}

/** Versioned tests, publish-once-immutable — same DetectionRegistryService precedent. */
@Injectable()
export class ControlTestService {
  constructor(private readonly prisma: PrismaService) {}

  async createTest(input: CreateControlTestInput) {
    return this.prisma.controlTest.create({
      data: {
        id: randomUUID(),
        control_objective_id: input.controlObjectiveId,
        key: input.key,
        title: input.title,
        description: input.description,
        test_type: input.testType,
        owner: input.owner,
        status: 'ACTIVE',
      },
    });
  }

  async createVersion(input: CreateControlTestVersionInput) {
    return this.prisma.controlTestVersion.create({
      data: {
        id: randomUUID(),
        control_test_id: input.controlTestId,
        version: input.version,
        input_schema: JSON.stringify(input.inputSchema ?? {}),
        evaluator_version_id: input.evaluatorVersionId,
        evaluation_policy: JSON.stringify(input.evaluationPolicy ?? {}),
        status: 'DRAFT',
      },
    });
  }

  async publishVersion(controlTestVersionId: string) {
    const version = await this.prisma.controlTestVersion.findUniqueOrThrow({ where: { id: controlTestVersionId } });
    if (version.status === 'PUBLISHED') {
      throw new ConflictException(`ControlTestVersion '${controlTestVersionId}' is already PUBLISHED and cannot be republished`);
    }
    return this.prisma.controlTestVersion.update({
      where: { id: controlTestVersionId },
      data: { status: 'PUBLISHED', published_at: new Date() },
    });
  }

  async getVersion(controlTestVersionId: string) {
    const version = await this.prisma.controlTestVersion.findUnique({ where: { id: controlTestVersionId } });
    if (!version) {
      throw new NotFoundException(`ControlTestVersion '${controlTestVersionId}' not found`);
    }
    return version;
  }
}
