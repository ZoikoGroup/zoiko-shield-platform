"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDemoState } from "@/lib/demo-state";

/**
 * Evidence-derived experience state for the G2 contracts.
 *
 * UX-INV-03 says PARTIAL, STALE, COLLECTOR_UNHEALTHY, PERMISSION_CHANGED and
 * EVALUATOR_FAILED never render compliant or healthy. That invariant only
 * means anything if the state is *derived* — a page that lets someone pick
 * NOMINAL from a dropdown satisfies the letter of the seven state classes and
 * none of the point. So nothing here is selectable: the status is computed
 * from what the sources actually returned, and NOMINAL is reachable only when
 * every source answered, answered recently, and declared no limitations.
 *
 * The reasons list is the other half. A page that degrades without saying why
 * is as hard to act on as one that lies, so every non-nominal status carries
 * the specific observations that produced it.
 */

/**
 * Demo-fallback mode is opt-in, same as ZoikoShieldApiClient's: with it off,
 * a source that fails or is unreachable surfaces as DEGRADED/UNAVAILABLE
 * (per UX-INV-03 above) rather than silently rendering fabricated data that
 * looks indistinguishable from a real, healthy answer.
 */
const DEMO_FALLBACK_ENABLED =
  process.env.NEXT_PUBLIC_DEMO_FALLBACK === "true";

export type ContractStatus =
  | "LOADING"
  | "PARTIAL"
  | "STALE"
  | "DEGRADED"
  | "UNAUTHORIZED"
  | "UNAVAILABLE"
  | "NOMINAL";

export interface SourceSpec {
  /** Stable key the page reads its data back by. */
  key: string;
  /** Human name used in the source table and in degradation reasons. */
  label: string;
  /** Path under the API root. */
  path: string;
  /**
   * A source the contract can render without. A missing optional source
   * degrades the view to PARTIAL; a missing required one degrades it to
   * DEGRADED, or to UNAVAILABLE if nothing at all resolved.
   */
  optional?: boolean;
}

export interface SourceResult {
  key: string;
  label: string;
  path: string;
  optional: boolean;
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
  /** Wall-clock time this source was read, for the freshness column. */
  fetchedAt: string | null;
  /** generatedAt / lastSyncedAt the payload declared, when it declares one. */
  reportedAt: string | null;
  data: unknown;
}

export interface ContractEvidence {
  status: ContractStatus;
  /** Why the view is not NOMINAL. Empty exactly when status is NOMINAL. */
  reasons: string[];
  /** Limitations the backend itself declared, carried through verbatim. */
  declaredLimitations: string[];
  sources: SourceResult[];
  correlationId: string;
  tenantId: string;
  reload: () => void;
}

/** Grace period past which a reported generation time counts as stale. */
const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;

function unwrap(body: unknown): unknown {
  // Controllers return either the row/array directly or {statusCode, data}.
  if (body && typeof body === "object" && "data" in (body as Record<string, unknown>)) {
    return (body as { data: unknown }).data;
  }
  return body;
}

function readString(value: unknown, ...keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string") return candidate;
  }
  return null;
}

/** Limitations the payload declares about itself, in any of the shapes used. */
function readLimitations(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ["limitations", "known_limitations", "knownLimitations"]) {
    const raw = record[key];
    if (Array.isArray(raw)) {
      out.push(...raw.filter((entry): entry is string => typeof entry === "string"));
    } else if (typeof raw === "string" && raw.trim() && raw.trim() !== "[]") {
      // Several tables persist these as a JSON string column.
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          out.push(...parsed.filter((e): e is string => typeof e === "string"));
        }
      } catch {
        out.push(raw);
      }
    }
  }
  return out;
}

/**
 * Health/completeness/freshness words the backend uses. These are the
 * projection states from reporting.prisma and the summary services, which
 * already refuse to collapse UNKNOWN into green — this just carries that
 * refusal up to the surface instead of overriding it.
 */
function readDeclaredStates(value: unknown): {
  degraded: string[];
  partial: string[];
  stale: string[];
} {
  const degraded: string[] = [];
  const partial: string[] = [];
  const stale: string[] = [];
  if (!value || typeof value !== "object") return { degraded, partial, stale };
  const record = value as Record<string, unknown>;

  const health = readString(record, "healthState", "health_state", "overallHealth");
  if (health === "DEGRADED" || health === "UNAVAILABLE") degraded.push(health);
  else if (health === "PARTIAL" || health === "UNKNOWN") partial.push(health);
  else if (health === "STALE") stale.push(health);

  const completeness = readString(record, "completenessState", "completeness_state");
  if (completeness && completeness !== "COMPLETE") partial.push(`completeness=${completeness}`);

  const freshness = readString(record, "freshnessState", "freshness_state");
  if (freshness === "STALE") stale.push("freshness=STALE");
  else if (freshness && !["FRESH", "CURRENT"].includes(freshness)) {
    partial.push(`freshness=${freshness}`);
  }

  return { degraded, partial, stale };
}

function reportedTimestamp(value: unknown): string | null {
  return readString(
    value,
    "generatedAt",
    "generated_at",
    "lastSyncedAt",
    "last_synced_at",
    "updated_at",
  );
}

function getFallbackDataForPath(path: string, key: string): unknown {
  const cleanPath = path.split("?")[0];

  // 1. Context / Asset Inventory & Identity
  if (cleanPath.startsWith("/api/v1/context/assets/resolution-decisions")) {
    return [
      {
        id: "dec-res-01",
        entity_type: "ASSET",
        source_system: "crowdstrike-edr",
        external_id: "cluster-k8s-node-worker",
        resolved_entity_id: "ast-k8s-prod-cluster-01",
        decision: "RESOLVED_EXACT_MATCH",
        confidence: 0.98,
        resolver_version: "v2.1-deterministic",
        reason: "Matched MAC address, host FQDN, and cloud instance metadata",
        created_at: new Date().toISOString(),
      },
      {
        id: "dec-res-02",
        entity_type: "IDENTITY",
        source_system: "microsoft-entra",
        external_id: "sarah.chen@acme.com",
        resolved_entity_id: "id-usr-sarah-chen",
        decision: "RESOLVED_EXACT_MATCH",
        confidence: 0.99,
        resolver_version: "v2.1-deterministic",
        reason: "Matched Immutable UPN and Hardware Passkey Credential ID",
        created_at: new Date().toISOString(),
      },
    ];
  }

  if (cleanPath.startsWith("/api/v1/context/assets")) {
    return [
      {
        id: "ast-k8s-prod-cluster-01",
        external_id: "arn:aws:eks:us-east-1:123456789012:cluster/zoiko-prod-core",
        asset_type: "KUBERNETES_CLUSTER",
        name: "Production Core EKS Cluster (us-east-1)",
        criticality: "CRITICAL",
        status: "ACTIVE",
        environment_id: "PRODUCTION-US-EAST",
        first_seen_at: "2026-08-01T08:00:00.000Z",
        last_seen_at: new Date().toISOString(),
        aliases: [
          {
            id: "alias-aws-eks-01",
            source_system: "aws-guardduty",
            external_type: "AWS_EKS_CLUSTER",
            external_id: "zoiko-prod-core",
            first_seen_at: "2026-08-01T08:00:00.000Z",
            last_seen_at: new Date().toISOString(),
          },
          {
            id: "alias-cs-fdr-01",
            source_system: "crowdstrike-edr",
            external_type: "CONTAINER_WORKLOAD",
            external_id: "cluster-k8s-node-worker",
            first_seen_at: "2026-08-01T08:00:00.000Z",
            last_seen_at: new Date().toISOString(),
          },
        ],
      },
      {
        id: "ast-db-pg-primary",
        external_id: "arn:aws:rds:us-east-1:123456789012:db:zoikoshield-primary-pg",
        asset_type: "DATABASE",
        name: "Postgres Sovereign Evidence DB",
        criticality: "CRITICAL",
        status: "ACTIVE",
        environment_id: "PRODUCTION-US-EAST",
        first_seen_at: "2026-08-01T08:00:00.000Z",
        last_seen_at: new Date().toISOString(),
        aliases: [
          {
            id: "alias-rds-pg-01",
            source_system: "aws-guardduty",
            external_type: "AWS_RDS_INSTANCE",
            external_id: "zoikoshield-primary-pg",
            first_seen_at: "2026-08-01T08:00:00.000Z",
            last_seen_at: new Date().toISOString(),
          },
        ],
      },
      {
        id: "ast-api-gateway-us",
        external_id: "gw-ingest-ingress-01",
        asset_type: "API_GATEWAY",
        name: "Ingest TLS Ingress Gateway",
        criticality: "HIGH",
        status: "ACTIVE",
        environment_id: "PRODUCTION-US-EAST",
        first_seen_at: "2026-08-15T08:00:00.000Z",
        last_seen_at: new Date().toISOString(),
        aliases: [
          {
            id: "alias-gw-01",
            source_system: "generic-webhook",
            external_type: "GATEWAY_ENDPOINT",
            external_id: "gw-ingest-ingress-01",
            first_seen_at: "2026-08-15T08:00:00.000Z",
            last_seen_at: new Date().toISOString(),
          },
        ],
      },
    ];
  }

  if (cleanPath.startsWith("/api/v1/context/identities")) {
    return [
      {
        id: "id-usr-sarah-chen",
        email: "sarah.chen@acme.com",
        display_name: "Sarah Chen (Lead Analyst)",
        identity_type: "HUMAN_USER",
        status: "ACTIVE",
        confidence: 0.99,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "id-svc-kafka-ingest",
        email: null,
        display_name: "svc-telemetry-kafka-consumer",
        identity_type: "SERVICE_ACCOUNT",
        status: "ACTIVE",
        confidence: 0.98,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: "id-svc-merkle-witness",
        email: null,
        display_name: "svc-merkle-hsm-signer",
        identity_type: "MANAGED_IDENTITY",
        status: "ACTIVE",
        confidence: 0.99,
        last_seen_at: new Date().toISOString(),
      },
    ];
  }

  // 2. Findings & Exposures
  if (cleanPath.startsWith("/api/v1/findings/summary")) {
    return {
      metrics: {
        total: 12,
        open: 3,
        staleAssertions: 0,
        ageingAssertions: 1,
        unscored: 0,
        scoredOverUnknowns: 0,
        unresolvedAsset: 0,
      },
      limitations: [],
    };
  }

  // Single finding detail route: /api/v1/findings/:id
  if (/^\/api\/v1\/findings\/[^/]+$/.test(cleanPath) && !cleanPath.endsWith("/summary")) {
    const findingId = cleanPath.split("/").pop() || "fnd-2026-001";
    return {
      id: findingId,
      tenant_id: "tnt-prod-enterprise",
      asset_id: "ast-k8s-prod-cluster-01",
      asset_external_ref: "arn:aws:eks:us-east-1:123456789012:cluster/zoiko-prod-core",
      source_system: "aws-guardduty",
      source_finding_id: "gd-fnd-99214-sec",
      scanner_version: "v4.1.0",
      finding_type: "CLOUD_MISCONFIGURATION",
      title: "Unrestricted Ingress on Admin Bastion Port 22",
      description: "Security group ingress rule 0.0.0.0/0 allows open TCP port 22 access directly from the public internet.",
      vulnerability_ref: "CVE-2026-38491",
      severity: "HIGH",
      status: "OPEN",
      priority_score: 88,
      evaluator_version: "v2.1-deterministic",
      priority_evaluated_at: new Date().toISOString(),
      first_detected_at: "2026-09-01T08:00:00.000Z",
      last_confirmed_at: new Date().toISOString(),
      reassertion_interval_hours: 24,
      detection_confidence: 0.99,
      factors: [
        {
          id: "fac-01",
          factor: "Internet Reachability",
          value: "DIRECT_PUBLIC_INGRESS",
          contribution: 35,
          unknown_input: false,
          source_ref: "aws-vpc-flow-logs",
        },
        {
          id: "fac-02",
          factor: "Asset Criticality Weight",
          value: "PRODUCTION_K8S_CORE",
          contribution: 30,
          unknown_input: false,
          source_ref: "asset-inventory",
        },
        {
          id: "fac-03",
          factor: "Known Active Exploit",
          value: "CISA_KEV_LISTED",
          contribution: 23,
          unknown_input: false,
          source_ref: "cisa-kev-feed",
        },
      ],
      attackPath: [
        {
          id: "ap-01",
          step_index: 1,
          node_type: "INTERNET",
          node_ref: "0.0.0.0/0",
          node_label: "Public Internet Attacker",
          relation: "INGRESS_PROBE",
          confidence: 0.99,
          inferred: false,
          source: "aws-guardduty",
        },
        {
          id: "ap-02",
          step_index: 2,
          node_type: "SECURITY_GROUP",
          node_ref: "sg-09283748291",
          node_label: "Bastion Security Group Port 22",
          relation: "EXPLOITS_PORT",
          confidence: 0.98,
          inferred: false,
          source: "aws-vpc",
        },
        {
          id: "ap-03",
          step_index: 3,
          node_type: "ASSET",
          node_ref: "ast-k8s-prod-cluster-01",
          node_label: "Production Core EKS Cluster",
          relation: "COMPROMISES_NODE",
          confidence: 0.95,
          inferred: true,
          source: "threat-graph-resolver",
        },
      ],
      remediations: [
        {
          id: "rem-01",
          action: "Restrict Security Group Ingress",
          guidance: "Modify Security Group sg-09283748291 rule to allow inbound SSH only from VPN Gateway 192.168.1.0/24.",
          status: "PENDING_APPROVAL",
          due_at: new Date(Date.now() + 86400000).toISOString(),
          created_by: "sec-ops-lead",
          created_at: new Date().toISOString(),
        },
      ],
      evidenceLinks: [
        {
          id: "evi-link-01",
          evidence_ref: "evi-ocsf-gd-99214",
          collector: "aws-guardduty-stream",
          collected_at: new Date().toISOString(),
          content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          summary: "Raw OCSF Network Activity Finding Payload",
        },
      ],
      acceptance: null,
      assertion: {
        state: "CURRENT",
        ageHours: 1,
        expectedWithinHours: 24,
        reason: "Re-asserted by continuous AWS GuardDuty connector poll",
      },
      priorityIntegrity: {
        scored: true,
        unknownInputs: [],
        resolvedFactors: 3,
        computedOverUnknowns: false,
      },
    };
  }

  if (cleanPath.startsWith("/api/v1/findings")) {
    return [
      {
        id: "fnd-2026-001",
        title: "Unrestricted Ingress on Admin Bastion Port 22",
        severity: "HIGH",
        status: "OPEN",
        finding_type: "CLOUD_MISCONFIGURATION",
        vulnerability_ref: "CVE-2026-38491",
        source_system: "aws-guardduty",
        asset_id: "ast-k8s-prod-cluster-01",
        priority_score: 88,
        last_confirmed_at: new Date().toISOString(),
        assertion: { state: "CURRENT", ageHours: 2, reason: "Confirmed by live network probe" },
        priorityIntegrity: { scored: true, computedOverUnknowns: false },
        remediation_guidance: "Apply SG rule restricting CIDR to Corporate VPN Gateway 192.168.1.0/24",
      },
      {
        id: "fnd-2026-002",
        title: "Dormant Service Account with High-Privilege KMS Decrypt Scope",
        severity: "CRITICAL",
        status: "OPEN",
        finding_type: "IAM_PRIVILEGE_RISK",
        vulnerability_ref: "CWE-284",
        source_system: "microsoft-entra",
        asset_id: "ast-db-pg-primary",
        priority_score: 95,
        last_confirmed_at: new Date().toISOString(),
        assertion: { state: "CURRENT", ageHours: 1, reason: "Verified against cloud IAM audit log" },
        priorityIntegrity: { scored: true, computedOverUnknowns: false },
        remediation_guidance: "Revoke unused KMS decrypt permission; enforce JIT elevation for key access",
      },
      {
        id: "fnd-2026-003",
        title: "TLS 1.2 Deprecation Notice on Legacy Ingestion Node",
        severity: "LOW",
        status: "IN_REVIEW",
        finding_type: "CRYPTOGRAPHIC_POSTURE",
        vulnerability_ref: "CWE-326",
        source_system: "generic-webhook",
        asset_id: "ast-api-gateway-us",
        priority_score: 42,
        last_confirmed_at: new Date().toISOString(),
        assertion: { state: "AGEING", ageHours: 18, reason: "Last verified during night scanner sweep" },
        priorityIntegrity: { scored: true, computedOverUnknowns: false },
        remediation_guidance: "Enforce TLS 1.3 strict ciphersuites across all public listeners",
      },
    ];
  }

  // 3. Reporting, Risks, and Executive Surfaces
  if (cleanPath.startsWith("/api/v1/reporting/security")) {
    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        meanTimeToRemediateHours: 14,
        unmitigatedCriticalExposures: 1,
        activeDetectionsCount: 3,
        coverageCompletenessPercent: 98.4,
      },
      definition: "Mean time to remediate and live unmitigated exposure counts derived across connected cloud estates.",
      limitations: [],
      healthState: "HEALTHY",
      overallHealth: "HEALTHY",
    };
  }

  if (cleanPath.startsWith("/api/v1/reporting/assurance")) {
    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        activeRisks: 3,
        activeExceptions: 0,
        expiredRiskAcceptances: 0,
        expiredExceptions: 0,
        evidenceGapsOpen: 0,
      },
      definition: "Assurance health calculated over active exceptions and cryptographically anchored evidence gaps.",
      limitations: [],
      healthState: "HEALTHY",
    };
  }

  if (cleanPath.startsWith("/api/v1/reporting/service-health")) {
    return {
      generatedAt: new Date().toISOString(),
      overallHealth: "HEALTHY",
      connectorHealth: { healthy: 6, total: 6 },
      aiAvailability: "HEALTHY",
      actionSimulationHealth: "HEALTHY",
      evidenceLedgerHealth: "HEALTHY",
      anchorHealth: "HEALTHY",
      limitations: [],
    };
  }

  if (cleanPath.startsWith("/api/v1/risks")) {
    return [
      {
        id: "rsk-001",
        title: "Unauthorized JIT Privilege Escalation on Production Bastion",
        likelihood: "LOW",
        impact: "CRITICAL",
        status: "MITIGATED",
        owner_id: "sarah.chen",
        factors: [
          { factor: "Hardware MFA Enforcement", value: "FIDO2_MANDATORY", contribution: -40, sourceRef: "entra-id" },
          { factor: "JIT Timebox Window", value: "60_MINUTES", contribution: -30, sourceRef: "shield-jit" },
        ],
      },
      {
        id: "rsk-002",
        title: "Supply Chain Container Tampering & Code Ingestion Drift",
        likelihood: "MEDIUM",
        impact: "HIGH",
        status: "MONITORED",
        owner_id: "marcus.vance",
        factors: [
          { factor: "Cosign Signature Verification", value: "ENFORCED", contribution: -35, sourceRef: "k8s-gatekeeper" },
          { factor: "WASM Playbook Sandboxing", value: "SECCOMP_STRICT", contribution: -25, sourceRef: "shield-action" },
        ],
      },
    ];
  }

  if (cleanPath.startsWith("/api/v1/reporting/definitions")) {
    return [
      {
        id: "rep-def-soc2-type2",
        key: "SOC2_TYPE2_MONTHLY",
        name: "SOC 2 Type II Security & Availability Monthly Snapshot",
        report_type: "COMPLIANCE_ASSURANCE",
        version: "v3.2",
        purpose: "Continuous control assurance for external auditors and compliance officers",
        audience: "BOARD_AND_AUDITORS",
        source_requirements: "All connected cloud accounts and tamper-proof ledger receipts",
        status: "ACTIVE",
      },
      {
        id: "rep-def-iso27001-isms",
        key: "ISO27001_ISMS_ROLLING",
        name: "ISO/IEC 27001:2022 ISMS Continuous Posture Assurance",
        report_type: "ISMS_GOVERNANCE",
        version: "v2.0",
        purpose: "Management review of security objectives, ISMS performance, and control metrics",
        audience: "CISO_AND_INTERNAL_AUDIT",
        source_requirements: "Policy lifecycle logs, risk register, and shift handover transcripts",
        status: "ACTIVE",
      },
    ];
  }

  if (cleanPath.startsWith("/api/v1/reporting/snapshots")) {
    return [
      {
        id: "rep-soc2-type2-annual-2026",
        report_definition_id: "rep-def-soc2-type2",
        report_definition_version: "v3.2",
        period_start: "2026-08-01T00:00:00.000Z",
        period_end: "2026-09-01T00:00:00.000Z",
        generated_by: "sarah.chen@acme.com",
        freshness_state: "FRESH",
        completeness_state: "COMPLETE",
        snapshot_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        status: "READY",
        generated_at: new Date().toISOString(),
      },
    ];
  }

  // 4. Operations / Shift Handover
  if (cleanPath.startsWith("/api/v1/cases/handover")) {
    return [
      {
        id: "case-handover-01",
        title: "Distributed SSH Brute Force & Privileged JIT Elevation Anomaly",
        severity: "CRITICAL",
        priority: "P1",
        status: "CONTAINMENT_IN_PROGRESS",
        owner_id: "sarah.chen",
        created_at: "2026-09-02T08:00:00.000Z",
        acknowledged_at: "2026-09-02T08:05:00.000Z",
        slaClock: {
          target_response_minutes: 15,
          status: "ACTIVE",
          started_at: new Date(Date.now() - 300000).toISOString(),
          total_paused_ms: 0,
          coverage_tier: "24x7_CRITICAL_RESPONSE",
        },
        qualityReviews: [
          {
            id: "qr-01",
            review_type: "PEER_AUDIT",
            trigger: "P1_TRIAGE",
            requested_by: "marcus.vance",
            status: "PASSED",
            reviewer_id: "alex.kumar",
            created_at: new Date().toISOString(),
          },
        ],
        notes: [
          {
            id: "note-01",
            author_id: "sarah.chen",
            content: "Network containment playbook executed via WASM sandbox; SG updated to isolate attacker IP 198.51.100.24.",
            classification: "OPERATIONAL_BRIEF",
            created_at: new Date().toISOString(),
          },
        ],
      },
    ];
  }

  // 5. Incident Command / Cases
  if (cleanPath.includes("/timeline")) {
    return [
      {
        id: "tl-01",
        entry_type: "ALERT_INGESTED",
        actor_id: "system-kafka-ingest",
        occurred_at: new Date(Date.now() - 1800000).toISOString(),
        title: "High-Volume SSH Failed Logins from Untrusted ASN",
        summary: "Over 450 failed authentication attempts detected within 60 seconds targeting bastion-01.",
        source_ref: "aws-guardduty",
        evidence_ref: "evi-01",
      },
      {
        id: "tl-02",
        entry_type: "ACTION_EXECUTED",
        actor_id: "sarah.chen",
        occurred_at: new Date(Date.now() - 900000).toISOString(),
        title: "Automated Network Isolation Rule Deployed",
        summary: "Enforced SG egress/ingress block and triggered JIT hardware credential invalidation.",
        source_ref: "shield-action",
        evidence_ref: "evi-02",
      },
    ];
  }

  if (cleanPath.includes("/decisions")) {
    return [
      {
        id: "dec-01",
        decision_type: "CONTAINMENT_STRATEGY",
        decision: "EXECUTE_IMMEDIATE_NETWORK_ISOLATION",
        rationale: "Correlated credential attack indicated active lateral traversal attempt against sovereign evidence database.",
        actor_id: "sarah.chen",
        evidence_refs: JSON.stringify(["evi-01", "evi-02"]),
        policy_version: "v4.2",
        created_at: new Date(Date.now() - 900000).toISOString(),
      },
    ];
  }

  if (cleanPath.includes("/notes")) {
    return [
      {
        id: "nt-01",
        author_id: "sarah.chen",
        content: "Customer notification drafted in accordance with DORA Art. 19 SLA (under 4h threshold).",
        classification: "REGULATORY_RECORD",
        created_at: new Date(Date.now() - 600000).toISOString(),
      },
    ];
  }

  if (cleanPath.includes("/sla")) {
    return {
      case_id: "case-01",
      severity: "CRITICAL",
      coverage_tier: "ENTERPRISE_MISSION_CRITICAL",
      target_response_minutes: 15,
      status: "ACTIVE",
      started_at: new Date(Date.now() - 300000).toISOString(),
      total_paused_ms: 0,
      active_triage_minutes: 5,
    };
  }

  if (cleanPath.includes("/evidence")) {
    return [
      {
        id: "evi-link-01",
        evidence_id: "evi-01",
        relationship: "TRIGGERING_TELEMETRY",
        added_by: "system-ingest",
        added_at: new Date(Date.now() - 1800000).toISOString(),
        note: "Raw OCSF SSH attack authentication stream",
      },
      {
        id: "evi-link-02",
        evidence_id: "evi-02",
        relationship: "MITIGATION_RECEIPT",
        added_by: "sarah.chen",
        added_at: new Date(Date.now() - 900000).toISOString(),
        note: "AWS Security Group revocation cryptographic audit log",
      },
    ];
  }

  if (cleanPath.includes("/quality-reviews")) {
    return [
      {
        id: "qr-01",
        review_type: "PEER_AUDIT",
        trigger: "P1_TRIAGE",
        requested_by: "marcus.vance",
        status: "PASSED",
        reviewer_id: "alex.kumar",
        created_at: new Date().toISOString(),
      },
    ];
  }

  if (/^\/api\/v1\/cases\/[^/]+$/.test(cleanPath)) {
    const caseId = cleanPath.split("/").pop() || "case-01";
    return {
      id: caseId,
      title: "Distributed SSH Brute Force & Privileged JIT Elevation Anomaly",
      severity: "CRITICAL",
      priority: "P1",
      status: "CONTAINMENT_IN_PROGRESS",
      region: "eu-west-1",
      environment_id: "PRODUCTION-CORE",
      owner_id: "sarah.chen",
      queue_id: "queue-p1-critical",
      primary_asset_id: "ast-k8s-prod-cluster-01",
      primary_identity_id: "id-usr-sarah-chen",
      created_by: "system-kafka-ingest",
      created_at: new Date(Date.now() - 1800000).toISOString(),
      acknowledged_at: new Date(Date.now() - 1500000).toISOString(),
    };
  }

  if (cleanPath.startsWith("/api/v1/cases")) {
    return [
      {
        id: "case-01",
        title: "Distributed SSH Brute Force & Privileged JIT Elevation Anomaly",
        severity: "CRITICAL",
        priority: "P1",
        status: "CONTAINMENT_IN_PROGRESS",
        region: "eu-west-1",
        environment_id: "PRODUCTION-CORE",
        owner_id: "sarah.chen",
        queue_id: "queue-p1-critical",
        primary_asset_id: "ast-k8s-prod-cluster-01",
        primary_identity_id: "id-usr-sarah-chen",
        created_by: "system-kafka-ingest",
        created_at: new Date(Date.now() - 1800000).toISOString(),
        acknowledged_at: new Date(Date.now() - 1500000).toISOString(),
      },
    ];
  }

  // 6. Admin Export & Offboarding
  if (cleanPath.includes("/offboarding/legal-holds")) {
    return [
      {
        id: "lh-01",
        scope: "AUDIT_EVIDENCE_LOGS_2025_2026",
        authority: "SEC_AND_FINRA_COMPLIANCE",
        reason: "Mandatory statutory retention rule for financial audit trails",
        status: "ACTIVE",
        starts_at: "2025-01-01T00:00:00.000Z",
        review_at: "2027-01-01T00:00:00.000Z",
      },
    ];
  }

  if (cleanPath.includes("/offboarding/backup-expiry")) {
    return [
      {
        id: "be-01",
        backup_class: "IMMUTABLE_WORM_COLD_STORAGE",
        retained_until: "2030-01-01T00:00:00.000Z",
        final_expiry_expected_at: "2030-01-01T00:00:00.000Z",
        status: "RETAINED_UNDER_POLICY",
      },
    ];
  }

  if (cleanPath.includes("/offboarding/deletion-attestation")) {
    return {
      id: "att-01",
      deleted_scopes: JSON.stringify(["APPLICATION_STATE", "SESSION_TOKENS", "EPHEMERAL_LOGS"]),
      retained_scopes: JSON.stringify(["MERKLE_ANCHOR_WITNESS_ROOTS"]),
      legal_hold_refs: JSON.stringify(["lh-01"]),
      backup_expiry_refs: JSON.stringify(["be-01"]),
      limitations: "Cold archive backups will naturally expire per statutory schedule.",
      attestation_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      issued_by: "zoikoshield-sovereignty-engine",
      issued_at: new Date().toISOString(),
    };
  }

  if (cleanPath.includes("/offboarding/retention-policy")) {
    return [
      {
        id: "ret-01",
        basis: "DORA_REGULATORY_COMPLIANCE",
        authority: "EUROPEAN_BANKING_AUTHORITY",
        period_days: 1825,
        effective_from: "2025-01-01T00:00:00.000Z",
      },
    ];
  }

  if (cleanPath.includes("/offboarding")) {
    return {
      id: "off-run-01",
      status: "COMPLETED",
      reason: "Quarterly automated sovereign verification drill",
      initiated_at: new Date(Date.now() - 86400000).toISOString(),
      initiated_by: "sarah.chen@acme.com",
    };
  }

  if (cleanPath.startsWith("/api/v1/exports")) {
    return [
      {
        id: "exp-job-2026-09-01",
        purpose: "Full Tenant Sovereign Merkle Archive Export",
        export_type: "COMPLETE_EVIDENCE_ARCHIVE",
        requested_scope: "TENANT_EVIDENCE_ALL",
        formats: "PARQUET_AND_JSON_LD",
        status: "READY",
        progress: 100,
        requested_by: "sarah.chen@acme.com",
        created_at: "2026-09-02T08:00:00.000Z",
        completed_at: new Date().toISOString(),
        artifacts: [
          {
            id: "art-01",
            artifact_type: "PARQUET_TABLE",
            schema_id: "ocsf-v1.3",
            schema_version: "1.3.0",
            object_count: 14280,
            content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            media_type: "application/vnd.apache.parquet",
            size_bytes: 48600000,
          },
        ],
      },
    ];
  }

  // 7. Developer & Webhooks
  if (cleanPath.startsWith("/api/v1/api-clients")) {
    return [
      {
        id: "cli-01",
        name: "SIEM Ingestion & Continuous Audit Pipeline",
        client_id: "zoiko_live_891724918237",
        principal_id: "prn-svc-audit-ingest",
        status: "ACTIVE",
        purpose: "Real-time OCSF evidence streaming into enterprise data lake",
        created_by: "sarah.chen",
        created_at: "2026-08-01T08:00:00.000Z",
        last_used_at: new Date().toISOString(),
        credentials: [
          {
            id: "crd-01",
            secret_version: 1,
            fingerprint: "SHA256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
            status: "ACTIVE",
            issued_at: "2026-08-01T08:00:00.000Z",
          },
        ],
        scopeGrants: [
          {
            id: "sg-01",
            scope: "telemetry:ingest",
            granted_by: "sarah.chen",
            authorization_decision_id: "dec-auth-9912",
            effective_from: "2026-08-01T08:00:00.000Z",
          },
          {
            id: "sg-02",
            scope: "ledger:read-proof",
            granted_by: "sarah.chen",
            authorization_decision_id: "dec-auth-9913",
            effective_from: "2026-08-01T08:00:00.000Z",
          },
        ],
      },
    ];
  }

  if (cleanPath.startsWith("/api/v1/webhooks")) {
    return [
      {
        id: "whk-01",
        endpoint_url: "https://siem.internal.acme.corp/webhooks/zoikoshield",
        event_types: JSON.stringify(["FINDING_CREATED", "ACTION_EXECUTED", "MERKLE_ROOT_ANCHORED"]),
        payload_version: "v2.0",
        data_minimization_profile: "STRICT_ANONYMIZED",
        status: "ACTIVE",
        created_by: "sarah.chen",
        verified_at: "2026-08-01T08:00:00.000Z",
        created_at: "2026-08-01T08:00:00.000Z",
      },
    ];
  }

  // 8. Commercial & Trust Center
  if (cleanPath.startsWith("/api/v1/commercial/trust-center/overview") || cleanPath.startsWith("/api/v1/trust")) {
    return {
      trustStatus: "VERIFIED",
      securityPosture: "COMPLIANT_HIGH_ASSURANCE",
      approvedClaimsCount: 14,
      claims: [
        {
          claimKey: "EVIDENCE_IMMUTABILITY",
          claimWording: "Every detection and human decision is cryptographically bound into RFC-6962 Merkle trees.",
          scope: "ALL_TENANTS",
          evidenceRequirement: "Independent verifiable inclusion proofs via public HSM zero-knowledge verifier",
        },
        {
          claimKey: "NON_REPUDIATION",
          claimWording: "All response actions require dual-custody approval with WebAuthn Level 3 hardware token attestation.",
          scope: "PRIVILEGED_OPERATIONS",
          evidenceRequirement: "FIDO2 signature verification receipts recorded on immutable audit ledger",
        },
      ],
      publishedArtifacts: [
        {
          id: "pub-soc2-type2-2026",
          publishedAt: "2026-09-01T00:00:00.000Z",
          artifactType: "SOC_2_TYPE_II_REPORT",
          title: "ZoikoShield Independent SOC 2 Type II Examination Report (2026)",
        },
        {
          id: "pub-iso27001-cert",
          publishedAt: "2026-08-15T00:00:00.000Z",
          artifactType: "ISO_IEC_27001_CERTIFICATE",
          title: "BSI Accredited ISO/IEC 27001:2022 ISMS Certificate",
        },
      ],
      availableAuditPackages: [
        {
          id: "pkg-soc2-2026",
          packageName: "Annual SOC 2 Type II Auditor Working Paper Package",
          frameworkScope: "SOC_2_TRUST_SERVICES_CRITERIA",
          frameworkVersion: "2017_REVISED_2022",
          status: "FROZEN",
          frozenAt: "2026-09-01T08:00:00.000Z",
        },
      ],
    };
  }

  if (cleanPath.startsWith("/api/v1/commercial/capabilities/public-services")) {
    return [
      {
        id: "svc-core",
        serviceId: "shield-core",
        name: "ZoikoShield Core Policy & Context Engine",
        description: "Primary policy evaluation, context correlation, and state machine cluster.",
        status: "HEALTHY",
        regions: ["us-east-1", "eu-west-1", "ap-southeast-1"],
      },
      {
        id: "svc-ingest",
        serviceId: "shield-ingest",
        name: "High-Throughput OCSF Telemetry Ingestion",
        description: "Zero-loss event streaming gateway backed by Apache Kafka and RFC-9457 schema validation.",
        status: "HEALTHY",
        regions: ["us-east-1", "eu-west-1"],
      },
      {
        id: "svc-action",
        serviceId: "shield-action",
        name: "Governed SOAR & WASM Sandbox Engine",
        description: "Deterministic playbook execution with strict seccomp dual-custody enforcement.",
        status: "HEALTHY",
        regions: ["us-east-1", "eu-west-1"],
      },
    ];
  }

  if (cleanPath.startsWith("/api/v1/commercial/capabilities/domains")) {
    return [
      {
        domain: "THREAT_DETECTION",
        name: "Multi-Cloud Real-Time Threat Detection",
        available: 18,
        total: 18,
        capabilities: [
          { id: "cap-01", name: "OCSF Telemetry Normalization", available: true },
          { id: "cap-02", name: "MITRE ATT&CK Matrix Correlation", available: true },
          { id: "cap-03", name: "Zero-False-Positive Threshold Tuning", available: true },
        ],
      },
      {
        domain: "CRYPTOGRAPHIC_ASSURANCE",
        name: "Immutable Sovereign Ledger & Proofs",
        available: 12,
        total: 12,
        capabilities: [
          { id: "cap-04", name: "RFC 6962 Merkle Tree Inclusion Proofs", available: true },
          { id: "cap-05", name: "Hardware Passkey Non-Repudiation", available: true },
          { id: "cap-06", name: "Sovereign Air-Gap Offline Verification CLI", available: true },
        ],
      },
    ];
  }

  return [];
}

/**
 * Fetch a contract's sources and derive its experience state from them.
 *
 * Sources are fetched together rather than in sequence: a view that shows
 * three panels should not claim to be loading the third because the first was
 * slow, and a partial answer is worth rendering as partial.
 */
export function useContractSources(
  specs: SourceSpec[],
  options: { staleAfterSeconds?: number } = {},
): ContractEvidence {
  const staleAfterSeconds = options.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const [state] = useDemoState();
  const tenantId = state.tenant?.id ?? "";
  const sessionToken = state.session?.token ?? "";

  const [results, setResults] = useState<SourceResult[] | null>(null);
  const [correlationId, setCorrelationId] = useState("");

  // specs are declared inline at each call site; key on identity, not the array.
  const specKey = useMemo(
    () => specs.map((s) => `${s.key}:${s.path}:${s.optional ? "opt" : "req"}`).join("|"),
    [specs],
  );

  const load = useCallback(async () => {
    const correlation =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `corr-${Date.now()}`;
    setCorrelationId(correlation);
    setResults(null);

    const settled = await Promise.all(
      specs.map(async (spec): Promise<SourceResult> => {
        const base: Omit<SourceResult, "ok" | "httpStatus" | "error" | "data" | "reportedAt"> = {
          key: spec.key,
          label: spec.label,
          path: spec.path,
          optional: Boolean(spec.optional),
          fetchedAt: new Date().toISOString(),
        };
        try {
          const response = await fetch(spec.path, {
            headers: {
              ...(tenantId ? { "x-tenant-id": tenantId } : {}),
              ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
              "x-correlation-id": correlation,
            },
          });
          if (!response.ok) {
            // Demo-fallback mode is opt-in: see DEMO_FALLBACK_ENABLED above.
            if (DEMO_FALLBACK_ENABLED) {
              const fallbackData = getFallbackDataForPath(spec.path, spec.key);
              if (fallbackData !== undefined) {
                console.warn(
                  `[demo fallback] ${spec.path} returned ${response.status}; serving fabricated data because NEXT_PUBLIC_DEMO_FALLBACK=true`,
                );
                return {
                  ...base,
                  ok: true,
                  httpStatus: 200,
                  error: null,
                  reportedAt: new Date().toISOString(),
                  data: fallbackData,
                };
              }
            }
            const body = await response.json().catch(() => ({}));
            return {
              ...base,
              ok: false,
              httpStatus: response.status,
              error:
                (body as { message?: string })?.message ||
                `Request failed with ${response.status}`,
              reportedAt: null,
              data: null,
            };
          }
          const payload = unwrap(await response.json());
          return {
            ...base,
            ok: true,
            httpStatus: response.status,
            error: null,
            reportedAt: reportedTimestamp(payload),
            data: payload,
          };
        } catch (err) {
          if (DEMO_FALLBACK_ENABLED) {
            const fallbackData = getFallbackDataForPath(spec.path, spec.key);
            if (fallbackData !== undefined) {
              console.warn(
                `[demo fallback] ${spec.path} was unreachable; serving fabricated data because NEXT_PUBLIC_DEMO_FALLBACK=true`,
              );
              return {
                ...base,
                ok: true,
                httpStatus: 200,
                error: null,
                reportedAt: new Date().toISOString(),
                data: fallbackData,
              };
            }
          }
          return {
            ...base,
            ok: false,
            httpStatus: null,
            error: err instanceof Error ? err.message : String(err),
            reportedAt: null,
            data: null,
          };
        }
      }),
    );
    setResults(settled);
    // specKey stands in for specs; tenantId re-reads on tenant switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, tenantId, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return useMemo<ContractEvidence>(() => {
    if (results === null) {
      return {
        status: "LOADING",
        reasons: [],
        declaredLimitations: [],
        sources: [],
        correlationId,
        tenantId,
        reload: () => void load(),
      };
    }

    const reasons: string[] = [];
    const declaredLimitations: string[] = [];

    const unauthorized = results.filter((r) => r.httpStatus === 401 || r.httpStatus === 403);
    const failed = results.filter((r) => !r.ok && r.httpStatus !== 401 && r.httpStatus !== 403);
    const requiredFailed = failed.filter((r) => !r.optional);

    for (const result of results) {
      if (!result.ok) continue;
      const limitations = readLimitations(result.data);
      declaredLimitations.push(...limitations.map((l) => `${result.label}: ${l}`));

      const declared = readDeclaredStates(result.data);
      for (const word of declared.degraded) reasons.push(`${result.label} reports ${word}`);
      for (const word of declared.partial) reasons.push(`${result.label} reports ${word}`);
      for (const word of declared.stale) reasons.push(`${result.label} reports ${word}`);

      if (result.reportedAt) {
        const ageSeconds = (Date.now() - new Date(result.reportedAt).getTime()) / 1000;
        if (Number.isFinite(ageSeconds) && ageSeconds > staleAfterSeconds) {
          reasons.push(
            `${result.label} was generated ${Math.round(ageSeconds / 60)} min ago, past the ${Math.round(staleAfterSeconds / 60)} min freshness budget`,
          );
        }
      }
    }

    for (const result of unauthorized) {
      reasons.push(`${result.label} refused this session (${result.httpStatus})`);
    }
    for (const result of failed) {
      reasons.push(`${result.label} did not answer: ${result.error}`);
    }
    reasons.push(...declaredLimitations);

    let status: ContractStatus;
    if (unauthorized.length > 0) {
      status = "UNAUTHORIZED";
    } else if (failed.length === results.length && results.length > 0) {
      status = "UNAVAILABLE";
    } else if (requiredFailed.length > 0) {
      status = "DEGRADED";
    } else if (reasons.some((r) => r.includes("freshness budget") || r.includes("STALE"))) {
      status = "STALE";
    } else if (reasons.length > 0) {
      status = "PARTIAL";
    } else {
      status = "NOMINAL";
    }

    return {
      status,
      reasons,
      declaredLimitations,
      sources: results,
      correlationId,
      tenantId,
      reload: () => void load(),
    };
  }, [results, correlationId, tenantId, staleAfterSeconds, load]);
}

/** Read one source's payload back, typed by the caller. */
export function sourceData<T>(evidence: ContractEvidence, key: string): T | null {
  const found = evidence.sources.find((s) => s.key === key);
  return found && found.ok ? (found.data as T) : null;
}

/** A list-shaped source, normalised to an array so pages need no guards. */
export function sourceList<T>(evidence: ContractEvidence, key: string): T[] {
  const data = sourceData<unknown>(evidence, key);
  return Array.isArray(data) ? (data as T[]) : [];
}
