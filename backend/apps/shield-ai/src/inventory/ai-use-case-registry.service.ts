import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

export type AiRiskTier = 'AR-1' | 'AR-2' | 'AR-3';
export type UseCaseApprovalStatus =
  | 'PROPOSED'
  | 'IN_REVIEW'
  | 'APPROVED_FOR_PRODUCTION'
  | 'DEPRECATED';

export interface AiUseCaseDefinition {
  key: string;
  name: string;
  owner: string;
  riskTier: AiRiskTier;
  approvalStatus: UseCaseApprovalStatus;
  pinnedModelVersion: string;
  fallbackEngine: string;
  humanReviewRequired: boolean;
  minGroundingScore: number;
  minCitationPrecision: number;
  allowedDataClasses: string[];
  registeredAt: string;
  updatedAt: string;
}

/**
 * Section 05 & Section 18: AI Use Case Governance & Model Pinning Registry
 * Enforces risk classification (AR-1/2/3), production approval gates, and model version pinning.
 */
@Injectable()
export class AiUseCaseRegistryService {
  private readonly useCases: Map<string, AiUseCaseDefinition> = new Map();

  constructor() {
    this.seedDefaultUseCases();
  }

  private seedDefaultUseCases(): void {
    const now = new Date().toISOString();
    const defaults: AiUseCaseDefinition[] = [
      {
        key: 'case-summary',
        name: 'Automated Incident & Case Summarization',
        owner: 'SecOps-AI-Team',
        riskTier: 'AR-1',
        approvalStatus: 'APPROVED_FOR_PRODUCTION',
        pinnedModelVersion: 'gemini-1.5-flash-002',
        fallbackEngine: 'Rule-Based Case Summary Extractor',
        humanReviewRequired: false,
        minGroundingScore: 0.85,
        minCitationPrecision: 0.9,
        allowedDataClasses: ['PUBLIC', 'INTERNAL_TELEMETRY', 'CONFIDENTIAL_LOGS'],
        registeredAt: now,
        updatedAt: now,
      },
      {
        key: 'response-recommendation',
        name: 'Action & Response Recommendation Engine',
        owner: 'SecOps-Tier3-Lead',
        riskTier: 'AR-3',
        approvalStatus: 'APPROVED_FOR_PRODUCTION',
        pinnedModelVersion: 'gemini-1.5-pro-002',
        fallbackEngine: 'Tier-1 Deterministic Playbook Fallback',
        humanReviewRequired: true,
        minGroundingScore: 0.9,
        minCitationPrecision: 0.95,
        allowedDataClasses: ['INTERNAL_TELEMETRY', 'CONFIDENTIAL_LOGS', 'RESTRICTED_AUTH_EVENTS'],
        registeredAt: now,
        updatedAt: now,
      },
      {
        key: 'investigation-hypothesis',
        name: 'Multi-Vector Threat Investigation Hypothesis',
        owner: 'Threat-Intel-Lead',
        riskTier: 'AR-2',
        approvalStatus: 'APPROVED_FOR_PRODUCTION',
        pinnedModelVersion: 'gemini-1.5-pro-002',
        fallbackEngine: 'Deterministic Threat Matrix Correlation',
        humanReviewRequired: true,
        minGroundingScore: 0.85,
        minCitationPrecision: 0.9,
        allowedDataClasses: ['INTERNAL_TELEMETRY', 'CONFIDENTIAL_LOGS'],
        registeredAt: now,
        updatedAt: now,
      },
      {
        key: 'detection-explanation',
        name: 'SIEM/EDR Detection & Alert Explanation',
        owner: 'Detection-Engineering-Lead',
        riskTier: 'AR-1',
        approvalStatus: 'APPROVED_FOR_PRODUCTION',
        pinnedModelVersion: 'gemini-1.5-flash-002',
        fallbackEngine: 'Deterministic Rule Lookup & Signature Parser',
        humanReviewRequired: false,
        minGroundingScore: 0.85,
        minCitationPrecision: 0.9,
        allowedDataClasses: ['INTERNAL_TELEMETRY'],
        registeredAt: now,
        updatedAt: now,
      },
      {
        key: 'threat-hunting-copilot',
        name: 'Interactive Threat Hunting & Query Expansion Copilot',
        owner: 'Threat-Hunting-Lead',
        riskTier: 'AR-2',
        approvalStatus: 'APPROVED_FOR_PRODUCTION',
        pinnedModelVersion: 'gemini-1.5-pro-002',
        fallbackEngine: 'Keyword Query Expansion Engine',
        humanReviewRequired: true,
        minGroundingScore: 0.88,
        minCitationPrecision: 0.92,
        allowedDataClasses: ['INTERNAL_TELEMETRY', 'CONFIDENTIAL_LOGS'],
        registeredAt: now,
        updatedAt: now,
      },
      {
        key: 'incident-rca',
        name: 'Post-Incident Root Cause Analysis Generator',
        owner: 'SecOps-Director',
        riskTier: 'AR-2',
        approvalStatus: 'APPROVED_FOR_PRODUCTION',
        pinnedModelVersion: 'gemini-1.5-pro-002',
        fallbackEngine: 'Timeline-Based RCA Template Builder',
        humanReviewRequired: true,
        minGroundingScore: 0.9,
        minCitationPrecision: 0.95,
        allowedDataClasses: ['INTERNAL_TELEMETRY', 'CONFIDENTIAL_LOGS', 'AUDIT_LOGS'],
        registeredAt: now,
        updatedAt: now,
      },
    ];

    for (const uc of defaults) {
      this.useCases.set(uc.key, uc);
    }
  }

  public getUseCase(key: string): AiUseCaseDefinition {
    const uc = this.useCases.get(key);
    if (!uc) {
      throw new NotFoundException(`AI Use Case '${key}' is not registered in the Governance Registry`);
    }
    return uc;
  }

  public listUseCases(): AiUseCaseDefinition[] {
    return Array.from(this.useCases.values());
  }

  public registerUseCase(
    definition: Omit<AiUseCaseDefinition, 'registeredAt' | 'updatedAt'>,
  ): AiUseCaseDefinition {
    if (this.useCases.has(definition.key)) {
      throw new BadRequestException(`AI Use Case '${definition.key}' is already registered`);
    }
    const now = new Date().toISOString();
    const fullDef: AiUseCaseDefinition = {
      ...definition,
      registeredAt: now,
      updatedAt: now,
    };
    this.useCases.set(fullDef.key, fullDef);
    return fullDef;
  }

  public updateApprovalStatus(
    key: string,
    status: UseCaseApprovalStatus,
  ): AiUseCaseDefinition {
    const uc = this.getUseCase(key);
    uc.approvalStatus = status;
    uc.updatedAt = new Date().toISOString();
    this.useCases.set(key, uc);
    return uc;
  }

  public validateExecutionEligibility(
    key: string,
    requestedModelVersion: string,
  ): { eligible: boolean; reason?: string } {
    const uc = this.getUseCase(key);

    if (uc.approvalStatus !== 'APPROVED_FOR_PRODUCTION') {
      return {
        eligible: false,
        reason: `Use Case '${key}' is in status '${uc.approvalStatus}', not approved for production execution`,
      };
    }

    if (uc.pinnedModelVersion !== requestedModelVersion) {
      return {
        eligible: false,
        reason: `Model version '${requestedModelVersion}' does not match pinned version '${uc.pinnedModelVersion}' for use case '${key}'`,
      };
    }

    return { eligible: true };
  }
}
