import { Controller, Get } from '@nestjs/common';

export interface CustomerDisclosuresResponse {
  g1LaunchGateStatus: 'PENDING MULTI-APPROVER SIGN-OFF' | 'APPROVED_GA';
  responseAuthorityLevel: 'R1_RECOMMEND_AND_SIMULATE_ONLY';
  regulatoryBoundary: {
    activeFrameworks: string[];
    deferredOverlays: Array<{
      framework: string;
      deferredUntil: string;
      reason: string;
    }>;
  };
  certifiedConnectorsScope: {
    p0Certified: string[];
    p1Deferred: string[];
  };
  aiSafetyGovernance: {
    modelArmorSafetyStatus: string;
    promptInjectionProtection: boolean;
    deterministicFallbackEngine: string;
  };
  disclosedAt: string;
}

/**
 * Customer Disclosures & Known-Limitations Register Controller
 * Specification: MASTER_BUILD_PLAN.md §7 (Step 10: Customer Disclosures) & §10 (AI Implementation Rules)
 */
@Controller('api/v1/governance/disclosures')
export class CustomerDisclosuresController {
  @Get()
  getDisclosures(): CustomerDisclosuresResponse {
    return {
      g1LaunchGateStatus: 'PENDING MULTI-APPROVER SIGN-OFF',
      responseAuthorityLevel: 'R1_RECOMMEND_AND_SIMULATE_ONLY',
      regulatoryBoundary: {
        activeFrameworks: [
          'SOC 2 Type II (CC6.1, CC6.6)',
          'ISO/IEC 27001:2022 (A.9.4, A.12.1)',
        ],
        deferredOverlays: [
          {
            framework: 'DORA',
            deferredUntil: 'Phase 2 Midpoint (per ADR-08)',
            reason:
              'Requires signed production pipeline and legal readiness certification',
          },
          {
            framework: 'NIS2',
            deferredUntil: 'Phase 2 Midpoint (per ADR-08)',
            reason:
              'Requires sector overlay selection and legal readiness certification',
          },
        ],
      },
      certifiedConnectorsScope: {
        p0Certified: [
          'Microsoft Entra ID / M365',
          'AWS GuardDuty / CloudTrail',
          'Cortex XDR',
          'Generic Webhook',
          'Generic Syslog',
          'Jira',
          'Snyk',
        ],
        p1Deferred: [
          'GCP Security Command Center',
          'Microsoft Defender for Endpoint',
        ],
      },
      aiSafetyGovernance: {
        modelArmorSafetyStatus: 'ENFORCED_WITH_ZERO_BYPASS',
        promptInjectionProtection: true,
        deterministicFallbackEngine:
          'Tier-1 Deterministic RCA (Continuity Active)',
      },
      disclosedAt: new Date().toISOString(),
    };
  }
}
