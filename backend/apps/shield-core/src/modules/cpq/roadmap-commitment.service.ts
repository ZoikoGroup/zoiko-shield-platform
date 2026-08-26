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
  MinLength,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { QuoteService } from './quote.service';

const DELIVERY_DEPENDENCY_TYPES = [
  'PRODUCT_RELEASE',
  'DELIVERY_MILESTONE',
  'THIRD_PARTY_DEPENDENCY',
] as const;

interface RoadmapContext {
  tenantId: string;
  environmentId: string;
  actorId: string;
}

export class CreateRoadmapCommitmentDto {
  @IsString()
  @MinLength(3)
  commitmentKey!: string;

  @IsUUID()
  targetProductId!: string;

  @IsString()
  @MinLength(3)
  featureKey!: string;

  @IsString()
  @MinLength(20)
  nonGaLanguage!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  conditions!: string[];

  @IsIn(DELIVERY_DEPENDENCY_TYPES)
  deliveryDependencyType!: (typeof DELIVERY_DEPENDENCY_TYPES)[number];

  @IsString()
  @MinLength(3)
  deliveryDependencyReference!: string;

  @IsOptional()
  @IsISO8601()
  targetDeliveryDate?: Date;
}

export class SubmitRoadmapCommitmentDto {
  @IsOptional()
  @IsISO8601()
  approvalExpiresAt?: Date;
}

export class DecideRoadmapCommitmentDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class PassRoadmapReleaseGateDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  evidenceRefs!: string[];
}

@Injectable()
export class RoadmapCommitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuoteService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  private normalized(values: string[], field: string) {
    const result = [
      ...new Set((values ?? []).map((value) => value?.trim()).filter(Boolean)),
    ].sort();
    if (result.length === 0) {
      throw new BadRequestException(`${field} requires at least one value`);
    }
    return result;
  }

  private required(value: string, field: string) {
    const result = value?.trim();
    if (!result) throw new BadRequestException(`${field} is required`);
    return result;
  }

  private async getScoped(id: string, tenantId: string, environmentId: string) {
    const commitment = await this.prisma.roadmapCommitment.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
      include: {
        legalApproval: true,
        productApproval: true,
        targetProduct: { include: { catalogVersion: true } },
      },
    });
    if (!commitment) {
      throw new NotFoundException(`Roadmap commitment '${id}' not found`);
    }
    return commitment;
  }

  async create(
    context: RoadmapContext,
    quoteId: string,
    dto: CreateRoadmapCommitmentDto,
  ) {
    const quote = await this.quotes.getQuoteById(
      quoteId,
      context.tenantId,
      context.environmentId,
    );
    if (quote.status !== 'DRAFT') {
      throw new ConflictException(
        'Roadmap language can be attached only while the quote is DRAFT',
      );
    }

    const product = await this.prisma.product.findUnique({
      where: { id: dto.targetProductId },
      include: { catalogVersion: true },
    });
    if (!product) {
      throw new NotFoundException(
        `Target roadmap product '${dto.targetProductId}' not found`,
      );
    }
    if (product.release_status === 'RELEASED') {
      throw new ConflictException(
        `Product '${product.sku}' is already RELEASED; quote it as a normal catalog line instead of roadmap language`,
      );
    }
    if (product.catalogVersion.status !== 'DRAFT') {
      throw new ConflictException(
        'A roadmap target must belong to a future DRAFT catalog so its release can pass the normal catalog gate',
      );
    }

    const language = this.required(dto.nonGaLanguage, 'nonGaLanguage');
    if (!/(non[\s-]?ga|not generally available)/i.test(language)) {
      throw new BadRequestException(
        'Roadmap language must explicitly state that the feature is non-GA or not generally available',
      );
    }
    if (!/(conditional|subject to|not guaranteed)/i.test(language)) {
      throw new BadRequestException(
        'Roadmap language must explicitly state that delivery is conditional, subject to conditions, or not guaranteed',
      );
    }
    const targetDeliveryDate = dto.targetDeliveryDate
      ? new Date(dto.targetDeliveryDate)
      : undefined;
    if (targetDeliveryDate && targetDeliveryDate <= new Date()) {
      throw new BadRequestException('targetDeliveryDate must be in the future');
    }

    return this.prisma.roadmapCommitment.create({
      data: {
        tenant_id: context.tenantId,
        environment_id: context.environmentId,
        quote_id: quote.id,
        commitment_key: this.required(dto.commitmentKey, 'commitmentKey'),
        target_product_id: product.id,
        target_catalog_version_id: product.catalog_version_id,
        feature_key: this.required(dto.featureKey, 'featureKey'),
        non_ga_language: language,
        conditions: JSON.stringify(
          this.normalized(dto.conditions, 'conditions'),
        ),
        delivery_dependency_type: dto.deliveryDependencyType,
        delivery_dependency_reference: this.required(
          dto.deliveryDependencyReference,
          'deliveryDependencyReference',
        ),
        target_delivery_date: targetDeliveryDate,
        status: 'DRAFT',
        entitlement_effect: 'NONE',
        runtime_access_status: 'DISABLED',
        created_by: context.actorId,
      },
      include: { targetProduct: true },
    });
  }

  async list(tenantId: string, environmentId: string, quoteId: string) {
    await this.quotes.getQuoteById(quoteId, tenantId, environmentId);
    return this.prisma.roadmapCommitment.findMany({
      where: {
        quote_id: quoteId,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
      include: {
        legalApproval: true,
        productApproval: true,
        targetProduct: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async submit(
    context: RoadmapContext,
    quoteId: string,
    commitmentId: string,
    dto: SubmitRoadmapCommitmentDto,
  ) {
    const quote = await this.quotes.getQuoteById(
      quoteId,
      context.tenantId,
      context.environmentId,
    );
    const commitment = await this.getScoped(
      commitmentId,
      context.tenantId,
      context.environmentId,
    );
    if (commitment.quote_id !== quote.id) {
      throw new NotFoundException(
        `Roadmap commitment '${commitmentId}' not found for quote '${quoteId}'`,
      );
    }
    if (quote.status !== 'DRAFT' || commitment.status !== 'DRAFT') {
      throw new ConflictException(
        'Only a DRAFT roadmap commitment on a DRAFT quote can be submitted',
      );
    }
    const approvalExpiresAt = dto.approvalExpiresAt
      ? new Date(dto.approvalExpiresAt)
      : undefined;
    if (approvalExpiresAt && approvalExpiresAt <= new Date()) {
      throw new BadRequestException('approvalExpiresAt must be in the future');
    }
    const snapshot = {
      quoteId: quote.id,
      quoteKey: quote.quote_key,
      quoteVersion: quote.version,
      commitmentKey: commitment.commitment_key,
      targetProductId: commitment.target_product_id,
      targetCatalogVersionId: commitment.target_catalog_version_id,
      featureKey: commitment.feature_key,
      nonGaLanguage: commitment.non_ga_language,
      conditions: JSON.parse(commitment.conditions),
      deliveryDependencyType: commitment.delivery_dependency_type,
      deliveryDependencyReference: commitment.delivery_dependency_reference,
      targetDeliveryDate: commitment.target_delivery_date,
      entitlementEffect: 'NONE',
      runtimeAccessStatus: 'DISABLED',
    };

    return this.prisma.$transaction(async (tx) => {
      const legalApproval = await this.approvals.requestApproval(
        {
          changeType: 'ROADMAP_LEGAL_REVIEW',
          objectType: 'RoadmapCommitment',
          objectId: commitment.id,
          tenantId: context.tenantId,
          requestedBy: context.actorId,
          reason: `Legal review of conditional non-GA roadmap commitment ${commitment.commitment_key}`,
          proposedSnapshot: snapshot,
          requiredApprovalRole: 'LEGAL_APPROVER',
          expiresAt: approvalExpiresAt,
        },
        tx,
      );
      const productApproval = await this.approvals.requestApproval(
        {
          changeType: 'ROADMAP_PRODUCT_REVIEW',
          objectType: 'RoadmapCommitment',
          objectId: commitment.id,
          tenantId: context.tenantId,
          requestedBy: context.actorId,
          reason: `Product review of delivery dependency for roadmap commitment ${commitment.commitment_key}`,
          proposedSnapshot: snapshot,
          requiredApprovalRole: 'PRODUCT_APPROVER',
          expiresAt: approvalExpiresAt,
        },
        tx,
      );
      return tx.roadmapCommitment.update({
        where: { id: commitment.id },
        data: {
          status: 'PENDING_APPROVAL',
          legal_approval_id: legalApproval.id,
          product_approval_id: productApproval.id,
          submitted_by: context.actorId,
          submitted_at: new Date(),
        },
        include: { legalApproval: true, productApproval: true },
      });
    });
  }

  async decide(
    tenantId: string,
    environmentId: string,
    commitmentId: string,
    lane: 'LEGAL' | 'PRODUCT',
    actorId: string,
    dto: DecideRoadmapCommitmentDto,
  ) {
    const commitment = await this.getScoped(
      commitmentId,
      tenantId,
      environmentId,
    );
    if (commitment.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        `Roadmap commitment '${commitmentId}' is ${commitment.status}, not PENDING_APPROVAL`,
      );
    }
    const approval =
      lane === 'LEGAL' ? commitment.legalApproval : commitment.productApproval;
    const otherApproval =
      lane === 'LEGAL' ? commitment.productApproval : commitment.legalApproval;
    const expectedChangeType =
      lane === 'LEGAL' ? 'ROADMAP_LEGAL_REVIEW' : 'ROADMAP_PRODUCT_REVIEW';
    if (
      !approval ||
      approval.object_type !== 'RoadmapCommitment' ||
      approval.object_id !== commitment.id ||
      approval.change_type !== expectedChangeType
    ) {
      throw new ConflictException(
        `Roadmap commitment is missing its valid ${lane} approval record`,
      );
    }
    if (
      dto.decision === 'APPROVED' &&
      otherApproval?.approved_by === actorId &&
      ['APPROVED', 'APPLIED'].includes(otherApproval.status)
    ) {
      throw new ConflictException(
        'Legal and Product roadmap approvals require distinct approvers',
      );
    }

    const decided = await this.approvals.decideApproval(
      approval.id,
      actorId,
      dto.decision,
      dto.reason,
    );
    if (dto.decision === 'REJECTED') {
      return this.prisma.roadmapCommitment.update({
        where: { id: commitment.id },
        data: {
          status: 'REJECTED',
          ...(lane === 'LEGAL'
            ? {
                legal_approved_by: actorId,
                legal_approved_at: decided.approved_at,
              }
            : {
                product_approved_by: actorId,
                product_approved_at: decided.approved_at,
              }),
        },
      });
    }

    const otherApproved =
      otherApproval && ['APPROVED', 'APPLIED'].includes(otherApproval.status);
    return this.prisma.roadmapCommitment.update({
      where: { id: commitment.id },
      data: {
        status: otherApproved ? 'APPROVED' : 'PENDING_APPROVAL',
        ...(lane === 'LEGAL'
          ? {
              legal_approved_by: actorId,
              legal_approved_at: decided.approved_at,
              ...(otherApproved
                ? {
                    product_approved_by: otherApproval.approved_by,
                    product_approved_at: otherApproval.approved_at,
                  }
                : {}),
            }
          : {
              product_approved_by: actorId,
              product_approved_at: decided.approved_at,
              ...(otherApproved
                ? {
                    legal_approved_by: otherApproval.approved_by,
                    legal_approved_at: otherApproval.approved_at,
                  }
                : {}),
            }),
      },
      include: { legalApproval: true, productApproval: true },
    });
  }

  async passReleaseGate(
    tenantId: string,
    environmentId: string,
    commitmentId: string,
    actorId: string,
    dto: PassRoadmapReleaseGateDto,
  ) {
    const commitment = await this.getScoped(
      commitmentId,
      tenantId,
      environmentId,
    );
    if (commitment.status !== 'APPROVED') {
      throw new ConflictException(
        'Release gate requires an APPROVED Legal/Product roadmap commitment',
      );
    }
    if (
      commitment.targetProduct.release_status !== 'RELEASED' ||
      commitment.targetProduct.catalogVersion.status !== 'APPROVED'
    ) {
      throw new ConflictException(
        'Runtime eligibility remains disabled until the target product is RELEASED in an APPROVED catalog',
      );
    }
    return this.prisma.roadmapCommitment.update({
      where: { id: commitment.id },
      data: {
        status: 'RELEASE_GATE_PASSED',
        entitlement_effect: 'NONE',
        runtime_access_status: 'ELIGIBLE_FOR_SEPARATE_ORDER',
        release_gate_evidence_refs: JSON.stringify(
          this.normalized(dto.evidenceRefs, 'evidenceRefs'),
        ),
        release_gate_passed_by: actorId,
        release_gate_passed_at: new Date(),
      },
    });
  }
}
