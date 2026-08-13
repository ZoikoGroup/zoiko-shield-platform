import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialEntitlementService } from '../commercial/commercial-entitlement.service';
import { MeteringService } from '../metering/metering.service';

export class RecordAiUsageDto {
  @IsString()
  tenantId!: string;

  @IsString()
  workflow!: string;

  @IsString()
  provider!: string;

  @IsString()
  model!: string;

  @IsOptional()
  @IsInt()
  inputTokens?: number;

  @IsOptional()
  @IsInt()
  outputTokens?: number;

  @IsOptional()
  @IsInt()
  toolCalls?: number;

  @IsOptional()
  @IsInt()
  retrievalCalls?: number;

  /** Actual internal cost incurred with the provider — never invented, supplied by the caller's own cost tracking. */
  @IsNumber()
  internalCost!: number;
}

/**
 * ZS-COM-BILL-001 AI-01: internal AI cost != customer billable usage.
 * Every AI action is logged here regardless of billing; it becomes
 * customer-billable only via markBillable, which requires an active
 * AI_SECURITY entitlement (explicit customer authorization) and routes
 * through the existing MeteringService pipeline — never a second, looser
 * billing path. A provider fallback to a more expensive model changes
 * internal_cost, never billable status.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementService: CommercialEntitlementService,
    private readonly meteringService: MeteringService,
  ) {}

  async recordUsage(dto: RecordAiUsageDto) {
    return this.prisma.aiUsageRecord.create({
      data: {
        tenant_id: dto.tenantId,
        workflow: dto.workflow,
        provider: dto.provider,
        model: dto.model,
        input_tokens: dto.inputTokens ?? 0,
        output_tokens: dto.outputTokens ?? 0,
        tool_calls: dto.toolCalls ?? 0,
        retrieval_calls: dto.retrievalCalls ?? 0,
        internal_cost: dto.internalCost,
        billable: false,
      },
    });
  }

  async getUsageById(tenantId: string, id: string) {
    const usage = await this.prisma.aiUsageRecord.findFirst({ where: { id, tenant_id: tenantId } });
    if (!usage) {
      throw new NotFoundException(`AI usage record '${id}' not found`);
    }
    return usage;
  }

  /**
   * The one path from internal AI cost to customer billing. Fails closed
   * without an active AI_SECURITY entitlement — no catalog authorization,
   * no charge, no matter how much was actually spent with the provider.
   */
  async markBillable(tenantId: string, usageId: string, meterKey: string, quantity: number) {
    const usage = await this.getUsageById(tenantId, usageId);
    if (usage.billable) {
      throw new ConflictException(`AI usage record '${usageId}' is already billable`);
    }

    const entitled = await this.entitlementService.checkEntitlement(usage.tenant_id, 'AI_SECURITY');
    if (!entitled) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_AI_ENTITLEMENT',
        message: `Tenant '${usage.tenant_id}' has no active AI_SECURITY entitlement; AI usage cannot be billed`,
      });
    }

    const result = await this.meteringService.recordEvent({
      tenantId: usage.tenant_id,
      meterKey,
      source: `ai:${usage.provider}:${usage.model}`,
      sourceEventId: usage.id,
      occurredAt: usage.occurred_at,
      quantity,
    });

    return this.prisma.aiUsageRecord.update({
      where: { id: usageId },
      data: { billable: true, meter_event_id: result.event.id },
    });
  }
}
