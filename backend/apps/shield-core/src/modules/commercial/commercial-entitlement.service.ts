import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';
import { assertTransition } from '../commerce/state-machine.util';

/**
 * ZS-COM-BILL-001 Part 20: entitlements are granted directly into ACTIVE
 * (existing, tested behavior — preserved), all subsequent moves must go
 * through this map rather than an arbitrary status string.
 */
const ENTITLEMENT_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['SUSPENDED', 'EXPIRED', 'REVOKED'],
  SUSPENDED: ['ACTIVE', 'REVOKED'],
  EXPIRED: [],
  REVOKED: [],
};

const BILLING_CLASSIFICATIONS = [
  'COMMERCIAL_DIRECT',
  'COMMERCIAL_ZOIKO_ONE',
  'COMMERCIAL_RESELLER',
  'DESIGN_PARTNER',
  'PILOT',
  'EVALUATION',
  'INTERNAL',
  'DEMO',
  'SANDBOX',
  'PARTNER_MANAGED',
] as const;
/** Part 1: never accidentally billable. */
export const NON_COMMERCIAL_CLASSIFICATIONS = [
  'INTERNAL',
  'DEMO',
  'SANDBOX',
  'EVALUATION',
  'PILOT',
];

export class CreateCommercialAccountDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(['DIRECT', 'ZOIKO_ONE_BUNDLE', 'RESELLER'])
  billingSource?: 'DIRECT' | 'ZOIKO_ONE_BUNDLE' | 'RESELLER';

  @IsOptional()
  @IsIn(BILLING_CLASSIFICATIONS)
  billingClassification?: (typeof BILLING_CLASSIFICATIONS)[number];

  @IsOptional()
  @IsString()
  groupAccountId?: string;

  @IsOptional()
  @IsString()
  legalEntityId?: string;

  @IsOptional()
  @IsString()
  businessUnitId?: string;

  @IsOptional()
  @IsString()
  environmentId?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  residencyPolicy?: string;
}

export class GrantEntitlementDto {
  @IsString()
  commercialAccountId!: string;

  @IsString()
  tenantId!: string;

  @IsIn([
    'MANAGED_DEFENSE',
    'CONTINUOUS_ASSURANCE',
    'EXPOSURE_MANAGEMENT',
    'AI_SECURITY',
  ])
  offerType!:
    | 'MANAGED_DEFENSE'
    | 'CONTINUOUS_ASSURANCE'
    | 'EXPOSURE_MANAGEMENT'
    | 'AI_SECURITY';

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;
}

@Injectable()
export class CommercialEntitlementService {
  private readonly logger = new Logger(CommercialEntitlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly killSwitchService: CommercialKillSwitchService,
  ) {}

  /**
   * Create a new commercial account (Plane 1)
   */
  async createCommercialAccount(dto: CreateCommercialAccountDto) {
    const classification = dto.billingClassification || 'COMMERCIAL_DIRECT';
    this.logger.log(
      `Creating Commercial Account '${dto.name}' with classification ${classification}`,
    );

    // Part 1: the account itself may be created before its legal entity is
    // finalized (e.g. during sales cycle). The hard gate is enforced at
    // quote-creation time (QuoteService.assertProductionReadyAccount) for
    // every classification outside NON_COMMERCIAL_CLASSIFICATIONS, so a
    // production account can never actually be quoted without one.
    return this.prisma.commercialAccount.create({
      data: {
        name: dto.name,
        billing_source: dto.billingSource || 'DIRECT',
        billing_classification: classification,
        status: 'ACTIVE',
        group_account_id: dto.groupAccountId,
        legal_entity_id: dto.legalEntityId,
        business_unit_id: dto.businessUnitId,
        environment_id: dto.environmentId,
        region: dto.region || 'GLOBAL',
        residency_policy: dto.residencyPolicy,
      },
    });
  }

  /**
   * Get single commercial account by ID
   */
  async getCommercialAccountById(accountId: string) {
    const account = await this.prisma.commercialAccount.findUnique({
      where: { id: accountId },
      include: { entitlements: true },
    });

    if (!account) {
      throw new NotFoundException(
        `Commercial Account '${accountId}' not found`,
      );
    }

    return account;
  }

  /**
   * Issue an explicit versioned offer entitlement
   */
  async grantEntitlement(dto: GrantEntitlementDto) {
    await this.killSwitchService.assertNotBlocked('ENTITLEMENT_EXPANSION');
    await this.getCommercialAccountById(dto.commercialAccountId);
    await this.assertNoSourceCollision(
      dto.tenantId,
      dto.offerType,
      dto.commercialAccountId,
    );

    this.logger.log(
      `Granting '${dto.offerType}' entitlement to tenant ${dto.tenantId}`,
    );

    return this.prisma.entitlement.create({
      data: {
        commercial_account_id: dto.commercialAccountId,
        tenant_id: dto.tenantId,
        offer_type: dto.offerType,
        status: 'ACTIVE',
        effective_from: dto.effectiveFrom || new Date(),
        effective_to: dto.effectiveTo,
      },
    });
  }

  /**
   * ZS-COM-BILL-001 ONE-01: for the same tenant + capability (offer_type),
   * only one authoritative charging source may be active at a time. A
   * second ACTIVE entitlement for the same tenant/offer from a
   * commercial account with a *different* billing_source (e.g. a direct
   * subscription activated over an existing Zoiko One bundle) is a
   * collision, unless an approved split-billing exception is on record.
   */
  async assertNoSourceCollision(
    tenantId: string,
    offerType: string,
    newAccountId: string,
  ) {
    const newAccount = await this.getCommercialAccountById(newAccountId);

    const collidingEntitlements = await this.prisma.entitlement.findMany({
      where: {
        tenant_id: tenantId,
        offer_type: offerType,
        status: 'ACTIVE',
        commercial_account_id: { not: newAccountId },
      },
      include: { commercialAccount: true },
    });

    const collision = collidingEntitlements.find(
      (e) => e.commercialAccount.billing_source !== newAccount.billing_source,
    );
    if (!collision) {
      return;
    }

    const exceptionKey = `${tenantId}:${offerType}`;
    const approvedSplit = await this.prisma.commercialApproval.findFirst({
      where: {
        object_type: 'ZOIKO_ONE_SPLIT_BILLING',
        object_id: exceptionKey,
        status: 'APPROVED',
      },
    });
    if (approvedSplit) {
      return;
    }

    throw new ConflictException({
      statusCode: 409,
      error: 'COMMERCIAL_SOURCE_COLLISION',
      message: `Tenant '${tenantId}' already has an ACTIVE '${offerType}' entitlement charged via '${collision.commercialAccount.billing_source}'; activating from '${newAccount.billing_source}' would double-charge the same capability/period without an approved split-billing exception`,
    });
  }

  /**
   * Evaluate if a tenant has active commercial entitlement for an offer.
   * Per ADR-06 & ZS-COM-BILL-001: Fails closed (returns false) if unapproved or expired.
   */
  async checkEntitlement(
    tenantId: string,
    offerType: string,
  ): Promise<boolean> {
    const now = new Date();

    const activeEntitlement = await this.prisma.entitlement.findFirst({
      where: {
        tenant_id: tenantId,
        offer_type: offerType,
        status: 'ACTIVE',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      include: { commercialAccount: true },
    });

    if (!activeEntitlement) {
      this.logger.warn(
        `Entitlement check FAILED CLOSED for tenant ${tenantId}, offer: ${offerType}`,
      );
      return false;
    }

    if (
      ['SUSPENDED', 'TERMINATED'].includes(
        activeEntitlement.commercialAccount.status,
      )
    ) {
      this.logger.warn(
        `Commercial Account ${activeEntitlement.commercial_account_id} is ${activeEntitlement.commercialAccount.status}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Guarded entitlement status transition (Part 20). Illegal moves throw
   * 409 INVALID_STATE_TRANSITION instead of writing an arbitrary status.
   */
  async updateEntitlementStatus(entitlementId: string, targetStatus: string) {
    const entitlement = await this.prisma.entitlement.findUnique({
      where: { id: entitlementId },
    });
    if (!entitlement) {
      throw new NotFoundException(`Entitlement '${entitlementId}' not found`);
    }
    assertTransition(
      ENTITLEMENT_TRANSITIONS,
      entitlement.status,
      targetStatus,
      'entitlement',
    );

    return this.prisma.entitlement.update({
      where: { id: entitlementId },
      data: { status: targetStatus },
    });
  }

  /**
   * List entitlements for tenant
   */
  async getEntitlementsByTenant(tenantId: string) {
    return this.prisma.entitlement.findMany({
      where: { tenant_id: tenantId },
      include: { commercialAccount: true },
      orderBy: { created_at: 'desc' },
    });
  }
}
