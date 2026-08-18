import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateExpectedEvidenceRuleInput {
  tenantId?: string;
  controlTestVersionId: string;
  evidenceType: string;
  expectedSource: string;
  expectedPopulation: string;
  expectedPeriod: string;
  freshnessThreshold: string;
  minimumCoverage?: number;
  requiredPermissions?: string;
}

/** Never decide completeness based on "we have some evidence" — an explicit expected rule is required first (spec §10). */
@Injectable()
export class ExpectedEvidenceRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateExpectedEvidenceRuleInput) {
    return this.prisma.expectedEvidenceRule.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        control_test_version_id: input.controlTestVersionId,
        evidence_type: input.evidenceType,
        expected_source: input.expectedSource,
        expected_population: input.expectedPopulation,
        expected_period: input.expectedPeriod,
        freshness_threshold: input.freshnessThreshold,
        minimum_coverage: input.minimumCoverage,
        required_permissions: input.requiredPermissions,
        status: 'ACTIVE',
      },
    });
  }

  async getById(ruleId: string) {
    const rule = await this.prisma.expectedEvidenceRule.findUnique({
      where: { id: ruleId },
    });
    if (!rule) {
      throw new NotFoundException(`ExpectedEvidenceRule '${ruleId}' not found`);
    }
    return rule;
  }

  async listForControlTestVersion(controlTestVersionId: string) {
    return this.prisma.expectedEvidenceRule.findMany({
      where: {
        control_test_version_id: controlTestVersionId,
        status: 'ACTIVE',
      },
    });
  }
}
