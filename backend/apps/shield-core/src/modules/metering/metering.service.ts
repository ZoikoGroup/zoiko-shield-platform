import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { MeterDefinitionService } from './meter-definition.service';
import {
  MeterGovernanceService,
  type MeterEvaluation,
} from './meter-governance.service';

export class RecordMeterEventDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  environmentId?: string;

  @IsString()
  meterKey!: string;

  @IsString()
  source!: string;

  @IsString()
  sourceEventId!: string;

  @IsISO8601()
  occurredAt!: Date;

  @IsOptional()
  @IsInt()
  @IsPositive()
  quantity?: number;

  /** Processing loss is retained distinctly from source rejection/quarantine. */
  @IsOptional()
  @IsIn(['NORMAL', 'REJECTED', 'QUARANTINED', 'PROCESSING_LOSS'])
  intake?: 'NORMAL' | 'REJECTED' | 'QUARANTINED' | 'PROCESSING_LOSS';

  /** NORMAL events only bill when the upstream pipeline explicitly validated them. */
  @IsOptional()
  @IsIn(['VALID', 'INVALID', 'SCHEMA_UNKNOWN', 'POLICY_BLOCKED'])
  validationState?: 'VALID' | 'INVALID' | 'SCHEMA_UNKNOWN' | 'POLICY_BLOCKED';

  @IsOptional()
  @IsString()
  validationReason?: string;

  @IsOptional()
  @IsUUID()
  usageAuthorizationId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isPlatformGenerated?: boolean;
}

/**
 * Accepted security telemetry is immutable evidence, not billing authority.
 * Billable quantity requires an approved contract policy, exact scope, a
 * validated event and any required customer usage authorization.
 */
@Injectable()
export class MeteringService {
  private readonly logger = new Logger(MeteringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meterDefinitionService: MeterDefinitionService,
    private readonly governance: MeterGovernanceService,
  ) {}

  private sourceScope(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private eventPayload(
    dto: RecordMeterEventDto,
    definitionId: string,
    environmentId: string,
    facts: Record<string, unknown>,
  ) {
    return {
      tenantId: dto.tenantId,
      environmentId,
      meterDefinitionId: definitionId,
      source: dto.source,
      sourceEventId: dto.sourceEventId,
      occurredAt: new Date(dto.occurredAt).toISOString(),
      quantity: dto.quantity ?? 1,
      isPlatformGenerated: dto.isPlatformGenerated ?? false,
      metadata: dto.metadata ?? {},
      ...facts,
    };
  }

  async recordEvent(dto: RecordMeterEventDto) {
    const definition = await this.meterDefinitionService.getActiveDefinition(
      dto.meterKey,
      new Date(dto.occurredAt),
    );
    if (!definition) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_APPROVED_METER_DEFINITION',
        message: `No approved, effective meter definition for '${dto.meterKey}'`,
      });
    }

    const quantity = dto.quantity ?? 1;
    const environmentId = dto.environmentId?.trim() || 'UNBOUND';
    const dedupeKey = `${dto.source}:${dto.sourceEventId}`;
    const intake = dto.intake ?? 'NORMAL';
    const declaredSources = this.sourceScope(definition.source_scope);
    const sourceAuthorizedByDefinition = declaredSources.includes(dto.source);
    const validationState = dto.validationState ?? 'UNVALIDATED';
    const validationReason =
      dto.validationReason ??
      (!sourceAuthorizedByDefinition
        ? `Source '${dto.source}' is outside the approved meter definition scope`
        : validationState === 'UNVALIDATED'
          ? 'Upstream validation was not supplied'
          : undefined);

    if (
      intake !== 'NORMAL' ||
      validationState !== 'VALID' ||
      !sourceAuthorizedByDefinition
    ) {
      const acceptedState =
        intake !== 'NORMAL'
          ? intake
          : validationState === 'INVALID'
            ? 'REJECTED'
            : 'QUARANTINED';
      const payload = this.eventPayload(dto, definition.id, environmentId, {
        validationState,
        validationReason,
        acceptedState,
        billableState: 'NON_BILLABLE',
      });
      const event = await this.prisma.meterEvent.create({
        data: {
          tenant_id: dto.tenantId,
          environment_id: environmentId,
          meter_definition_id: definition.id,
          source: dto.source,
          source_event_id: dto.sourceEventId,
          occurred_at: new Date(dto.occurredAt),
          quantity,
          unit: definition.unit,
          validation_state: validationState,
          validation_reason: validationReason,
          accepted_state: acceptedState,
          billable_state: 'NON_BILLABLE',
          dedupe_key: dedupeKey,
          is_platform_generated: dto.isPlatformGenerated ?? false,
          event_metadata: JSON.stringify(dto.metadata ?? {}),
          immutable_hash: this.governance.immutableHash(payload),
        },
      });
      return {
        event,
        duplicate: false,
        usageRecord: null,
        action: 'FAIL_CLOSED',
      };
    }

    const baseEvaluation: MeterEvaluation = {
      policy: null,
      usageAuthorizationId: null,
      billableQuantity: 0,
      overageQuantity: 0,
      classification: 'UNAUTHORIZED_NON_BILLABLE',
      action: 'NO_CONTRACT_METER_POLICY',
    };

    let policy = null;
    if (
      !dto.isPlatformGenerated &&
      definition.billable_policy !== 'NEVER_BILLABLE'
    ) {
      policy = await this.governance.resolveEffectivePolicy(
        dto.tenantId,
        environmentId,
        definition.id,
        dto.source,
        new Date(dto.occurredAt),
      );
    } else if (dto.isPlatformGenerated) {
      baseEvaluation.classification = 'PLATFORM_GENERATED_NON_BILLABLE';
      baseEvaluation.action = 'PRESERVE_AS_NON_BILLABLE_EVIDENCE';
    } else {
      baseEvaluation.classification = 'METER_NEVER_BILLABLE';
      baseEvaluation.action = 'PRESERVE_AS_NON_BILLABLE_EVIDENCE';
    }

    const lockPeriod = policy
      ? this.governance
          .periodBounds(new Date(dto.occurredAt), policy.billing_period)
          .start.toISOString()
      : dedupeKey;
    const lockKey = policy
      ? `meter-policy:${policy.id}:${lockPeriod}`
      : `meter-dedupe:${dto.tenantId}:${environmentId}:${definition.id}:${dedupeKey}`;

    const result = await this.prisma.$transaction(
      async (tx) => {
        // A policy-period advisory lock serializes cap/overage arithmetic. A
        // dedupe-key lock covers non-billable policies, so concurrent replays
        // still produce one accepted event and one DUPLICATE evidence row.
        if (typeof tx.$executeRaw === 'function') {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;
        }
        const priorAccepted = await tx.meterEvent.findFirst({
          where: {
            tenant_id: dto.tenantId,
            environment_id: environmentId,
            meter_definition_id: definition.id,
            dedupe_key: dedupeKey,
            accepted_state: 'ACCEPTED',
          },
        });
        if (priorAccepted) {
          const duplicatePayload = this.eventPayload(
            dto,
            definition.id,
            environmentId,
            {
              validationState: 'VALID',
              acceptedState: 'DUPLICATE',
              billableState: 'NON_BILLABLE',
              duplicateOf: priorAccepted.id,
            },
          );
          const event = await tx.meterEvent.create({
            data: {
              tenant_id: dto.tenantId,
              environment_id: environmentId,
              meter_definition_id: definition.id,
              source: dto.source,
              source_event_id: dto.sourceEventId,
              occurred_at: new Date(dto.occurredAt),
              quantity,
              unit: definition.unit,
              validation_state: 'VALID',
              accepted_state: 'DUPLICATE',
              billable_state: 'NON_BILLABLE',
              dedupe_state: 'DUPLICATE',
              dedupe_key: dedupeKey,
              is_platform_generated: dto.isPlatformGenerated ?? false,
              event_metadata: JSON.stringify({
                ...(dto.metadata ?? {}),
                duplicateOf: priorAccepted.id,
              }),
              immutable_hash: this.governance.immutableHash(duplicatePayload),
            },
          });
          return {
            event,
            duplicate: true as const,
            usageRecord: null,
            evaluation: null,
          };
        }

        const evaluation = policy
          ? await this.governance.evaluate(
              policy,
              quantity,
              new Date(dto.occurredAt),
              dto.usageAuthorizationId,
              tx,
            )
          : baseEvaluation;
        const billableState =
          evaluation.billableQuantity > 0 ? 'BILLABLE' : 'NON_BILLABLE';
        const payload = this.eventPayload(dto, definition.id, environmentId, {
          validationState: 'VALID',
          acceptedState: 'ACCEPTED',
          billableState,
          meterAuthorizationId: evaluation.policy?.id ?? null,
          usageAuthorizationId: evaluation.usageAuthorizationId,
          contractId: evaluation.policy?.contract_id ?? null,
          billableQuantity: evaluation.billableQuantity,
          overageQuantity: evaluation.overageQuantity,
          classification: evaluation.classification,
        });
        const event = await tx.meterEvent.create({
          data: {
            tenant_id: dto.tenantId,
            environment_id: environmentId,
            meter_definition_id: definition.id,
            meter_authorization_id: evaluation.policy?.id,
            usage_authorization_id: evaluation.usageAuthorizationId,
            contract_id: evaluation.policy?.contract_id,
            source: dto.source,
            source_event_id: dto.sourceEventId,
            occurred_at: new Date(dto.occurredAt),
            quantity,
            unit: definition.unit,
            validation_state: 'VALID',
            validation_reason: dto.validationReason,
            accepted_state: 'ACCEPTED',
            billable_state: billableState,
            dedupe_state: 'UNIQUE',
            dedupe_key: dedupeKey,
            is_platform_generated: dto.isPlatformGenerated ?? false,
            event_metadata: JSON.stringify(dto.metadata ?? {}),
            immutable_hash: this.governance.immutableHash(payload),
          },
        });
        const usagePayload = {
          eventId: event.id,
          eventHash: event.immutable_hash,
          acceptedQuantity: quantity,
          billableQuantity: evaluation.billableQuantity,
          overageQuantity: evaluation.overageQuantity,
          classification: evaluation.classification,
        };
        const usageRecord = await tx.usageRecord.create({
          data: {
            tenant_id: dto.tenantId,
            environment_id: environmentId,
            meter_definition_id: definition.id,
            meter_authorization_id: evaluation.policy?.id,
            usage_authorization_id: evaluation.usageAuthorizationId,
            contract_id: evaluation.policy?.contract_id,
            meter_version: `${definition.meter_key}:v${definition.version}`,
            source_type: dto.source,
            raw_event_id: event.id,
            unit: definition.unit,
            accepted_quantity: quantity,
            billable_quantity: evaluation.billableQuantity,
            overage_quantity: evaluation.overageQuantity,
            usage_state: 'ACCEPTED',
            usage_classification: evaluation.classification,
            immutable_hash: this.governance.immutableHash(usagePayload),
            occurred_at: new Date(dto.occurredAt),
          },
        });
        return {
          event,
          duplicate: false as const,
          usageRecord,
          evaluation,
        };
      },
      { isolationLevel: 'Serializable' },
    );

    if (result.duplicate || !result.evaluation) {
      return {
        event: result.event,
        duplicate: true,
        usageRecord: null,
        action: 'DEDUPLICATED',
      };
    }
    const evaluation = result.evaluation;
    if (evaluation.policy) {
      await this.governance.recordThresholds(
        evaluation.policy,
        new Date(dto.occurredAt),
      );
    }
    this.logger.log(
      `Meter event ${result.event.id}: ${evaluation.classification}; action=${evaluation.action}`,
    );
    return {
      event: result.event,
      usageRecord: result.usageRecord,
      duplicate: false,
      action: evaluation.action,
      policyId: evaluation.policy?.id ?? null,
    };
  }

  listEvents(tenantId: string, environmentId: string) {
    return this.prisma.meterEvent.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: { occurred_at: 'desc' },
    });
  }

  async getEvent(id: string, tenantId: string, environmentId: string) {
    const event = await this.prisma.meterEvent.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!event) throw new NotFoundException(`Meter event '${id}' not found`);
    return event;
  }

  async correctionLineage(id: string, tenantId: string, environmentId: string) {
    const event = await this.getEvent(id, tenantId, environmentId);
    const rootId = event.correction_of_event_id ?? event.id;
    const root = await this.getEvent(rootId, tenantId, environmentId);
    const corrections = await this.prisma.meterEvent.findMany({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        correction_of_event_id: rootId,
      },
      orderBy: { created_at: 'asc' },
    });
    return { root, corrections };
  }
}
