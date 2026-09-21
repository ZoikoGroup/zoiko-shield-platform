import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DRAFT_PLAN_TIERS, PlanTier, PlanTierKey } from './plan-tier.entity';
import { OfferEntitlementService } from '../offer-entitlement.service';

export class PlanRecommendationRequest {
  protectedAssetCount!: number;
  estimatedDailyTelemetryGb!: number;
  requiresAiSecurity?: boolean;
  requiresManagedDefense?: boolean;
}

export interface PlanRecommendation {
  recommendedPlan: PlanTier;
  rationale: string[];
  alternativePlans: PlanTier[];
}

@Injectable()
export class PlanTierService {
  private readonly logger = new Logger(PlanTierService.name);

  constructor(
    private readonly offerEntitlementService: OfferEntitlementService,
  ) {}

  /**
   * Return all approved commercial plan tiers.
   */
  getAllPlanTiers(): PlanTier[] {
    return [...DRAFT_PLAN_TIERS];
  }

  /**
   * Retrieve a specific plan tier by key.
   */
  getPlanTierByKey(key: string): PlanTier {
    const normalizedKey = key.toUpperCase().trim() as PlanTierKey;
    const plan = DRAFT_PLAN_TIERS.find((p) => p.key === normalizedKey);
    if (!plan) {
      throw new NotFoundException(
        `Plan tier with key '${key}' not found in approved catalogue`,
      );
    }
    return plan;
  }

  /**
   * Calculate recommended plan tier based on organizational scale and requirements.
   */
  recommendPlan(req: PlanRecommendationRequest): PlanRecommendation {
    const {
      protectedAssetCount,
      estimatedDailyTelemetryGb,
      requiresAiSecurity,
      requiresManagedDefense,
    } = req;

    const rationale: string[] = [];

    if (protectedAssetCount > 5000 || estimatedDailyTelemetryGb > 250) {
      rationale.push(
        `Scale exceeds standard bands (${protectedAssetCount} assets, ${estimatedDailyTelemetryGb} GB/day). Custom Enterprise deployment required.`,
      );
      const enterprise = this.getPlanTierByKey('SHIELD_ENTERPRISE');
      return {
        recommendedPlan: enterprise,
        rationale,
        alternativePlans: [this.getPlanTierByKey('SHIELD_ADVANCED')],
      };
    }

    if (
      requiresAiSecurity ||
      protectedAssetCount > 1000 ||
      estimatedDailyTelemetryGb > 50
    ) {
      if (requiresAiSecurity)
        rationale.push(
          'AI Safety & Dual-Model Grounding Governance (§17) required.',
        );
      if (protectedAssetCount > 1000)
        rationale.push(
          `Protected asset count (${protectedAssetCount}) exceeds 1,000 asset boundary.`,
        );
      if (estimatedDailyTelemetryGb > 50)
        rationale.push(
          `Daily telemetry (${estimatedDailyTelemetryGb} GB/day) exceeds 50 GB boundary.`,
        );

      const advanced = this.getPlanTierByKey('SHIELD_ADVANCED');
      return {
        recommendedPlan: advanced,
        rationale,
        alternativePlans: [
          this.getPlanTierByKey('SHIELD_PROFESSIONAL'),
          this.getPlanTierByKey('SHIELD_ENTERPRISE'),
        ],
      };
    }

    if (
      requiresManagedDefense ||
      protectedAssetCount > 250 ||
      estimatedDailyTelemetryGb > 10
    ) {
      if (requiresManagedDefense)
        rationale.push(
          '24/7 Managed Detection & Threat Triage (MDR) required.',
        );
      if (protectedAssetCount > 250)
        rationale.push(
          `Protected asset count (${protectedAssetCount}) exceeds 250 asset boundary.`,
        );
      if (estimatedDailyTelemetryGb > 10)
        rationale.push(
          `Daily telemetry (${estimatedDailyTelemetryGb} GB/day) exceeds 10 GB boundary.`,
        );

      const professional = this.getPlanTierByKey('SHIELD_PROFESSIONAL');
      return {
        recommendedPlan: professional,
        rationale,
        alternativePlans: [
          this.getPlanTierByKey('SHIELD_ESSENTIAL'),
          this.getPlanTierByKey('SHIELD_ADVANCED'),
        ],
      };
    }

    rationale.push(
      'Standard Continuous Compliance & Assurance (SOC 2, ISO 27001) with 4-hour SLA retainer fits within Essential baseline.',
    );
    const essential = this.getPlanTierByKey('SHIELD_ESSENTIAL');
    return {
      recommendedPlan: essential,
      rationale,
      alternativePlans: [this.getPlanTierByKey('SHIELD_PROFESSIONAL')],
    };
  }

  /**
   * Verify whether a plan includes a specific commercial offer.
   */
  isOfferIncludedInPlan(planKey: string, offerType: string): boolean {
    try {
      const plan = this.getPlanTierByKey(planKey);
      return plan.includedOffers.includes(offerType as any);
    } catch {
      return false;
    }
  }
}
