import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateManualTestRunInput {
  tenantId: string;
  controlTestVersionId: string;
  performerId: string;
  reviewerId?: string;
  procedureVersion: string;
  sampledPopulation?: string;
  evidenceRefs: string[];
  result: string;
  rationale: string;
  limitations?: string[];
}

/** Human tests remain attributable — performer and reviewer must be distinct identities (spec §18). */
@Injectable()
export class ManualTestRunService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateManualTestRunInput) {
    if (input.reviewerId && input.reviewerId === input.performerId) {
      throw new BadRequestException(
        'A manual test reviewer must be a different identity than the performer',
      );
    }
    return this.prisma.manualTestRun.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        control_test_version_id: input.controlTestVersionId,
        performer_id: input.performerId,
        reviewer_id: input.reviewerId,
        procedure_version: input.procedureVersion,
        sampled_population: input.sampledPopulation,
        evidence_refs: JSON.stringify(input.evidenceRefs),
        result: input.result,
        rationale: input.rationale,
        limitations: JSON.stringify(input.limitations ?? []),
        reviewed_at: input.reviewerId ? new Date() : null,
      },
    });
  }
}
