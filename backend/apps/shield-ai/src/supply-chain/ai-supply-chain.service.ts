import { Injectable, Logger, BadRequestException } from '@nestjs/common';

export interface ProviderRouteConfig {
  providerKey: string; // 'anthropic' | 'openai' | 'aws-bedrock' | 'google-vertex' | 'self-hosted'
  providerName: string;
  region: string;
  dataSovereigntyZone: 'US' | 'EU' | 'UK' | 'APAC' | 'GLOBAL';
  activeModels: string[];
  isPrimary: boolean;
  status: 'HEALTHY' | 'DEGRADED' | 'OUTAGE';
}

export interface UseCaseFallbackConfig {
  useCaseKey: string;
  criticalityTier:
    'TIER_1_MISSION_CRITICAL' | 'TIER_2_OPERATIONAL' | 'TIER_3_NON_CRITICAL';
  primaryProvider: string;
  fallbackProvider: string;
  fallbackModel: string;
  fallbackTestedAt?: string;
  fallbackReady: boolean;
}

export interface ConcentrationRiskReport {
  generatedAt: string;
  totalProviders: number;
  providerDistribution: Record<
    string,
    { requestCount: number; percentage: number }
  >;
  hhiScore: number; // Herfindahl-Hirschman Index (0 - 10,000)
  concentrationRiskLevel:
    'LOW_DIVERSIFIED' | 'MODERATE' | 'HIGH_CONCENTRATION_RISK';
  missingFallbackUseCases: string[];
  dataSovereigntyWarnings: string[];
}

/**
 * §24: AI Supply Chain & Concentration Risk Management Service
 * Analyzes provider concentration using Herfindahl-Hirschman Index (HHI),
 * tracks model provenance and ensures active fallback routing for mission-critical use cases.
 */
@Injectable()
export class AiSupplyChainService {
  private readonly logger = new Logger(AiSupplyChainService.name);

  private readonly providers = new Map<string, ProviderRouteConfig>();
  private readonly useCaseFallbacks = new Map<string, UseCaseFallbackConfig>();
  private readonly inferenceCounts = new Map<string, number>();

  constructor() {
    this.seedDefaultProviders();
  }

  private seedDefaultProviders() {
    this.registerProvider({
      providerKey: 'anthropic',
      providerName: 'Anthropic Cloud',
      region: 'us-east-1',
      dataSovereigntyZone: 'US',
      activeModels: ['claude-3-5-sonnet', 'claude-3-haiku'],
      isPrimary: true,
      status: 'HEALTHY',
    });

    this.registerProvider({
      providerKey: 'openai',
      providerName: 'OpenAI Enterprise',
      region: 'us-west-2',
      dataSovereigntyZone: 'US',
      activeModels: ['gpt-4o', 'gpt-4o-mini'],
      isPrimary: false,
      status: 'HEALTHY',
    });

    this.registerProvider({
      providerKey: 'aws-bedrock',
      providerName: 'AWS Bedrock',
      region: 'eu-central-1',
      dataSovereigntyZone: 'EU',
      activeModels: ['anthropic.claude-v2', 'amazon.titan-text'],
      isPrimary: false,
      status: 'HEALTHY',
    });
  }

  registerProvider(config: ProviderRouteConfig): void {
    if (!config.providerKey) {
      throw new BadRequestException('providerKey is required');
    }
    this.providers.set(config.providerKey, config);
  }

  registerUseCaseFallback(config: UseCaseFallbackConfig): void {
    if (!config.useCaseKey) {
      throw new BadRequestException('useCaseKey is required');
    }
    this.useCaseFallbacks.set(config.useCaseKey, config);
  }

  recordInferenceUsage(providerKey: string, count = 1): void {
    const current = this.inferenceCounts.get(providerKey) || 0;
    this.inferenceCounts.set(providerKey, current + count);
  }

  /**
   * Assess supply chain concentration risk and fallback readiness
   */
  assessConcentrationRisk(
    targetZone?: 'US' | 'EU' | 'UK',
  ): ConcentrationRiskReport {
    let totalInferences = 0;
    for (const count of this.inferenceCounts.values()) {
      totalInferences += count;
    }

    const providerDistribution: Record<
      string,
      { requestCount: number; percentage: number }
    > = {};

    let sumSquaredShares = 0;

    if (totalInferences > 0) {
      for (const [provider, count] of this.inferenceCounts.entries()) {
        const percentage = Number(((count / totalInferences) * 100).toFixed(2));
        providerDistribution[provider] = {
          requestCount: count,
          percentage,
        };
        sumSquaredShares += percentage * percentage;
      }
    } else {
      // Default hypothetical split across registered providers if no traffic yet
      const count = this.providers.size || 1;
      const share = 100 / count;
      for (const key of this.providers.keys()) {
        providerDistribution[key] = {
          requestCount: 0,
          percentage: Number(share.toFixed(2)),
        };
        sumSquaredShares += share * share;
      }
    }

    const hhiScore = Math.round(sumSquaredShares);

    let concentrationRiskLevel:
      'LOW_DIVERSIFIED' | 'MODERATE' | 'HIGH_CONCENTRATION_RISK' =
      'LOW_DIVERSIFIED';

    if (hhiScore >= 2500) {
      concentrationRiskLevel = 'HIGH_CONCENTRATION_RISK';
    } else if (hhiScore >= 1500) {
      concentrationRiskLevel = 'MODERATE';
    }

    // Check Tier-1 fallback coverage
    const missingFallbackUseCases: string[] = [];
    for (const fb of this.useCaseFallbacks.values()) {
      if (
        fb.criticalityTier === 'TIER_1_MISSION_CRITICAL' &&
        (!fb.fallbackReady ||
          !fb.fallbackProvider ||
          fb.primaryProvider === fb.fallbackProvider)
      ) {
        missingFallbackUseCases.push(fb.useCaseKey);
      }
    }

    // Check data sovereignty violations
    const dataSovereigntyWarnings: string[] = [];
    if (targetZone) {
      for (const p of this.providers.values()) {
        if (
          p.dataSovereigntyZone !== targetZone &&
          p.dataSovereigntyZone !== 'GLOBAL'
        ) {
          dataSovereigntyWarnings.push(
            `Provider [${p.providerKey}] operates in zone [${p.dataSovereigntyZone}], which does not match required zone [${targetZone}]`,
          );
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      totalProviders: this.providers.size,
      providerDistribution,
      hhiScore,
      concentrationRiskLevel,
      missingFallbackUseCases,
      dataSovereigntyWarnings,
    };
  }

  getProviders(): ProviderRouteConfig[] {
    return Array.from(this.providers.values());
  }

  clearUsage(): void {
    this.inferenceCounts.clear();
  }
}
