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
  incidentResponseSlaHours: number;
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

export const APPROVED_PLAN_TIERS: PlanTier[] = [
  {
    key: 'SHIELD_ESSENTIAL',
    displayName: 'Shield Essential',
    tagline: 'Continuous Compliance & Foundation Defense',
    description: 'Automated continuous control evaluation for SOC 2 and ISO 27001 with verifiable evidence ledger and basic incident retainer.',
    pricing: {
      monthlyUsd: 2000,
      annualBilledMonthlyUsd: 1800,
      isContractOnly: false,
      currency: 'USD',
    },
    allocations: {
      maxProtectedAssets: 250,
      includedTelemetryGbPerDay: 10,
      incidentResponseSlaHours: 4,
      retentionDays: 90,
      includedRetainerHoursPerYear: 10,
    },
    includedOffers: ['CONTINUOUS_ASSURANCE', 'INCIDENT_RESPONSE_RETAINER'],
    highlightedFeatures: [
      'Continuous SOC 2 Type II (CC6.1) & ISO 27001 (A.9.2) evaluation',
      'Tamper-evident SHA-256 Merkle evidence ledger',
      'Offline zero-network audit package generator & CLI verifier',
      'Tier 1 Certified Connectors (Microsoft Entra ID, AWS, Okta)',
      '4-Hour SLA emergency incident response retainer',
    ],
    governanceFeatures: [
      'Single-region evidence pinning',
      'Role-based access control (RBAC)',
      'Standard weekly assurance digests',
    ],
    supportModel: 'Standard 8x5 business hours support + 4h emergency IR hotline',
  },
  {
    key: 'SHIELD_PROFESSIONAL',
    displayName: 'Shield Professional',
    tagline: 'Managed Detection & Threat Triage',
    description: 'Comprehensive Managed Detection & Response with human-approved containment, continuous assurance, exposure scanning, and priority incident surge.',
    pricing: {
      monthlyUsd: 4000,
      annualBilledMonthlyUsd: 3600,
      isContractOnly: false,
      currency: 'USD',
    },
    allocations: {
      maxProtectedAssets: 1000,
      includedTelemetryGbPerDay: 50,
      incidentResponseSlaHours: 2,
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
      '2-Hour SLA priority emergency incident response',
    ],
    governanceFeatures: [
      'Two-Man Quorum authorization for destructive playbooks',
      'Purpose-bound legal access reasons (§16.4) for forensic files',
      'Multi-region evidence synchronization',
    ],
    supportModel: 'Continuous SOC triage + 2h emergency IR response commitment',
    isPopular: true,
  },
  {
    key: 'SHIELD_ADVANCED',
    displayName: 'Shield Advanced',
    tagline: 'Enterprise AI Security & Active Defense',
    description: 'Full-spectrum cyber defense including AI safety grounding, multi-hop threat hunting, canary honeypots, and expedited 1-hour emergency surge.',
    pricing: {
      monthlyUsd: 8000,
      annualBilledMonthlyUsd: 7200,
      isContractOnly: false,
      currency: 'USD',
    },
    allocations: {
      maxProtectedAssets: 5000,
      includedTelemetryGbPerDay: 250,
      incidentResponseSlaHours: 1,
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
      'Post-Quantum Dilithium3 dual-signed evidence seals',
      '1-Hour SLA expedited emergency incident response retainer',
    ],
    governanceFeatures: [
      'Immutable counsel-controlled forensic record isolation',
      'Model armor prompt-injection gateway & PII filter',
      'Regional standby failover & sovereign boundary fencing',
    ],
    supportModel: 'Dedicated named Security Architect + 1h emergency IR SLA',
  },
  {
    key: 'SHIELD_ENTERPRISE',
    displayName: 'Shield Enterprise',
    tagline: 'Custom Sovereign & Global Fleet Assurance',
    description: 'Tailored enterprise architecture for global organizations requiring custom asset bands, on-premise enclaves, or specialized sector packs.',
    pricing: {
      monthlyUsd: null,
      annualBilledMonthlyUsd: null,
      isContractOnly: true,
      currency: 'USD',
    },
    allocations: {
      maxProtectedAssets: null,
      includedTelemetryGbPerDay: null,
      incidentResponseSlaHours: 1,
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
      'Bespoke SLA credit guarantees with automated ledger settlement',
    ],
    supportModel: 'Dedicated Named Incident Commander & TAM team',
  },
];
