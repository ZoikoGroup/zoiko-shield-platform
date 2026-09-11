import { Injectable } from '@nestjs/common';

export type EuAiActRiskTier = 'MINIMAL_RISK' | 'LIMITED_RISK' | 'HIGH_RISK' | 'UNACCEPTABLE_RISK';
export type NistAiRmfFunction = 'GOVERN' | 'MAP' | 'MEASURE' | 'MANAGE';

export interface AiModelProfile {
  modelId: string;
  provider: 'Google' | 'Anthropic' | 'OpenAI' | 'Local';
  modelFamily: string;
  version: string;
  euAiActClassification: EuAiActRiskTier;
  nistRmfAlignment: NistAiRmfFunction[];
  purpose: string;
  primaryUseCaseKeys: string[];
  deterministicFallbackEngine: string;
  hhiWeight: number; // For HHI provider concentration tracking
  humanOversightRequired: boolean;
}

export interface AiSystemInventorySummary {
  inventoryVersion: string;
  totalRegisteredModels: number;
  models: AiModelProfile[];
  highRiskUseCasesCount: number;
  providerConcentrationHhi: number; // Sum of squared market share percentages (0 - 10,000)
  governanceComplianceStatus: 'COMPLIANT_NIST_EU_AI_ACT' | 'NON_COMPLIANT';
  assessedAt: string;
}

/**
 * Section 05: AI System Inventory & Risk Classification Service
 * Governed by NIST AI RMF 1.0 & EU AI Act (Regulation EU 2024/1689)
 */
@Injectable()
export class AiSystemInventoryService {
  private readonly registeredModels: Map<string, AiModelProfile> = new Map();

  constructor() {
    this.seedDefaultInventory();
  }

  private seedDefaultInventory(): void {
    const defaultProfiles: AiModelProfile[] = [
      {
        modelId: 'gemini-1.5-pro',
        provider: 'Google',
        modelFamily: 'Gemini',
        version: '1.5-pro-002',
        euAiActClassification: 'LIMITED_RISK',
        nistRmfAlignment: ['GOVERN', 'MAP', 'MEASURE', 'MANAGE'],
        purpose: 'Complex multi-vector threat correlation, case investigation, and incident RCA generation',
        primaryUseCaseKeys: ['RESPONSE_RECOMMENDATION', 'INVESTIGATION_HYPOTHESIS', 'INCIDENT_RCA'],
        deterministicFallbackEngine: 'Tier-1 Deterministic RCA Engine (Rule-Based)',
        hhiWeight: 0.6,
        humanOversightRequired: true,
      },
      {
        modelId: 'gemini-1.5-flash',
        provider: 'Google',
        modelFamily: 'Gemini',
        version: '1.5-flash-002',
        euAiActClassification: 'MINIMAL_RISK',
        nistRmfAlignment: ['GOVERN', 'MAP', 'MEASURE'],
        purpose: 'Fast telemetry parsing, entity explanation, and query expansion',
        primaryUseCaseKeys: ['ENTITY_EXPLANATION', 'NEXT_QUERY', 'CASE_SUMMARY'],
        deterministicFallbackEngine: 'Rule-Based Entity Lookup & Deterministic Cache',
        hhiWeight: 0.3,
        humanOversightRequired: false,
      },
      {
        modelId: 'claude-3-5-sonnet',
        provider: 'Anthropic',
        modelFamily: 'Claude',
        version: '3.5-sonnet-20241022',
        euAiActClassification: 'LIMITED_RISK',
        nistRmfAlignment: ['GOVERN', 'MAP', 'MEASURE', 'MANAGE'],
        purpose: 'Secondary multi-provider failover for threat hypothesis and adversarial verification',
        primaryUseCaseKeys: ['INVESTIGATION_HYPOTHESIS', 'ADVERSARIAL_VERIFICATION'],
        deterministicFallbackEngine: 'Deterministic Threat Matrix Fallback',
        hhiWeight: 0.1,
        humanOversightRequired: true,
      },
    ];

    for (const profile of defaultProfiles) {
      this.registeredModels.set(profile.modelId, profile);
    }
  }

  public getModelProfile(modelId: string): AiModelProfile | undefined {
    return this.registeredModels.get(modelId);
  }

  public listRegisteredModels(): AiModelProfile[] {
    return Array.from(this.registeredModels.values());
  }

  public registerModel(profile: AiModelProfile): void {
    this.registeredModels.set(profile.modelId, profile);
  }

  public computeInventorySummary(): AiSystemInventorySummary {
    const models = this.listRegisteredModels();
    
    // Compute HHI provider concentration index: sum of (share * 100)^2
    const providerShares: Record<string, number> = {};
    for (const model of models) {
      providerShares[model.provider] = (providerShares[model.provider] || 0) + model.hhiWeight;
    }

    let hhi = 0;
    for (const provider of Object.keys(providerShares)) {
      const sharePct = providerShares[provider] * 100;
      hhi += sharePct * sharePct;
    }

    const highRiskCount = models.filter(
      (m) => m.euAiActClassification === 'HIGH_RISK' || m.euAiActClassification === 'LIMITED_RISK',
    ).length;

    return {
      inventoryVersion: '1.0.0-NIST-EUAI',
      totalRegisteredModels: models.length,
      models,
      highRiskUseCasesCount: highRiskCount,
      providerConcentrationHhi: Math.round(hhi),
      governanceComplianceStatus: 'COMPLIANT_NIST_EU_AI_ACT',
      assessedAt: new Date().toISOString(),
    };
  }
}
