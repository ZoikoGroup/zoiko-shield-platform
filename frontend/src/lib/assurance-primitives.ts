/**
 * Zoiko Shield — Enterprise Assurance Primitives & Canonical Contracts (G00–G12)
 * Implements the shared data contracts across G01–G12 and role-separated workspaces.
 */

export type DataProvenanceState =
  | "VERIFIED_BACKEND"
  | "DEMO_FIXTURE"
  | "STALE_SNAPSHOT"
  | "UNAVAILABLE";

export interface DataProvenanceEnvelope<T = unknown> {
  data_provenance: DataProvenanceState;
  as_of: string;
  source_service: string;
  completeness: "COMPLETE" | "PARTIAL" | "DEGRADED";
  tenant_id: string;
  residency_region: string;
  payload?: T;
}

export type WorkspaceMode =
  | "CUSTOMER_WORKSPACE"
  | "TENANT_ADMIN_WORKSPACE"
  | "SUPER_ADMIN_WORKSPACE";

export type CustomerViewMode = "EXECUTIVE_VIEW" | "SOC_VIEW" | "ACCOUNT_VIEW";

export interface CanonicalRegionMetadata {
  code: string;
  displayName: string;
  shortLabel: string;
  countryCode: string;
  countryName: string;
  cloudProviderRegion: string;
  sovereigntyRegime: string;
  kmsBoundary: string;
  backupRegion: string;
}

/**
 * G01 Claim C06 & G02 Canonical Region Registry
 * Fixes the eu-west-1 (Ireland) vs eu-central-1 (Frankfurt) vs ap-south-1 (Mumbai) mapping bug.
 */
export const CANONICAL_REGIONS: Record<string, CanonicalRegionMetadata> = {
  "eu-west-1": {
    code: "eu-west-1",
    displayName: "EU (Ireland) — eu-west-1",
    shortLabel: "EU (Ireland)",
    countryCode: "IE",
    countryName: "Ireland (EU GDPR)",
    cloudProviderRegion: "AWS Europe (Ireland)",
    sovereigntyRegime: "EU GDPR / DORA / NIS2",
    kmsBoundary: "arn:aws:kms:eu-west-1:zoiko-shield:key/tenant-cmk-ie",
    backupRegion: "eu-west-1 (In-Region Multi-AZ)",
  },
  "eu-central-1": {
    code: "eu-central-1",
    displayName: "EU (Frankfurt) — eu-central-1",
    shortLabel: "EU (Frankfurt)",
    countryCode: "DE",
    countryName: "Germany (EU GDPR / BSI C5)",
    cloudProviderRegion: "AWS Europe (Frankfurt)",
    sovereigntyRegime: "EU GDPR / BSI C5 / DORA",
    kmsBoundary: "arn:aws:kms:eu-central-1:zoiko-shield:key/tenant-cmk-de",
    backupRegion: "eu-central-1 (In-Region Multi-AZ)",
  },
  "eu-west-2": {
    code: "eu-west-2",
    displayName: "UK (London) — eu-west-2",
    shortLabel: "UK (London)",
    countryCode: "GB",
    countryName: "United Kingdom (UK GDPR)",
    cloudProviderRegion: "AWS Europe (London)",
    sovereigntyRegime: "UK GDPR / FCA / NCSC CAF",
    kmsBoundary: "arn:aws:kms:eu-west-2:zoiko-shield:key/tenant-cmk-gb",
    backupRegion: "eu-west-2 (In-Region Multi-AZ)",
  },
  "us-east-1": {
    code: "us-east-1",
    displayName: "US East (N. Virginia) — us-east-1",
    shortLabel: "US East (Virginia)",
    countryCode: "US",
    countryName: "United States (CCPA / SEC / HIPAA)",
    cloudProviderRegion: "AWS US East (N. Virginia)",
    sovereigntyRegime: "US Federal / SOC 2 / HIPAA",
    kmsBoundary: "arn:aws:kms:us-east-1:zoiko-shield:key/tenant-cmk-use1",
    backupRegion: "us-east-1 (In-Region Multi-AZ)",
  },
  "us-west-2": {
    code: "us-west-2",
    displayName: "US West (Oregon) — us-west-2",
    shortLabel: "US West (Oregon)",
    countryCode: "US",
    countryName: "United States (West Coast)",
    cloudProviderRegion: "AWS US West (Oregon)",
    sovereigntyRegime: "US Federal / SOC 2 / CCPA",
    kmsBoundary: "arn:aws:kms:us-west-2:zoiko-shield:key/tenant-cmk-usw2",
    backupRegion: "us-west-2 (In-Region Multi-AZ)",
  },
  "ap-south-1": {
    code: "ap-south-1",
    displayName: "India (Mumbai) — ap-south-1",
    shortLabel: "India (Mumbai)",
    countryCode: "IN",
    countryName: "India (DPDP Act / CERT-In / RBI)",
    cloudProviderRegion: "AWS Asia Pacific (Mumbai)",
    sovereigntyRegime: "India DPDP / RBI Data Localization",
    kmsBoundary: "arn:aws:kms:ap-south-1:zoiko-shield:key/tenant-cmk-in",
    backupRegion: "ap-south-1 (In-Region Multi-AZ)",
  },
  "ap-southeast-1": {
    code: "ap-southeast-1",
    displayName: "APAC (Singapore) — ap-southeast-1",
    shortLabel: "APAC (Singapore)",
    countryCode: "SG",
    countryName: "Singapore (PDPA / MAS TRM)",
    cloudProviderRegion: "AWS Asia Pacific (Singapore)",
    sovereigntyRegime: "Singapore PDPA / MAS TRM",
    kmsBoundary: "arn:aws:kms:ap-southeast-1:zoiko-shield:key/tenant-cmk-sg",
    backupRegion: "ap-southeast-1 (In-Region Multi-AZ)",
  },
};

export function resolveCountryFromRegion(regionCode: string): string {
  const normalized = (regionCode || "eu-west-1").trim().toLowerCase();
  return CANONICAL_REGIONS[normalized]?.countryCode ?? "IE";
}

export function resolveRegionMetadata(regionCode: string): CanonicalRegionMetadata {
  const normalized = (regionCode || "eu-west-1").trim().toLowerCase();
  return CANONICAL_REGIONS[normalized] ?? CANONICAL_REGIONS["eu-west-1"];
}

/**
 * Role & Workspace Resolution Helper (Lennox Sir's 3-Dashboard Separation)
 */
export function resolveWorkspaceMode(
  role?: string,
  explicitMode?: string | null
): WorkspaceMode {
  if (explicitMode === "CUSTOMER_WORKSPACE") return "CUSTOMER_WORKSPACE";
  if (explicitMode === "TENANT_ADMIN_WORKSPACE") return "TENANT_ADMIN_WORKSPACE";
  if (explicitMode === "SUPER_ADMIN_WORKSPACE") return "SUPER_ADMIN_WORKSPACE";

  if (role === "SUPER_ADMIN") return "SUPER_ADMIN_WORKSPACE";
  if (role === "TENANT_ADMIN") return "TENANT_ADMIN_WORKSPACE";
  // Default for TENANT_OWNER (CISO / Customer Executive), SECURITY_ANALYST, AUDITOR:
  return "CUSTOMER_WORKSPACE";
}

export function resolveDefaultLandingRoute(
  role?: string,
  explicitMode?: string | null
): string {
  const mode = resolveWorkspaceMode(role, explicitMode);
  if (mode === "SUPER_ADMIN_WORKSPACE") return "/admin";
  if (mode === "TENANT_ADMIN_WORKSPACE") return "/admin/tenant";
  return "/customer/dashboard";
}

/**
 * G01 — Public Assurance Claims Registry (C01–C23)
 */
export type ClaimVerificationState =
  | "UNVERIFIED"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "EXPIRED"
  | "REVOKED"
  | "CONTRADICTED";

export interface ClaimRecord {
  claim_id: string;
  surface: string;
  assertion: string;
  remediated_copy: string;
  scope: "PLATFORM" | "SUPPLIER_INFRASTRUCTURE" | "CONNECTOR_INTEGRATION" | "ROADMAP_TARGET";
  source: string;
  claim_state: ClaimVerificationState;
  release_policy: "FAIL_CLOSED" | "QUALIFIED_DISCLOSURE";
  evidence_artifact_ref?: string;
  verified_at?: string;
  expires_at?: string;
  approvals: string[];
}

export const G01_CLAIM_REGISTRY: ClaimRecord[] = [
  {
    claim_id: "C01",
    surface: "/trust, /verify-certificate",
    assertion: "SOC 2 Type II Platform Certification",
    remediated_copy:
      "SOC 2 Type II readiness controls implemented; formal independent CPA audit report under review (Supplier AWS infrastructure holds SOC 2 Type II).",
    scope: "PLATFORM",
    source: "Trust Center / Compliance Registry",
    claim_state: "UNDER_REVIEW",
    release_policy: "QUALIFIED_DISCLOSURE",
    evidence_artifact_ref: "evd://g01/c01-soc2-readiness-matrix-v1",
    approvals: ["CISO", "Legal"],
  },
  {
    claim_id: "C02",
    surface: "/trust, /compliance",
    assertion: "ISO/IEC 27001:2022 Certification",
    remediated_copy:
      "ISMS controls aligned to ISO/IEC 27001:2022 Annex A; external certification body Stage 2 audit pending.",
    scope: "PLATFORM",
    source: "Trust Center / Compliance Registry",
    claim_state: "UNDER_REVIEW",
    release_policy: "QUALIFIED_DISCLOSURE",
    evidence_artifact_ref: "evd://g01/c02-iso27001-soa-v1",
    approvals: ["CISO", "DPO"],
  },
  {
    claim_id: "C06",
    surface: "/onboarding, /tenant-management, TopHeader",
    assertion: "Canonical Regional Data Residency Mapping (eu-west-1 = Ireland, eu-central-1 = Frankfurt)",
    remediated_copy:
      "eu-west-1 maps deterministically to AWS Europe (Ireland / IE); eu-central-1 maps to AWS Europe (Frankfurt / DE); ap-south-1 maps to AWS Asia Pacific (Mumbai / IN).",
    scope: "PLATFORM",
    source: "Onboarding & Boundary Registry (G02)",
    claim_state: "VERIFIED",
    release_policy: "FAIL_CLOSED",
    evidence_artifact_ref: "evd://g01/c06-region-mapping-test-t06",
    verified_at: "2026-10-31T08:00:00Z",
    expires_at: "2027-10-31T08:00:00Z",
    approvals: ["VP_ENG", "DPO"],
  },
  {
    claim_id: "C12",
    surface: "/ledger, /audit, /ai-governance, TopHeader",
    assertion: "Post-Quantum Cryptography (PQC / ML-DSA-65) Evidence Signatures",
    remediated_copy:
      "Production evidence bundles are signed with classical Ed25519 / ECDSA P-256 and anchored with SHA-256 Merkle trees + RFC 3161 TSA tokens. PQC (ML-DSA-65) is gated as an experimental roadmap profile.",
    scope: "PLATFORM",
    source: "Cryptographic Evidence Service (G06)",
    claim_state: "VERIFIED",
    release_policy: "FAIL_CLOSED",
    evidence_artifact_ref: "evd://g06/manifest-schema-ed25519-v1",
    verified_at: "2026-10-31T08:00:00Z",
    expires_at: "2027-10-31T08:00:00Z",
    approvals: ["CISO", "VP_ENG"],
  },
  {
    claim_id: "C14",
    surface: "/trust, /connectors",
    assertion: "Third-Party Subprocessor vs. Security Integration Scope",
    remediated_copy:
      "CrowdStrike Falcon, Microsoft Entra ID, and Okta are customer-configured telemetry/action integrations, not Zoiko Shield hosting subprocessors.",
    scope: "CONNECTOR_INTEGRATION",
    source: "Connector Certification Registry (G09)",
    claim_state: "VERIFIED",
    release_policy: "FAIL_CLOSED",
    evidence_artifact_ref: "evd://g01/c14-supplier-vs-integration-schedule",
    verified_at: "2026-10-31T08:00:00Z",
    expires_at: "2027-10-31T08:00:00Z",
    approvals: ["Legal", "DPO"],
  },
  {
    claim_id: "C18",
    surface: "/admin/platform-health, UnavailableState",
    assertion: "Recovery Time Objective (RTO) & Recovery Point Objective (RPO) Claims",
    remediated_copy:
      "Engineering targets: RPO <= 15m, RTO <= 60m. Displayed alongside the latest dated, verified isolated DR restore drill measurement.",
    scope: "PLATFORM",
    source: "DR Restore Drill Service (G05)",
    claim_state: "VERIFIED",
    release_policy: "FAIL_CLOSED",
    evidence_artifact_ref: "evd://g05/dr-drill-receipt-2026-10-31",
    verified_at: "2026-10-31T08:00:00Z",
    expires_at: "2027-01-31T08:00:00Z",
    approvals: ["SRE_LEAD", "VP_ENG"],
  },
  {
    claim_id: "C21",
    surface: "/ai-governance, /trust",
    assertion: "ISO/IEC 42001 AI Management System Alignment",
    remediated_copy:
      "AI governance controls mapped to ISO/IEC 42001:2023 framework requirements (Internal Alignment / Non-Certified).",
    scope: "ROADMAP_TARGET",
    source: "AI Governance Registry (G10)",
    claim_state: "UNDER_REVIEW",
    release_policy: "QUALIFIED_DISCLOSURE",
    evidence_artifact_ref: "evd://g10/iso42001-control-mapping-draft",
    approvals: ["AI_RISK_LEAD", "Legal"],
  },
  {
    claim_id: "C22",
    surface: "Footer, /trust, /terms, /privacy",
    assertion: "Canonical Corporate Legal Entity Name",
    remediated_copy: "Zoiko Shield Inc. (a subsidiary of Zoiko Group — Canonical Contracting Entity)",
    scope: "PLATFORM",
    source: "Corporate Legal Registry",
    claim_state: "VERIFIED",
    release_policy: "FAIL_CLOSED",
    evidence_artifact_ref: "evd://g01/c22-legal-entity-schedule",
    verified_at: "2026-10-31T08:00:00Z",
    expires_at: "2027-10-31T08:00:00Z",
    approvals: ["Legal"],
  },
];

/**
 * G02 — Tenant Isolation Profiles & Boundary Evidence
 */
export type IsolationProfileType =
  | "SHARED_LOGICAL"
  | "DEDICATED_DATA_NAMESPACE"
  | "DEDICATED_SINGLE_TENANT";

export interface SubsystemBoundaryStatus {
  subsystem:
    | "HOT_EVENTS_POSTGRES_RLS"
    | "WARM_ANALYTICS_CLICKHOUSE"
    | "COLD_ARCHIVE_OBJECT_STORE"
    | "SEARCH_INDEX_OPENSEARCH"
    | "BACKUPS_AND_SNAPSHOTS"
    | "KMS_KEY_CUSTODY"
    | "AI_INFERENCE_CONTEXT";
  label: string;
  targetRegion: string;
  observedRegion: string;
  isolationMechanism: string;
  status: "ENFORCED" | "DRIFT_DETECTED" | "PROVISIONING";
  lastVerifiedAt: string;
}

export interface BoundaryDecisionReceipt {
  receipt_id: string;
  tenant_id: string;
  commercial_plan: string;
  isolation_profile: IsolationProfileType;
  home_region: string;
  country_code: string;
  data_plane_gate: "PASS" | "FAIL";
  backup_boundary_gate: "PASS" | "FAIL";
  search_index_gate: "PASS" | "FAIL";
  kms_key_gate: "PASS" | "FAIL";
  subprocessor_residency_gate: "PASS" | "FAIL";
  decision_hash: string;
  issued_at: string;
}

/**
 * G06 — 4 Mandatory Independent Proof Dimensions
 */
export type ProofDimensionStatus = "PASS" | "FAIL" | "INDETERMINATE" | "ERROR";

export type EvidenceReasonCode =
  | "EVD-NONE"
  | "EVD-ARC"
  | "EVD-HSH"
  | "EVD-MKL"
  | "EVD-SIG"
  | "EVD-TSA"
  | "EVD-TRU"
  | "EVD-COV"
  | "EVD-TEN"
  | "EVD-SRC";

export interface EvidenceVerificationVector {
  package_id: string;
  overall_verdict: ProofDimensionStatus;
  dimensions: {
    integrity: {
      status: ProofDimensionStatus;
      detail: string;
      reason_code: EvidenceReasonCode;
    };
    authenticity_time: {
      status: ProofDimensionStatus;
      detail: string;
      algorithm: "Ed25519" | "ECDSA-P256";
      tsa_authority: string;
      reason_code: EvidenceReasonCode;
    };
    completeness_scope: {
      status: ProofDimensionStatus;
      detail: string;
      window_start: string;
      window_end: string;
      excluded_sources: string[];
      reason_code: EvidenceReasonCode;
    };
    chain_of_custody: {
      status: ProofDimensionStatus;
      detail: string;
      custody_events_count: number;
      reason_code: EvidenceReasonCode;
    };
  };
  verified_at: string;
  verifier_version: string;
}

/**
 * G07 — 6 Scoped Launch Candidate Detection Rules
 */
export type RuleLifecycleState =
  | "CANDIDATE"
  | "NOT_EVALUABLE"
  | "EVALUATED_NO_MATCH"
  | "INTERMEDIATE_RISK"
  | "FINDING_OPEN"
  | "SUPPRESSED_WITH_REASON"
  | "RECOMPUTED"
  | "REVIEWED"
  | "RETIRED";

export interface ScopedDetectionRule {
  ruleId: string;
  version: string;
  name: string;
  mitreTechnique: string;
  mitreTactic: string;
  requiredSources: string[];
  lifecycleState: RuleLifecycleState;
  entityRiskWeight: number;
  precisionBenchmark: number;
  recallBenchmark: number;
  falsePositiveRate: number;
  windowSpec: string;
  description: string;
}

export const G07_LAUNCH_CANDIDATE_RULES: ScopedDetectionRule[] = [
  {
    ruleId: "ZS-DET-ID-001",
    version: "1.4.0",
    name: "Distributed Password Spray Across Multi-Tenant Identity Boundary",
    mitreTechnique: "T1110.003",
    mitreTactic: "Credential Access",
    requiredSources: ["microsoft-entra", "okta-identity"],
    lifecycleState: "FINDING_OPEN",
    entityRiskWeight: 35,
    precisionBenchmark: 0.94,
    recallBenchmark: 0.91,
    falsePositiveRate: 0.02,
    windowSpec: "15m sliding window (>= 12 distinct principals, <= 2 failures/principal)",
    description:
      "Detects low-and-slow password spraying across distinct identity principals originating from ASN-correlated proxy clusters.",
  },
  {
    ruleId: "ZS-DET-ID-002",
    version: "1.2.1",
    name: "Burst Authentication Failure Followed by Interactive Success from New ASN",
    mitreTechnique: "T1078.004",
    mitreTactic: "Initial Access / Credential Access",
    requiredSources: ["microsoft-entra", "okta-identity"],
    lifecycleState: "FINDING_OPEN",
    entityRiskWeight: 40,
    precisionBenchmark: 0.92,
    recallBenchmark: 0.89,
    falsePositiveRate: 0.03,
    windowSpec: "10m correlation window (>= 5 failed challenges + 1 MFA success)",
    description:
      "Correlates rapid authentication failures with a subsequent valid session establishment from an unseen autonomous system.",
  },
  {
    ruleId: "ZS-DET-ID-003",
    version: "2.0.0",
    name: "Out-of-Band Privileged Directory Role Assignment",
    mitreTechnique: "T1098.003",
    mitreTactic: "Persistence / Privilege Escalation",
    requiredSources: ["microsoft-entra", "aws-cloudtrail"],
    lifecycleState: "EVALUATED_NO_MATCH",
    entityRiskWeight: 45,
    precisionBenchmark: 0.97,
    recallBenchmark: 0.95,
    falsePositiveRate: 0.01,
    windowSpec: "Real-time event evaluation + JIT approval cross-check",
    description:
      "Flags Global Admin or IAM Administrator role bindings lacking a matching active JIT elevation lease.",
  },
  {
    ruleId: "ZS-DET-ID-004",
    version: "1.3.0",
    name: "MFA Fatigue / Push Bombing Sequence",
    mitreTechnique: "T1621",
    mitreTactic: "Credential Access",
    requiredSources: ["okta-identity", "microsoft-entra"],
    lifecycleState: "INTERMEDIATE_RISK",
    entityRiskWeight: 30,
    precisionBenchmark: 0.95,
    recallBenchmark: 0.93,
    falsePositiveRate: 0.02,
    windowSpec: "5m sliding window (>= 6 push challenges rejected/expired)",
    description:
      "Identifies repeated MFA push prompts targeting a single identity intended to induce user acceptance fatigue.",
  },
  {
    ruleId: "ZS-DET-ID-005",
    version: "1.1.0",
    name: "High-Privilege OAuth App Secret or Federation Certificate Mutation",
    mitreTechnique: "T1098.001",
    mitreTactic: "Persistence",
    requiredSources: ["microsoft-entra", "okta-identity"],
    lifecycleState: "FINDING_OPEN",
    entityRiskWeight: 50,
    precisionBenchmark: 0.98,
    recallBenchmark: 0.94,
    falsePositiveRate: 0.01,
    windowSpec: "Real-time event evaluation",
    description:
      "Detects addition of new client secrets, SAML signing certificates, or federated trust realms on privileged applications.",
  },
  {
    ruleId: "ZS-DET-CLOUD-006",
    version: "1.5.0",
    name: "Cloud Audit Trail Tampering or Logging Suppression",
    mitreTechnique: "T1562.008",
    mitreTactic: "Defense Evasion",
    requiredSources: ["aws-cloudtrail", "gcp-scc"],
    lifecycleState: "EVALUATED_NO_MATCH",
    entityRiskWeight: 55,
    precisionBenchmark: 0.99,
    recallBenchmark: 0.98,
    falsePositiveRate: 0.005,
    windowSpec: "Immediate deterministic evaluation (StopLogging / DeleteTrail / UpdateTrail)",
    description:
      "Detects control-plane API calls that stop, delete, or alter the S3/KMS destination of cloud audit logs.",
  },
];

/**
 * G08 — 7-Class Data Retention & Storage Schedule
 */
export type StorageTier = "HOT" | "ARCHIVE" | "BOTH";

export interface DataClassRetentionSchedule {
  dataClass:
    | "RAW_SECURITY_EVENT"
    | "NORMALIZED_OCSF_EVENT"
    | "DETECTION_AND_CASE"
    | "EVIDENCE_BUNDLE"
    | "SEARCH_JOB_OUTPUT"
    | "CONNECTOR_META_AND_USAGE"
    | "BACKUP_AND_SNAPSHOT";
  label: string;
  hotDays: number;
  warmDays: number;
  coldArchiveDays: number;
  deletionDisposition: "CRYPTO_SHRED_AND_PURGE" | "HOLD_LOCKED" | "APPEND_ONLY_WORM";
  legalHoldEligible: boolean;
  currentFootprintGb: number;
  policyPackKey?: string;
}

/**
 * Unified Canonical Policy Pack Catalogue (`policy_pack` single source of truth).
 * Consolidates regulatory/sector pack definitions and jurisdiction retention limits
 * so Retention reads its limits directly from the winning spec-driven `policy_pack`
 * (eliminating any duplicate `jurisdiction_pack` catalogue).
 */
export interface CanonicalPolicyPack {
  policy_pack_id: string;
  policy_key: string;
  version: string;
  name: string;
  region_codes: string[];
  jurisdiction: string;
  authority_reference: string;
  release_status: "RELEASED" | "UNDER_REVIEW";
  retention_limits: {
    min_statutory_days: number;
    max_retention_days: number;
    raw_hot_days: number;
    normalized_hot_days: number;
    evidence_worm_days: number;
    backup_warm_days: number;
  };
}

export const CANONICAL_POLICY_PACKS: Record<string, CanonicalPolicyPack> = {
  "eu-west-1": {
    policy_pack_id: "ZS-POL-PACK-EU-IE-001",
    policy_key: "eu_gdpr_dora_nis2_ie",
    version: "2.4.0",
    name: "EU GDPR + DORA + NIS2 Sovereign Policy Pack (Ireland)",
    region_codes: ["eu-west-1"],
    jurisdiction: "EU / Ireland (DPC)",
    authority_reference: "Reg (EU) 2016/679 Art. 5(1)(e) & Reg (EU) 2022/2554 (DORA)",
    release_status: "RELEASED",
    retention_limits: {
      min_statutory_days: 365,
      max_retention_days: 2555,
      raw_hot_days: 30,
      normalized_hot_days: 90,
      evidence_worm_days: 2555,
      backup_warm_days: 35,
    },
  },
  "eu-central-1": {
    policy_pack_id: "ZS-POL-PACK-EU-DE-002",
    policy_key: "eu_gdpr_bsi_c5_de",
    version: "2.4.0",
    name: "EU GDPR + BSI C5 + DORA Sovereign Policy Pack (Frankfurt)",
    region_codes: ["eu-central-1"],
    jurisdiction: "EU / Germany (BfDI / BaFin)",
    authority_reference: "BDSG § 257 HGB & BSI C5:2020 OPS-05",
    release_status: "RELEASED",
    retention_limits: {
      min_statutory_days: 365,
      max_retention_days: 3650,
      raw_hot_days: 45,
      normalized_hot_days: 120,
      evidence_worm_days: 3650,
      backup_warm_days: 45,
    },
  },
  "eu-west-2": {
    policy_pack_id: "ZS-POL-PACK-UK-GB-003",
    policy_key: "uk_gdpr_fca_ncsc_gb",
    version: "2.2.0",
    name: "UK GDPR + FCA SYSC + NCSC CAF Policy Pack (London)",
    region_codes: ["eu-west-2"],
    jurisdiction: "United Kingdom (ICO / FCA)",
    authority_reference: "UK Data Protection Act 2018 & FCA SYSC 13.7",
    release_status: "RELEASED",
    retention_limits: {
      min_statutory_days: 365,
      max_retention_days: 2190,
      raw_hot_days: 30,
      normalized_hot_days: 90,
      evidence_worm_days: 2190,
      backup_warm_days: 30,
    },
  },
  "us-east-1": {
    policy_pack_id: "ZS-POL-PACK-US-VA-004",
    policy_key: "us_soc2_sec_hipaa_use1",
    version: "3.1.0",
    name: "US SOC 2 + SEC Cyber + HIPAA Security Rule Policy Pack",
    region_codes: ["us-east-1", "us-west-2"],
    jurisdiction: "United States (SEC / HHS OCR / AICPA)",
    authority_reference: "45 CFR § 164.316(b)(2)(i) (6-Year HIPAA Retention) & SEC 17a-4",
    release_status: "RELEASED",
    retention_limits: {
      min_statutory_days: 365,
      max_retention_days: 2190,
      raw_hot_days: 30,
      normalized_hot_days: 90,
      evidence_worm_days: 2190,
      backup_warm_days: 35,
    },
  },
  "ap-south-1": {
    policy_pack_id: "ZS-POL-PACK-IN-MH-005",
    policy_key: "in_dpdp_certin_rbi_aps1",
    version: "2.1.0",
    name: "India DPDP Act + CERT-In 180d + RBI Localization Policy Pack",
    region_codes: ["ap-south-1"],
    jurisdiction: "India (MeitY / CERT-In / RBI)",
    authority_reference: "CERT-In Directions No. 20(3)/2022-CERT-In (Min 180d In-Country Logs) & DPDP Act 2023",
    release_status: "RELEASED",
    retention_limits: {
      min_statutory_days: 180,
      max_retention_days: 2920,
      raw_hot_days: 60,
      normalized_hot_days: 180,
      evidence_worm_days: 2920,
      backup_warm_days: 60,
    },
  },
  "ap-southeast-1": {
    policy_pack_id: "ZS-POL-PACK-SG-006",
    policy_key: "sg_pdpa_mas_trm_apse1",
    version: "2.0.0",
    name: "Singapore PDPA + MAS TRM Policy Pack",
    region_codes: ["ap-southeast-1"],
    jurisdiction: "Singapore (PDPC / MAS)",
    authority_reference: "MAS Technology Risk Management Guidelines § 11.2 & PDPA s25",
    release_status: "RELEASED",
    retention_limits: {
      min_statutory_days: 365,
      max_retention_days: 1825,
      raw_hot_days: 30,
      normalized_hot_days: 90,
      evidence_worm_days: 1825,
      backup_warm_days: 30,
    },
  },
};

export function resolvePolicyPackForRegion(regionCode: string): CanonicalPolicyPack {
  const normalized = (regionCode || "eu-west-1").trim().toLowerCase();
  if (normalized === "us-west-2") {
    return CANONICAL_POLICY_PACKS["us-east-1"];
  }
  return CANONICAL_POLICY_PACKS[normalized] ?? CANONICAL_POLICY_PACKS["eu-west-1"];
}

/**
 * Derives the 7-Class Data Retention Schedule dynamically from the winning `policy_pack`
 * for the given region, ensuring a single source of truth with zero duplicate catalogues.
 */
export function resolveRetentionScheduleFromPolicyPack(
  regionCode: string
): DataClassRetentionSchedule[] {
  const pack = resolvePolicyPackForRegion(regionCode);
  return G08_RETENTION_SCHEDULE.map((item) => {
    if (item.dataClass === "RAW_SECURITY_EVENT") {
      return {
        ...item,
        hotDays: pack.retention_limits.raw_hot_days,
        coldArchiveDays: pack.retention_limits.min_statutory_days,
        policyPackKey: pack.policy_key,
      };
    }
    if (item.dataClass === "NORMALIZED_OCSF_EVENT") {
      return {
        ...item,
        hotDays: pack.retention_limits.normalized_hot_days,
        coldArchiveDays: pack.retention_limits.min_statutory_days,
        policyPackKey: pack.policy_key,
      };
    }
    if (item.dataClass === "EVIDENCE_BUNDLE") {
      return {
        ...item,
        coldArchiveDays: pack.retention_limits.evidence_worm_days,
        policyPackKey: pack.policy_key,
      };
    }
    if (item.dataClass === "BACKUP_AND_SNAPSHOT") {
      return {
        ...item,
        warmDays: pack.retention_limits.backup_warm_days,
        policyPackKey: pack.policy_key,
      };
    }
    return {
      ...item,
      policyPackKey: pack.policy_key,
    };
  });
}

export const G08_RETENTION_SCHEDULE: DataClassRetentionSchedule[] = [
  {
    dataClass: "RAW_SECURITY_EVENT",
    label: "Raw Inbound Security Telemetry (WAL / Object Store)",
    hotDays: 30,
    warmDays: 90,
    coldArchiveDays: 365,
    deletionDisposition: "CRYPTO_SHRED_AND_PURGE",
    legalHoldEligible: true,
    currentFootprintGb: 412.8,
  },
  {
    dataClass: "NORMALIZED_OCSF_EVENT",
    label: "Normalized OCSF v1.1 Analytics Records",
    hotDays: 90,
    warmDays: 180,
    coldArchiveDays: 365,
    deletionDisposition: "CRYPTO_SHRED_AND_PURGE",
    legalHoldEligible: true,
    currentFootprintGb: 284.5,
  },
  {
    dataClass: "DETECTION_AND_CASE",
    label: "Alerts, Entity Risk Graph & Investigation Cases",
    hotDays: 180,
    warmDays: 365,
    coldArchiveDays: 730,
    deletionDisposition: "HOLD_LOCKED",
    legalHoldEligible: true,
    currentFootprintGb: 42.1,
  },
  {
    dataClass: "EVIDENCE_BUNDLE",
    label: "Merkle-Anchored Cryptographic Evidence Packages",
    hotDays: 365,
    warmDays: 730,
    coldArchiveDays: 2555,
    deletionDisposition: "APPEND_ONLY_WORM",
    legalHoldEligible: true,
    currentFootprintGb: 68.4,
  },
  {
    dataClass: "SEARCH_JOB_OUTPUT",
    label: "Asynchronous Threat Hunt & Archive Rehydration Outputs",
    hotDays: 14,
    warmDays: 30,
    coldArchiveDays: 0,
    deletionDisposition: "CRYPTO_SHRED_AND_PURGE",
    legalHoldEligible: false,
    currentFootprintGb: 11.2,
  },
  {
    dataClass: "CONNECTOR_META_AND_USAGE",
    label: "Connector Watermarks, Receipts & Metering Ledger",
    hotDays: 90,
    warmDays: 365,
    coldArchiveDays: 1095,
    deletionDisposition: "CRYPTO_SHRED_AND_PURGE",
    legalHoldEligible: false,
    currentFootprintGb: 6.9,
  },
  {
    dataClass: "BACKUP_AND_SNAPSHOT",
    label: "Encrypted Regional DR Snapshots & WAL Archives",
    hotDays: 7,
    warmDays: 35,
    coldArchiveDays: 90,
    deletionDisposition: "CRYPTO_SHRED_AND_PURGE",
    legalHoldEligible: false,
    currentFootprintGb: 520.0,
  },
];

