import { CommercialOfferType } from '../offer-entitlement.service';

export type PlanTierKey =
  | 'SHIELD_ESSENTIAL'
  | 'SHIELD_PROFESSIONAL'
  | 'SHIELD_ADVANCED'
  | 'SHIELD_ENTERPRISE';

export interface PlanTierPricing {
  monthlyUsd: number | null;
  annualBilledMonthlyUsd: number | null;
  isContractOnly: boolean;
  currency: 'USD' | 'EUR' | 'GBP';
}

export interface PlanTierAllocations {
  maxProtectedAssets: number | null;
  includedTelemetryGbPerDay: number | null;
  /**
   * Null until ADR-07 approves contractual SLAs. Internal SLOs are not
   * customer promises (ZS-COM-BILL-001 §742).
   */
  incidentResponseSlaHours: number | null;
  retentionDays: number;
  includedRetainerHoursPerYear: number;
}

export interface PlanTier {
  key: PlanTierKey;
  displayName: string;
  tagline: string;
  description: string;
  pricing: PlanTierPricing;
  allocations: PlanTierAllocations;
  includedOffers: CommercialOfferType[];
  highlightedFeatures: string[];
  governanceFeatures: string[];
  supportModel: string;
  isPopular?: boolean;
}

/**
 * DRAFT plan structure only — nothing here is an approved commercial offer.
 *
 * ADR-06 (price book) and ADR-07 (contractual SLAs) are open. ZS-COM-BILL-001
 * §161: "No public price, plan ladder, included quota, discount, overage or
 * SLA is assumed until the approved price book is live. Missing price
 * configuration blocks charge creation." So every price and SLA figure is
 * null and every tier is contract-only until Finance/Commercial approve the
 * price book. This was previously named APPROVED_PLAN_TIERS and published
 * $2,000 / $4,000 / $8,000 monthly prices and 4h / 2h / 1h response SLAs on
 * an unauthenticated endpoint.
 */
export const DRAFT_PLAN_TIERS: PlanTier[] = [
  {
    key: 'SHIELD_ESSENTIAL',
    displayName: 'Shield Essential',
    tagline: 'Continuous Compliance & Foundation Defense',
    description:
      'Automated continuous control evaluation for SOC 2 and ISO 27001 with verifiable evidence ledger and basic incident retainer.',
    pricing: {
      monthlyUsd: null,
      annualBilledMonthlyUsd: null,
      isContractOnly: true,
      currency: 'USD',
    },
    allocations: {
      maxProtectedAssets: 250,
      includedTelemetryGbPerDay: 10,
      incidentResponseSlaHours: null,
      retentionDays: 90,
      includedRetainerHoursPerYear: 10,
    },
    includedOffers: ['CONTINUOUS_ASSURANCE', 'INCIDENT_RESPONSE_RETAINER'],
    highlightedFeatures: [
      'Continuous SOC 2 Type II (CC6.1) & ISO/IEC 27001:2022 (A.5.18) control evaluation',
      'Tamper-evident SHA-256 Merkle evidence ledger',
      'Offline zero-network audit package generator & CLI verifier',
      'Tier 1 Certified Connectors (Microsoft Entra ID, AWS, Okta)',
      'Emergency incident response retainer (response terms per order form)',
    ],
    governanceFeatures: [
      'Single-region evidence pinning',
      'Role-based access control (RBAC)',
      'Standard weekly assurance digests',
    ],
    supportModel: 'Standard 8x5 business hours support + emergency IR hotline',
  },
  {
    key: 'SHIELD_PROFESSIONAL',
    displayName: 'Shield Professional',
    tagline: 'Managed Detection & Threat Triage',
    description:
      'Comprehensive Managed Detection & Response with human-approved containment, continuous assurance, exposure scanning, and priority incident surge.',
    pricing: {
      monthlyUsd: null,
      annualBilledMonthlyUsd: null,
      isContractOnly: true,
      currency: 'USD',
    },
    allocations: {
      maxProtectedAssets: 1000,
      includedTelemetryGbPerDay: 50,
      incidentResponseSlaHours: null,
      retentionDays: 180,
      includedRetainerHoursPerYear: 25,
    },
    includedOffers: [
      'MANAGED_DEFENSE',
      'CONTINUOUS_ASSURANCE',
      'EXPOSURE_MANAGEMENT',
      'INCIDENT_RESPONSE_RETAINER',
    ],
    highlightedFeatures: [
      'Everything in Shield Essential',
      'Real-time threat detection stream engine & alert deduplication',
      'Multi-cloud threat correlation (AWS, Azure, GCP, CrowdStrike)',
      'Continuous attack surface & exposure management',
      'Human-in-the-loop SOAR response proposals & sandbox simulation',
      'Priority emergency incident response (response terms per order form)',
    ],
    governanceFeatures: [
      'Two-Man Quorum authorization for destructive playbooks',
      'Purpose-bound legal access reasons (§16.4) for forensic files',
      'Multi-region evidence synchronization',
    ],
    supportModel:
      'Continuous SOC triage + emergency IR response (terms per order form)',
    isPopular: true,
  },
  {
    key: 'SHIELD_ADVANCED',
    displayName: 'Shield Advanced',
    tagline: 'Enterprise AI Security & Active Defense',
    description:
      'Full-spectrum cyber defense including AI safety grounding, multi-hop threat hunting, canary honeypots, and expedited 1-hour emergency surge.',
    pricing: {
      monthlyUsd: null,
      annualBilledMonthlyUsd: null,
      isContractOnly: true,
      currency: 'USD',
    },
    allocations: {
      maxProtectedAssets: 5000,
      includedTelemetryGbPerDay: 250,
      incidentResponseSlaHours: null,
      retentionDays: 365,
      includedRetainerHoursPerYear: 50,
    },
    includedOffers: [
      'MANAGED_DEFENSE',
      'CONTINUOUS_ASSURANCE',
      'EXPOSURE_MANAGEMENT',
      'AI_SECURITY',
      'INCIDENT_RESPONSE_RETAINER',
    ],
    highlightedFeatures: [
      'Everything in Shield Professional',
      'AI Safety & Grounding Governance (§17 dual-model consensus)',
      'Multi-hop attack path trajectory exploration & MITRE correlation',
      'Autonomous adversary replay & canary honeypot telemetry',
      'Post-quantum ML-DSA-65 (FIPS 204) dual-signed evidence seals',
      'Expedited emergency incident response retainer (response terms per order form)',
    ],
    governanceFeatures: [
      'Immutable counsel-controlled forensic record isolation',
      'Model armor prompt-injection gateway & PII filter',
      'Regional standby failover & sovereign boundary fencing',
    ],
    supportModel:
      'Dedicated named Security Architect + emergency IR (terms per order form)',
  },
  {
    key: 'SHIELD_ENTERPRISE',
    displayName: 'Shield Enterprise',
    tagline: 'Custom Sovereign & Global Fleet Assurance',
    description:
      'Tailored enterprise architecture for global organizations requiring custom asset bands, on-premise enclaves, or specialized sector packs.',
    pricing: {
      monthlyUsd: null,
      annualBilledMonthlyUsd: null,
      isContractOnly: true,
      currency: 'USD',
    },
    allocations: {
      maxProtectedAssets: null,
      includedTelemetryGbPerDay: null,
      incidentResponseSlaHours: null,
      retentionDays: 730,
      includedRetainerHoursPerYear: 100,
    },
    includedOffers: [
      'MANAGED_DEFENSE',
      'CONTINUOUS_ASSURANCE',
      'EXPOSURE_MANAGEMENT',
      'AI_SECURITY',
      'INCIDENT_RESPONSE_RETAINER',
    ],
    highlightedFeatures: [
      'Everything in Shield Advanced',
      'Custom asset and telemetry bands tailored to organizational scale',
      'Dedicated private sovereign tenant partition & Customer-Managed Keys (BYOK)',
      'Custom sector compliance packs upon regional approval',
      'Executive quarterly board reporting & bespoke SLA settlement',
      'Direct executive incident commander assignment',
    ],
    governanceFeatures: [
      'Customer-Managed Keys (BYOK KMS integration) & Sovereign Partitioning',
      'Custom data sovereignty boundaries with geofenced storage',
      'Contractual SLA and service-credit terms once ADR-07 is approved',
    ],
    supportModel: 'Dedicated Named Incident Commander & TAM team',
  },
];
