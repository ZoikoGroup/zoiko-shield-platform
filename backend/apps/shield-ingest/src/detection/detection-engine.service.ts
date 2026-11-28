import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AlertGeneratorService } from '../alerts/alert-generator.service';

const OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'IN',
  'GREATER_THAN',
  'LESS_THAN',
] as const;
const RULE_TYPES = ['MATCH', 'THRESHOLD', 'BEHAVIORAL'] as const;
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

/** A tenant may own at most this many rules. */
const MAX_TENANT_RULES = 100;
/** At most this many of a tenant's active rules are run against each live event. */
const MAX_LIVE_RULES = 50;
const PREVIEW_DEFAULT = 50;
const PREVIEW_MAX = 200;

/**
 * shield-ingest's global ValidationPipe runs with forbidUnknownValues: true
 * (main.ts), which throws "An unknown value was passed to the validate
 * function" for any class with zero class-validator decorators - it can't
 * tell an intentionally-empty schema from one nobody got around to
 * decorating. These were plain interfaces/classes with none, so every call
 * to POST/PATCH /api/v1/detections failed identically regardless of body.
 */
export class ConditionRule {
  @IsString()
  field!: string;

  @IsIn(OPERATORS)
  operator!: (typeof OPERATORS)[number];

  value: any;
}

export class RuleDefinition {
  @IsIn(RULE_TYPES)
  ruleType!: (typeof RULE_TYPES)[number];

  @IsOptional()
  @IsString()
  eventClass?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionRule)
  conditions!: ConditionRule[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupBy?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  windowMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  threshold?: number;
}

export class CreateDetectionRuleDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(RULE_TYPES)
  ruleType?: (typeof RULE_TYPES)[number];

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: (typeof SEVERITIES)[number];

  @IsObject()
  @ValidateNested()
  @Type(() => RuleDefinition)
  conditionDefinition!: RuleDefinition;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFields?: string[];

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class UpdateDetectionRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(SEVERITIES)
  severity?: (typeof SEVERITIES)[number];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RuleDefinition)
  conditionDefinition?: RuleDefinition;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFields?: string[];
}

export class PreviewRuleDto {
  @IsObject()
  @ValidateNested()
  @Type(() => RuleDefinition)
  conditionDefinition!: RuleDefinition;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PREVIEW_MAX)
  limit?: number;
}

/** A recorded evaluation of one rule against one event. */
type RunRecord = Awaited<ReturnType<PrismaService['detectionRun']['create']>>;

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
    if (dto.tenantId) {
      const owned = await this.prisma.detectionRule.count({
        where: { tenant_id: dto.tenantId },
      });
      if (owned >= MAX_TENANT_RULES) {
        throw new BadRequestException(
          `A tenant can have at most ${MAX_TENANT_RULES} rules. Disable or edit an existing one.`,
        );
      }
    }

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
  // Replays always get a run back; the live path gets null for a non-match.
  private async evaluateRuleAgainstEvent(
    rule: any,
    event: any,
  ): Promise<RunRecord>;
  private async evaluateRuleAgainstEvent(
    rule: any,
    event: any,
    options: { live: true },
  ): Promise<RunRecord | null>;
  private async evaluateRuleAgainstEvent(
    rule: any,
    event: any,
    options: { live?: boolean } = {},
  ): Promise<RunRecord | null> {
    // Replays record a run for every rule and event, matched or not. Running live, that
    // would add a row per rule on every event, forever; only matches and errors are kept.
    const nonMatch = (result: string, details: string) =>
      options.live ? null : this.recordRun(rule, event, result, details);
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
        return nonMatch(
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
      return nonMatch('NO_MATCH', `event_class mismatch`);
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
      return nonMatch('NO_MATCH', 'Conditions did not match');
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
        return nonMatch(
          'NO_MATCH',
          `Threshold not met: ${matchingCount}/${definition.threshold} events in ${definition.windowMinutes}m window`,
        );
      }
      // Once a threshold rule has fired, stay quiet for the rest of its window instead
      // of raising an alert for every further event.
      if (options.live) {
        const recent = await this.prisma.detectionRun.findFirst({
          where: {
            rule_id: rule.id,
            tenant_id: event.tenant_id,
            result: 'MATCHED',
            executed_at: {
              gte: new Date(Date.now() - definition.windowMinutes * 60 * 1000),
            },
          },
          select: { id: true },
        });
        if (recent) return null;
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
  /**
   * Run a new event through the tenant's OWN active rules, raising an alert for each match.
   *
   * Only rules the tenant created run here. The shared, platform-wide rules are not run
   * on live events by this path, so turning a tenant's own rules on cannot change what
   * every other tenant sees. A fault in one rule is logged and skipped; it never stops the
   * others or fails the caller.
   */
  async evaluateTenantRules(event: any) {
    const rules = await this.prisma.detectionRule.findMany({
      where: { status: 'ACTIVE', tenant_id: event.tenant_id },
      orderBy: { created_at: 'asc' },
      take: MAX_LIVE_RULES,
    });
    const matched = [];
    for (const rule of rules) {
      try {
        const run = await this.evaluateRuleAgainstEvent(rule, event, {
          live: true,
        });
        if (run?.result === 'MATCHED') matched.push(run);
      } catch (error) {
        this.logger.warn(
          `Rule '${rule.name}' (${rule.id}) failed on event ${event.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return matched;
  }

  /**
   * What a rule WOULD do: run its conditions over the tenant's most recent events and
   * report how many match, without recording anything or raising any alert. Lets an admin
   * tune a rule before it goes live.
   */
  async previewRule(
    tenantId: string,
    definition: RuleDefinition,
    limit = PREVIEW_DEFAULT,
  ) {
    if (definition.ruleType !== 'MATCH') {
      throw new BadRequestException(
        'Only single-event (MATCH) rules can be previewed.',
      );
    }
    const take = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), PREVIEW_MAX)
      : PREVIEW_DEFAULT;
    const events = await this.prisma.normalizedEvent.findMany({
      where: { tenant_id: tenantId },
      orderBy: { recorded_at: 'desc' },
      take,
    });
    const matches = events.filter((event) =>
      this.matchesDefinition(definition, event),
    );
    return {
      evaluated: events.length,
      matched: matches.length,
      samples: matches.slice(0, 5).map((e) => ({
        id: e.id,
        recordedAt: e.recorded_at,
        activity: e.event_activity ?? e.event_class,
        resource: e.resource_id,
        actor: e.actor_user_id,
        outcome: e.outcome,
      })),
    };
  }

  /** Whether one event satisfies a MATCH rule's event class and conditions. */
  private matchesDefinition(definition: RuleDefinition, event: any): boolean {
    if (definition.eventClass && event.event_class !== definition.eventClass) {
      return false;
    }
    return (definition.conditions || []).every((cond) =>
      this.evalSingleCondition(cond, event),
    );
  }

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
