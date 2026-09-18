import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import { PrismaService } from '../../prisma/prisma.service';

export type CommercialOfferType =
  | 'MANAGED_DEFENSE'
  | 'CONTINUOUS_ASSURANCE'
  | 'EXPOSURE_MANAGEMENT'
  | 'AI_SECURITY'
  | 'INCIDENT_RESPONSE_RETAINER';

export interface OfferEntitlementContext {
  action?: string;
  environmentId?: string;
  targetResource?: string;
}

/**
 * OfferEntitlementService
 *
 * Implements strict commercial offer boundary enforcement.
 * Enforces fail-closed commercial access control between independent offers:
 * - Managed Defense (24x7 SOC, threat triage, SOAR response actions)
 * - Continuous Assurance (SOC 2, ISO 27001, compliance control automation, audit packages)
 * - Incident Response Retainer (§16.4 purpose-bound legal-access retainer)
 * - Exposure Management & AI Security
 */
@Injectable()
export class OfferEntitlementService {
  private readonly logger = new Logger(OfferEntitlementService.name);

  constructor(
    private readonly entitlementService: CommercialEntitlementService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Check whether a tenant holds an active, unexpired commercial entitlement for the given offer.
   */
  async checkEntitlement(
    tenantId: string,
    offerType: CommercialOfferType | string,
  ): Promise<boolean> {
    return this.entitlementService.checkEntitlement(tenantId, offerType);
  }

  /**
   * Fail-closed assertion requiring that a tenant holds an active entitlement for the specified offer.
   * Throws ForbiddenException (403) with structured OFFER_ENTITLEMENT_REQUIRED error payload if unentitled.
   */
  async assertOfferEntitled(
    tenantId: string,
    offerType: CommercialOfferType | string,
    context?: OfferEntitlementContext,
  ): Promise<void> {
    const isEntitled = await this.checkEntitlement(tenantId, offerType);
    if (!isEntitled) {
      const actionText = context?.action ? ` to perform '${context.action}'` : '';
      this.logger.warn(
        `Commercial offer entitlement check FAILED for tenant '${tenantId}' on offer '${offerType}'${actionText}`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: 'OFFER_ENTITLEMENT_REQUIRED',
        message: `Tenant '${tenantId}' does not have an active commercial entitlement for '${offerType}'${actionText}. An active '${offerType}' subscription is required.`,
        offerType,
        tenantId,
        action: context?.action,
      });
    }
  }

  /**
   * Assert tenant is entitled to Managed Defense offer.
   */
  async assertManagedDefenseEntitled(
    tenantId: string,
    context?: OfferEntitlementContext,
  ): Promise<void> {
    return this.assertOfferEntitled(tenantId, 'MANAGED_DEFENSE', context);
  }

  /**
   * Assert tenant is entitled to Continuous Assurance offer.
   */
  async assertContinuousAssuranceEntitled(
    tenantId: string,
    context?: OfferEntitlementContext,
  ): Promise<void> {
    return this.assertOfferEntitled(tenantId, 'CONTINUOUS_ASSURANCE', context);
  }

  /**
   * Assert tenant is entitled to Incident Response Retainer offer.
   */
  async assertIncidentResponseRetainerEntitled(
    tenantId: string,
    context?: OfferEntitlementContext,
  ): Promise<void> {
    return this.assertOfferEntitled(tenantId, 'INCIDENT_RESPONSE_RETAINER', context);
  }

  /**
   * Returns list of all active offer types currently held by the tenant.
   */
  async getTenantActiveOffers(tenantId: string): Promise<string[]> {
    const now = new Date();
    const activeEntitlements = await this.prisma.entitlement.findMany({
      where: {
        tenant_id: tenantId,
        status: 'ACTIVE',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
        commercialAccount: {
          status: { notIn: ['SUSPENDED', 'TERMINATED'] },
        },
      },
      select: {
        offer_type: true,
      },
    });

    return [...new Set(activeEntitlements.map((e) => e.offer_type))];
  }
}
