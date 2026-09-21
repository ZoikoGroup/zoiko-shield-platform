import { Injectable, Logger } from '@nestjs/common';

export type GovernanceStatus = 'CORE' | 'CONTROLLED' | 'GATED' | 'DEFERRED';

export interface CapabilityItem {
  id: string;
  name: string;
  domain: string;
  customerService: string;
  status: GovernanceStatus;
  substantiatingSatellites: string[];
  governanceRationale: string;
  statutoryReference?: string;
  requiresQuorum?: boolean;
  requiresPurposeBoundAccess?: boolean;
}

export interface CapabilityDomainSummary {
  domainId: string;
  domainName: string;
  description: string;
  totalCapabilities: number;
  coreCount: number;
  controlledCount: number;
  gatedCount: number;
  deferredCount: number;
  items: CapabilityItem[];
}

export interface PublicServiceDefinition {
  serviceId: string;
  serviceName: string;
  category: string;
  publicOutcomeDescription: string;
  status: GovernanceStatus;
  substantiatingComponents: string[];
  includedCapabilities: string[];
  pricingTierMinimum: 'ESSENTIAL' | 'PROFESSIONAL' | 'ADVANCED' | 'ENTERPRISE';
}

@Injectable()
export class CapabilityStatusService {
  private readonly logger = new Logger(CapabilityStatusService.name);

  /**
   * Complete Registry of Customer-Visible Public Services (12 Services)
   * Grounded strictly in commercial catalogue outcome definitions.
   * Internal satellites (shield-core, shield-ingest, shield-action, shield-anchor, shield-ai, verifier-cli)
   * are explicitly documented only as substantiating components.
   */
  private readonly publicServices: PublicServiceDefinition[] = [
    {
      serviceId: 'SVC-01',
      serviceName: 'Continuous Compliance & Assurance Monitoring',
      category: 'Governance, Risk & Compliance',
      publicOutcomeDescription:
        'Automated continuous evaluation of security controls against approved regulatory baselines (SOC 2 Type II CC6.1, ISO/IEC 27001:2022 A.9.2) with tamper-evident evidence linkage.',
      status: 'CORE',
      substantiatingComponents: ['shield-core', 'shield-anchor'],
      includedCapabilities: ['CAP-ASSURE-01', 'CAP-ASSURE-02', 'CAP-EVID-01'],
      pricingTierMinimum: 'ESSENTIAL',
    },
    {
      serviceId: 'SVC-02',
      serviceName: 'Cryptographic Evidence Ledger & Audit Package Delivery',
      category: 'Trust & Verification',
      publicOutcomeDescription:
        'Immutable SHA-256 Merkle-tree checkpointing with offline, zero-network verifiable audit package generation and CLI verifier.',
      status: 'CORE',
      substantiatingComponents: ['shield-anchor', 'verifier-cli'],
      includedCapabilities: ['CAP-EVID-01', 'CAP-EVID-02', 'CAP-VERIF-01'],
      pricingTierMinimum: 'ESSENTIAL',
    },
    {
      serviceId: 'SVC-03',
      serviceName: 'Multi-Cloud & SaaS Telemetry Ingestion',
      category: 'Security Operations',
      publicOutcomeDescription:
        'Normalized OCSF schema security event streaming across Microsoft Entra ID, AWS CloudTrail, Google Workspace, CrowdStrike, and Okta.',
      status: 'CORE',
      substantiatingComponents: ['shield-ingest', 'shield-core'],
      includedCapabilities: ['CAP-INGEST-01', 'CAP-CONN-01', 'CAP-CONN-02'],
      pricingTierMinimum: 'ESSENTIAL',
    },
    {
      serviceId: 'SVC-04',
      serviceName: 'Continuous Exposure & Vulnerability Management',
      category: 'Attack Surface Management',
      publicOutcomeDescription:
        'Continuous discovery, asset graph inventory, attack path visualization, and risk factor scoring for cloud and identity assets.',
      status: 'CORE',
      substantiatingComponents: ['shield-core', 'shield-ai'],
      includedCapabilities: ['CAP-EXPOS-01', 'CAP-EXPOS-02'],
      pricingTierMinimum: 'PROFESSIONAL',
    },
    {
      serviceId: 'SVC-05',
      serviceName: 'Managed Detection & Threat Triage (MDR)',
      category: 'Security Operations',
      publicOutcomeDescription:
        'Real-time threat detection rule engine, alert deduplication, anomaly scoring, and automated case timeline aggregation.',
      status: 'CORE',
      substantiatingComponents: ['shield-core', 'shield-ingest'],
      includedCapabilities: ['CAP-DETECT-01', 'CAP-DETECT-02', 'CAP-CASE-01'],
      pricingTierMinimum: 'PROFESSIONAL',
    },
    {
      serviceId: 'SVC-06',
      serviceName: 'Human-in-the-Loop SOAR Response Orchestration',
      category: 'Incident Response',
      publicOutcomeDescription:
        'Pre-simulated, idempotency-backed remediation playbooks with two-man quorum gates and circuit-breaker rollback guarantees.',
      status: 'CONTROLLED',
      substantiatingComponents: ['shield-action', 'shield-core'],
      includedCapabilities: ['CAP-ACTION-01', 'CAP-ACTION-02'],
      pricingTierMinimum: 'PROFESSIONAL',
    },
    {
      serviceId: 'SVC-07',
      serviceName: 'Emergency Incident Response Retainer (§16.4)',
      category: 'Incident Response',
      publicOutcomeDescription:
        'Contractual emergency surge retainer with SLA response windows, purpose-bound legal access reasons, and immutable counsel-controlled record protection.',
      status: 'CONTROLLED',
      substantiatingComponents: ['shield-core'],
      includedCapabilities: ['CAP-IR-01', 'CAP-IR-02'],
      pricingTierMinimum: 'ESSENTIAL',
    },
    {
      serviceId: 'SVC-08',
      serviceName: 'AI Safety & Grounding Governance',
      category: 'AI Security',
      publicOutcomeDescription:
        'Domain-differentiated AI governance featuring dual-model consensus verification, evidence-grounded hypothesis validation, and model armor filtering.',
      status: 'CORE',
      substantiatingComponents: ['shield-ai', 'shield-core'],
      includedCapabilities: ['CAP-AI-01', 'CAP-AI-02', 'CAP-AI-03'],
      pricingTierMinimum: 'ADVANCED',
    },
    {
      serviceId: 'SVC-09',
      serviceName: 'Threat Hunting & Attack Path Explorer',
      category: 'Security Operations',
      publicOutcomeDescription:
        'Multi-hop graph trajectory exploration, MITRE ATT&CK correlation, and streaming threat hypothesis validation.',
      status: 'CORE',
      substantiatingComponents: ['shield-ai', 'shield-core'],
      includedCapabilities: ['CAP-HUNT-01', 'CAP-HUNT-02'],
      pricingTierMinimum: 'ADVANCED',
    },
    {
      serviceId: 'SVC-10',
      serviceName: 'Continuous Security Validation & Posture Verification',
      category: 'Security Operations',
      publicOutcomeDescription:
        'Controlled defensive control testing, detection rule verification, and defensive posture attestation.',
      status: 'CONTROLLED',
      substantiatingComponents: ['shield-core', 'shield-action'],
      includedCapabilities: ['CAP-POSTURE-01', 'CAP-POSTURE-02'],
      pricingTierMinimum: 'ADVANCED',
    },
    {
      serviceId: 'SVC-11',
      serviceName: 'Industry Sector Compliance Packs',
      category: 'Governance, Risk & Compliance',
      publicOutcomeDescription:
        'Tailored sector-specific compliance overlays (FinTech, Telecom, Healthcare, Legal, SaaS, Public Sector) subject to regional release approval.',
      status: 'GATED',
      substantiatingComponents: ['shield-core'],
      includedCapabilities: ['CAP-SECTOR-01'],
      pricingTierMinimum: 'ADVANCED',
    },
    {
      serviceId: 'SVC-12',
      serviceName:
        'Advanced Regulatory Frameworks (DORA, NIS2, PCI DSS v4.0.1)',
      category: 'Governance, Risk & Compliance',
      publicOutcomeDescription:
        'Specialized European Digital Operational Resilience (DORA), NIS2 Directive, and PCI DSS v4.0.1 evaluators.',
      status: 'DEFERRED',
      substantiatingComponents: ['shield-core'],
      includedCapabilities: ['CAP-FRAME-01', 'CAP-FRAME-02'],
      pricingTierMinimum: 'ENTERPRISE',
    },
  ];

  /**
   * Complete Registry of Detailed Platform Capabilities across 7 Capability Domains
   */
  private readonly capabilities: CapabilityItem[] = [
    // 1. Ingestion & Connectivity Domain
    {
      id: 'CAP-INGEST-01',
      name: 'Real-time OCSF Event Stream Ingestion',
      domain: 'INGESTION_CONNECTIVITY',
      customerService: 'SVC-03',
      status: 'CORE',
      substantiatingSatellites: ['shield-ingest'],
      governanceRationale:
        'Fully certified Tier 1 connector stream processor with DLQ replay quarantine.',
    },
    {
      id: 'CAP-CONN-01',
      name: 'Tier 1 Certified Connector Ecosystem (Microsoft Entra ID, AWS, Okta)',
      domain: 'INGESTION_CONNECTIVITY',
      customerService: 'SVC-03',
      status: 'CORE',
      substantiatingSatellites: ['shield-core', 'shield-ingest'],
      governanceRationale:
        'Certified Tier 1 connectors with automated HMAC authentication and token rotation.',
    },
    {
      id: 'CAP-CONN-02',
      name: 'Tier 2 Partner-Verified Connectors (CrowdStrike, Google Workspace, SentinelOne)',
      domain: 'INGESTION_CONNECTIVITY',
      customerService: 'SVC-03',
      status: 'CORE',
      substantiatingSatellites: ['shield-core', 'shield-ingest'],
      governanceRationale:
        'Partner-verified connectors active with standard telemetry ingestion SLAs.',
    },
    {
      id: 'CAP-CONN-03',
      name: 'Tier 3 Community & Experimental Connectors',
      domain: 'INGESTION_CONNECTIVITY',
      customerService: 'SVC-03',
      status: 'GATED',
      substantiatingSatellites: ['shield-core', 'shield-ingest'],
      governanceRationale:
        'Experimental connectors gated behind explicit tenant activation approval.',
    },

    // 2. Continuous Assurance & Evidence Domain
    {
      id: 'CAP-ASSURE-01',
      name: 'SOC 2 Type II (CC6.1) Continuous Control Evaluation',
      domain: 'ASSURANCE_EVIDENCE',
      customerService: 'SVC-01',
      status: 'CORE',
      substantiatingSatellites: ['shield-core'],
      governanceRationale:
        'Active core continuous assurance baseline evaluating logical access and access reviews.',
      statutoryReference: 'AICPA SOC 2 CC6.1',
    },
    {
      id: 'CAP-ASSURE-02',
      name: 'ISO/IEC 27001:2022 (A.9.2) User Access Management Evaluation',
      domain: 'ASSURANCE_EVIDENCE',
      customerService: 'SVC-01',
      status: 'CORE',
      substantiatingSatellites: ['shield-core'],
      governanceRationale:
        'Active core continuous assurance baseline evaluating user provisioning and deprovisioning.',
      statutoryReference: 'ISO/IEC 27001:2022 A.9.2',
    },
    {
      id: 'CAP-EVID-01',
      name: 'Cryptographic Evidence Ledger (SHA-256 Merkle Checkpointing)',
      domain: 'ASSURANCE_EVIDENCE',
      customerService: 'SVC-02',
      status: 'CORE',
      substantiatingSatellites: ['shield-anchor'],
      governanceRationale:
        'Tamper-evident append-only ledger sealing epoch checkpoints with Merkle roots.',
    },
    {
      id: 'CAP-VERIF-01',
      name: 'Offline Zero-Network Audit Package Verifier CLI',
      domain: 'ASSURANCE_EVIDENCE',
      customerService: 'SVC-02',
      status: 'CORE',
      substantiatingSatellites: ['verifier-cli'],
      governanceRationale:
        'Standalone zero-dependency CLI verifying audit packages against local Merkle proofs.',
    },
    {
      id: 'CAP-FRAME-01',
      name: 'EU DORA (Digital Operational Resilience Act) Control Pack',
      domain: 'ASSURANCE_EVIDENCE',
      customerService: 'SVC-12',
      status: 'DEFERRED',
      substantiatingSatellites: ['shield-core'],
      governanceRationale:
        'Deferred to Phase 2 midpoint per ADR-08. Schema present in sector pack registry in DEFERRED status.',
      statutoryReference: 'Regulation (EU) 2022/2554',
    },
    {
      id: 'CAP-FRAME-02',
      name: 'NIS2 Directive & PCI DSS v4.0.1 Sector Evaluators',
      domain: 'ASSURANCE_EVIDENCE',
      customerService: 'SVC-12',
      status: 'DEFERRED',
      substantiatingSatellites: ['shield-core'],
      governanceRationale: 'Deferred to Phase 2 midpoint per ADR-08.',
      statutoryReference: 'Directive (EU) 2022/2555 / PCI DSS v4.0.1',
    },

    // 3. Managed Detection & Response (MDR) Domain
    {
      id: 'CAP-DETECT-01',
      name: 'Tier-A High-Throughput Stream Detection Engine',
      domain: 'MANAGED_DEFENSE',
      customerService: 'SVC-05',
      status: 'CORE',
      substantiatingSatellites: ['shield-core', 'shield-ingest'],
      governanceRationale:
        'In-memory sliding window threat correlation and pattern matching.',
    },
    {
      id: 'CAP-DETECT-02',
      name: 'Multi-Cloud Threat Ingestion & Correlation Pipeline',
      domain: 'MANAGED_DEFENSE',
      customerService: 'SVC-05',
      status: 'CORE',
      substantiatingSatellites: ['shield-core'],
      governanceRationale:
        'Cross-cloud asset identity resolution and anomaly scoring.',
    },
    {
      id: 'CAP-CASE-01',
      name: 'Temporal Case Management & Evidence Timeline',
      domain: 'MANAGED_DEFENSE',
      customerService: 'SVC-05',
      status: 'CORE',
      substantiatingSatellites: ['shield-core'],
      governanceRationale:
        'Comprehensive case tracking, analyst notes, and evidence linkage.',
    },

    // 4. SOAR Remediation & Response Domain
    {
      id: 'CAP-ACTION-01',
      name: 'Simulated Pre-Execution Playbook Sandbox',
      domain: 'SOAR_RESPONSE',
      customerService: 'SVC-06',
      status: 'CORE',
      substantiatingSatellites: ['shield-action'],
      governanceRationale:
        'Dry-run execution sandbox generating cryptographically signed execution receipts.',
    },
    {
      id: 'CAP-ACTION-02',
      name: 'Two-Man Quorum & Break-Glass Remediation Execution',
      domain: 'SOAR_RESPONSE',
      customerService: 'SVC-06',
      status: 'CONTROLLED',
      substantiatingSatellites: ['shield-action', 'shield-core'],
      governanceRationale:
        'High-impact remediation actions require multi-party approval quorum and circuit-breaker rollback.',
      requiresQuorum: true,
    },

    // 5. Emergency Incident Response Retainer Domain
    {
      id: 'CAP-IR-01',
      name: 'SLA-Backed Emergency Incident Response Retainer',
      domain: 'INCIDENT_RETAINER',
      customerService: 'SVC-07',
      status: 'CORE',
      substantiatingSatellites: ['shield-core'],
      governanceRationale:
        'Guaranteed 1-hour / 4-hour SLA emergency response windows with consumption ledger.',
    },
    {
      id: 'CAP-IR-02',
      name: 'Purpose-Bound Legal Access & Counsel-Controlled Records (§16.4)',
      domain: 'INCIDENT_RETAINER',
      customerService: 'SVC-07',
      status: 'CONTROLLED',
      substantiatingSatellites: ['shield-core'],
      governanceRationale:
        'Mandatory accessReason enforcement and tamper-evident audit logging for privilege-claimed forensics.',
      requiresPurposeBoundAccess: true,
    },

    // 6. AI Security Governance Domain
    {
      id: 'CAP-AI-01',
      name: 'Evidence-Grounded AI Hypothesis Verification',
      domain: 'AI_GOVERNANCE',
      customerService: 'SVC-08',
      status: 'CORE',
      substantiatingSatellites: ['shield-ai', 'shield-core'],
      governanceRationale:
        'AI investigations verified against factual evidence ledger ground truth before acceptance.',
    },
    {
      id: 'CAP-AI-02',
      name: 'Domain-Differentiated Dual-Model Consensus Gate (§17)',
      domain: 'AI_GOVERNANCE',
      customerService: 'SVC-08',
      status: 'CORE',
      substantiatingSatellites: ['shield-ai'],
      governanceRationale:
        'Requires secondary consensus verification for high-severity threat hypotheses.',
    },
    {
      id: 'CAP-AI-03',
      name: 'Model Armor Prompt-Injection & Data-Leakage Gateway',
      domain: 'AI_GOVERNANCE',
      customerService: 'SVC-08',
      status: 'CORE',
      substantiatingSatellites: ['shield-ai'],
      governanceRationale:
        'Sanitizes all LLM prompts and model responses for prompt-injection and PII redaction.',
    },
    {
      id: 'CAP-HUNT-01',
      name: 'Multi-Hop Attack Path Trajectory Discovery',
      domain: 'AI_GOVERNANCE',
      customerService: 'SVC-09',
      status: 'CORE',
      substantiatingSatellites: ['shield-ai', 'shield-core'],
      governanceRationale:
        'Graph-based traversal mapping lateral movement opportunities across cloud assets.',
    },

    // 7. Sector Packs & Experimental Crypto Domain
    {
      id: 'CAP-SECTOR-01',
      name: 'F1 Approved Industry Sector Packs (6 Industries)',
      domain: 'SECTOR_PACKS',
      customerService: 'SVC-11',
      status: 'GATED',
      substantiatingSatellites: ['shield-core'],
      governanceRationale:
        'Gated behind legal interpretation, SME review, content license, and regional availability approval.',
    },
    {
      id: 'CAP-CRYPTO-01',
      name: 'Post-Quantum Dual-Signing (Dilithium3 / Sphincs+)',
      domain: 'EXPERIMENTAL_CRYPTO',
      customerService: 'SVC-02',
      status: 'CONTROLLED',
      substantiatingSatellites: ['shield-anchor'],
      governanceRationale:
        'Dual-signing active in parallel with standard Ed25519/ECDSA.',
    },
    {
      id: 'CAP-CRYPTO-02',
      name: 'Homomorphic Threat Telemetry Aggregation (ADR-017)',
      domain: 'EXPERIMENTAL_CRYPTO',
      customerService: 'SVC-02',
      status: 'GATED',
      substantiatingSatellites: ['shield-core'],
      governanceRationale:
        'Parked in isolated experimental module per ADR-017 until G1 release approval.',
    },
  ];

  /**
   * Get all customer-visible public services.
   */
  getPublicServices(): PublicServiceDefinition[] {
    return [...this.publicServices];
  }

  /**
   * Get a public service by ID.
   */
  getPublicServiceById(serviceId: string): PublicServiceDefinition | undefined {
    return this.publicServices.find((s) => s.serviceId === serviceId);
  }

  /**
   * Get all registered capability items across all 7 domains.
   */
  getAllCapabilities(): CapabilityItem[] {
    return [...this.capabilities];
  }

  /**
   * Get capability items grouped by domain.
   */
  getCapabilitiesByDomain(): CapabilityDomainSummary[] {
    const domainNames: Record<string, string> = {
      INGESTION_CONNECTIVITY: 'Ingestion & Connectivity',
      ASSURANCE_EVIDENCE: 'Continuous Assurance & Verifiable Evidence',
      MANAGED_DEFENSE: 'Managed Detection & Threat Triage',
      SOAR_RESPONSE: 'SOAR Remediation & Response Orchestration',
      INCIDENT_RETAINER: 'Emergency Incident Response Retainer (§16.4)',
      AI_GOVERNANCE: 'AI Safety & Grounding Governance (§17)',
      SECTOR_PACKS: 'Industry Sector Compliance Packs',
      EXPERIMENTAL_CRYPTO: 'Advanced Cryptographic Trust & Verification',
    };

    const domainDescriptions: Record<string, string> = {
      INGESTION_CONNECTIVITY:
        'High-throughput OCSF security event streaming and multi-tier connector lifecycle management.',
      ASSURANCE_EVIDENCE:
        'Automated continuous control evaluation and tamper-evident Merkle evidence checkpointing.',
      MANAGED_DEFENSE:
        'Real-time threat detection, anomaly scoring, and case management.',
      SOAR_RESPONSE:
        'Human-in-the-loop playbook orchestration with two-man quorum and rollback safety.',
      INCIDENT_RETAINER:
        'SLA-guaranteed emergency response surge with purpose-bound legal record access.',
      AI_GOVERNANCE:
        'Dual-model consensus validation, evidence grounding gates, and model armor defenses.',
      SECTOR_PACKS:
        'Specialized regulatory and compliance overlays with regional market release gating.',
      EXPERIMENTAL_CRYPTO:
        'PQC dual-signing and cryptographic trust attestation.',
    };

    const domainKeys = [...new Set(this.capabilities.map((c) => c.domain))];

    return domainKeys.map((domainId) => {
      const items = this.capabilities.filter((c) => c.domain === domainId);
      return {
        domainId,
        domainName: domainNames[domainId] || domainId,
        description: domainDescriptions[domainId] || '',
        totalCapabilities: items.length,
        coreCount: items.filter((i) => i.status === 'CORE').length,
        controlledCount: items.filter((i) => i.status === 'CONTROLLED').length,
        gatedCount: items.filter((i) => i.status === 'GATED').length,
        deferredCount: items.filter((i) => i.status === 'DEFERRED').length,
        items,
      };
    });
  }

  /**
   * Fail-closed check: Verifies if a specific capability can be claimed as active/available.
   * Only CORE and CONTROLLED capabilities can be claimed as active.
   * GATED and DEFERRED capabilities return false.
   */
  isCapabilityAvailable(capabilityId: string): boolean {
    const item = this.capabilities.find((c) => c.id === capabilityId);
    if (!item) return false;
    return item.status === 'CORE' || item.status === 'CONTROLLED';
  }

  /**
   * Check whether a specific connector is available for active telemetry ingestion.
   */
  isConnectorAvailable(connectorKey: string): boolean {
    const gatedConnectors = [
      'sap-enterprise-gated',
      'custom-grpc-experimental',
    ];
    if (gatedConnectors.includes(connectorKey.toLowerCase())) {
      return false;
    }
    return true;
  }

  /**
   * Check whether a compliance framework evaluator is active vs deferred.
   */
  isFrameworkEvaluatorActive(frameworkKey: string): boolean {
    const activeFrameworks = ['SOC2_CC6_1', 'ISO27001_A9_2'];
    const deferredFrameworks = ['DORA', 'NIS2', 'PCI_DSS_V4'];

    const normalized = frameworkKey.toUpperCase().replace(/[-.]/g, '_');
    if (deferredFrameworks.some((d) => normalized.includes(d))) {
      return false;
    }
    return activeFrameworks.some((a) => normalized.includes(a));
  }
}
