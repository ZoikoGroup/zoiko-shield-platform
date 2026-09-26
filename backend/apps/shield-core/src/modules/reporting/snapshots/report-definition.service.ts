import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateReportDefinitionInput {
  key: string;
  name: string;
  reportType:
    | 'OPERATIONAL'
    | 'SECURITY'
    | 'ASSURANCE'
    | 'EXECUTIVE'
    | 'BOARD'
    | 'CUSTOMER_SERVICE';
  purpose: string;
  audience: string;
  sourceRequirements?: string[];
  metricDefinitions?: Record<string, unknown>[];
}

@Injectable()
export class ReportDefinitionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateReportDefinitionInput) {
    return this.prisma.reportDefinition.create({
      data: {
        id: randomUUID(),
        key: input.key,
        name: input.name,
        report_type: input.reportType,
        purpose: input.purpose,
        audience: input.audience,
        source_requirements: JSON.stringify(input.sourceRequirements ?? []),
        metric_definitions: JSON.stringify(input.metricDefinitions ?? []),
        status: 'ACTIVE',
      },
    });
  }

  /**
   * The report definitions a snapshot can be built from (W32). Definitions
   * are platform-wide rather than tenant-scoped, and each carries the source
   * requirements a snapshot of it must satisfy — which is what makes a
   * generated report's scope checkable rather than asserted.
   */
  async listActive() {
    return this.prisma.reportDefinition.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }

  async getById(reportDefinitionId: string) {
    const def = await this.prisma.reportDefinition.findUnique({
      where: { id: reportDefinitionId },
    });
    if (!def) {
      throw new NotFoundException(
        `ReportDefinition '${reportDefinitionId}' not found`,
      );
    }
    return def;
  }
}
