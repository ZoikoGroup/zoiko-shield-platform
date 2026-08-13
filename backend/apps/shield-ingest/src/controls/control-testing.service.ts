import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenantId } from '../security/tenant-context';

export class CreateControlObjectiveDto {
  tenantId?: string;
  code!: string;
  name!: string;
  framework?:
    'SOC2' | 'ISO27001' | 'HIPAA' | 'PCI_DSS' | 'ZOIKO_SHIELD_BASELINE';
  description?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

@Injectable()
export class ControlTestingService {
  private readonly logger = new Logger(ControlTestingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create custom control objective
   */
  async createControlObjective(dto: CreateControlObjectiveDto) {
    if (!dto.code || !dto.name) {
      throw new BadRequestException('Control code and name are required');
    }

    const tenantId = requireTenantId(dto.tenantId);

    return this.prisma.controlObjective.create({
      data: {
        key: `${tenantId}:${dto.code}`,
        title: dto.name,
        description: dto.description ?? dto.name,
        category: dto.framework ?? 'ZOIKO_SHIELD_BASELINE',
        owner: tenantId,
      },
    });
  }

  /**
   * List control objectives for tenant
   */
  async getControlObjectives(tenantId: string) {
    return this.prisma.controlObjective.findMany({
      where: { owner: tenantId, status: 'ACTIVE' },
    });
  }

  /**
   * Evaluate a control objective against live telemetry & evidence strictly enforcing "unknown is not false"
   */
  async evaluateControlObjective(tenantId: string, controlId: string) {
    const control = await this.prisma.controlObjective.findFirst({
      where: { id: controlId, owner: tenantId, status: 'ACTIVE' },
    });
    if (!control)
      throw new NotFoundException(`Control objective '${controlId}' not found`);

    const [evidenceItems, eventCount] = await Promise.all([
      this.prisma.evidenceRecord.findMany({
        where: { tenant_id: tenantId },
        take: 5,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.normalizedEvent.count({
        where: { tenant_id: tenantId },
      }),
    ]);

    const evidenceIds = evidenceItems.map((e) => e.id);

    const result = 'INSUFFICIENT_EVIDENCE';
    const failureReason: string | null =
      'No verifiable evidence for control evaluation';

    const testRun = await this.prisma.controlTestRun.create({
      data: {
        tenant_id: tenantId,
        objective_id: controlId,
        result,
        details: JSON.stringify({
          evidenceIds,
          eventCount,
          failureReason,
          note: 'Generic telemetry presence is not sufficient to prove a control; a published control-specific evaluator is required.',
        }),
      },
    });

    this.logger.log(
      `Evaluated Control '${controlId}' -> Result: ${result} (Run ID: ${testRun.id})`,
    );

    return testRun;
  }

  /**
   * Query continuous control test execution results
   */
  async getControlResults(tenantId: string) {
    return this.prisma.controlTestRun.findMany({
      where: { tenant_id: tenantId },
      orderBy: { executed_at: 'desc' },
    });
  }

  async getControlResult(tenantId: string, evaluationId: string) {
    const result = await this.prisma.controlTestRun.findFirst({
      where: { id: evaluationId, tenant_id: tenantId },
    });
    if (!result)
      throw new NotFoundException(
        `Control evaluation '${evaluationId}' not found`,
      );
    return result;
  }
}
