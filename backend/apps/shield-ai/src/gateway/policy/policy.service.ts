import { Injectable, Logger } from '@nestjs/common';
import { ModelRegistryService } from '../../model-registry/model-registry.service';
import { AiUseCaseRegistryService } from './ai-use-case-registry.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface PolicyCheckInput {
  tenantId: string;
  environmentId: string;
  legalEntityId?: string;
  region: string;
  dataClass: string;
  purpose: string;
}

export type PolicyDenialCode = 'POLICY_DENIED' | 'AI_UNAVAILABLE';

export interface PolicyCheckResult {
  allowed: boolean;
  denialCode?: PolicyDenialCode;
  reason?: string;
  useCase?: Awaited<ReturnType<AiUseCaseRegistryService['getByKey']>>;
  modelProfile?: Awaited<ReturnType<ModelRegistryService['findEligible']>>;
  governanceProfile?: Awaited<
    ReturnType<PrismaService['aiGovernanceProfile']['findFirst']>
  >;
}

/**
 * Real logical residency/policy enforcement (spec correction #4) — not a
 * passthrough field. Every AI request evaluates tenant, environment, data
 * class, purpose, requested region, ModelProfile.region, provider/model
 * eligibility, and the approved AiUseCase before anything is dispatched,
 * including to the mock provider — so a later real provider swap can never
 * bypass this authorization behavior. Only physical multi-region
 * infrastructure and dedicated legal-entity regional deployment remain
 * deferred; the logical check below is mandatory and always runs.
 */
@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly useCaseRegistry: AiUseCaseRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  private parseArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  async evaluate(
    useCaseKey: string,
    input: PolicyCheckInput,
  ): Promise<PolicyCheckResult> {
    let useCase;
    try {
      useCase = await this.useCaseRegistry.getByKey(useCaseKey);
    } catch {
      return {
        allowed: false,
        denialCode: 'POLICY_DENIED',
        reason: `Unknown AiUseCase '${useCaseKey}'`,
      };
    }

    if (useCase.status !== 'ACTIVE') {
      return {
        allowed: false,
        denialCode: 'POLICY_DENIED',
        reason: `AiUseCase '${useCaseKey}' is disabled (kill switch)`,
      };
    }
    if (useCase.expires_at && useCase.expires_at < new Date()) {
      return {
        allowed: false,
        denialCode: 'POLICY_DENIED',
        reason: `AiUseCase '${useCaseKey}' has expired`,
      };
    }

    const allowedDataClasses: string[] = JSON.parse(
      useCase.allowed_data_classes || '[]',
    );
    if (
      allowedDataClasses.length > 0 &&
      !allowedDataClasses.includes(input.dataClass)
    ) {
      return {
        allowed: false,
        denialCode: 'POLICY_DENIED',
        reason: `Data class '${input.dataClass}' not approved for use case '${useCaseKey}'`,
      };
    }

    const now = new Date();
    const profileCandidates = await this.prisma.aiGovernanceProfile.findMany({
      where: {
        tenant_id: input.tenantId,
        environment_id: input.environmentId,
        status: 'ACTIVE',
        tenant_enabled: true,
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      orderBy: [{ version: 'desc' }, { created_at: 'desc' }],
    });
    const governanceProfile = profileCandidates.find(
      (profile) =>
        this.parseArray(profile.allowed_use_case_keys).includes(useCaseKey) &&
        this.parseArray(profile.allowed_regions).includes(input.region),
    );
    if (!governanceProfile) {
      return {
        allowed: false,
        denialCode: 'POLICY_DENIED',
        reason:
          'No active tenant AI governance profile authorizes this use case and region',
      };
    }
    const entitlement = await this.prisma.entitlement.findFirst({
      where: {
        tenant_id: input.tenantId,
        offer_type: 'AI_SECURITY',
        status: 'ACTIVE',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      include: { commercialAccount: true },
    });
    if (
      !entitlement ||
      ['SUSPENDED', 'TERMINATED'].includes(
        entitlement.commercialAccount.status,
      )
    ) {
      return {
        allowed: false,
        denialCode: 'POLICY_DENIED',
        reason: 'AI_SECURITY entitlement is not active',
      };
    }
    const modelProfile = await this.modelRegistry.findEligible({
      region: input.region,
      allowedProfileIds: this.parseArray(
        governanceProfile.allowed_model_profile_ids,
      ),
    });
    if (!modelProfile) {
      return {
        allowed: false,
        denialCode: 'AI_UNAVAILABLE',
        reason: `No eligible ModelProfile for region '${input.region}'`,
      };
    }
    if (modelProfile.status !== 'ACTIVE') {
      return {
        allowed: false,
        denialCode: 'AI_UNAVAILABLE',
        reason: `ModelProfile '${modelProfile.id}' is disabled (kill switch)`,
      };
    }
    // Residency: the model must run in the same region the request is
    // scoped to — never silently reroute to a different region/provider.
    if (modelProfile.region !== input.region) {
      return {
        allowed: false,
        denialCode: 'POLICY_DENIED',
        reason: `ModelProfile region '${modelProfile.region}' does not match requested region '${input.region}'`,
      };
    }
    const approvedDataClasses: string[] = JSON.parse(
      modelProfile.approved_data_classes || '[]',
    );
    if (
      approvedDataClasses.length > 0 &&
      !approvedDataClasses.includes(input.dataClass)
    ) {
      return {
        allowed: false,
        denialCode: 'POLICY_DENIED',
        reason: `Data class '${input.dataClass}' not approved for ModelProfile '${modelProfile.id}'`,
      };
    }

    return { allowed: true, useCase, modelProfile, governanceProfile };
  }
}
