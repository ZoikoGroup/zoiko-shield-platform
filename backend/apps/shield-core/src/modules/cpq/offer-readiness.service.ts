import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class VerifyCpqOfferReadinessDto {
  @IsUUID()
  catalogVersionId!: string;

  @IsUUID()
  productId!: string;

  @IsString()
  region!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  retentionProfiles!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serviceTiers!: string[];

  @IsArray()
  @IsString({ each: true })
  supportedConnectorKeys!: string[];

  @IsArray()
  @IsString({ each: true })
  obligationTypes!: string[];

  @IsIn(['AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'NOT_APPLICABLE'])
  serviceCapacityStatus!: string;

  @IsIn(['AVAILABLE', 'UNAVAILABLE'])
  marketAvailabilityStatus!: string;

  @IsIn(['ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE', 'NOT_APPLICABLE'])
  claimEligibilityStatus!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  evidenceRefs!: string[];

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;
}

@Injectable()
export class OfferReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  private normalized(values: string[], field: string, requireOne = false) {
    const result = [
      ...new Set((values ?? []).map((value) => value?.trim()).filter(Boolean)),
    ];
    if (requireOne && result.length === 0) {
      throw new BadRequestException(`${field} requires at least one value`);
    }
    return result.sort();
  }

  async verify(dto: VerifyCpqOfferReadinessDto, verifiedBy: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        catalog_version_id: dto.catalogVersionId,
        release_status: 'RELEASED',
        catalogVersion: { status: 'APPROVED' },
      },
    });
    if (!product) {
      throw new NotFoundException(
        'Readiness can be verified only for a RELEASED product in the approved catalog version',
      );
    }
    const region = dto.region.trim();
    if (!region) throw new BadRequestException('region is required');
    const productRegions = this.parseArray(product.region_scope);
    if (
      productRegions.length > 0 &&
      !productRegions.includes('GLOBAL') &&
      !productRegions.includes(region)
    ) {
      throw new ConflictException(
        `Product '${product.sku}' is not released for region '${region}'`,
      );
    }
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException(
        'effectiveTo must be later than effectiveFrom',
      );
    }
    const prior = await this.prisma.cpqOfferReadiness.findFirst({
      where: { product_id: product.id, region },
      orderBy: { version: 'desc' },
    });
    return this.prisma.cpqOfferReadiness.create({
      data: {
        catalog_version_id: dto.catalogVersionId,
        product_id: product.id,
        region,
        version: (prior?.version ?? 0) + 1,
        retention_profiles: JSON.stringify(
          this.normalized(dto.retentionProfiles, 'retentionProfiles', true),
        ),
        service_tiers: JSON.stringify(
          this.normalized(dto.serviceTiers, 'serviceTiers', true),
        ),
        supported_connector_keys: JSON.stringify(
          this.normalized(dto.supportedConnectorKeys, 'supportedConnectorKeys'),
        ),
        obligation_types: JSON.stringify(
          this.normalized(dto.obligationTypes, 'obligationTypes'),
        ),
        service_capacity_status: dto.serviceCapacityStatus,
        market_availability_status: dto.marketAvailabilityStatus,
        claim_eligibility_status: dto.claimEligibilityStatus,
        evidence_refs: JSON.stringify(
          this.normalized(dto.evidenceRefs, 'evidenceRefs', true),
        ),
        status: 'VERIFIED',
        verified_by: verifiedBy,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      },
    });
  }

  async list(productId: string, region?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(`Product '${productId}' not found`);
    }
    return this.prisma.cpqOfferReadiness.findMany({
      where: {
        product_id: productId,
        ...(region?.trim() ? { region: region.trim() } : {}),
      },
      orderBy: [{ region: 'asc' }, { version: 'desc' }],
    });
  }

  private parseArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  async assertReady(params: {
    catalogVersionId: string;
    productId: string;
    region: string;
    retentionProfile: string;
    serviceTier: string;
    connectorDependencies: string[];
    obligations: string[];
  }) {
    const now = new Date();
    const readiness = await this.prisma.cpqOfferReadiness.findFirst({
      where: {
        catalog_version_id: params.catalogVersionId,
        product_id: params.productId,
        region: params.region,
        status: 'VERIFIED',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      orderBy: { version: 'desc' },
    });
    if (!readiness) {
      throw new ConflictException({
        statusCode: 409,
        error: 'OFFER_READINESS_NOT_VERIFIED',
        message: `No current verified CPQ readiness exists for product '${params.productId}' in region '${params.region}'`,
      });
    }
    if (
      !['AVAILABLE', 'NOT_APPLICABLE'].includes(
        readiness.service_capacity_status,
      ) ||
      readiness.market_availability_status !== 'AVAILABLE' ||
      !['ELIGIBLE', 'NOT_APPLICABLE'].includes(
        readiness.claim_eligibility_status,
      )
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'OFFER_NOT_COMMERCIALLY_READY',
        message: `Offer readiness '${readiness.id}' does not permit quoting: capacity=${readiness.service_capacity_status}, market=${readiness.market_availability_status}, claim=${readiness.claim_eligibility_status}`,
      });
    }
    const allowedRetention = new Set(
      this.parseArray(readiness.retention_profiles),
    );
    const allowedTiers = new Set(this.parseArray(readiness.service_tiers));
    const allowedConnectors = new Set(
      this.parseArray(readiness.supported_connector_keys),
    );
    const allowedObligations = new Set(
      this.parseArray(readiness.obligation_types),
    );
    const unsupported = [
      ...(!allowedRetention.has(params.retentionProfile)
        ? [`retention:${params.retentionProfile}`]
        : []),
      ...(!allowedTiers.has(params.serviceTier)
        ? [`serviceTier:${params.serviceTier}`]
        : []),
      ...params.connectorDependencies
        .filter((value) => !allowedConnectors.has(value))
        .map((value) => `connector:${value}`),
      ...params.obligations
        .filter((value) => !allowedObligations.has(value))
        .map((value) => `obligation:${value}`),
    ];
    if (unsupported.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'QUOTE_CONFIGURATION_UNSUPPORTED',
        message: `Offer readiness '${readiness.id}' does not support: ${unsupported.join(', ')}`,
      });
    }
    return readiness;
  }
}
