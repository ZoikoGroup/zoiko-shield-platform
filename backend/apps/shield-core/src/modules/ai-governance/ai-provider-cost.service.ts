import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class RecordAiProviderCostEventDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  environmentId?: string;

  @IsOptional()
  @IsString()
  governanceProfileId?: string;

  @IsString()
  provider!: string;

  @IsString()
  model!: string;

  @IsString()
  modelClass!: string;

  @IsString()
  providerPriceVersion!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priorUnitCost?: number;

  @IsNumber()
  @Min(0)
  newUnitCost!: number;

  @IsString()
  costUnit!: string;

  @IsISO8601()
  effectiveAt!: Date;

  @IsString()
  sourceReference!: string;

  @IsString()
  recordedBy!: string;
}

/** Provider price movement is a cost/margin event, never a customer price mutation. */
@Injectable()
export class AiProviderCostService {
  constructor(private readonly prisma: PrismaService) {}

  private required(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  async record(dto: RecordAiProviderCostEventDto) {
    if (dto.governanceProfileId) {
      const profile = await this.prisma.aiGovernanceProfile.findFirst({
        where: {
          id: dto.governanceProfileId,
          tenant_id: dto.tenantId,
          environment_id: dto.environmentId,
        },
      });
      if (!profile) {
        throw new NotFoundException(
          `AI governance profile '${dto.governanceProfileId}' not found`,
        );
      }
    }
    return this.prisma.aiProviderCostEvent.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: dto.environmentId,
        governance_profile_id: dto.governanceProfileId,
        provider: this.required(dto.provider, 'provider'),
        model: this.required(dto.model, 'model'),
        model_class: this.required(dto.modelClass, 'modelClass'),
        provider_price_version: this.required(
          dto.providerPriceVersion,
          'providerPriceVersion',
        ),
        prior_unit_cost: dto.priorUnitCost,
        new_unit_cost: dto.newUnitCost,
        cost_unit: this.required(dto.costUnit, 'costUnit'),
        effective_at: new Date(dto.effectiveAt),
        source_reference: this.required(dto.sourceReference, 'sourceReference'),
        customer_price_changed: false,
        recorded_by: this.required(dto.recordedBy, 'recordedBy'),
      },
    });
  }

  async list(tenantId: string, environmentId: string) {
    return this.prisma.aiProviderCostEvent.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: { effective_at: 'desc' },
    });
  }
}
