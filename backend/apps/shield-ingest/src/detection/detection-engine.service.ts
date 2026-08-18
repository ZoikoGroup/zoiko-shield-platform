import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlertGeneratorService } from '../alerts/alert-generator.service';

export interface ConditionRule {
  field: string;
  operator:
    'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'IN' | 'GREATER_THAN' | 'LESS_THAN';
  value: any;
}

export interface RuleDefinition {
  ruleType: 'MATCH' | 'THRESHOLD' | 'BEHAVIORAL';
  eventClass?: string;
  conditions: ConditionRule[];
  groupBy?: string[];
  windowMinutes?: number;
  threshold?: number;
}

export class CreateDetectionRuleDto {
  tenantId?: string;
  name!: string;
  description?: string;
  ruleType?: 'MATCH' | 'THRESHOLD' | 'BEHAVIORAL';
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  conditionDefinition!: RuleDefinition;
  requiredFields?: string[];
  createdBy?: string;
}

export class UpdateDetectionRuleDto {
  name?: string;
  description?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  conditionDefinition?: RuleDefinition;
  requiredFields?: string[];
}

@Injectable()
export class DetectionEngineService {
  private readonly logger = new Logger(DetectionEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly alertService?: AlertGeneratorService,
  ) {}

  /**
   * Create a new detection rule
   */
  async createRule(dto: CreateDetectionRuleDto) {
    this.logger.log(`Creating detection rule '${dto.name}'`);

    const conditionStr = JSON.stringify(dto.conditionDefinition);
    const requiredStr = JSON.stringify(dto.requiredFields || []);

    return this.prisma.detectionRule.create({
      data: {
        tenant_id: dto.tenantId,
        name: dto.name,
        description: dto.description,
        rule_type: dto.ruleType || dto.conditionDefinition.ruleType || 'MATCH',
        severity: dto.severity || 'HIGH',
        condition_definition: conditionStr,
        required_fields: requiredStr,
        status: 'ACTIVE',
        created_by: dto.createdBy,
      },
    });
  }

  /**
   * List detection rules for tenant
   */
  async getRules(tenantId?: string) {
    return this.prisma.detectionRule.findMany({
      where: tenantId
        ? { OR: [{ tenant_id: tenantId }, { tenant_id: null }] }
        : {},
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Get single detection rule by ID
   */
  async getRuleById(tenantId: string, ruleId: string, includeGlobal = true) {
    const rule = await this.prisma.detectionRule.findFirst({
      where: {
        id: ruleId,
        ...(includeGlobal
          ? { OR: [{ tenant_id: tenantId }, { tenant_id: null }] }
          : { tenant_id: tenantId }),
      },
      include: {
        detectionRuns: { take: 10, orderBy: { executed_at: 'desc' } },
      },
    });

    if (!rule) {
      throw new NotFoundException(`Detection rule '${ruleId}' not found`);
    }

    return rule;
  }

  /**
   * Update a detection rule and increment its version
   */
  async updateRule(
    tenantId: string,
    ruleId: string,
    dto: UpdateDetectionRuleDto,
  ) {
    const existing = await this.getRuleById(tenantId, ruleId, false);

    const dataToUpdate: any = {
      current_version: existing.current_version + 1,
    };

    if (dto.name) dataToUpdate.name = dto.name;
    if (dto.description !== undefined)
      dataToUpdate.description = dto.description;
    if (dto.severity) dataToUpdate.severity = dto.severity;
    if (dto.conditionDefinition)
      dataToUpdate.condition_definition = JSON.stringify(
        dto.conditionDefinition,
      );
    if (dto.requiredFields)
      dataToUpdate.required_fields = JSON.stringify(dto.requiredFields);

    return this.prisma.detectionRule.update({
      where: { id: ruleId },
      data: dataToUpdate,
    });
  }

  /**
   * Activate detection rule
   */
  async activateRule(tenantId: string, ruleId: string) {
    await this.getRuleById(tenantId, ruleId, false);
    return this.prisma.detectionRule.update({
      where: { id: ruleId },
      data: { status: 'ACTIVE' },
    });
  }

  /**
   * Disable detection rule
   */
  async disableRule(tenantId: string, ruleId: string) {
    await this.getRuleById(tenantId, ruleId, false);
    return this.prisma.detectionRule.update({
      where: { id: ruleId },
      data: { status: 'DISABLED' },
    });
  }

  /**
   * Evaluate a single NormalizedEvent against active rules
   */
  async evaluateNormalizedEvent(eventId: string) {
    const event = await this.prisma.normalizedEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Normalized event '${eventId}' not found`);
    }

    // Get active rules applicable to tenant or global
    const rules = await this.prisma.detectionRule.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ tenant_id: event.tenant_id }, { tenant_id: null }],
      },
    });

    const runResults = [];

    for (const rule of rules) {
      const run = await this.evaluateRuleAgainstEvent(rule, event);
      runResults.push(run);
    }

    return runResults;
  }

  /**
   * Evaluates a rule against a single event record
   */
  private async evaluateRuleAgainstEvent(rule: any, event: any) {
    let requiredFields: string[] = [];
    try {
      requiredFields = JSON.parse(rule.required_fields || '[]');
    } catch {
      return this.recordRun(
        rule,
        event,
        'ERROR',
        'Invalid required fields JSON',
      );
    }

    // Check required fields
    for (const field of requiredFields) {
      if (!event[field]) {
        return this.recordRun(
          rule,
          event,
          'SKIPPED_MISSING_FIELDS',
          `Required field '${field}' missing on event`,
        );
      }
    }

    let definition: RuleDefinition;
    try {
      definition = JSON.parse(rule.condition_definition);
    } catch {
      return this.recordRun(
        rule,
        event,
        'ERROR',
        'Invalid condition definition JSON',
      );
    }

    // Check eventClass if specified
    if (definition.eventClass && event.event_class !== definition.eventClass) {
      return this.recordRun(rule, event, 'NO_MATCH', `event_class mismatch`);
    }

    // Check single event conditions
    let conditionsMatched = true;
    for (const cond of definition.conditions || []) {
      if (!this.evalSingleCondition(cond, event)) {
        conditionsMatched = false;
        break;
      }
    }

    if (!conditionsMatched) {
      return this.recordRun(
        rule,
        event,
        'NO_MATCH',
        'Conditions did not match',
      );
    }

    // If ruleType is THRESHOLD, evaluate windowing
    if (
      definition.ruleType === 'THRESHOLD' &&
      definition.windowMinutes &&
      definition.threshold
    ) {
      const windowStart = new Date(
        (event.occurred_at
          ? new Date(event.occurred_at)
          : new Date()
        ).getTime() -
          definition.windowMinutes * 60 * 1000,
      );

      // Query past matching normalized events in window
      const matchingCount = await this.prisma.normalizedEvent.count({
        where: {
          tenant_id: event.tenant_id,
          event_class: event.event_class,
          outcome: event.outcome,
          actor_email: event.actor_email || undefined,
          recorded_at: { gte: windowStart },
        },
      });

      if (matchingCount < definition.threshold) {
        return this.recordRun(
          rule,
          event,
          'NO_MATCH',
          `Threshold not met: ${matchingCount}/${definition.threshold} events in ${definition.windowMinutes}m window`,
        );
      }
    }

    // Match found!
    const run = await this.recordRun(
      rule,
      event,
      'MATCHED',
      `Rule '${rule.name}' matched event '${event.id}'`,
    );

    // Automatically create Alert record
    if (this.alertService) {
      await this.alertService.createAlertFromDetectionRun(run.id);
    }

    return run;
  }

  /**
   * Evaluates a single condition against an event object
   */
  private evalSingleCondition(cond: ConditionRule, event: any): boolean {
    const val = event[cond.field];
    if (val === undefined || val === null) return false;

    switch (cond.operator) {
      case 'EQUALS':
        return String(val).toLowerCase() === String(cond.value).toLowerCase();
      case 'NOT_EQUALS':
        return String(val).toLowerCase() !== String(cond.value).toLowerCase();
      case 'CONTAINS':
        return String(val)
          .toLowerCase()
          .includes(String(cond.value).toLowerCase());
      case 'IN':
        return (
          Array.isArray(cond.value) &&
          cond.value
            .map((v) => String(v).toLowerCase())
            .includes(String(val).toLowerCase())
        );
      case 'GREATER_THAN':
        return Number(val) > Number(cond.value);
      case 'LESS_THAN':
        return Number(val) < Number(cond.value);
      default:
        return false;
    }
  }

  /**
   * Helper to write run logs to DetectionRun
   */
  private async recordRun(
    rule: any,
    event: any,
    result: string,
    details: string,
  ) {
    return this.prisma.detectionRun.create({
      data: {
        tenant_id: event.tenant_id,
        rule_id: rule.id,
        event_id: event.id,
        rule_version: rule.current_version,
        result,
        execution_details: JSON.stringify({
          message: details,
          timestamp: new Date(),
        }),
      },
    });
  }

  /**
   * Test a detection rule against sample event payload
   */
  async testRule(
    tenantId: string,
    ruleId: string,
    sampleEvent: Record<string, any>,
  ) {
    const rule = await this.getRuleById(tenantId, ruleId);

    let definition: RuleDefinition;
    try {
      definition = JSON.parse(rule.condition_definition);
    } catch {
      return { match: false, reason: 'Invalid condition definition in rule' };
    }

    for (const cond of definition.conditions || []) {
      if (!this.evalSingleCondition(cond, sampleEvent)) {
        return {
          match: false,
          reason: `Condition failed on field '${cond.field}' (Expected ${cond.operator} '${cond.value}', got '${sampleEvent[cond.field]}')`,
        };
      }
    }

    return {
      match: true,
      reason: `Sample payload matches rule '${rule.name}'`,
    };
  }

  /**
   * Replay detection rules over historical events
   */
  async replayDetections(tenantId: string, ruleId?: string) {
    const events = await this.prisma.normalizedEvent.findMany({
      where: { tenant_id: tenantId },
      orderBy: { recorded_at: 'asc' },
    });

    let totalMatched = 0;
    let totalRuns = 0;

    for (const evt of events) {
      if (ruleId) {
        const rule = await this.getRuleById(tenantId, ruleId);
        const run = await this.evaluateRuleAgainstEvent(rule, evt);
        totalRuns++;
        if (run.result === 'MATCHED') totalMatched++;
      } else {
        const runs = await this.evaluateNormalizedEvent(evt.id);
        totalRuns += runs.length;
        totalMatched += runs.filter((r) => r.result === 'MATCHED').length;
      }
    }

    return {
      totalEventsProcessed: events.length,
      totalRuns,
      totalMatched,
    };
  }
}
