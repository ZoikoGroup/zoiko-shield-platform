import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateCommercialAccountDto {
  name!: string;
  billingSource?: 'DIRECT' | 'ZOIKO_ONE_BUNDLE' | 'RESELLER';
  billingClassification?: 'COMMERCIAL_DIRECT' | 'COMMERCIAL_ZOIKO_ONE' | 'COMMERCIAL_RESELLER' | 'DESIGN_PARTNER' | 'PILOT' | 'INTERNAL' | 'DEMO' | 'SANDBOX';
}

export class GrantEntitlementDto {
  commercialAccountId!: string;
  tenantId!: string;
  offerType!: 'MANAGED_DEFENSE' | 'CONTINUOUS_ASSURANCE' | 'EXPOSURE_MANAGEMENT' | 'AI_SECURITY';
  effectiveFrom?: Date;
  effectiveTo?: Date;
}

export class RegisterClaimDto {
  claimKey!: string;
  approvedWording!: string;
  requiresEvidence?: boolean;
}

@Injectable()
export class CommercialEntitlementService {
  private readonly logger = new Logger(CommercialEntitlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new commercial account (Plane 1)
   */
  async createCommercialAccount(dto: CreateCommercialAccountDto) {
    this.logger.log(`Creating Commercial Account '${dto.name}' with classification ${dto.billingClassification || 'COMMERCIAL_DIRECT'}`);

    return this.prisma.commercialAccount.create({
      data: {
        name: dto.name,
        billing_source: dto.billingSource || 'DIRECT',
        billing_classification: dto.billingClassification || 'COMMERCIAL_DIRECT',
        status: 'ACTIVE',
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
      throw new NotFoundException(`Commercial Account '${accountId}' not found`);
    }

    return account;
  }

  /**
   * Issue an explicit versioned offer entitlement
   */
  async grantEntitlement(dto: GrantEntitlementDto) {
    await this.getCommercialAccountById(dto.commercialAccountId);

    this.logger.log(`Granting '${dto.offerType}' entitlement to tenant ${dto.tenantId}`);

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
   * Evaluate if a tenant has active commercial entitlement for an offer.
   * Per ADR-06 & ZS-COM-BILL-001: Fails closed (returns false) if unapproved or expired.
   */
  async checkEntitlement(tenantId: string, offerType: string): Promise<boolean> {
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
      this.logger.warn(`Entitlement check FAILED CLOSED for tenant ${tenantId}, offer: ${offerType}`);
      return false;
    }

    if (['SUSPENDED', 'TERMINATED'].includes(activeEntitlement.commercialAccount.status)) {
      this.logger.warn(`Commercial Account ${activeEntitlement.commercial_account_id} is ${activeEntitlement.commercialAccount.status}`);
      return false;
    }

    return true;
  }

  /**
   * Register approved claim wording in ClaimRegister
   */
  async registerClaim(dto: RegisterClaimDto) {
    return this.prisma.claimRegister.upsert({
      where: { claim_key: dto.claimKey },
      update: {
        approved_wording: dto.approvedWording,
        requires_evidence: dto.requiresEvidence !== undefined ? dto.requiresEvidence : true,
        status: 'APPROVED',
      },
      create: {
        claim_key: dto.claimKey,
        approved_wording: dto.approvedWording,
        requires_evidence: dto.requiresEvidence !== undefined ? dto.requiresEvidence : true,
        status: 'APPROVED',
      },
    });
  }

  /**
   * Reconciles purchased SKU, active entitlements, and claim register rules before allowing claims.
   */
  async verifyClaimEligibility(tenantId: string, claimKey: string) {
    const claim = await this.prisma.claimRegister.findUnique({
      where: { claim_key: claimKey },
    });

    if (!claim || claim.status !== 'APPROVED') {
      return {
        eligible: false,
        reason: `Claim '${claimKey}' is unapproved, expired, or not found in Claim Register`,
        approvedWording: null,
      };
    }

    // Map claim keys to required offer types
    const requiredOffer =
      claimKey === 'CLAIM_24_7_SOC'
        ? 'MANAGED_DEFENSE'
        : claimKey === 'CLAIM_AUDIT_READY'
        ? 'CONTINUOUS_ASSURANCE'
        : 'MANAGED_DEFENSE';

    const hasEntitlement = await this.checkEntitlement(tenantId, requiredOffer);

    if (!hasEntitlement) {
      return {
        eligible: false,
        reason: `Tenant '${tenantId}' lacks active '${requiredOffer}' entitlement required for claim '${claimKey}'`,
        approvedWording: claim.approved_wording,
      };
    }

    return {
      eligible: true,
      reason: `Tenant '${tenantId}' is eligible for claim '${claimKey}'`,
      approvedWording: claim.approved_wording,
    };
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
