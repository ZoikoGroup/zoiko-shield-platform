import { asList, backend } from "./backend";

/**
 * Typed access to the shield-core endpoints behind the customer workspace.
 *
 * Every function here calls a route that exists in shield-core (or
 * shield-ingest through it). Nothing is invented on the client: when the
 * backend has no data the caller gets an empty list or zero counts, and
 * when it fails the promise rejects with a BackendError.
 */

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface SessionContext {
  id: string;
  email: string;
  fullName: string;
  tenantId: string;
  environmentId: string;
  region: string;
  membershipId?: string;
  assurance?: string;
}

export interface Alert {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  priority: string;
  confidence: number;
  status: string;
  detection_definition_id: string;
  coverage_state: string;
  incomplete_data: boolean;
  primary_asset_id: string | null;
  primary_identity_id: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface Case {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  priority: string;
  status: string;
  owner_id: string | null;
  queue_id: string | null;
  created_at: string;
  updated_at?: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface Finding {
  id: string;
  asset_id: string | null;
  asset_external_ref: string | null;
  source_system: string;
  finding_type: "VULNERABILITY" | "MISCONFIGURATION" | "EXPOSURE" | "WEAKNESS" | string;
  title: string;
  description: string | null;
  vulnerability_ref: string | null;
  severity: Severity;
  status: string;
  priority_score: number | null;
  first_detected_at: string;
  last_confirmed_at: string;
  resolved_at: string | null;
  acceptance: unknown | null;
  assertion: { state: "CURRENT" | "AGEING" | "STALE" | string; reason: string };
}

export interface FindingSummary {
  metrics: {
    total: number;
    open: number;
    staleAssertions: number;
    ageingAssertions: number;
    unscored: number;
    scoredOverUnknowns: number;
    unresolvedAsset: number;
    accepted: number;
    resolved: number;
  };
  openBySeverity: Partial<Record<Severity, number>>;
  openByType: Record<string, number>;
  definition?: string;
  limitations?: string[];
}

export interface Asset {
  id: string;
  external_id: string;
  asset_type: string;
  name: string | null;
  criticality: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  aliases?: Array<{ source_system: string; external_id: string }>;
}

export interface IdentityEntity {
  id: string;
  external_id: string;
  email: string | null;
  display_name: string | null;
  identity_type: string;
  status: string;
  confidence: number;
  first_seen_at: string;
  last_seen_at: string;
  aliases?: Array<{ source_system: string; external_id: string }>;
}

export interface DetectionDefinition {
  id: string;
  key: string;
  name: string;
  description: string | null;
  owner: string | null;
  category: string | null;
  status: string;
  versions?: Array<{ id: string; status?: string; version?: number | string }>;
}

export interface Connector {
  id: string;
  name?: string;
  displayName?: string;
  type?: string;
  connectorType?: string;
  status?: string;
  health?: string;
  lastSyncAt?: string | null;
  [key: string]: unknown;
}

export interface SecurityReport {
  generatedAt: string;
  metrics: { openAlerts: number; criticalAlerts: number; openCases: number; casesAwaitingCustomer: number };
}

export interface AssuranceReport {
  generatedAt: string;
  metrics: {
    controlsEffective: number;
    controlsPartiallyEffective: number;
    controlsIneffective: number;
    controlsUnknown: number;
    evidenceGapsOpen: number;
    activeRisks: number;
    activeExceptions: number;
    expiredRiskAcceptances: number;
    expiredExceptions: number;
  };
  healthState: string;
}

export interface ServiceHealthReport {
  generatedAt: string;
  connectorHealth: { healthy: number; total: number };
  overallHealth: string;
  aiAvailability: string;
  actionSimulationHealth: string;
  evidenceLedgerHealth: string;
  anchorHealth: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  homeRegion: string;
  dataResidencyRegion: string;
  timezone: string;
  dataClass: string;
  retentionPolicyRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceFramework {
  score: number | null;
  status: string;
  totalArticles?: number;
  totalControls?: number;
  compliantCount: number;
  gapCount: number;
  merkleRoot?: string;
}

export interface ComplianceSummary {
  tenantId: string;
  environmentId: string;
  frameworks: Record<string, ComplianceFramework>;
  assessedAt: string;
}

export interface PortalSummary {
  tenantId: string;
  entitlementsSummary: {
    total: number;
    activeCount: number;
    entitlements: Array<{ id?: string; capabilityKey?: string; name?: string; status?: string; [k: string]: unknown }>;
  };
  protectedResourcesSummary: Array<{ resourceType?: string; count?: number; [k: string]: unknown }>;
  serviceObligationsSummary: { total: number; pending: number; delivered: number };
  invoicesSummary: { totalInvoices: number };
}

const enc = encodeURIComponent;

export const customerApi = {
  /**
   * The signed-in user's tenant, environment and region. Not cached: a
   * sign-out and sign-in as someone else happens without a page reload.
   */
  session: () => backend.get<SessionContext>("/api/v1/auth/me"),

  alerts: async (limit = 50) => asList<Alert>(await backend.get(`/api/v1/alerts?limit=${limit}`)),
  updateAlertStatus: (alertId: string, status: string) =>
    backend.patch(`/api/v1/alerts/${enc(alertId)}/status`, { status }),

  cases: async (limit = 50) => asList<Case>(await backend.get(`/api/v1/cases?limit=${limit}`)),
  async createCase(input: { title: string; description?: string; severity: Severity }) {
    const s = await customerApi.session();
    return backend.post<Case>("/api/v1/cases", {
      ...input,
      environmentId: s.environmentId,
      region: s.region,
    });
  },

  findings: async (filters: { type?: string; status?: string; severity?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (filters.type) q.set("type", filters.type);
    if (filters.status) q.set("status", filters.status);
    if (filters.severity) q.set("severity", filters.severity);
    q.set("limit", String(filters.limit ?? 200));
    return asList<Finding>(await backend.get(`/api/v1/findings?${q}`));
  },
  findingSummary: () => backend.get<FindingSummary>("/api/v1/findings/summary"),

  assets: async (limit = 200) => asList<Asset>(await backend.get(`/api/v1/context/assets?limit=${limit}`)),
  addAsset: (input: {
    externalId: string;
    assetType: string;
    hostname?: string;
    criticality?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    sourceSystem?: string;
  }) => backend.post<{ assetId: string; decision: string }>("/api/v1/context/assets/resolve", input),

  identities: async (limit = 200) =>
    asList<IdentityEntity>(await backend.get(`/api/v1/context/identities?limit=${limit}`)),

  detectionDefinitions: async () => asList<DetectionDefinition>(await backend.get("/api/v1/detections/definitions")),
  detectionMatches: async () => asList<Record<string, unknown>>(await backend.get("/api/v1/detections/matches")),

  connectors: async () => asList<Connector>(await backend.get("/api/v1/connectors")),

  securityReport: () => backend.get<SecurityReport>("/api/v1/reporting/security"),
  assuranceReport: () => backend.get<AssuranceReport>("/api/v1/reporting/assurance"),
  serviceHealth: () => backend.get<ServiceHealthReport>("/api/v1/reporting/service-health"),

  complianceSummary: () => backend.get<ComplianceSummary>("/api/v1/compliance/sector-summary"),
  portalSummary: () => backend.get<PortalSummary>("/api/v1/commercial/portal/summary"),

  async tenant(): Promise<Tenant> {
    const s = await customerApi.session();
    return backend.get<Tenant>(`/api/v1/tenants/${enc(s.tenantId)}`);
  },
};

/** "3 hours ago", "2 days ago". Empty string for a missing timestamp. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
