import { Injectable } from '@nestjs/common';

export type EuAiActRiskTier = 'MINIMAL_RISK' | 'LIMITED_RISK' | 'HIGH_RISK' | 'UNACCEPTABLE_RISK';
export type NistAiRmfFunction = 'GOVERN' | 'MAP' | 'MEASURE' | 'MANAGE';
export type AiLifecycleState = 'PROPOSED' | 'EVALUATING' | 'APPROVED_FOR_PRODUCTION' | 'DECOMMISSIONED';

export interface AiModelProfile {
  modelId: string;
  provider: 'Google' | 'Anthropic' | 'OpenAI' | 'Local' | string;
  modelFamily: string;
  version: string;
  euAiActClassification: EuAiActRiskTier;
  nistRmfAlignment: NistAiRmfFunction[];
  purpose: string;
  primaryUseCaseKeys: string[];
  deterministicFallbackEngine: string;
  hhiWeight: number; // For HHI provider concentration tracking
  humanOversightRequired: boolean;
  lifecycleState?: AiLifecycleState;
  registeredAt?: string;
  updatedAt?: string;
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
    const now = new Date().toISOString();
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
        lifecycleState: 'APPROVED_FOR_PRODUCTION',
        registeredAt: now,
        updatedAt: now,
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
        lifecycleState: 'APPROVED_FOR_PRODUCTION',
        registeredAt: now,
        updatedAt: now,
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
        lifecycleState: 'APPROVED_FOR_PRODUCTION',
        registeredAt: now,
        updatedAt: now,
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

  public registerModel(profile: AiModelProfile): AiModelProfile {
    const now = new Date().toISOString();
    const model: AiModelProfile = {
      ...profile,
      lifecycleState: profile.lifecycleState || 'PROPOSED',
      registeredAt: profile.registeredAt || now,
      updatedAt: now,
      hhiWeight: profile.hhiWeight ?? 0.05,
      nistRmfAlignment: profile.nistRmfAlignment || ['GOVERN', 'MEASURE'],
      primaryUseCaseKeys: profile.primaryUseCaseKeys || ['CUSTOM_INFERENCE'],
      deterministicFallbackEngine: profile.deterministicFallbackEngine || 'Deterministic Rule Fallback',
    };
    this.registeredModels.set(model.modelId, model);
    return model;
  }

  public updateModel(modelId: string, updates: Partial<AiModelProfile>): AiModelProfile {
    const existing = this.registeredModels.get(modelId);
    if (!existing) {
      throw new Error(`AI Model profile '${modelId}' not found in registry`);
    }
    const updated: AiModelProfile = {
      ...existing,
      ...updates,
      modelId, // Preserve primary key
      updatedAt: new Date().toISOString(),
    };
    this.registeredModels.set(modelId, updated);
    return updated;
  }

  public deleteModel(modelId: string): boolean {
    const existing = this.registeredModels.get(modelId);
    if (!existing) return false;
    existing.lifecycleState = 'DECOMMISSIONED';
    existing.updatedAt = new Date().toISOString();
    return true;
  }

  public computeInventorySummary(): AiSystemInventorySummary {
    const models = this.listRegisteredModels();
    
    // Compute HHI provider concentration index: sum of (share * 100)^2
    const providerShares: Record<string, number> = {};
    for (const model of models) {
      if (model.lifecycleState !== 'DECOMMISSIONED') {
        providerShares[model.provider] = (providerShares[model.provider] || 0) + model.hhiWeight;
      }
    }

    let hhi = 0;
    for (const provider of Object.keys(providerShares)) {
      const sharePct = providerShares[provider] * 100;
      hhi += sharePct * sharePct;
    }

    const highRiskCount = models.filter(
      (m) => (m.euAiActClassification === 'HIGH_RISK' || m.euAiActClassification === 'LIMITED_RISK') && m.lifecycleState !== 'DECOMMISSIONED',
    ).length;

    return {
      inventoryVersion: '1.0.0-NIST-EUAI',
      totalRegisteredModels: models.filter((m) => m.lifecycleState !== 'DECOMMISSIONED').length,
      models,
      highRiskUseCasesCount: highRiskCount,
      providerConcentrationHhi: Math.round(hhi),
      governanceComplianceStatus: 'COMPLIANT_NIST_EU_AI_ACT',
      assessedAt: new Date().toISOString(),
    };
  }
}
