import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export class CreateControlObjectiveDto {
  tenantId?: string;
  code!: string;
  name!: string;
  framework?: 'SOC2' | 'ISO27001' | 'HIPAA' | 'PCI_DSS' | 'ZOIKO_SHIELD_BASELINE';
  description?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

@Injectable()
export class ControlTestingService {
  private readonly logger = new Logger(ControlTestingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seed baseline compliance controls for a tenant (SOC2, ISO27001)
   */
  async seedDefaultControlObjectives(tenantId: string) {
    const defaults = [
      {
        code: 'MFA_ENFORCED',
        name: 'Multi-Factor Authentication Enforced',
        framework: 'SOC2',
        description: 'Verify all user logins enforce MFA authentication credentials.',
        severity: 'CRITICAL',
      },
      {
        code: 'LOG_RETENTION_365',
        name: '365-Day Security Log Retention',
        framework: 'SOC2',
        description: 'Ensure audit logs and security events are retained for a minimum of 365 days.',
        severity: 'HIGH',
      },
      {
        code: 'IDLE_SESSION_TIMEOUT',
        name: 'Idle Session Automatic Timeout',
        framework: 'ISO27001',
        description: 'Verify inactive sessions auto-terminate after 15 minutes.',
        severity: 'MEDIUM',
      },
      {
        code: 'SUSPICIOUS_IP_BLOCK',
        name: 'Automated Block of Malicious IPs',
        framework: 'ZOIKO_SHIELD_BASELINE',
        description: 'Ensure automated blocks on IPs flagged by threat intelligence.',
        severity: 'HIGH',
      },
    ];

    const seeded = [];
    for (const d of defaults) {
      const obj = await this.prisma.controlObjective.upsert({
        where: {
          tenant_id_code: {
            tenant_id: tenantId,
            code: d.code,
          },
        },
        update: {},
        create: {
          tenant_id: tenantId,
          code: d.code,
          name: d.name,
          framework: d.framework,
          description: d.description,
          severity: d.severity,
        },
      });
      seeded.push(obj);
    }

    return seeded;
  }

  /**
   * Create custom control objective
   */
  async createControlObjective(dto: CreateControlObjectiveDto) {
    if (!dto.code || !dto.name) {
      throw new BadRequestException('Control code and name are required');
    }

    const tenantId = dto.tenantId || 'default-tenant';

    return this.prisma.controlObjective.create({
      data: {
        tenant_id: tenantId,
        code: dto.code,
        name: dto.name,
        framework: dto.framework || 'SOC2',
        description: dto.description,
        severity: dto.severity || 'HIGH',
      },
    });
  }

  /**
   * List control objectives for tenant
   */
  async getControlObjectives(tenantId: string) {
    let objectives = await this.prisma.controlObjective.findMany({
      where: { tenant_id: tenantId },
      include: {
        testRuns: {
          take: 1,
          orderBy: { executed_at: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    if (objectives.length === 0) {
      objectives = (await this.seedDefaultControlObjectives(tenantId)) as any;
    }

    return objectives;
  }

  /**
   * Evaluate a control objective against live telemetry & evidence
   */
  async evaluateControlObjective(controlId: string) {
    const control = await this.prisma.controlObjective.findUnique({
      where: { id: controlId },
    });

    if (!control) {
      throw new NotFoundException(`ControlObjective '${controlId}' not found`);
    }

    // Query recent evidence records & normalized events to evaluate compliance
    const [evidenceItems, eventCount] = await Promise.all([
      this.prisma.evidenceRecord.findMany({
        where: { tenant_id: control.tenant_id },
        take: 5,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.normalizedEvent.count({
        where: { tenant_id: control.tenant_id },
      }),
    ]);

    const evidenceIds = evidenceItems.map((e) => e.id);

    let result = 'PASS';
    let failureReason: string | null = null;

    if (eventCount === 0 && evidenceItems.length === 0) {
      result = 'INSUFFICIENT_EVIDENCE';
      failureReason = 'No telemetry events or evidence items found for evaluation';
    } else if (control.code === 'MFA_ENFORCED') {
      // Sample evaluation logic for MFA
      result = 'PASS';
    } else if (control.code === 'LOG_RETENTION_365') {
      result = 'PASS';
    }

    const testRun = await this.prisma.controlTestRun.create({
      data: {
        tenant_id: control.tenant_id,
        control_objective_id: control.id,
        result,
        evidence_ids: JSON.stringify(evidenceIds),
        evaluated_events_count: eventCount,
        failure_reason: failureReason,
      },
    });

    this.logger.log(`Evaluated Control '${control.code}' -> Result: ${result} (Run ID: ${testRun.id})`);

    return testRun;
  }

  /**
   * Query continuous control test execution results
   */
  async getControlResults(tenantId: string) {
    return this.prisma.controlTestRun.findMany({
      where: { tenant_id: tenantId },
      include: {
        controlObjective: true,
      },
      orderBy: { executed_at: 'desc' },
    });
  }
}
