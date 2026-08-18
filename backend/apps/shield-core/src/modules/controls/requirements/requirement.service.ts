import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateRequirementInput {
  frameworkVersionId: string;
  externalReference: string;
  title: string;
  description?: string;
  applicabilityRule?: string;
}

@Injectable()
export class RequirementService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRequirementInput) {
    return this.prisma.requirement.create({
      data: {
        id: randomUUID(),
        framework_version_id: input.frameworkVersionId,
        external_reference: input.externalReference,
        title: input.title,
        description: input.description,
        applicability_rule: input.applicabilityRule,
        status: 'ACTIVE',
      },
    });
  }

  async getById(requirementId: string) {
    return this.prisma.requirement.findUniqueOrThrow({
      where: { id: requirementId },
    });
  }
}
