import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateControlMappingInput {
  controlObjectiveId: string;
  frameworkVersionId: string;
  requirementId: string;
  mappingType: 'FULL' | 'PARTIAL' | 'RELATED';
  mappingVersion: string;
  rationale?: string;
  validFrom: Date;
}

/**
 * Immutable version rows (bitemporal — spec correction #7). A correction
 * never edits the row it supersedes — validFrom/validTo describe the
 * business-time window a row asserts, recordedAt is the system-time this
 * row was written (set once, never changed). resolveAsOf reconstructs
 * "what the platform knew" at any past point on both axes independently.
 */
@Injectable()
export class ControlMappingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateControlMappingInput) {
    return this.prisma.controlMapping.create({
      data: {
        id: randomUUID(),
        control_objective_id: input.controlObjectiveId,
        framework_version_id: input.frameworkVersionId,
        requirement_id: input.requirementId,
        mapping_type: input.mappingType,
        mapping_version: input.mappingVersion,
        rationale: input.rationale,
        valid_from: input.validFrom,
      },
    });
  }

  /** A correction is a brand-new row with supersedes_id set — the row it supersedes is never written to again. */
  async correct(previousMappingId: string, input: Omit<CreateControlMappingInput, 'controlObjectiveId' | 'frameworkVersionId' | 'requirementId'>) {
    const previous = await this.prisma.controlMapping.findUnique({ where: { id: previousMappingId } });
    if (!previous) {
      throw new NotFoundException(`ControlMapping '${previousMappingId}' not found`);
    }
    return this.prisma.controlMapping.create({
      data: {
        id: randomUUID(),
        control_objective_id: previous.control_objective_id,
        framework_version_id: previous.framework_version_id,
        requirement_id: previous.requirement_id,
        mapping_type: input.mappingType,
        mapping_version: input.mappingVersion,
        rationale: input.rationale,
        valid_from: input.validFrom,
        supersedes_id: previousMappingId,
      },
    });
  }

  /**
   * "What was effective as of business-time T, as known as of system-time
   * S" — recorded_at <= S AND valid_from <= T AND (valid_to IS NULL OR
   * valid_to > T), latest recorded_at among matches. Defaults both to now.
   */
  async resolveAsOf(controlObjectiveId: string, businessTime: Date = new Date(), systemTime: Date = new Date()) {
    const candidates = await this.prisma.controlMapping.findMany({
      where: {
        control_objective_id: controlObjectiveId,
        recorded_at: { lte: systemTime },
        valid_from: { lte: businessTime },
        OR: [{ valid_to: null }, { valid_to: { gt: businessTime } }],
      },
      orderBy: { recorded_at: 'desc' },
    });
    return candidates;
  }
}
