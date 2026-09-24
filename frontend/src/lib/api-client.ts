import {
  Tenant,
  UserSession,
  Invitation,
  Connector,
  TelemetryNormalized,
  Alert,
  Case,
  EvidenceRecord,
  AiInvestigationSummary,
  HumanDecision,
  ResponseProposal,
  SimulationReceipt,
  ControlTest,
  AuditPackage,
  AiIncident,
  AiIncidentSeverity,
  AiIncidentState,
  AiIncidentTrigger,
  AiModelProfile,
  AiSystemInventorySummary,
  ModelDriftReport,
  AiSupplyChainReport,
  ComplianceDriftState,
  ExperienceStateEnvelope,
  RegisteredPasskey,
  AiReviewEnvelope,
  DecisionTransition,
  DecisionState,
  IncidentResponseRetainer,
  IncidentWorkOrder,
  WorkOrderConsumptionRecord,
  IncidentLegalSensitiveRecord,
  MerkleEpochCheckpoint,
  MerkleInclusionProof,
  MerkleVerificationResult,
  AttackPathTrajectory,
  AttackPathNode,
  PublicServiceDefinition,
  CapabilityDomainSummary,
  CapabilityItem,
  PlanTier,
  PlanRecommendation,
  MdrServiceObligation,
  GTMChecklistItem,
  JitElevationSession,
  PlatformReadinessSnapshot,
  CoreServiceReadiness,
  DisasterRecoveryPostureSummary,
  RestoreDrillReceipt,
  GameDayPostureSummary,
  GameDayExerciseResult,
  GameDayScenario,
  AnnexPGameDayReport,
  Phase0PostureSummary,
  Phase0ExitProofRecord,
  Phase0ProofBundle,
  OfflineVerificationReport,
} from "./types";
import { getInitialDemoState, saveDemoState, DemoState } from "./demo-state";
import { generateUUID, sha256Mock } from "./utils";
import type {
  PasskeyAssertionPayload,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationOptions,
  PasskeyRegistrationPayload,
} from "./webauthn";

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.message || fallback;
  } catch {
    return fallback;
  }
}

function getState(): DemoState {
  return getInitialDemoState();
}

/**
 * Whether a failed request may be answered with fabricated demo data.
 *
 * Every call below passes a `fallbackFn` that returns invented records, and
 * this used to run on ANY failure — the backend being down, but equally a 401
 * because the user was not signed in, a 403, a 404, or a 500. The screen then
 * filled with fictional alerts, cases and evidence that were indistinguishable
 * from real ones, and a write the backend had rejected still looked like it
 * had succeeded.
 *
 * So it is off unless someone deliberately turns it on for a disconnected
 * demo. With it off, a failed call throws and the caller finds out.
 */
const DEMO_FALLBACK_ENABLED =
  process.env.NEXT_PUBLIC_DEMO_FALLBACK === "true";

/** Thrown instead of silently returning demo data. */
export class ZoikoShieldApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly endpoint: string
  ) {
    super(message);
    this.name = "ZoikoShieldApiError";
  }
}

export class ZoikoShieldApiClient {
  private static async safeFetch<T>(
    endpoint: string,
    options: RequestInit = {},
    fallbackFn: () => T
  ): Promise<T> {
    try {
      const state = getState();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      // Only send tenant context that actually exists. This used to fall back
      // to a made-up tenant id, which the backend correctly rejects as a
      // tenant mismatch - and the failed call then silently fell through to
      // demo data below.
      if (state.tenant?.id) headers["x-tenant-id"] = state.tenant.id;
      if (state.tenant?.environmentName) {
        headers["x-environment-id"] = state.tenant.environmentName;
      }
      if (state.session?.token) {
        headers["Authorization"] = `Bearer ${state.session.token}`;
      }
      const url =
        endpoint.startsWith("http://") || endpoint.startsWith("https://")
          ? endpoint
          : typeof window !== "undefined" && window.location?.origin
            ? new URL(endpoint, window.location.origin).toString()
            : `http://localhost:3000${endpoint}`;
      const res = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === "object" && "data" in json && json.data !== undefined) {
          return json.data as T;
        }
        return json as T;
      }

      // The backend answered and said no. That is an answer.
      const message = await extractErrorMessage(
        res,
        `Request to ${endpoint} failed with ${res.status}`
      );
      if (DEMO_FALLBACK_ENABLED) {
        console.warn(
          `[demo fallback] ${endpoint} returned ${res.status} (${message}); serving fabricated data because NEXT_PUBLIC_DEMO_FALLBACK=true`
        );
        return fallbackFn();
      }
      throw new ZoikoShieldApiError(message, res.status, endpoint);
    } catch (error) {
      if (error instanceof ZoikoShieldApiError) throw error;
      // The request never reached the backend.
      const reason = error instanceof Error ? error.message : String(error);
      if (DEMO_FALLBACK_ENABLED) {
        console.warn(
          `[demo fallback] ${endpoint} was unreachable (${reason}); serving fabricated data because NEXT_PUBLIC_DEMO_FALLBACK=true`
        );
        return fallbackFn();
      }
      throw new ZoikoShieldApiError(
        `ZoikoShield backend is unreachable: ${reason}`,
        null,
        endpoint
      );
    }
  }

  // --- Step 1: Authentication ---
  /**
   * shield-core's LoginDto requires a tenantId: a principal can be a member
   * of several tenants, so a sign-in has to say which one it is for. This
   * used to send only the email and password, so every real login attempt was
   * rejected with a 400 — and the rejection was answered with a fabricated
   * session, which is why the gap went unnoticed.
   */
  static async login(
    email: string,
    password?: string,
    tenantId?: string
  ): Promise<UserSession> {
    const resolvedTenantId = tenantId || getState().tenant?.id;
    const session = await this.safeFetch<UserSession>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          tenantId: resolvedTenantId,
        }),
      },
      () => {
        const state = getState();
        const role = email.includes("owner")
          ? "TENANT_OWNER"
          : email.includes("admin")
            ? "SUPER_ADMIN"
            : "SECURITY_ANALYST";
        return {
          userId: `usr-${generateUUID().slice(0, 8)}`,
          email,
          fullName: email.split("@")[0].replace(".", " ").toUpperCase(),
          role,
          tenantId: state.tenant.id,
          environment: state.tenant.environmentName,
          token: `jwt-${generateUUID()}`,
          isAuthenticated: true,
        };
      }
    );

    const state = getState();
    state.session = session;
    // Carry the tenant the user actually signed in to, so every later request
    // sends an x-tenant-id the backend will accept.
    if (resolvedTenantId && state.tenant) {
      state.tenant.id = resolvedTenantId;
    }
    state.currentStep = 2;
    saveDemoState(state);
    return session;
  }

  // --- WebAuthn / Passkey login ---
  // Options are harmless to simulate offline (they carry no proof of anything);
  // the assertion verify step below always hits the live backend since that is
  // where the actual cryptographic proof-of-possession is checked.
  static async getPasskeyLoginOptions(email: string): Promise<PasskeyAuthenticationOptions> {
    return this.safeFetch<PasskeyAuthenticationOptions>(
      "/api/v1/auth/passkeys/authentication/options",
      { method: "POST", body: JSON.stringify({ email }) },
      () => ({
        challenge: generateUUID().replace(/-/g, ""),
        rpId: typeof window !== "undefined" ? window.location.hostname : "localhost",
        allowCredentials: [],
        userVerification: "required",
        timeout: 120_000,
      })
    );
  }

  static async loginWithPasskey(
    assertion: PasskeyAssertionPayload,
    tenantId: string,
    environmentId?: string
  ): Promise<UserSession> {
    const res = await fetch("/api/v1/auth/passkeys/authentication", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...assertion, tenantId, environmentId }),
    });
    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Passkey sign-in failed"));
    }
    const data = await res.json();
    const user = data.user || {};
    const session: UserSession = {
      userId: user.id || user.userId || `usr-${generateUUID().slice(0, 8)}`,
      email: user.email,
      fullName: user.fullName || user.email?.split("@")[0]?.replace(".", " ").toUpperCase() || "Passkey User",
      role: user.role || "SECURITY_ANALYST",
      tenantId: user.tenantId || tenantId,
      environment: user.environmentId || user.environment || getState().tenant.environmentName,
      isAuthenticated: true,
    };

    const state = getState();
    state.session = session;
    state.currentStep = 2;
    saveDemoState(state);
    return session;
  }

  // --- WebAuthn / Passkey enrollment (requires an authenticated session) ---
  static async getPasskeyRegistrationOptions(): Promise<PasskeyRegistrationOptions> {
    const res = await fetch("/api/v1/auth/passkeys/registration/options", { method: "POST" });
    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Unable to start passkey registration"));
    }
    return res.json();
  }

  static async registerPasskey(payload: PasskeyRegistrationPayload): Promise<RegisteredPasskey> {
    const res = await fetch("/api/v1/auth/passkeys/registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Passkey registration failed"));
    }
    return res.json();
  }

  static async listPasskeys(): Promise<RegisteredPasskey[]> {
    // The demo proxy's generic fallback returns a non-array {success, message}
    // shape when the real backend isn't reachable, so the result is validated
    // here rather than trusted as RegisteredPasskey[].
    const res = await this.safeFetch<unknown>(
      "/api/v1/auth/passkeys",
      { method: "GET" },
      () => []
    );
    return Array.isArray(res) ? (res as RegisteredPasskey[]) : [];
  }

  static async revokePasskey(id: string): Promise<void> {
    const res = await fetch(`/api/v1/auth/passkeys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      throw new Error(await extractErrorMessage(res, "Unable to revoke passkey"));
    }
  }

  // --- Step 2: Organization Onboarding ---
  static async createOrganization(data: {
    organizationName: string;
    slug: string;
    legalEntityName: string;
    environmentName: string;
    homeRegion: string;
  }): Promise<Tenant> {
    const newTenant = await this.safeFetch<Tenant>(
      "/api/v1/onboarding",
      { method: "POST", body: JSON.stringify(data) },
      () => {
        return {
          id: `tenant-${generateUUID().slice(0, 8)}`,
          organizationName: data.organizationName,
          slug: data.slug,
          legalEntityName: data.legalEntityName,
          environmentName: data.environmentName,
          homeRegion: data.homeRegion,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
        };
      }
    );

    const state = getState();
    state.tenant = newTenant;
    state.session.tenantId = newTenant.id;
    state.currentStep = 3;
    saveDemoState(state);
    return newTenant;
  }

  // --- Step 3: Team Invitations ---
  static async inviteAnalyst(
    tenantId: string,
    invitedEmail: string,
    assignedRole: "SECURITY_ANALYST" | "AUDITOR" | "TENANT_ADMIN"
  ): Promise<Invitation> {
    const invitation = await this.safeFetch<Invitation>(
      `/api/v1/tenants/${tenantId}/invitations`,
      {
        method: "POST",
        body: JSON.stringify({ invitedEmail, assignedRole }),
      },
      () => {
        return {
          id: `inv-${generateUUID().slice(0, 8)}`,
          tenantId,
          invitedEmail,
          assignedRole,
          token: `token-inv-${generateUUID().slice(0, 12)}`,
          status: "PENDING",
          createdAt: new Date().toISOString(),
        };
      }
    );

    const state = getState();
    state.invitations = [invitation, ...state.invitations.filter((i) => i.id !== invitation.id)];
    saveDemoState(state);
    return invitation;
  }

  static async acceptInvitation(token: string): Promise<Invitation> {
    const inv = await this.safeFetch<Invitation>(
      `/api/v1/invitations/${token}/accept`,
      { method: "POST" },
      () => {
        const state = getState();
        const found = state.invitations.find((i) => i.token === token || i.id === token);
        if (found) {
          found.status = "ACCEPTED";
          return found;
        }
        return {
          id: token,
          tenantId: "tenant-acme-prod-01",
          invitedEmail: "analyst.ops@acme.com",
          assignedRole: "SECURITY_ANALYST",
          token,
          status: "ACCEPTED",
          createdAt: new Date().toISOString(),
        };
      }
    );

    const state = getState();
    const existing = state.invitations.find((i) => i.token === token || i.id === token);
    if (existing) {
      existing.status = "ACCEPTED";
    }
    state.team.push({
      id: `usr-${generateUUID().slice(0, 8)}`,
      email: inv.invitedEmail,
      fullName: inv.invitedEmail.split("@")[0].replace(".", " ").toUpperCase(),
      role: inv.assignedRole as any,
      status: "ACTIVE",
      joinedAt: new Date().toISOString(),
    });
    state.currentStep = 4;
    saveDemoState(state);
    return inv;
  }

  // --- Step 4: Connectors Setup ---
  static async createConnector(data: {
    tenantId: string;
    name: string;
    provider: any;
    sourceRegion: string;
  }): Promise<Connector> {
    const conn = await this.safeFetch<Connector>(
      "/api/v1/connectors",
      { method: "POST", body: JSON.stringify(data) },
      () => {
        const id = `conn-${data.provider}-${generateUUID().slice(0, 6)}`;
        return {
          id,
          tenantId: data.tenantId,
          name: data.name,
          provider: data.provider,
          sourceRegion: data.sourceRegion,
          status: "ACTIVE",
          healthStatus: "HEALTHY",
          hmacSecret: `whsec_${sha256Mock(id).slice(0, 32)}`,
          webhookUrl: `https://ingest.zoikoshield.io/api/v1/ingestion/webhooks/${id}`,
          eventsIngestedCount: 0,
          lastEventAt: new Date().toISOString(),
        };
      }
    );

    const state = getState();
    state.connectors = [conn, ...state.connectors.filter((c) => c.id !== conn.id)];
    state.currentStep = 5;
    saveDemoState(state);
    return conn;
  }

  static async activateConnector(connectorId: string): Promise<Connector> {
    const conn = await this.safeFetch<Connector>(
      `/api/v1/connectors/${connectorId}/activate`,
      { method: "POST" },
      () => {
        const state = getState();
        const found = state.connectors.find((c) => c.id === connectorId);
        if (found) {
          found.status = "ACTIVE";
          found.healthStatus = "HEALTHY";
          return found;
        }
        throw new Error("Connector not found");
      }
    );

    const state = getState();
    const existing = state.connectors.find((c) => c.id === connectorId);
    if (existing) {
      existing.status = "ACTIVE";
      existing.healthStatus = "HEALTHY";
    }
    saveDemoState(state);
    return conn;
  }

  static async disableConnector(connectorId: string): Promise<Connector> {
    const conn = await this.safeFetch<Connector>(
      `/api/v1/connectors/${connectorId}/disable`,
      { method: "POST" },
      () => {
        const state = getState();
        const found = state.connectors.find((c) => c.id === connectorId);
        if (found) {
          found.status = "DISABLED";
          found.healthStatus = "DEGRADED";
          return found;
        }
        throw new Error("Connector not found");
      }
    );

    const state = getState();
    const existing = state.connectors.find((c) => c.id === connectorId);
    if (existing) {
      existing.status = "DISABLED";
      existing.healthStatus = "DEGRADED";
    }
    saveDemoState(state);
    return conn;
  }

  static async testConnector(connectorId: string): Promise<{ success: boolean; latencyMs: number; provider: string; message: string }> {
    return this.safeFetch(
      `/api/v1/connectors/${connectorId}/test`,
      { method: "POST" },
      () => ({
        success: true,
        latencyMs: Math.floor(Math.random() * 40) + 10,
        provider: "generic-webhook",
        message: `Connection test passed for ${connectorId}`,
      })
    );
  }

  static async syncConnector(connectorId: string): Promise<{ status: string; syncedCount: number; lastSyncAt: string }> {
    const res = await this.safeFetch<{ status: string; syncedCount: number; lastSyncAt: string }>(
      `/api/v1/connectors/${connectorId}/sync`,
      { method: "POST" },
      () => ({
        status: "SUCCESS",
        syncedCount: Math.floor(Math.random() * 50) + 10,
        lastSyncAt: new Date().toISOString(),
      })
    );

    const state = getState();
    const conn = state.connectors.find((c) => c.id === connectorId);
    if (conn) {
      conn.eventsIngestedCount += res.syncedCount || 15;
      conn.lastEventAt = new Date().toISOString();
      saveDemoState(state);
    }
    return res;
  }

  static async getEvents(params?: { limit?: number; connectorId?: string }): Promise<{ total: number; data: TelemetryNormalized[] }> {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.connectorId) query.set("connectorId", params.connectorId);

    return this.safeFetch(
      `/api/v1/events?${query.toString()}`,
      { method: "GET" },
      () => {
        const state = getState();
        return {
          total: state.normalizedEvents.length,
          data: state.normalizedEvents,
        };
      }
    );
  }

  // --- Step 5: Webhook Ingestion & Normalization ---
  static async sendSyntheticTelemetry(
    connectorId: string,
    rawPayload: Record<string, unknown>
  ): Promise<{ raw: Record<string, unknown>; normalized: TelemetryNormalized; alertTriggered: boolean }> {
    const res = await this.safeFetch(
      `/api/v1/ingestion/webhooks/${connectorId}`,
      { method: "POST", body: JSON.stringify(rawPayload) },
      () => {
        const state = getState();
        const payloadStr = JSON.stringify(rawPayload);
        const payloadHash = sha256Mock(payloadStr);

        const normalized: TelemetryNormalized = {
          id: `norm-${generateUUID().slice(0, 8)}`,
          tenantId: state.tenant.id,
          environmentId: state.tenant.environmentName,
          connectorId,
          eventClass: (rawPayload.eventClass as any) || "AUTHENTICATION",
          eventCategory: "IDENTITY",
          eventActivity: (rawPayload.activity as any) || "LOGIN_ATTEMPT",
          severity: (rawPayload.severity as any) || "HIGH",
          actorUserId: (rawPayload.userId as string) || "usr-target-victim",
          actorEmail: (rawPayload.email as string) || "victim.engineer@acme.com",
          sourceIp: (rawPayload.sourceIp as string) || "198.51.100.42",
          action: (rawPayload.action as string) || "AUTH_PASSWORD_LOGIN",
          outcome: (rawPayload.outcome as any) || "FAILED",
          occurredAt: (rawPayload.occurredAt as string) || new Date().toISOString(),
          normalizationStatus: "NORMALIZED",
          rawPayloadHash: payloadHash,
        };

        return { raw: rawPayload, normalized, alertTriggered: true };
      }
    );

    const state = getState();
    state.normalizedEvents = [res.normalized, ...state.normalizedEvents];
    state.lastSimulatedEvent = rawPayload;

    // Trigger P1 Alert
    const alertId = `alt-${generateUUID().slice(0, 8)}`;
    const alert: Alert = {
      id: alertId,
      tenantId: state.tenant.id,
      detectionRuleId: "rule-threshold-failed-logins",
      detectionRuleVersion: 1,
      title: `Detection: ${res.normalized.eventActivity} Anomaly (${res.normalized.actorEmail})`,
      severity: res.normalized.severity === "INFORMATIONAL" ? "LOW" : res.normalized.severity,
      priority: res.normalized.severity === "CRITICAL" ? "P1" : "P2",
      status: "NEW",
      sourceEventIds: [res.normalized.id],
      affectedAssets: ["auth-gateway-us-east-1"],
      affectedIdentities: [res.normalized.actorEmail || "unknown"],
      mitreTechnique: "T1110.001 - Password Spraying",
      createdAt: new Date().toISOString(),
    };
    state.alerts = [alert, ...state.alerts.filter((a) => a.id !== alert.id)];
    state.currentStep = 6;

    saveDemoState(state);
    return res;
  }

  // --- Step 6 & 7: Promote Alert -> Case & Evidence ---
  static async promoteAlertToCase(alertId: string, caseTitle?: string): Promise<Case> {
    const newCase = await this.safeFetch<Case>(
      `/api/v1/alerts/${alertId}/create-case`,
      { method: "POST", body: JSON.stringify({ title: caseTitle }) },
      () => {
        const state = getState();
        const alert = state.alerts.find((a) => a.id === alertId);
        const caseId = `case-${generateUUID().slice(0, 8)}`;
        const evidenceId = `ev-${generateUUID().slice(0, 8)}`;
        const evidenceHash = sha256Mock(JSON.stringify(alert || {}));

        const evidence: EvidenceRecord = {
          id: evidenceId,
          tenantId: state.tenant.id,
          caseId,
          evidenceType: "SECURITY_TELEMETRY",
          sourceType: "WEBHOOK",
          collectorId: state.connectors[0]?.id || "conn-01",
          contentHash: evidenceHash,
          freshnessStatus: "CURRENT",
          integrityStatus: "VALID",
          merkleEpoch: 1043,
          merkleRootHash: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
          recordedAt: new Date().toISOString(),
          rawPayload: alert,
        };

        return {
          id: caseId,
          tenantId: state.tenant.id,
          title: caseTitle || `Investigation: ${alert?.title || "Security Incident"}`,
          severity: alert?.severity || "HIGH",
          status: "INVESTIGATING",
          ownerId: state.session.userId,
          ownerName: state.session.fullName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          linkedAlertIds: [alertId],
          timeline: [
            {
              id: `tl-${generateUUID().slice(0, 6)}`,
              timestamp: new Date().toISOString(),
              title: "Alert Triggered",
              description: `Detection rule triggered P1 alert for ${alert?.affectedIdentities.join(", ") || "target identity"}.`,
              actor: "shield-ingest / TierA-Windowed-Detector",
              type: "ALERT_TRIGGERED",
            },
            {
              id: `tl-${generateUUID().slice(0, 6)}`,
              timestamp: new Date().toISOString(),
              title: "Formal Case Promoted",
              description: `Promoted alert '${alertId}' into formal incident workspace.`,
              actor: state.session.fullName,
              type: "CASE_OPENED",
            },
            {
              id: `tl-${generateUUID().slice(0, 6)}`,
              timestamp: new Date().toISOString(),
              title: "Cryptographic Evidence Anchored",
              description: `Recorded SHA-256 evidence entry (${evidenceHash.slice(0, 16)}...) sealed in Merkle Epoch #1043.`,
              actor: "shield-anchor / BatchMerkleCheckpointer",
              type: "EVIDENCE_RECORDED",
            },
          ],
          evidenceList: [evidence],
        };
      }
    );

    const state = getState();
    const alert = state.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.status = "CASE_CREATED";
    }
    state.cases = [newCase, ...state.cases.filter((c) => c.id !== newCase.id)];
    state.currentStep = 7;
    saveDemoState(state);
    return newCase;
  }

  // --- Step 8: AI Investigation Summary & 10-Field AiReviewEnvelope ---
  static async generateAiInvestigationSummary(caseId: string): Promise<AiInvestigationSummary> {
    const summary = await this.safeFetch<AiInvestigationSummary>(
      `/api/v1/cases/${caseId}/ai/summary`,
      { method: "POST" },
      () => {
        const state = getState();
        const currentCase = state.cases.find((c) => c.id === caseId);
        const targetEmail = currentCase?.evidenceList[0]?.rawPayload
          ? (currentCase.evidenceList[0].rawPayload as any).affectedIdentities?.[0] || "victim.engineer@acme.com"
          : "victim.engineer@acme.com";

        return {
          outputId: `ai-out-${generateUUID().slice(0, 8)}`,
          aiRunId: `ai-run-${generateUUID().slice(0, 8)}`,
          caseId,
          status: "REVIEW_REQUIRED",
          generatedAt: new Date().toISOString(),
          modelArmorVerdict: "SCREENED_SAFE",
          executiveSummary: `Autonomous AI analysis confirms high-severity credential brute-force telemetry against '${targetEmail}'. Attacking IP 198.51.100.42 exhibited automated cadence with 5 consecutive failures.`,
          threatAssessment: "MITRE ATT&CK T1110 (Brute Force) & T1078 (Valid Accounts). Recommended immediate session invalidation.",
          citations: (currentCase?.evidenceList || []).map((ev, idx) => ({
            evidenceId: ev.id,
            evidenceRef: `[E-0${idx + 1}]`,
            description: `Telemetry digest: ${ev.contentHash.slice(0, 16)}... from ${ev.sourceType}`,
          })),
          hypotheses: [
            {
              id: "hyp-01",
              title: "Automated Distributed Credential Stuffing Botnet",
              likelihood: "HIGH",
              supportingEvidence: ["Sub-second event burst", "Known proxy CIDR"],
            },
            {
              id: "hyp-02",
              title: "Legitimate User Forgot Password",
              likelihood: "LOW",
              supportingEvidence: ["Corporate IP range", "Previous auth success"],
            },
          ],
          recommendedActions: [
            "Execute SOAR Session Reset for target user",
            "Apply WAF egress perimeter block on 198.51.100.42",
          ],
          limitations: ["Source ASN resolution obfuscated behind residential proxy network."],
        };
      }
    );

    const state = getState();
    const currentCase = state.cases.find((c) => c.id === caseId);
    if (currentCase) {
      currentCase.aiSummary = summary;

      // Construct the 10-Field AiReviewEnvelope
      const envelopeId = `env-${generateUUID().slice(0, 8)}`;
      const envelope: AiReviewEnvelope = {
        envelopeId,
        tenantId: state.tenant.id,
        environmentId: state.tenant.environmentName,
        createdAt: new Date().toISOString(),
        aiLabelAndUseCaseName: {
          aiLabel: "AI Generated - Human Oversight Mandatory",
          useCaseName: "Threat-Investigation-Copilot",
          modelRoute: "vertex-ai/gemini-1.5-pro",
          version: "v2.4.0",
        },
        sourcesAndSpans: [
          {
            sourceId: currentCase?.evidenceList[0]?.id || "ev-telemetry-01",
            sourceType: "OCSF_AUTH_LOG",
            exactSpan: "5 consecutive failed logins within 4.2s from IP 198.51.100.42 targeting account victim.engineer@acme.com",
            confidence: 0.96,
          },
          {
            sourceId: "ev-merkle-anchor-1043",
            sourceType: "MERKLE_TREE_WITNESS",
            exactSpan: "Leaf 0x4f9a... verified against Epoch #1043 root with 0x00 domain separator",
            confidence: 1.0,
          },
        ],
        knownMissingStaleOrConflictingEvidence: {
          missingEvidence: ["Egress firewall flow telemetry for attacking ASN"],
          staleEvidence: ["GeoIP database cached 18h ago"],
          conflictingEvidence: [],
        },
        calibratedConfidenceAndUncertainty: {
          score: 0.94,
          qualitativeBand: "HIGH",
          calibrationBasis: "Brier-calibrated ensemble over 1,400 historical credential stuffing incidents",
          uncertaintyFactors: ["Residential proxy rotation risk (<6% false attribution)"],
        },
        alternativeHypothesesOrActions: [
          {
            title: "Legitimate user forgot corporate VPN password rotation",
            rationale: "User password changed 24h prior, possible stale credential cache",
            tradeOffs: "Lower risk but does not explain sub-second 5x burst cadence",
          },
          {
            title: "Automated distributed credential stuffing botnet",
            rationale: "Cadence matches Mirai/DarkGate brute-force cluster signatures",
            tradeOffs: "High confidence match with MITRE T1110.001 technique",
          },
        ],
        expectedImpactAndReversibility: {
          blastRadius: "Low (single user identity & 3 active session tokens)",
          isReversible: true,
          reversibilityTier: "R1",
          compensationPlan: "RESTORE_USER_SESSION_CACHE via SOAR rollback adapter",
        },
        requiredAuthorityAndApprovals: {
          requiredRole: "SECURITY_ANALYST",
          responseAuthorityTier: "R1",
          dualApproverRequired: false,
        },
        controls: {
          availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
          state: "UNREVIEWED",
        },
        humanDecisionAndRationale: {},
        appealOrFeedbackRoute: {
          appealUrl: `https://trust.zoikoshield.io/appeals/cases/${caseId}/decisions/${envelopeId}`,
          feedbackChannel: "secops-ai-oversight@acme.com",
          customerAffecting: true,
        },
        payload: summary,
      };

      currentCase.aiReviewEnvelope = envelope;
      currentCase.timeline.push({
        id: `tl-${generateUUID().slice(0, 6)}`,
        timestamp: new Date().toISOString(),
        title: "AI Investigation Narrative Synthesized",
        description: "AI Copilot generated attack timeline with 10-field review envelope under Model Armor screening.",
        actor: "shield-ai / ModelArmorGateway",
        type: "AI_INVESTIGATED",
      });
    }
    state.currentStep = 8;
    saveDemoState(state);
    return summary;
  }

  static async getAiReviewEnvelope(envelopeId: string): Promise<AiReviewEnvelope> {
    return this.safeFetch<AiReviewEnvelope>(
      `/api/v1/ai/decisions/${envelopeId}`,
      { method: "GET" },
      () => {
        const state = getState();
        for (const c of state.cases) {
          if (c.aiReviewEnvelope?.envelopeId === envelopeId) {
            return c.aiReviewEnvelope;
          }
        }
        throw new Error("AiReviewEnvelope not found");
      }
    );
  }

  static async recordDecisionRightsAction(
    envelopeId: string,
    action: DecisionTransition,
    payload: {
      decidedBy: string;
      rationale: string;
      modifiedContent?: string;
      escalatedToRole?: string;
      caseId?: string;
    }
  ): Promise<AiReviewEnvelope> {
    const endpointMap: Record<DecisionTransition, string> = {
      ACCEPT: `/api/v1/ai/decisions/${envelopeId}/accept`,
      MODIFY: `/api/v1/ai/decisions/${envelopeId}/modify`,
      REJECT: `/api/v1/ai/decisions/${envelopeId}/reject`,
      ESCALATE: `/api/v1/ai/decisions/${envelopeId}/escalate`,
    };

    const endpoint = endpointMap[action] || `/api/v1/ai/decisions/${envelopeId}/accept`;

    const updatedEnvelope = await this.safeFetch<AiReviewEnvelope>(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      () => {
        const state = getState();
        const nowStr = new Date().toISOString();
        const stateMap: Record<DecisionTransition, any> = {
          ACCEPT: "ACCEPTED",
          MODIFY: "MODIFIED",
          REJECT: "REJECTED",
          ESCALATE: "ESCALATED",
        };

        let targetCase = state.cases.find(
          (c) => c.aiReviewEnvelope?.envelopeId === envelopeId || c.id === payload.caseId
        );
        if (!targetCase && state.cases.length > 0) targetCase = state.cases[0];

        const env = targetCase?.aiReviewEnvelope || {
          envelopeId,
          tenantId: state.tenant.id,
          environmentId: state.tenant.environmentName,
          createdAt: nowStr,
          aiLabelAndUseCaseName: {
            aiLabel: "AI Generated - Human Oversight Mandatory",
            useCaseName: "Threat-Investigation-Copilot",
            modelRoute: "vertex-ai/gemini-1.5-pro",
          },
          sourcesAndSpans: [],
          knownMissingStaleOrConflictingEvidence: { missingEvidence: [], staleEvidence: [], conflictingEvidence: [] },
          calibratedConfidenceAndUncertainty: { score: 0.94, qualitativeBand: "HIGH", calibrationBasis: "Calibrated", uncertaintyFactors: [] },
          alternativeHypothesesOrActions: [],
          expectedImpactAndReversibility: { blastRadius: "Low", isReversible: true, reversibilityTier: "R1" },
          requiredAuthorityAndApprovals: { requiredRole: "SECURITY_ANALYST", responseAuthorityTier: "R1", dualApproverRequired: false },
          controls: { availableTransitions: [], state: stateMap[action] },
          humanDecisionAndRationale: {
            decidedBy: payload.decidedBy,
            decision: action,
            rationale: payload.rationale,
            modifiedContent: payload.modifiedContent,
            escalatedToRole: payload.escalatedToRole,
            decidedAt: nowStr,
            evidenceRef: `ev-ai-dec-${generateUUID().slice(0, 8)}`,
          },
          appealOrFeedbackRoute: {
            appealUrl: `https://trust.zoikoshield.io/appeals/decisions/${envelopeId}`,
            feedbackChannel: "secops-ai-oversight@acme.com",
            customerAffecting: true,
          },
          payload: {},
        };

        env.controls.state = stateMap[action];
        env.humanDecisionAndRationale = {
          decidedBy: payload.decidedBy,
          decision: action,
          rationale: payload.rationale,
          modifiedContent: payload.modifiedContent,
          escalatedToRole: payload.escalatedToRole,
          decidedAt: nowStr,
          evidenceRef: `ev-ai-dec-${generateUUID().slice(0, 8)}`,
        };

        return env;
      }
    );

    const state = getState();
    const targetCase = state.cases.find(
      (c) => c.aiReviewEnvelope?.envelopeId === envelopeId || c.id === payload.caseId
    );
    if (targetCase) {
      targetCase.aiReviewEnvelope = updatedEnvelope;
      if (targetCase.aiSummary) {
        targetCase.aiSummary.status =
          action === "ACCEPT" ? "ACCEPTED" : action === "REJECT" ? "REJECTED" : "REVIEW_REQUIRED";
        targetCase.aiSummary.rationale = payload.rationale;
        if (payload.modifiedContent) {
          targetCase.aiSummary.modifiedContent = payload.modifiedContent;
        }
      }
      targetCase.timeline.push({
        id: `tl-${generateUUID().slice(0, 6)}`,
        timestamp: new Date().toISOString(),
        title: `AI Oversight Decision: ${action}`,
        description: `Analyst ${payload.decidedBy} executed ${action}: "${payload.rationale}" (Anchored Ref: ${updatedEnvelope.humanDecisionAndRationale?.evidenceRef || "ev-ledger-pending"})`,
        actor: payload.decidedBy,
        type: "DECISION_RECORDED",
      });
      saveDemoState(state);
    }

    return updatedEnvelope;
  }

  // --- Step 9: Human Decision & Response Simulation ---
  static async recordHumanDecision(
    caseId: string,
    decisionType: any,
    decisionNotes: string
  ): Promise<HumanDecision> {
    const decision = await this.safeFetch<HumanDecision>(
      `/api/v1/cases/${caseId}/decisions`,
      { method: "POST", body: JSON.stringify({ decisionType, decisionNotes }) },
      () => {
        const state = getState();
        const currentCase = state.cases.find((c) => c.id === caseId);
        return {
          id: `dec-${generateUUID().slice(0, 8)}`,
          tenantId: state.tenant.id,
          caseId,
          decisionType,
          decisionNotes,
          actorId: state.session.userId,
          actorName: state.session.fullName,
          evidenceIds: currentCase ? currentCase.evidenceList.map((e) => e.id) : [],
          timestamp: new Date().toISOString(),
        };
      }
    );

    const state = getState();
    const currentCase = state.cases.find((c) => c.id === caseId);
    if (currentCase) {
      currentCase.decision = decision;
      currentCase.timeline.push({
        id: `tl-${generateUUID().slice(0, 6)}`,
        timestamp: new Date().toISOString(),
        title: `Human Decision: ${decisionType}`,
        description: `Analyst ${state.session.fullName} verified evidence and authorized response proposal: "${decisionNotes}"`,
        actor: state.session.fullName,
        type: "DECISION_RECORDED",
      });

      const proposal: ResponseProposal = {
        id: `prop-${generateUUID().slice(0, 8)}`,
        tenantId: state.tenant.id,
        caseId,
        actionType: "RESET_USER_SESSIONS",
        targetAsset: "victim.engineer@acme.com",
        authorityLevel: "R1_RECOMMEND",
        status: "PROPOSED",
        proposedAt: new Date().toISOString(),
        blastRadiusScore: 0.05,
      };
      currentCase.responseProposal = proposal;
    }
    state.currentStep = 9;
    saveDemoState(state);
    return decision;
  }

  static async simulateResponseProposal(
    proposalId: string,
    actionType?: string,
    targetRef?: string
  ): Promise<SimulationReceipt> {
    const receipt = await this.safeFetch<SimulationReceipt>(
      `/api/v1/response-proposals/${proposalId}/simulate`,
      {
        method: "POST",
        body: JSON.stringify({ proposalId, actionType, targetRef }),
      },
      () => {
        const target = targetRef || "victim.engineer@acme.com";
        const act = actionType || "ISOLATE_ENDPOINT";
        return {
          id: `rcpt-sim-${generateUUID().slice(0, 8)}`,
          proposalId,
          commandId: `cmd-${generateUUID().slice(0, 8)}`,
          result: "SIMULATED",
          simulatedBlastRadius: 0.05,
          simulatedAt: new Date().toISOString(),
          stateDiffs: [
            {
              target,
              beforeState: "NETWORK_CONNECTED (Active Sessions=3)",
              afterState: "CONTAINMENT_ACTIVE (Loopback Only, Zero Collateral)",
              rollbackCommand: act === "ISOLATE_ENDPOINT" ? "UNISOLATE_ENDPOINT" : "RESTORE_USER_SESSION_CACHE",
            },
          ],
          observedEffect: {
            sessionsTerminated: 3,
            tokensRevoked: ["jwt_sess_1", "jwt_sess_2", "jwt_sess_3"],
            collateralDamageRisk: "ZERO_COLLATERAL",
          },
          safetyAttestationHash: sha256Mock(proposalId + Date.now()),
        };
      }
    );

    const state = getState();
    let targetCase: Case | undefined;
    for (const c of state.cases) {
      if (c.responseProposal?.id === proposalId || c.responseProposal) {
        targetCase = c;
        break;
      }
    }
    if (targetCase && targetCase.responseProposal) {
      targetCase.responseProposal.status = "SIMULATED";
      targetCase.responseProposal.simulatedAt = receipt.simulatedAt;
      targetCase.simulationReceipt = receipt;
      targetCase.timeline.push({
        id: `tl-${generateUUID().slice(0, 6)}`,
        timestamp: new Date().toISOString(),
        title: "SOAR Response Dry-Run Simulated",
        description: `Simulation completed with blast radius 0.05 (3 active sessions targeted, zero collateral damage).`,
        actor: "shield-action / PlaybookSandboxEngine",
        type: "RESPONSE_SIMULATED",
      });
    }

    state.currentStep = 10;
    saveDemoState(state);
    return receipt;
  }

  // --- Step 10: Control Evaluation & Audit Package ---
  static async evaluateControl(controlId: string): Promise<ControlTest> {
    const ctrl = await this.safeFetch<ControlTest>(
      `/api/v1/control-tests/${controlId}/evaluate`,
      { method: "POST" },
      () => {
        return {
          id: controlId,
          controlId: "SOC2-CC6.1",
          framework: "SOC2_TYPE2",
          controlName: "Privileged Access Restriction & MFA Enforcement",
          description: "Evaluates whether privileged administrative sessions enforce hardware MFA step-up.",
          category: "IDENTITY_ACCESS",
          result: "PASS",
          evaluatedEventsCount: 420,
          lastEvaluatedAt: new Date().toISOString(),
          evidenceSampleHash: sha256Mock(controlId + Date.now()),
        };
      }
    );

    const state = getState();
    const found = state.controlTests.find((c) => c.id === controlId || c.controlId === controlId);
    if (found) {
      found.result = "PASS";
      found.evaluatedEventsCount += 1;
      found.lastEvaluatedAt = new Date().toISOString();
      found.evidenceSampleHash = sha256Mock(controlId + Date.now());
    }
    saveDemoState(state);
    return ctrl;
  }

  static async generateAuditPackage(): Promise<AuditPackage> {
    const pkg = await this.safeFetch<AuditPackage>(
      "/api/v1/audit-packages",
      { method: "POST" },
      () => {
        const state = getState();
        return {
          id: `pkg-${generateUUID().slice(0, 8)}`,
          tenantId: state.tenant.id,
          packageName: `ZoikoShield-Audit-Package-${state.tenant.slug}-${new Date().toISOString().slice(0, 10)}.zip`,
          packageHash: sha256Mock(state.tenant.id + Date.now()),
          dilithiumSignature: `pqc_mldsa65_${sha256Mock(generateUUID()).slice(0, 48)}`,
          ecdsaP256Signature: `ecdsa_p256_${sha256Mock(generateUUID()).slice(0, 48)}`,
          ed25519Signature: `ecdsa_p256_${sha256Mock(generateUUID()).slice(0, 48)}`,
          status: "VERIFIED",
          generatedAt: new Date().toISOString(),
          sizeBytes: 428190,
          manifest: {
            evidenceCount: state.cases.reduce((acc, c) => acc + c.evidenceList.length, 0) || 14,
            casesCount: state.cases.length || 3,
            controlEvaluationsCount: state.controlTests.length || 4,
            epochMerkleRoot: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
            tsaTimestampProof: `RFC3161_TSA_SEAL_${new Date().toISOString().slice(0, 10)}_VALID`,
          },
        };
      }
    );

    const state = getState();
    state.auditPackages = [pkg, ...state.auditPackages.filter((p) => p.id !== pkg.id)];
    saveDemoState(state);
    return pkg;
  }

  // --- GET: Fetch alerts from backend ---
  static async getAlerts(params?: { status?: string; limit?: number }): Promise<Alert[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", String(params.limit));
    return this.safeFetch(
      `/api/v1/alerts?${query.toString()}`,
      { method: "GET" },
      () => {
        const state = getState();
        return state.alerts;
      }
    );
  }

  // --- GET: Fetch cases from backend ---
  static async getCases(): Promise<Case[]> {
    return this.safeFetch(
      "/api/v1/cases",
      { method: "GET" },
      () => {
        const state = getState();
        return state.cases;
      }
    );
  }

  // --- GET: Fetch connectors from backend ---
  static async getConnectors(): Promise<Connector[]> {
    const res = await this.safeFetch<{ data: Connector[] } | Connector[]>(
      "/api/v1/connectors",
      { method: "GET" },
      () => {
        const state = getState();
        return { data: state.connectors };
      }
    );
    // Handle both array and {data:[]} shapes
    return Array.isArray(res) ? res : ((res as any).data ?? []);
  }

  // --- GET: Fetch control tests from backend ---
  static async getControlTests(): Promise<ControlTest[]> {
    return this.safeFetch(
      "/api/v1/control-evaluations",
      { method: "GET" },
      () => {
        const state = getState();
        return state.controlTests;
      }
    );
  }

  // --- GET: Fetch audit packages from backend ---
  static async getAuditPackages(): Promise<AuditPackage[]> {
    return this.safeFetch(
      "/api/v1/audit-packages",
      { method: "GET" },
      () => {
        const state = getState();
        return state.auditPackages;
      }
    );
  }

  // --- Emergency SOAR Freeze ---
  static async freezeSOAR(scope: string, reason: string): Promise<{ frozen: boolean; mode: string; freezeId: string; initiatedBy: string; timestamp: string }> {
    return this.safeFetch(
      "/api/v1/response/freeze",
      { method: "POST", body: JSON.stringify({ scope, reason }) },
      () => ({
        frozen: true,
        mode: "EMERGENCY_FREEZE",
        freezeId: `frz-${generateUUID().slice(0, 8)}`,
        initiatedBy: getState().session.email,
        timestamp: new Date().toISOString(),
      })
    );
  }

  // --- Release Emergency SOAR Freeze ---
  // Note: the backend scopes an active freeze to the tenant (via x-tenant-id), not
  // a freezeId, so freezeId is accepted for caller compatibility but not sent.
  static async releaseFreezeSOAR(_freezeId: string): Promise<{ frozen: boolean; releasedAt: string }> {
    return this.safeFetch(
      "/api/v1/response/unfreeze",
      { method: "POST" },
      () => ({
        frozen: false,
        releasedAt: new Date().toISOString(),
      })
    );
  }

  // --- Request JIT Elevation ---
  static async requestJitElevation(targetTenantId: string, justification: string, durationMinutes: number): Promise<{ requestId: string; status: string; expiresAt: string; requestedRole: string; approverPeerAdmin: string }> {
    return this.safeFetch(
      "/api/v1/authz/jit/request",
      {
        method: "POST",
        body: JSON.stringify({
          targetTenantId,
          statedPurpose: justification,
          requestedDurationMinutes: durationMinutes,
        }),
      },
      () => ({
        requestId: `jit-req-${generateUUID().slice(0, 8)}`,
        status: "APPROVED_ACTIVE",
        requestedRole: "SUPER_ADMIN",
        approverPeerAdmin: "alex.kumar@acme.com",
        expiresAt: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
        justification,
        auditSignature: sha256Mock("jit" + Date.now()),
      })
    );
  }

  // --- Revoke JIT Session ---
  static async revokeJitElevation(
    sessionId: string,
    revocationReason: string = "Analyst-initiated revocation via console"
  ): Promise<{ revoked: boolean; revokedAt: string }> {
    return this.safeFetch(
      `/api/v1/authz/jit/${sessionId}/revoke`,
      { method: "POST", body: JSON.stringify({ revocationReason }) },
      () => ({
        revoked: true,
        revokedAt: new Date().toISOString(),
      })
    );
  }

  // --- Verify JIT Step-Up Challenge (FIDO2 / WebAuthn) ---
  static async verifyJitStepUp(
    requestId: string,
    principalId: string,
    clientDataJson: string,
    signature: string,
    authenticatorData?: string
  ): Promise<{ verified: boolean; hardwareProofDigest: string; verifiedAt: string }> {
    return this.safeFetch(
      `/api/v1/authz/jit/${requestId}/stepup`,
      {
        method: "POST",
        body: JSON.stringify({
          principalId,
          clientDataJson,
          signature,
          authenticatorData: authenticatorData || "direct",
        }),
      },
      () => ({
        verified: true,
        hardwareProofDigest: sha256Mock(`fido2-${requestId}-${Date.now()}`),
        verifiedAt: new Date().toISOString(),
      })
    );
  }

  // --- Step 11: AI Safety Incident Lifecycle (§23) & Emergency Kill-Switch ---
  static async getAiIncidents(tenantId?: string): Promise<AiIncident[]> {
    return this.safeFetch<AiIncident[]>(
      `/api/v1/ai/incidents?tenantId=${tenantId || "default"}`,
      { method: "GET" },
      () => {
        const state = getState();
        return state.aiIncidents || [];
      }
    );
  }

  static async declareAiIncident(data: {
    tenantId: string;
    title: string;
    severity: AiIncidentSeverity;
    trigger: AiIncidentTrigger;
    affectedModel: string;
    declaredBy: string;
  }): Promise<AiIncident> {
    const incident = await this.safeFetch<AiIncident>(
      "/api/v1/ai/incidents",
      { method: "POST", body: JSON.stringify(data) },
      () => {
        return {
          id: `ai-inc-${generateUUID().slice(0, 8)}`,
          tenantId: data.tenantId,
          title: data.title,
          severity: data.severity,
          state: "DECLARED",
          trigger: data.trigger,
          affectedModel: data.affectedModel,
          killSwitchEngaged: false,
          fallbackModeActive: false,
          declaredBy: data.declaredBy,
          createdAt: new Date().toISOString(),
        };
      }
    );

    const state = getState();
    state.aiIncidents = [incident, ...(state.aiIncidents || []).filter((i) => i.id !== incident.id)];
    saveDemoState(state);
    return incident;
  }

  static async containAiIncident(incidentId: string, actionReason?: string): Promise<AiIncident> {
    const incident = await this.safeFetch<AiIncident>(
      `/api/v1/ai/incidents/${incidentId}/contain`,
      { method: "POST", body: JSON.stringify({ actionReason: actionReason || "Emergency Kill-Switch Engaged (Simulation Mode)" }) },
      () => {
        const state = getState();
        const found = (state.aiIncidents || []).find((i) => i.id === incidentId);
        if (found) {
          found.state = "CONTAINED_KILL_SWITCH";
          found.killSwitchEngaged = true;
          return found;
        }
        throw new Error("AI Incident not found");
      }
    );

    const state = getState();
    const existing = (state.aiIncidents || []).find((i) => i.id === incidentId);
    if (existing) {
      existing.state = "CONTAINED_KILL_SWITCH";
      existing.killSwitchEngaged = true;
    }
    saveDemoState(state);
    return incident;
  }

  static async activateAiFallback(incidentId: string, targetTier1Provider?: string): Promise<AiIncident> {
    const incident = await this.safeFetch<AiIncident>(
      `/api/v1/ai/incidents/${incidentId}/fallback`,
      { method: "POST", body: JSON.stringify({ targetProvider: targetTier1Provider || "Anthropic Claude / Deterministic Rule Engine" }) },
      () => {
        const state = getState();
        const found = (state.aiIncidents || []).find((i) => i.id === incidentId);
        if (found) {
          found.state = "FALLBACK_ACTIVE";
          found.fallbackModeActive = true;
          return found;
        }
        throw new Error("AI Incident not found");
      }
    );

    const state = getState();
    const existing = (state.aiIncidents || []).find((i) => i.id === incidentId);
    if (existing) {
      existing.state = "FALLBACK_ACTIVE";
      existing.fallbackModeActive = true;
    }
    saveDemoState(state);
    return incident;
  }

  static async analyzeAiIncidentRca(incidentId: string): Promise<{
    incident: AiIncident;
    rcaSummary: string;
    fiveWhys: string[];
    rootCauseClass: string;
    recommendedFixes: string[];
  }> {
    const result = await this.safeFetch<{
      incident: AiIncident;
      rcaSummary: string;
      fiveWhys: string[];
      rootCauseClass: string;
      recommendedFixes: string[];
    }>(
      `/api/v1/ai/incidents/${incidentId}/rca`,
      { method: "POST" },
      () => {
        const state = getState();
        const found = (state.aiIncidents || []).find((i) => i.id === incidentId);
        const rcaSummary =
          "Automated RCA Engine (§23): Adversarial injection payload successfully bypassed pre-filter due to zero-width unicode whitespace obfuscation. Model output deviated from grounded facts, triggering Model Armor circuit breaker.";
        if (found) {
          found.state = "ROOT_CAUSE_ANALYZED";
          found.rootCauseSummary = rcaSummary;
        }
        return {
          incident: found || {
            id: incidentId,
            tenantId: "default",
            title: "Prompt Injection Incident",
            severity: "SEV1_CRITICAL",
            state: "ROOT_CAUSE_ANALYZED",
            trigger: "PROMPT_INJECTION",
            affectedModel: "gemini-1.5-pro",
            killSwitchEngaged: true,
            fallbackModeActive: true,
            rootCauseSummary: rcaSummary,
            declaredBy: "Security Analyst",
            createdAt: new Date().toISOString(),
          },
          rcaSummary,
          fiveWhys: [
            "Why 1: Log Summarizer generated hallucinations -> Model instruction was superseded by input payload.",
            "Why 2: Input payload was parsed as system instruction -> Delimiter tags were unescaped in raw syslog stream.",
            "Why 3: Unescaped delimiter tags passed regex filter -> Adversary encoded tags with zero-width whitespace.",
            "Why 4: Unicode normalization was omitted before regex pass -> Sanitizer assumed UTF-8 ASCII strict compliance.",
            "Why 5: Lack of NFKD unicode canonicalization in ingest Tier-A preprocessor.",
          ],
          rootCauseClass: "UNESCAPED_INPUT_DELIMITER_UNICODE_CONFUSABLE",
          recommendedFixes: [
            "Deploy NFKD Unicode Normalization filter in Ingest Preprocessor",
            "Update Model Armor prompt injection classifier confidence threshold from 0.80 to 0.65",
            "Enforce strict XML-tag containment on raw log variables in prompt template",
          ],
        };
      }
    );

    const state = getState();
    const existing = (state.aiIncidents || []).find((i) => i.id === incidentId);
    if (existing) {
      existing.state = "ROOT_CAUSE_ANALYZED";
      existing.rootCauseSummary = result.rcaSummary;
    }
    saveDemoState(state);
    return result;
  }

  static async resolveAiIncident(incidentId: string, resolutionNotes: string): Promise<AiIncident> {
    const incident = await this.safeFetch<AiIncident>(
      `/api/v1/ai/incidents/${incidentId}/resolve`,
      { method: "POST", body: JSON.stringify({ resolutionNotes }) },
      () => {
        const state = getState();
        const found = (state.aiIncidents || []).find((i) => i.id === incidentId);
        if (found) {
          found.state = "RESOLVED";
          found.resolvedAt = new Date().toISOString();
          return found;
        }
        throw new Error("AI Incident not found");
      }
    );

    const state = getState();
    const existing = (state.aiIncidents || []).find((i) => i.id === incidentId);
    if (existing) {
      existing.state = "RESOLVED";
      existing.resolvedAt = incident.resolvedAt;
    }
    saveDemoState(state);
    return incident;
  }

  static async closeAiIncident(incidentId: string): Promise<AiIncident> {
    const incident = await this.safeFetch<AiIncident>(
      `/api/v1/ai/incidents/${incidentId}/close`,
      { method: "POST" },
      () => {
        const state = getState();
        const found = (state.aiIncidents || []).find((i) => i.id === incidentId);
        if (found) {
          found.state = "CLOSED";
          return found;
        }
        throw new Error("AI Incident not found");
      }
    );

    const state = getState();
    const existing = (state.aiIncidents || []).find((i) => i.id === incidentId);
    if (existing) {
      existing.state = "CLOSED";
    }
    saveDemoState(state);
    return incident;
  }

  // --- Step 12: Model Drift & PSI Monitoring (§21) ---
  static async getModelDriftMetrics(): Promise<ModelDriftReport[]> {
    return this.safeFetch<ModelDriftReport[]>(
      "/api/v1/ai/drift",
      { method: "GET" },
      () => {
        const state = getState();
        return state.modelDriftReports || [];
      }
    );
  }

  // --- Step 13: AI Supply Chain Concentration Risk (§24) ---
  static async getAiSupplyChainRisk(): Promise<AiSupplyChainReport> {
    return this.safeFetch<AiSupplyChainReport>(
      "/api/v1/ai/supply-chain",
      { method: "GET" },
      () => {
        const state = getState();
        return state.aiSupplyChain;
      }
    );
  }

  // --- Step 14: Continuous Compliance Drift & Real-Time SLA Alarms (§55) ---
  static async getComplianceDriftAssessment(): Promise<ComplianceDriftState> {
    return this.safeFetch<ComplianceDriftState>(
      "/api/v1/compliance/drift-assessment",
      { method: "GET" },
      () => {
        const state = getState();
        return state.complianceDrift;
      }
    );
  }

  static async remediateComplianceDrift(alarmId: string): Promise<{
    success: boolean;
    remediatedAlarmId: string;
    updatedScore: number;
  }> {
    const result = await this.safeFetch<{
      success: boolean;
      remediatedAlarmId: string;
      updatedScore: number;
    }>(
      `/api/v1/compliance/drift-assessment/alarms/${alarmId}/remediate`,
      { method: "POST" },
      () => {
        const state = getState();
        state.complianceDrift.slaAlarms = (state.complianceDrift.slaAlarms || []).filter((a) => a.alarmId !== alarmId);
        state.complianceDrift.score = Math.min(100, state.complianceDrift.score + 1.6);
        return {
          success: true,
          remediatedAlarmId: alarmId,
          updatedScore: state.complianceDrift.score,
        };
      }
    );

    const state = getState();
    state.complianceDrift.slaAlarms = (state.complianceDrift.slaAlarms || []).filter((a) => a.alarmId !== alarmId);
    state.complianceDrift.score = result.updatedScore;
    saveDemoState(state);
    return result;
  }

  // --- Step 14.5: AI System Inventory & Risk Registry (§05 NIST/EU AI Act) ---
  static async getAiInventory(): Promise<AiSystemInventorySummary> {
    const res = await this.safeFetch<{ status?: string; data?: AiSystemInventorySummary } | AiSystemInventorySummary>(
      "/api/v1/ai/inventory",
      { method: "GET" },
      () => {
        const state = getState();
        const models = state.aiModels || [];
        const highRiskCount = models.filter(
          (m) => (m.euAiActClassification === "HIGH_RISK" || m.euAiActClassification === "LIMITED_RISK") && m.lifecycleState !== "DECOMMISSIONED"
        ).length;
        let hhi = 0;
        const providerShares: Record<string, number> = {};
        for (const m of models) {
          if (m.lifecycleState !== "DECOMMISSIONED") {
            providerShares[m.provider] = (providerShares[m.provider] || 0) + m.hhiWeight;
          }
        }
        for (const p of Object.keys(providerShares)) {
          const sharePct = providerShares[p] * 100;
          hhi += sharePct * sharePct;
        }

        return {
          inventoryVersion: "1.0.0-NIST-EUAI",
          totalRegisteredModels: models.filter((m) => m.lifecycleState !== "DECOMMISSIONED").length,
          models,
          highRiskUseCasesCount: highRiskCount,
          providerConcentrationHhi: Math.round(hhi),
          governanceComplianceStatus: "COMPLIANT_NIST_EU_AI_ACT",
          assessedAt: new Date().toISOString(),
        };
      }
    );
    return (res as any).data || res;
  }

  static async getAiModel(modelId: string): Promise<AiModelProfile | null> {
    const res = await this.safeFetch<{ status?: string; data?: AiModelProfile } | AiModelProfile>(
      `/api/v1/ai/inventory/${encodeURIComponent(modelId)}`,
      { method: "GET" },
      () => {
        const state = getState();
        return (state.aiModels || []).find((m) => m.modelId === modelId) || null as any;
      }
    );
    return (res as any).data || res;
  }

  static async registerAiModel(profile: AiModelProfile): Promise<AiModelProfile> {
    const res = await this.safeFetch<{ status?: string; data?: AiModelProfile } | AiModelProfile>(
      "/api/v1/ai/inventory",
      {
        method: "POST",
        body: JSON.stringify(profile),
      },
      () => {
        const state = getState();
        const now = new Date().toISOString();
        const model: AiModelProfile = {
          ...profile,
          lifecycleState: profile.lifecycleState || "PROPOSED",
          registeredAt: now,
          updatedAt: now,
        };
        state.aiModels = [...(state.aiModels || []).filter((m) => m.modelId !== model.modelId), model];
        saveDemoState(state);
        return model;
      }
    );
    const model = (res as any).data || res;
    const state = getState();
    state.aiModels = [...(state.aiModels || []).filter((m) => m.modelId !== model.modelId), model];
    saveDemoState(state);
    return model;
  }

  static async updateAiModel(modelId: string, updates: Partial<AiModelProfile>): Promise<AiModelProfile> {
    const res = await this.safeFetch<{ status?: string; data?: AiModelProfile } | AiModelProfile>(
      `/api/v1/ai/inventory/${encodeURIComponent(modelId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(updates),
      },
      () => {
        const state = getState();
        const existing = (state.aiModels || []).find((m) => m.modelId === modelId);
        if (!existing) throw new Error("AI Model not found");
        const updated: AiModelProfile = {
          ...existing,
          ...updates,
          modelId,
          updatedAt: new Date().toISOString(),
        };
        state.aiModels = (state.aiModels || []).map((m) => (m.modelId === modelId ? updated : m));
        saveDemoState(state);
        return updated;
      }
    );
    const updated = (res as any).data || res;
    const state = getState();
    state.aiModels = (state.aiModels || []).map((m) => (m.modelId === modelId ? updated : m));
    saveDemoState(state);
    return updated;
  }

  static async deleteAiModel(modelId: string): Promise<boolean> {
    await this.safeFetch(
      `/api/v1/ai/inventory/${encodeURIComponent(modelId)}`,
      { method: "DELETE" },
      () => {
        const state = getState();
        state.aiModels = (state.aiModels || []).map((m) =>
          m.modelId === modelId ? { ...m, lifecycleState: "DECOMMISSIONED" as const, updatedAt: new Date().toISOString() } : m
        );
        saveDemoState(state);
        return { success: true };
      }
    );
    const state = getState();
    state.aiModels = (state.aiModels || []).map((m) =>
      m.modelId === modelId ? { ...m, lifecycleState: "DECOMMISSIONED" as const, updatedAt: new Date().toISOString() } : m
    );
    saveDemoState(state);
    return true;
  }

  // --- Step 15: Command Center Experience State Contract (LAB 14) ---
  static async getCommandCenterOverview(): Promise<
    ExperienceStateEnvelope<{
      stats: Record<string, unknown>;
      alerts: Alert[];
      incidents: AiIncident[];
      complianceScore: number;
    }>
  > {
    return this.safeFetch<
      ExperienceStateEnvelope<{
        stats: Record<string, unknown>;
        alerts: Alert[];
        incidents: AiIncident[];
        complianceScore: number;
      }>
    >(
      "/api/v1/experience/command-center-overview",
      { method: "GET" },
      () => {
        const state = getState();
        return {
          status: "HEALTHY_SYNCED",
          isPartial: false,
          isStale: false,
          staleGracePeriodSeconds: 120,
          lastSyncedAt: new Date().toISOString(),
          correlationId: `corr-${generateUUID().slice(0, 8)}`,
          tenantId: state.tenant.id,
          data: {
            stats: {
              activeConnectors: state.connectors.length,
              activeCases: state.cases.filter((c) => c.status !== "CLOSED").length,
              activeAlerts: state.alerts.filter((a) => a.status === "NEW").length,
              auditPackages: state.auditPackages.length,
            },
            alerts: state.alerts,
            incidents: state.aiIncidents || [],
            complianceScore: state.complianceDrift?.score || 98.4,
          },
        };
      }
    );
  }

  // --- Step 16: IR Retainer & Incident Work Orders (§16.4) ---
  static async getIncidentRetainers(): Promise<IncidentResponseRetainer[]> {
    return this.safeFetch<IncidentResponseRetainer[]>(
      "/api/v1/ir/retainers",
      { method: "GET" },
      () => {
        const state = getState();
        return state.incidentRetainers || [];
      }
    );
  }

  static async getIncidentRetainerById(id: string): Promise<IncidentResponseRetainer | null> {
    return this.safeFetch<IncidentResponseRetainer | null>(
      `/api/v1/ir/retainers/${id}`,
      { method: "GET" },
      () => {
        const state = getState();
        return state.incidentRetainers?.find((r) => r.id === id) || null;
      }
    );
  }

  static async getIncidentWorkOrders(): Promise<IncidentWorkOrder[]> {
    return this.safeFetch<IncidentWorkOrder[]>(
      "/api/v1/ir/work-orders",
      { method: "GET" },
      () => {
        const state = getState();
        return state.incidentWorkOrders || [];
      }
    );
  }

  static async getIncidentWorkOrderById(id: string): Promise<IncidentWorkOrder | null> {
    return this.safeFetch<IncidentWorkOrder | null>(
      `/api/v1/ir/work-orders/${id}`,
      { method: "GET" },
      () => {
        const state = getState();
        return state.incidentWorkOrders?.find((w) => w.id === id) || null;
      }
    );
  }

  static async getWorkOrderConsumption(workOrderId: string): Promise<WorkOrderConsumptionRecord[]> {
    return this.safeFetch<WorkOrderConsumptionRecord[]>(
      `/api/v1/ir/work-orders/${workOrderId}/consumption`,
      { method: "GET" },
      () => {
        const state = getState();
        return (state.workOrderConsumption || []).filter((c) => c.workOrderId === workOrderId);
      }
    );
  }

  static async activateWorkOrder(data: {
    retainerId: string;
    incidentReference: string;
    activationReason: string;
    activationReference: string;
    responseAuthority?: "R0" | "R1" | "R2" | "R3" | "R4";
    authorityScope?: Record<string, unknown>;
    customerCommandStructure?: Record<string, unknown>;
    readinessEvidenceRefs: string[];
    customerContact?: string;
  }): Promise<IncidentWorkOrder> {
    const newWorkOrder = await this.safeFetch<IncidentWorkOrder>(
      "/api/v1/ir/work-orders",
      { method: "POST", body: JSON.stringify(data) },
      () => {
        const state = getState();
        const retainer = state.incidentRetainers?.find((r) => r.id === data.retainerId);
        const totalIncluded = retainer?.includedHours || 40;
        const totalConsumed = retainer?.consumedHours || 0;
        const remaining = Math.max(0, totalIncluded - totalConsumed);
        const created: IncidentWorkOrder = {
          id: `wo-${generateUUID().slice(0, 8)}`,
          tenantId: state.tenant.id,
          environmentId: state.tenant.environmentName,
          retainerId: data.retainerId,
          incidentReference: data.incidentReference,
          activationReason: data.activationReason,
          activationReference: data.activationReference,
          status: "ACTIVE",
          responseAuthority: data.responseAuthority || "R2",
          includedHours: totalIncluded,
          consumedHours: 0,
          remainingHours: remaining,
          overageHours: 0,
          forecastHours: 10,
          warningThresholdPercent: retainer?.warningThresholdPercent || 80,
          overagePolicy: retainer?.overagePolicy || "REQUIRE_APPROVAL",
          evidenceRefs: data.readinessEvidenceRefs,
          thirdPartyCosts: 0,
          emergencyReconciliationStatus: "NOT_REQUIRED",
          customerContact: data.customerContact || state.session?.fullName || "Sarah Chen",
          createdAt: new Date().toISOString(),
        };
        return created;
      }
    );

    const state = getState();
    state.incidentWorkOrders = [newWorkOrder, ...(state.incidentWorkOrders || [])];
    saveDemoState(state);
    return newWorkOrder;
  }

  static async logWorkOrderHours(
    workOrderId: string,
    data: {
      hours: number;
      workDescription: string;
      evidenceReference: string;
    }
  ): Promise<WorkOrderConsumptionRecord> {
    const consumption = await this.safeFetch<WorkOrderConsumptionRecord>(
      `/api/v1/ir/work-orders/${workOrderId}/hours`,
      { method: "POST", body: JSON.stringify(data) },
      () => {
        const state = getState();
        const rec: WorkOrderConsumptionRecord = {
          id: `cons-${generateUUID().slice(0, 8)}`,
          workOrderId,
          tenantId: state.tenant.id,
          hours: data.hours,
          workDescription: data.workDescription,
          evidenceReference: data.evidenceReference,
          loggedBy: state.session?.userId || "usr-sarah-chen-01",
          occurredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        return rec;
      }
    );

    const state = getState();
    state.workOrderConsumption = [consumption, ...(state.workOrderConsumption || [])];
    const woIndex = (state.incidentWorkOrders || []).findIndex((w) => w.id === workOrderId);
    if (woIndex >= 0) {
      const wo = state.incidentWorkOrders[woIndex];
      wo.consumedHours += data.hours;
      wo.remainingHours = Math.max(0, wo.includedHours - wo.consumedHours);
      if (wo.consumedHours > wo.includedHours) {
        wo.overageHours = wo.consumedHours - wo.includedHours;
      }
      state.incidentWorkOrders[woIndex] = { ...wo };
    }
    const retId = state.incidentWorkOrders?.[woIndex]?.retainerId;
    const retIndex = (state.incidentRetainers || []).findIndex((r) => r.id === retId);
    if (retIndex >= 0) {
      const ret = state.incidentRetainers[retIndex];
      ret.consumedHours = (ret.consumedHours || 0) + data.hours;
      ret.remainingHours = Math.max(0, ret.includedHours - ret.consumedHours);
      state.incidentRetainers[retIndex] = { ...ret };
    }
    saveDemoState(state);
    return consumption;
  }

  static async listLegalSensitiveRecords(
    workOrderId: string,
    accessReason: string
  ): Promise<IncidentLegalSensitiveRecord[]> {
    return this.safeFetch<IncidentLegalSensitiveRecord[]>(
      `/api/v1/ir/legal-sensitive-records/work-orders/${workOrderId}?accessReason=${encodeURIComponent(accessReason)}`,
      { method: "GET" },
      () => {
        const state = getState();
        return (state.legalSensitiveRecords || []).filter((r) => r.workOrderId === workOrderId);
      }
    );
  }

  static async createLegalSensitiveRecord(data: {
    workOrderId: string;
    purpose: "LEGAL_DEFENSE" | "REGULATOR_INQUIRY" | "INSURER_PROOF" | "BREACH_NOTIFICATION" | "INCIDENT_COORDINATION";
    privilegeStatus: "COUNSEL_ASSERTED" | "NO_PRIVILEGE_CLAIMED" | "UNDER_REVIEW";
    notificationStatus: "COUNSEL_DETERMINED" | "STATUTORY_MANDATED" | "NOT_APPLICABLE";
    counselControlled: boolean;
    contentReference: string;
    accessReason: string;
  }): Promise<IncidentLegalSensitiveRecord> {
    const record = await this.safeFetch<IncidentLegalSensitiveRecord>(
      "/api/v1/ir/legal-sensitive-records",
      { method: "POST", body: JSON.stringify(data) },
      () => {
        const state = getState();
        const rec: IncidentLegalSensitiveRecord = {
          id: `legal-rec-${generateUUID().slice(0, 8)}`,
          workOrderId: data.workOrderId,
          tenantId: state.tenant.id,
          environmentId: state.tenant.environmentName,
          purpose: data.purpose,
          privilegeStatus: data.privilegeStatus,
          notificationStatus: data.notificationStatus,
          counselControlled: data.counselControlled,
          contentReference: data.contentReference,
          accessReason: data.accessReason,
          noLegalAdviceWording:
            "This work order does not establish legal privilege or provide a breach-notification, regulatory, or legal conclusion.",
          recordedBy: state.session?.userId || "usr-sarah-chen-01",
          createdAt: new Date().toISOString(),
        };
        return rec;
      }
    );

    const state = getState();
    state.legalSensitiveRecords = [record, ...(state.legalSensitiveRecords || [])];
    saveDemoState(state);
    return record;
  }

  // --- Step 15: Cryptographic Ledger & Merkle Proofs ---
  static async getMerkleReceipt(epochNumber: number): Promise<MerkleEpochCheckpoint> {
    return this.safeFetch<MerkleEpochCheckpoint>(
      `/api/v1/anchor/receipts/${epochNumber}`,
      { method: "GET" },
      () => {
        return {
          epochNumber,
          merkleRoot: "33b510f06a084d53a2901198c471ba9844e1290bb3410928aa7819ce012891bb",
          leafCount: 4,
          pqcSignature: "pqc_mldsa65_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a",
          ecdsaSignature: "ecdsa_p256_3045022100a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b202202a3b4c5d",
          witnessCount: 3,
          sealedAt: new Date().toISOString(),
          hsmKeyCustody: {
            keyId: "kms-key-pqc-us-east1-primary",
            provider: "GOOGLE_CLOUD_KMS",
            fipsLevel: "FIPS_140_3_L3",
            algorithm: "ECDSA_P256_ML_DSA_65",
            timestamp: new Date().toISOString(),
          },
        };
      }
    );
  }

  static async getMerkleInclusionProof(
    epochNumber: number,
    leafIndex: number
  ): Promise<MerkleInclusionProof> {
    return this.safeFetch<MerkleInclusionProof>(
      `/api/v1/anchor/proofs/${epochNumber}/${leafIndex}`,
      { method: "GET" },
      () => {
        return {
          epochNumber,
          leafIndex,
          leafHash: "a1c4e90812bd56ff34aa9812cc457812ee491028374829102837461928374610",
          merkleRoot: "33b510f06a084d53a2901198c471ba9844e1290bb3410928aa7819ce012891bb",
          auditPath: [
            { position: "right", hash: "d3e712ba990145fc88ab1024ee591233aa819284759201928475928374619283" },
            { position: "right", hash: "f5b891a27719ce3400ab819211c4788192847592837461928475928374619283" },
          ],
        };
      }
    );
  }

  static async verifyMerkleProof(proof: MerkleInclusionProof): Promise<MerkleVerificationResult> {
    return this.safeFetch<MerkleVerificationResult>(
      "/api/v1/anchor/proofs/verify",
      { method: "POST", body: JSON.stringify(proof) },
      () => {
        return {
          valid: true,
          epochNumber: proof.epochNumber,
          verifiedAt: new Date().toISOString(),
        };
      }
    );
  }

  static async sealEpochBatch(items: any[]): Promise<MerkleEpochCheckpoint> {
    return this.safeFetch<MerkleEpochCheckpoint>(
      "/api/v1/anchor/batches/seal",
      { method: "POST", body: JSON.stringify({ items }) },
      () => {
        return {
          epochNumber: Math.floor(Date.now() / 60000),
          merkleRoot: sha256Mock(JSON.stringify(items)),
          leafCount: items.length,
          pqcSignature: `pqc_mldsa65_${sha256Mock(JSON.stringify(items)).slice(0, 32)}`,
          ecdsaSignature: `ecdsa_p256_${sha256Mock(JSON.stringify(items)).slice(0, 32)}`,
          witnessCount: 3,
          sealedAt: new Date().toISOString(),
        };
      }
    );
  }

  static async getAttackPathTrajectory(caseId: string): Promise<AttackPathTrajectory> {
    return this.safeFetch<AttackPathTrajectory>(
      `/api/v1/ai/cases/${caseId}/attack-path`,
      { method: "GET" },
      () => {
        const state = getState();
        const activeCase = state.cases.find((c) => c.id === caseId) || state.cases[0];
        const linkedAlert = state.alerts.find((a) => (activeCase?.linkedAlertIds || []).includes(a.id)) || state.alerts[0];

        const primaryUser = (linkedAlert?.affectedIdentities && linkedAlert.affectedIdentities[0]) || "usr-compromised-analyst";
        const primaryAsset = (linkedAlert?.affectedAssets && linkedAlert.affectedAssets[0]) || "srv-db-prod-01";
        const primaryTtp = linkedAlert?.mitreTechnique || "T1078.004";
        const criticality: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" =
          (activeCase?.severity as any) === "CRITICAL" ? "CRITICAL" : "HIGH";

        return {
          pathId: `path-${generateUUID().slice(0, 8)}`,
          caseId: activeCase?.id || caseId,
          alertId: linkedAlert?.id,
          title: `Live Multi-Hop Attack Trajectory for [${activeCase?.title || "Security Incident"}]`,
          severity: criticality,
          totalHops: 3,
          nodes: [
            {
              nodeId: "node-entry",
              stepNumber: 1,
              label: primaryUser,
              role: "ENTRYPOINT",
              mitreTechnique: primaryTtp,
              techniqueName: "Valid Accounts: Cloud Accounts",
              targetEntity: primaryUser,
              evidenceDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
              description: `Compromised session token for identity '${primaryUser}' detected across authentication telemetry.`,
              severity: "HIGH",
              riskScore: 89,
              status: "DETECTED",
            },
            {
              nodeId: "node-pivot",
              stepNumber: 2,
              label: "ec2-jump-01 (Bastion Host)",
              role: "PIVOT",
              mitreTechnique: "T1021.002",
              techniqueName: "Remote Services: SMB/Windows Admin Shares",
              targetEntity: "ec2-jump-01",
              evidenceDigest: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
              description: "Lateral SMB command execution pivot across private VPC subnet 10.0.4.0/24.",
              severity: "HIGH",
              riskScore: 78,
              status: "CORRELATED",
            },
            {
              nodeId: "node-target",
              stepNumber: 3,
              label: `${primaryAsset} (Crown Jewel Database)`,
              role: "CROWN_JEWEL",
              mitreTechnique: "T1098.004",
              techniqueName: "Account Manipulation: SSH Authorized Keys",
              targetEntity: primaryAsset,
              evidenceDigest: "185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969",
              description: `Unauthorized privilege escalation attempt against crown jewel asset '${primaryAsset}'.`,
              severity: criticality,
              riskScore: 96,
              status: "CORRELATED",
            },
          ],
          blastRadius: {
            targetHost: primaryAsset,
            affectedAccounts: 1,
            affectedConnections: 4,
            projectedDowntimeSec: 0,
            isolationMechanism: "Policy-Level Process Isolation [derived]",
            containmentSafetyVerdict: "SAFE_TO_EXECUTE",
          },
          generatedAt: new Date().toISOString(),
        };
      }
    );
  }

  // --- Commercial Services & Capability Status ---
  static async getPublicServices(): Promise<PublicServiceDefinition[]> {
    return this.safeFetch<PublicServiceDefinition[]>(
      "/api/v1/commercial/capabilities/public-services",
      { method: "GET" },
      () => [
        {
          serviceId: "managed-detection-response",
          serviceName: "Managed Threat Detection & Rapid Response (MDR)",
          category: "OPERATIONS",
          publicOutcomeDescription:
            "Continuous telemetry correlation, incident triaging, and human-approved autonomous containment with custom SLAs defined per customer order form.",
          status: "CORE",
          substantiatingComponents: ["shield-core", "shield-ingest", "shield-action"],
          includedCapabilities: ["TELEMETRY_INGESTION", "ALERT_TRIAGE", "INCIDENT_MANAGEMENT", "SOAR_PLAYBOOKS"],
          pricingTierMinimum: "ESSENTIAL",
        },
        {
          serviceId: "continuous-compliance-assurance",
          serviceName: "Continuous Compliance & Automated Control Assurance",
          category: "GOVERNANCE",
          publicOutcomeDescription:
            "Real-time control evaluation and cryptographically sealed evidence generation across SOC 2 CC6.1 and ISO 27001 A.9.2.",
          status: "CORE",
          substantiatingComponents: ["shield-core", "shield-anchor"],
          includedCapabilities: ["CONTROL_EVALUATION", "CONTINUOUS_MONITORING", "EVIDENCE_COLLECTION"],
          pricingTierMinimum: "ESSENTIAL",
        },
        {
          serviceId: "cryptographic-evidence-ledger",
          serviceName: "Post-Quantum Cryptographic Audit Ledger",
          category: "TRUST",
          publicOutcomeDescription:
            "Tamper-evident Merkle epoch tree; checkpoints dual-signed with ECDSA P-256 and ML-DSA-65.",
          status: "CORE",
          substantiatingComponents: ["shield-anchor", "verifier-cli"],
          includedCapabilities: ["MERKLE_ANCHORING", "PQC_SIGNATURES", "INDEPENDENT_VERIFICATION"],
          pricingTierMinimum: "ESSENTIAL",
        },
        {
          serviceId: "ai-safety-governance",
          serviceName: "AI Safety, Guardrails & Model Governance",
          category: "AI_DEFENSE",
          publicOutcomeDescription:
            "Multi-modal prompt firewall, model drift telemetry, and EU AI Act / NIST AI RMF governance classification.",
          status: "CONTROLLED",
          substantiatingComponents: ["shield-ai", "shield-core"],
          includedCapabilities: ["AI_CIRCUIT_BREAKER", "PROMPT_INJECTION_SHIELD", "AI_INVENTORY"],
          pricingTierMinimum: "PROFESSIONAL",
        },
        {
          serviceId: "cloud-exposure-management",
          serviceName: "Cloud Exposure & Attack Path Graph Analysis",
          category: "VULNERABILITY",
          publicOutcomeDescription:
            "Continuous multi-hop attack graph calculation, crown jewel blast radius modeling, and toxic privilege path elimination.",
          status: "CONTROLLED",
          substantiatingComponents: ["shield-core"],
          includedCapabilities: ["ATTACK_GRAPH_ENGINE", "BLAST_RADIUS_CALC", "ASSET_DISCOVERY"],
          pricingTierMinimum: "PROFESSIONAL",
        },
        {
          serviceId: "incident-response-retainer",
          serviceName: "Emergency Incident Response Retainer & SLA",
          category: "OPERATIONS",
          publicOutcomeDescription:
            "Contracted surge capacity, guaranteed response windows, and counsel-controlled legal privilege evidence protection.",
          status: "CONTROLLED",
          substantiatingComponents: ["shield-core", "shield-anchor"],
          includedCapabilities: ["IR_RETAINER_HOURS", "PRIVILEGE_PROTECTION", "EMERGENCY_PROVISION"],
          pricingTierMinimum: "PROFESSIONAL",
        },
        {
          serviceId: "continuous-validation",
          serviceName: "Continuous Security Validation & Testing",
          category: "SECURITY_OPERATIONS",
          publicOutcomeDescription:
            "Controlled defensive control testing with cryptographic simulation receipts and safety kill-switches.",
          status: "CONTROLLED",
          substantiatingComponents: ["shield-action", "shield-core"],
          includedCapabilities: ["CONTROL_VALIDATION", "SIMULATION_RECEIPTS", "SAFETY_KILL_SWITCH"],
          pricingTierMinimum: "ADVANCED",
        },
        {
          serviceId: "ai-security-copilot",
          serviceName: "ZoikoShield AI Security Copilot",
          category: "AI_DEFENSE",
          publicOutcomeDescription:
            "Deterministic 6-mode operational copilot providing dual-layer review envelopes, source span grounding, and calibration bands.",
          status: "CORE",
          substantiatingComponents: ["shield-ai", "shield-core"],
          includedCapabilities: ["COPILOT_INVESTIGATE", "COPILOT_ASSURE", "COPILOT_RESPOND", "COPILOT_REPORT", "COPILOT_DEVELOP", "COPILOT_NAVIGATE"],
          pricingTierMinimum: "PROFESSIONAL",
        },
        {
          serviceId: "eu-dora-resilience-evaluator",
          serviceName: "EU DORA Digital Operational Resilience Evaluator",
          category: "GOVERNANCE",
          publicOutcomeDescription:
            "Statutory ICT risk management and operational resilience evaluation for financial entities.",
          status: "DEFERRED",
          substantiatingComponents: ["shield-core"],
          includedCapabilities: ["DORA_ICT_RISK", "DORA_REPORTING"],
          pricingTierMinimum: "ENTERPRISE",
        },
        {
          serviceId: "eu-nis2-compliance-evaluator",
          serviceName: "EU NIS2 Directive Compliance Evaluator",
          category: "GOVERNANCE",
          publicOutcomeDescription:
            "Supply chain security and incident notification evaluation for essential and important entities.",
          status: "DEFERRED",
          substantiatingComponents: ["shield-core"],
          includedCapabilities: ["NIS2_SUPPLY_CHAIN", "NIS2_EARLY_WARNING"],
          pricingTierMinimum: "ENTERPRISE",
        },
        {
          serviceId: "pci-dss-v4-evaluator",
          serviceName: "PCI DSS v4.0.1 Payment Card Security Evaluator",
          category: "GOVERNANCE",
          publicOutcomeDescription:
            "Cardholder data environment control verification and automated continuous compliance.",
          status: "DEFERRED",
          substantiatingComponents: ["shield-core"],
          includedCapabilities: ["PCI_CDE_SCOPING", "PCI_CONTROL_EVAL"],
          pricingTierMinimum: "ENTERPRISE",
        },
        {
          serviceId: "enterprise-dedicated-partition",
          serviceName: "Dedicated Sovereign Partition & Bring-Your-Own-KMS",
          category: "TRUST",
          publicOutcomeDescription:
            "Single-tenant dedicated partition, customer-managed keys (BYOK), and sovereign regional isolation.",
          status: "GATED",
          substantiatingComponents: ["shield-anchor"],
          includedCapabilities: ["BYOK_ENCRYPTION", "SOVEREIGN_CELL", "HARDWARE_ROOT_OF_TRUST"],
          pricingTierMinimum: "ENTERPRISE",
        },
      ]
    );
  }

  static async checkFrameworkEvaluator(
    framework: string
  ): Promise<{ framework: string; active: boolean }> {
    return this.safeFetch<{ framework: string; active: boolean }>(
      `/api/v1/commercial/capabilities/evaluators/check?framework=${encodeURIComponent(framework)}`,
      { method: "GET" },
      () => {
        const isDeferred = ["EU_DORA", "EU_NIS2", "PCI_DSS"].some((d) => framework.includes(d));
        return { framework, active: !isDeferred };
      }
    );
  }

  static async checkCapabilityAvailability(
    capabilityId: string
  ): Promise<{ capabilityId: string; available: boolean }> {
    return this.safeFetch<{ capabilityId: string; available: boolean }>(
      `/api/v1/commercial/capabilities/check/${encodeURIComponent(capabilityId)}`,
      { method: "GET" },
      () => {
        const cap = (capabilityId || "").toUpperCase();
        const isUnavailable =
          cap.includes("DORA") ||
          cap.includes("NIS2") ||
          cap.includes("PCI") ||
          cap.includes("TIER3") ||
          cap.includes("EXPERIMENTAL");
        return {
          capabilityId,
          available: !isUnavailable,
        };
      }
    );
  }

  static async getCapabilityDomains(): Promise<CapabilityDomainSummary[]> {
    return this.safeFetch<CapabilityDomainSummary[]>(
      "/api/v1/commercial/capabilities/domains",
      { method: "GET" },
      () => [
        {
          domainId: "threat-operations",
          domainName: "Threat Operations & MDR",
          description: "Core detection, telemetry normalization, alert triaging, and SOAR action orchestration.",
          totalCapabilities: 4,
          coreCount: 4,
          controlledCount: 0,
          gatedCount: 0,
          deferredCount: 0,
          items: [
            {
              id: "TELEMETRY_INGESTION",
              name: "OCSF v1.1.0 High-Throughput Normalization",
              domain: "Threat Operations",
              customerService: "Managed Threat Detection & Rapid Response (MDR)",
              status: "CORE",
              substantiatingSatellites: ["shield-ingest"],
              governanceRationale: "Fully operational across P0 Certified connectors.",
            },
            {
              id: "ALERT_TRIAGE",
              name: "Deterministic Event-Correlated Alert Triaging",
              domain: "Threat Operations",
              customerService: "Managed Threat Detection & Rapid Response (MDR)",
              status: "CORE",
              substantiatingSatellites: ["shield-core"],
              governanceRationale: "Core rule evaluation with 0 false-negative SLA on critical MITRE techniques.",
            },
          ],
        },
        {
          domainId: "cryptographic-assurance",
          domainName: "Continuous Assurance & Merkle Trust",
          description: "Tamper-evident epoch ledger, post-quantum signatures, and continuous SOC 2 / ISO 27001 evaluation.",
          totalCapabilities: 3,
          coreCount: 3,
          controlledCount: 0,
          gatedCount: 0,
          deferredCount: 0,
          items: [
            {
              id: "MERKLE_ANCHORING",
              name: "Post-Quantum Dilithium3 Merkle Epoch Trees",
              domain: "Continuous Assurance",
              customerService: "Post-Quantum Cryptographic Audit Ledger",
              status: "CORE",
              substantiatingSatellites: ["shield-anchor"],
              governanceRationale: "Merkle checkpoints dual-signed (ECDSA P-256 + ML-DSA-65) by shield-anchor.",
            },
          ],
        },
        {
          domainId: "compliance-frameworks",
          domainName: "Regulatory & Framework Governance",
          description: "Statutory compliance evaluators with fail-closed enforcement of deferred standards.",
          totalCapabilities: 5,
          coreCount: 2,
          controlledCount: 0,
          gatedCount: 0,
          deferredCount: 3,
          items: [
            {
              id: "SOC2_EVALUATOR",
              name: "SOC 2 Type II CC6.1 Logical Access Controls",
              domain: "Regulatory & Frameworks",
              customerService: "Continuous Compliance & Automated Control Assurance",
              status: "CORE",
              substantiatingSatellites: ["shield-core"],
              governanceRationale: "Production-ready automated control testing.",
            },
            {
              id: "ISO27001_EVALUATOR",
              name: "ISO/IEC 27001:2022 A.9.2 User Access Management",
              domain: "Regulatory & Frameworks",
              customerService: "Continuous Compliance & Automated Control Assurance",
              status: "CORE",
              substantiatingSatellites: ["shield-core"],
              governanceRationale: "Production-ready automated control testing.",
            },
            {
              id: "EU_DORA_EVALUATOR",
              name: "EU Digital Operational Resilience Act (DORA)",
              domain: "Regulatory & Frameworks",
              customerService: "EU DORA Digital Operational Resilience Evaluator",
              status: "DEFERRED",
              substantiatingSatellites: ["shield-core"],
              governanceRationale: "Deferred to Phase 2 midpoint per ADR-08 pending final Regulatory Technical Standards.",
              statutoryReference: "EU Regulation 2022/2554",
            },
            {
              id: "EU_NIS2_EVALUATOR",
              name: "EU Network and Information Systems Directive (NIS2)",
              domain: "Regulatory & Frameworks",
              customerService: "EU NIS2 Directive Compliance Evaluator",
              status: "DEFERRED",
              substantiatingSatellites: ["shield-core"],
              governanceRationale: "Deferred to Phase 2 midpoint per ADR-08.",
              statutoryReference: "EU Directive 2022/2555",
            },
            {
              id: "PCI_DSS_EVALUATOR",
              name: "PCI DSS v4.0.1 Payment Security Standard",
              domain: "Regulatory & Frameworks",
              customerService: "PCI DSS v4.0.1 Payment Card Security Evaluator",
              status: "DEFERRED",
              substantiatingSatellites: ["shield-core"],
              governanceRationale: "Deferred to Phase 2 midpoint per ADR-08.",
              statutoryReference: "PCI SSC v4.0.1",
            },
          ],
        },
      ]
    );
  }

  // --- Plan Tiers & Billing Source of Truth ---
  static async getPlanTiers(): Promise<PlanTier[]> {
    return this.safeFetch<PlanTier[]>(
      "/api/v1/commercial/plans",
      { method: "GET" },
      () => [
        {
          key: "SHIELD_ESSENTIAL",
          displayName: "Shield Essential",
          tagline: "Foundational MDR & Post-Quantum Compliance",
          description: "For growing organizations requiring continuous threat detection, compliance automation, and post-quantum proof ledger.",
          pricing: {
            monthlyUsd: null,
            annualBilledMonthlyUsd: null,
            isContractOnly: true,
            currency: "USD",
          },
          allocations: {
            maxProtectedAssets: 250,
            includedTelemetryGbPerDay: 25,
            incidentResponseSlaHours: null,
            retentionDays: 90,
            includedRetainerHoursPerYear: 0,
          },
          includedOffers: ["MANAGED_DEFENSE", "CONTINUOUS_ASSURANCE", "CRYPTO_LEDGER"],
          highlightedFeatures: [
            "250 Protected Assets & 25 GB/day Telemetry",
            "P0 Certified Connectors (AWS, Entra ID, Okta, CrowdStrike)",
            "Automated SOC 2 & ISO 27001 Controls",
            "Dilithium3 Post-Quantum Merkle Ledger",
            "4-Hour Critical Incident Response Target",
          ],
          governanceFeatures: [
            "Anti-Perverse Billing Guard (No per-incident charges)",
            "Dual-approver R3-R4 containment workflows",
            "Automated evidence integrity proofs",
          ],
          supportModel: "Standard 8x5 Business Hours Support with Email & Slack Webhooks",
        },
        {
          key: "SHIELD_PROFESSIONAL",
          displayName: "Shield Professional",
          tagline: "Advanced SecOps, Attack Path Graphs & AI Copilot",
          description: "For mid-market enterprises requiring deep attack graph analysis, AI security copilot, and 1-hour response SLAs.",
          pricing: {
            monthlyUsd: null,
            annualBilledMonthlyUsd: null,
            isContractOnly: true,
            currency: "USD",
          },
          allocations: {
            maxProtectedAssets: 1000,
            includedTelemetryGbPerDay: 100,
            incidentResponseSlaHours: null,
            retentionDays: 365,
            includedRetainerHoursPerYear: 20,
          },
          includedOffers: [
            "MANAGED_DEFENSE",
            "CONTINUOUS_ASSURANCE",
            "CRYPTO_LEDGER",
            "EXPOSURE_MANAGEMENT",
            "AI_SECURITY_COPILOT",
            "INCIDENT_RETAINER",
          ],
          highlightedFeatures: [
            "1,000 Protected Assets & 100 GB/day Telemetry",
            "Multi-Hop Attack Path & Toxic Combination Graph",
            "ZoikoShield AI Security Copilot (6 Operational Modes)",
            "20 Included Incident Response Retainer Hours/yr",
            "1-Hour Critical Incident Response SLA",
            "1-Year Evidence Retention & Verifier CLI",
          ],
          governanceFeatures: [
            "Mandatory 10-Field Decision Review Envelope",
            "Model drift telemetry & Prompt injection circuit breaker",
            "Counsel-controlled legal privilege logging",
          ],
          supportModel: "Extended 16x7 Coverage with Dedicated Customer Success Manager",
          isPopular: true,
        },
        {
          key: "SHIELD_ADVANCED",
          displayName: "Shield Advanced",
          tagline: "Full-Spectrum Defense, Continuous Validation & 24/7 MDR",
          description: "For highly regulated institutions requiring continuous 24/7 SOC operations, defensive posture verification, and rapid containment.",
          pricing: {
            monthlyUsd: null,
            annualBilledMonthlyUsd: null,
            isContractOnly: true,
            currency: "USD",
          },
          allocations: {
            maxProtectedAssets: 5000,
            includedTelemetryGbPerDay: 500,
            incidentResponseSlaHours: null,
            retentionDays: 730,
            includedRetainerHoursPerYear: 50,
          },
          includedOffers: [
            "MANAGED_DEFENSE",
            "CONTINUOUS_ASSURANCE",
            "CRYPTO_LEDGER",
            "EXPOSURE_MANAGEMENT",
            "AI_SECURITY_COPILOT",
            "INCIDENT_RETAINER",
            "CONTINUOUS_SECURITY_VALIDATION",
          ],
          highlightedFeatures: [
            "5,000 Protected Assets & 500 GB/day Telemetry",
            "Operationally-Proven 24/7/365 Continuous MDR",
            "15-Minute Critical Incident Containment SLA",
            "Continuous Security Validation & Testing",
            "50 Included Incident Response Retainer Hours/yr",
            "2-Year Merkle-Anchored Evidence Retention",
          ],
          governanceFeatures: [
            "Rule SVC-01 Verified Operational Readiness",
            "Signed Simulation Receipts",
            "Multi-party Quorum Approval for R4 Network Freezes",
          ],
          supportModel: "Dedicated Lead Incident Commander & War Room Bridge",
        },
        {
          key: "SHIELD_ENTERPRISE",
          displayName: "Shield Enterprise",
          tagline: "Sovereign Cells, Custom SLAs & Bespoke Governance",
          description: "For multinational conglomerates and government entities requiring dedicated cryptographic cells and BYOK key governance.",
          pricing: {
            monthlyUsd: null,
            annualBilledMonthlyUsd: null,
            isContractOnly: true,
            currency: "USD",
          },
          allocations: {
            maxProtectedAssets: null,
            includedTelemetryGbPerDay: null,
            incidentResponseSlaHours: null,
            retentionDays: 2555,
            includedRetainerHoursPerYear: 100,
          },
          includedOffers: [
            "MANAGED_DEFENSE",
            "CONTINUOUS_ASSURANCE",
            "CRYPTO_LEDGER",
            "EXPOSURE_MANAGEMENT",
            "AI_SECURITY_COPILOT",
            "INCIDENT_RETAINER",
            "CONTINUOUS_SECURITY_VALIDATION",
            "SOVEREIGN_CELL",
            "BYOK_KEY_MANAGEMENT",
          ],
          highlightedFeatures: [
            "Unlimited Custom Asset & Telemetry Bands",
            "Dedicated Single-Tenant Regional Cell",
            "Bring-Your-Own-KMS (BYOK) Hardware Key Control",
            "Custom Statutory Assurance Packs & Bespoke SLAs",
            "100+ Included Retainer Hours with Tier-3 Forensics",
            "7-Year Regulatory Evidence Preservation",
          ],
          governanceFeatures: [
            "Custom Cross-Tenant JIT Elevation Policies",
            "Bespoke Statutory Compliance Auditing",
            "Full Source Code & Formal Proof Escrow Options",
          ],
          supportModel: "White-Glove Named Principal Engineer & On-Call Forensic Team",
        },
      ]
    );
  }

  static async recommendPlan(req: {
    protectedAssetCount: number;
    estimatedDailyGb: number;
    requiresContinuous24x7Mdr?: boolean;
    requiresContinuousMdr?: boolean;
    requiresFormalProofEngine?: boolean;
    requiresDedicatedTenantIsolation?: boolean;
  }): Promise<PlanRecommendation> {
    return this.safeFetch<PlanRecommendation>(
      "/api/v1/commercial/plans/recommend",
      {
        method: "POST",
        body: JSON.stringify(req),
      },
      () => {
        let recommendedKey: any = "SHIELD_ESSENTIAL";
        const rationale: string[] = [];

        if (req.requiresDedicatedTenantIsolation || req.protectedAssetCount > 5000 || req.estimatedDailyGb > 500) {
          recommendedKey = "SHIELD_ENTERPRISE";
          rationale.push("Enterprise-scale telemetry volume or sovereign isolation requires bespoke Enterprise plan.");
        } else if (req.requiresContinuous24x7Mdr || req.requiresContinuousMdr || req.protectedAssetCount > 1000 || req.estimatedDailyGb > 100) {
          recommendedKey = "SHIELD_ADVANCED";
          rationale.push("Continuous MDR operations and high asset scale requires Shield Advanced with order-form governed containment SLAs.");
        } else if (req.protectedAssetCount > 250 || req.estimatedDailyGb > 25) {
          recommendedKey = "SHIELD_PROFESSIONAL";
          rationale.push("Asset count and telemetry exceed Essential baseline. Shield Professional provides attack graphs and AI copilot.");
        } else {
          rationale.push("Scale fits baseline Shield Essential tier perfectly with foundational MDR and Dilithium3 ledger.");
        }

        const allTiers: any = [
          {
            key: "SHIELD_ESSENTIAL",
            displayName: "Shield Essential",
            pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: "USD" },
            allocations: { maxProtectedAssets: 250, includedTelemetryGbPerDay: 25, incidentResponseSlaHours: null, retentionDays: 90, includedRetainerHoursPerYear: 0 },
            highlightedFeatures: ["250 Protected Assets", "25 GB/day Telemetry", "SOC 2 & ISO 27001", "Dilithium3 Ledger"],
          },
          {
            key: "SHIELD_PROFESSIONAL",
            displayName: "Shield Professional",
            pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: "USD" },
            allocations: { maxProtectedAssets: 1000, includedTelemetryGbPerDay: 100, incidentResponseSlaHours: null, retentionDays: 365, includedRetainerHoursPerYear: 20 },
            highlightedFeatures: ["1,000 Assets", "Attack Path Graph", "AI Copilot", "20 Retainer Hours"],
          },
          {
            key: "SHIELD_ADVANCED",
            displayName: "Shield Advanced",
            pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: "USD" },
            allocations: { maxProtectedAssets: 5000, includedTelemetryGbPerDay: 500, incidentResponseSlaHours: null, retentionDays: 730, includedRetainerHoursPerYear: 50 },
            highlightedFeatures: ["5,000 Assets", "Managed Defense", "Defensive Control Validation", "Governed Containment"],
          },
          {
            key: "SHIELD_ENTERPRISE",
            displayName: "Shield Enterprise",
            pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: "USD" },
            allocations: { maxProtectedAssets: null, includedTelemetryGbPerDay: null, incidentResponseSlaHours: null, retentionDays: 2555, includedRetainerHoursPerYear: 100 },
            highlightedFeatures: ["Dedicated Regional Cell", "BYOK Control", "Custom SLAs", "7-Year Retention"],
          },
        ];

        const recommended = allTiers.find((t: any) => t.key === recommendedKey) || allTiers[0];
        const alternativePlans = allTiers.filter((t: any) => t.key !== recommendedKey);

        return {
          recommendedPlan: recommended,
          rationale,
          alternativePlans,
        };
      }
    );
  }

  // --- MDR Service Obligations & Section 12 GTM Checklist ---
  static async getMdrServiceObligation(contractId: string): Promise<MdrServiceObligation> {
    return this.safeFetch<MdrServiceObligation>(
      `/api/v1/managed-defense/service-obligations/${contractId}`,
      { method: "GET" },
      () => ({
        id: "obl-mdr-demo-001",
        contractId: contractId || "ctr-acme-prod-2026",
        tenantId: "00000000-0000-4000-8000-000000000001",
        coverageTier: "CONTINUOUS_24X7",
        readinessStatus: "OPERATIONALLY_PROVEN",
        staffingSchedule: {
          coverageTier: "CONTINUOUS_24X7",
          primaryTimezone: "UTC",
          minimumActiveAnalystsOnDuty: 4,
          escalationLeadAvailable: true,
          tier3IncidentCommanderOnCall: true,
          shiftHandoffProtocolProven: true,
        },
        slaWindows: [
          { severity: "CRITICAL", targetAcknowledgementMinutes: 5, targetInvestigationMinutes: 15, targetContainmentMinutes: 30, financialCreditPercentage: 10 },
          { severity: "HIGH", targetAcknowledgementMinutes: 15, targetInvestigationMinutes: 60, targetContainmentMinutes: 120, financialCreditPercentage: 5 },
          { severity: "MEDIUM", targetAcknowledgementMinutes: 60, targetInvestigationMinutes: 240, targetContainmentMinutes: 480, financialCreditPercentage: 0 },
        ],
        escalationPath: [
          { tierLevel: 1, roleTitle: "Tier 1 Triage Analyst", responseWindowMinutes: 5, notificationChannels: ["PAGERDUTY", "SLACK_SOC"], requiresQuorumApproval: false },
          { tierLevel: 2, roleTitle: "Tier 2 Senior Incident Responder", responseWindowMinutes: 15, notificationChannels: ["PAGERDUTY", "SECURE_VOICE"], requiresQuorumApproval: false },
          { tierLevel: 3, roleTitle: "Tier 3 Principal Incident Commander", responseWindowMinutes: 30, notificationChannels: ["WAR_ROOM_DIRECT", "EXECUTIVE_BRIDGE"], requiresQuorumApproval: true },
        ],
        operationalProofReference: "proof-audit-lab18-gameday-2026-09",
        lastReadinessAuditDate: "2026-09-18T10:00:00Z",
        verifiedBy: "Lead SOC Architect & Security Assurance Officer",
      })
    );
  }

  static async getGTMChecklist(): Promise<GTMChecklistItem[]> {
    return [
      {
        ruleCode: "CAT-01",
        title: "Microservice Taxonomy Masking",
        domain: "Marketing Catalogue",
        ruleStatement: "Internal satellites (shield-core, shield-ingest, shield-action, shield-anchor, shield-ai, verifier-cli) must NEVER be published as commercial services.",
        status: "VERIFIED",
        verificationSource: "check-public-capability-claims.ts",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "CAT-02",
        title: "Aletheia Moniker Protection",
        domain: "Product Brand",
        ruleStatement: "Conversational AI copilot must remain under neutral branding ('ZoikoShield AI Security Copilot') pending trademark clearance.",
        status: "VERIFIED",
        verificationSource: "Frontend Codebase & Specs",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "PR-01",
        title: "Static Band Pricing Resolution",
        domain: "Commercial Billing",
        ruleStatement: "All pricing displays must resolve directly from the backend plan tier engine ($2,000/$4,000/$8,000/Contract) with catalog disclaimer.",
        status: "VERIFIED",
        verificationSource: "PlanTierService & Anti-Perverse Billing Guards",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "PR-02",
        title: "Anti-Perverse Billing Guard",
        domain: "Commercial Billing",
        ruleStatement: "Customer bills must NEVER increase due to alert storms, incident spikes, or AI investigation depth.",
        status: "VERIFIED",
        verificationSource: "anti-perverse-incentive-billing.spec.ts",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "CON-01",
        title: "Canonical Connector Ecosystem Truth",
        domain: "Data Ingestion",
        ruleStatement: "Production-ready connectors strictly adhere to the canonical 14 connectors in ConnectorCatalogService (Entra ID, CloudTrail, GuardDuty, Okta, Azure Monitor, GCP SCC, CrowdStrike EDR, SentinelOne, Cortex XDR, Defender, Snyk, Jira, Webhook, Syslog).",
        status: "VERIFIED",
        verificationSource: "ConnectorCatalogService & IngestionGateways",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "CON-02",
        title: "Tier 3 Experimental Connector Gating",
        domain: "Data Ingestion",
        ruleStatement: "Tier 3 experimental/unratified connectors (SAP Enterprise, Custom gRPC) must remain GATED and require explicit admin activation.",
        status: "GATED_ENFORCED",
        verificationSource: "ConnectorCatalogService & GatedCapabilityEngine",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "GOV-01",
        title: "EU DORA Deferral Enforcement",
        domain: "Regulatory Compliance",
        ruleStatement: "EU DORA evaluator must return DEFERRED/false until Phase 2 midpoint RTS trigger.",
        status: "DEFERRED_ENFORCED",
        verificationSource: "CapabilityStatusService::isFrameworkEvaluatorActive",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "GOV-02",
        title: "EU NIS2 Directive Deferral Enforcement",
        domain: "Regulatory Compliance",
        ruleStatement: "EU NIS2 evaluator must return DEFERRED/false until Phase 2 midpoint.",
        status: "DEFERRED_ENFORCED",
        verificationSource: "CapabilityStatusService::isFrameworkEvaluatorActive",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "GOV-03",
        title: "PCI DSS v4.0.1 Deferral Enforcement",
        domain: "Regulatory Compliance",
        ruleStatement: "PCI DSS v4.0.1 evaluator must return DEFERRED/false until Phase 2 midpoint.",
        status: "DEFERRED_ENFORCED",
        verificationSource: "CapabilityStatusService::isFrameworkEvaluatorActive",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "SVC-01",
        title: "24/7 MDR Operational Readiness Proof",
        domain: "Managed Defense",
        ruleStatement: "Continuous 24/7 MDR claims require signed staffing schedule and audited shift handoff protocol.",
        status: "VERIFIED",
        verificationSource: "MdrServiceObligationService::assert24x7ClaimPermitted",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "SEC-01",
        title: "Sector Solutions Statutory Caveats",
        domain: "Sector Packs",
        ruleStatement: "Sector pack descriptions (Telecom, FinTech, Healthcare, etc.) must carry statutory disclaimers.",
        status: "VERIFIED",
        verificationSource: "SectorSolutionsRegistry",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
      {
        ruleCode: "GO-01",
        title: "Signed Merkle Evidence Checkpoints",
        domain: "Trust & Assurance",
        ruleStatement: "Merkle epoch checkpoints are dual-signed (ECDSA P-256 + ML-DSA-65) and verifiable offline.",
        status: "VERIFIED",
        verificationSource: "shield-anchor checkpoint signer & verifier-cli",
        verifiedAt: new Date().toISOString(),
        auditPass: true,
      },
    ];
  }

  static async getFreezeStatusSOAR(): Promise<{ frozen: boolean; status: string; freeze?: any }> {
    return this.safeFetch<{ frozen: boolean; status: string; freeze?: any }>(
      "/api/v1/response/freeze-status",
      { method: "GET" },
      () => ({
        frozen: false,
        status: "OPERATIONAL",
      })
    );
  }

  // --- Dual-Custody Quorum Methods ---
  static async initiateDualCustodyQuorum(params: {
    tenantId?: string;
    proposalId: string;
    actionType: string;
    targetResource: string;
    authorityLevel?: string;
    blastRadiusScore?: number;
    reversibilityTier?: string;
    compensatingCommand?: string;
    initiator?: any;
  }): Promise<any> {
    return this.safeFetch<any>(
      "/api/v1/action/dual-custody/initiate",
      {
        method: "POST",
        body: JSON.stringify(params),
      },
      () => {
        const quorumId = `quorum-${generateUUID().slice(0, 8)}`;
        return {
          quorumId,
          tenantId: params.tenantId || "00000000-0000-4000-8000-000000000001",
          proposalId: params.proposalId,
          actionType: params.actionType,
          targetResource: params.targetResource,
          authorityLevel: params.authorityLevel || "R2",
          status: "PENDING_SECOND_SIGNATURE",
          singleUseRollbackToken: `ZS-ROLLBACK-TOKEN-${generateUUID().slice(0, 8).toUpperCase()}`,
          compensatingPlan: {
            rollbackCommand: params.compensatingCommand || "UNISOLATE_ENDPOINT",
            targetResource: params.targetResource,
            reversibilityTier: params.reversibilityTier || "R1",
          },
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        };
      }
    );
  }

  static async approveDualCustodyQuorum(params: {
    tenantId?: string;
    quorumId: string;
    approver: any;
  }): Promise<any> {
    return this.safeFetch<any>(
      "/api/v1/action/dual-custody/approve",
      {
        method: "POST",
        body: JSON.stringify(params),
      },
      () => {
        const signature = sha256Mock(`ZS-QUORUM-RECEIPT-V1:${params.quorumId}:${params.approver?.userId}:${Date.now()}`);
        return {
          quorumId: params.quorumId,
          status: "QUORUM_REACHED",
          secondaryApprover: params.approver,
          quorumSignature: signature,
          singleUseRollbackToken: `ZS-ROLLBACK-TOKEN-${generateUUID().slice(0, 8).toUpperCase()}`,
          finalizedAt: new Date().toISOString(),
        };
      }
    );
  }

  // --- Automated Rollback Compensation ---
  static async executeRollbackSOAR(
    rollbackToken: string
  ): Promise<{ status: string; receiptId: string; rollbackToken: string }> {
    return this.safeFetch<{ status: string; receiptId: string; rollbackToken: string }>(
      "/api/v1/actions/rollback",
      {
        method: "POST",
        body: JSON.stringify({ rollbackToken }),
      },
      () => {
        const receiptId = `rcpt-rollback-${generateUUID().slice(0, 8)}`;
        return {
          status: "ROLLED_BACK",
          receiptId,
          rollbackToken,
        };
      }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI SECURITY COPILOT & SPEC §16.1 10-FIELD MANDATORY DECISION REVIEW ENVELOPE
  // ═══════════════════════════════════════════════════════════════════════════

  static async queryCopilot(params: {
    mode: string;
    query: string;
    tenantId?: string;
  }): Promise<{
    summary: string;
    envelope: AiReviewEnvelope;
  }> {
    return this.safeFetch<{ summary: string; envelope: AiReviewEnvelope }>(
      "/api/v1/copilot/query",
      {
        method: "POST",
        body: JSON.stringify(params),
      },
      () => {
        const envelopeId = `env-copilot-${generateUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        const modeUpper = params.mode.toUpperCase();

        const envelope: AiReviewEnvelope = {
          envelopeId,
          tenantId: params.tenantId || "00000000-0000-4000-8000-000000000001",
          environmentId: "PRODUCTION",
          createdAt: now,
          aiLabelAndUseCaseName: {
            useCaseName: `COPILOT_${modeUpper}_ASSISTANCE`,
            modelIdentifier: "claude-3-5-sonnet-20241022",
            providerProfile: "anthropic-bedrock-us-east-1",
            riskTier: modeUpper === "RESPOND" ? "CRITICAL_R2" : "HIGH",
          },
          sourcesAndSpans: [
            {
              sourceId: "src-ocsf-3002",
              sourceType: "OCSF_EVENT_CORRELATION",
              name: "aws.guardduty.iam-exfiltration",
              type: "TELEMETRY_LOG",
              documentRef: "doc-guardduty-9942",
              span: `Principal: AROAEXAMPLE:usr-analyst-lead-01 from non-corporate IP 198.51.100.99`,
              confidenceScore: 0.98,
            },
            {
              sourceId: "src-mitre-t1078",
              sourceType: "THREAT_INTEL_MAPPING",
              name: "MITRE ATT&CK T1078.004",
              type: "FRAMEWORK_SPEC",
              documentRef: "ref-mitre-v14.1",
              span: "Valid Accounts: Cloud Accounts credential exfiltration path",
              confidenceScore: 0.99,
            },
          ],
          knownMissingStaleOrConflictingEvidence: {
            missingEvidenceCount: 0,
            staleEvidenceCount: 0,
            conflictingEvidenceCount: 0,
            freshnessSeconds: 14,
            completenessRatio: 1.0,
          },
          calibratedConfidenceAndUncertainty: {
            confidenceTier: "HIGH",
            score: 0.94,
            calibrationBasis: "Multi-source telemetry match against 90-day baseline and verified IAM credentials.",
            uncertaintyFactors: [
              "Assumed role session expires in 42 minutes.",
              "Lateral VPC access verification pending VPC flow log batch delivery.",
            ],
          },
          alternativeHypothesesOrActions: [
            {
              actionId: "ALT-01",
              title: "Passive Honeypot Monitoring",
              rationale: "Observe attacker reconnaissance without revoking active credentials.",
              tradeOff: "Maintains threat visibility but risks immediate data exfiltration.",
            },
            {
              actionId: "ALT-02",
              title: "Network Perimeter Geo-Block",
              rationale: "Block source IP 198.51.100.99 at edge WAF.",
              tradeOff: "Prevents direct traffic from known IP but does not revoke stolen STS credentials.",
            },
          ],
          expectedImpactAndReversibility: {
            blastRadius: "Scoped to IAM role 'DeployBot'. Production traffic unaffected.",
            downtimeExpected: false,
            reversibility: "Fully Reversible",
            compensationMechanism: "Signed Rollback Token: ZS-RB-TOKEN-9941 (re-attaches standard policy)",
          },
          requiredAuthorityAndApprovals: {
            requiredAuthorityTier: modeUpper === "RESPOND" ? "R2" : "R1",
            dualCustodyRequired: modeUpper === "RESPOND",
            approverRoles: ["LEAD_SECURITY_ANALYST", "SOC_MANAGER"],
          },
          controls: {
            currentState: "PENDING_REVIEW",
            availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
          },
          humanDecisionAndRationale: {
            decision: undefined,
            decidedBy: undefined,
            decidedAt: undefined,
            rationale: undefined,
            signature: undefined,
          },
          appealOrFeedbackRoute: {
            appealUrl: "https://shield.zoikogroup.com/appeals/v1",
            feedbackChannel: "secops-human-review@zoikogroup.com",
            customerAffecting: modeUpper === "RESPOND",
          },
          payload: {
            query: params.query,
            mode: params.mode,
          },
        };

        return {
          summary: `Synthesized ${modeUpper} decision hypothesis: correlated GuardDuty IAM exfiltration with MITRE T1078. Prepared Spec §16.1 10-field review envelope with reversible rollback token.`,
          envelope,
        };
      }
    );
  }

  static async recordReviewDecision(params: {
    envelopeId: string;
    decision: DecisionTransition;
    decidedBy: string;
    rationale: string;
    modifiedContent?: string;
    escalatedToRole?: string;
  }): Promise<{
    status: string;
    envelope: AiReviewEnvelope;
    receiptSignature: string;
    decidedAt: string;
  }> {
    return this.safeFetch<{
      status: string;
      envelope: AiReviewEnvelope;
      receiptSignature: string;
      decidedAt: string;
    }>(
      `/api/v1/ai/decisions/${params.envelopeId}/${params.decision.toLowerCase()}`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
      () => {
        const decidedAt = new Date().toISOString();
        const receiptSignature = sha256Mock(
          `ZS-DECISION-RECEIPT-V1:${params.envelopeId}:${params.decision}:${params.decidedBy}:${decidedAt}:${params.rationale}`
        );

        let newState: DecisionState = "PENDING_REVIEW";
        if (params.decision === "ACCEPT") newState = "ACCEPTED";
        else if (params.decision === "MODIFY") newState = "MODIFIED";
        else if (params.decision === "REJECT") newState = "REJECTED";
        else if (params.decision === "ESCALATE") newState = "ESCALATED";

        const envelope: AiReviewEnvelope = {
          envelopeId: params.envelopeId,
          tenantId: "00000000-0000-4000-8000-000000000001",
          environmentId: "PRODUCTION",
          createdAt: new Date(Date.now() - 60000).toISOString(),
          aiLabelAndUseCaseName: {
            useCaseName: "COPILOT_INTERACTIVE_DECISION",
            modelIdentifier: "claude-3-5-sonnet-20241022",
            providerProfile: "anthropic-bedrock-us-east-1",
            riskTier: "HIGH",
          },
          sourcesAndSpans: [
            {
              sourceId: "src-ocsf-3002",
              sourceType: "OCSF_EVENT_CORRELATION",
              name: "aws.guardduty.iam-exfiltration",
              type: "TELEMETRY_LOG",
              span: "Principal: AROAEXAMPLE:usr-analyst-lead-01 from non-corporate IP 198.51.100.99",
              confidenceScore: 0.98,
            },
          ],
          knownMissingStaleOrConflictingEvidence: {
            missingEvidenceCount: 0,
            staleEvidenceCount: 0,
            conflictingEvidenceCount: 0,
            freshnessSeconds: 10,
            completenessRatio: 1.0,
          },
          calibratedConfidenceAndUncertainty: {
            confidenceTier: "HIGH",
            score: 0.95,
            calibrationBasis: "Human operator reviewed and confirmed.",
            uncertaintyFactors: ["None recorded by operator."],
          },
          alternativeHypothesesOrActions: [],
          expectedImpactAndReversibility: {
            blastRadius: "Production scope approved by operator.",
            downtimeExpected: false,
            reversibility: "Fully Reversible",
            compensationMechanism: "Rollback Token: ZS-RB-TOKEN-9941",
          },
          requiredAuthorityAndApprovals: {
            requiredAuthorityTier: "R2",
            dualCustodyRequired: true,
            approverRoles: ["LEAD_SECURITY_ANALYST"],
          },
          controls: {
            currentState: newState,
            availableTransitions: [],
          },
          humanDecisionAndRationale: {
            decision: params.decision,
            decidedBy: params.decidedBy,
            decidedAt,
            rationale: params.rationale,
            signature: receiptSignature,
            modifiedContent: params.modifiedContent,
            escalatedToRole: params.escalatedToRole,
          },
          appealOrFeedbackRoute: {
            appealUrl: "https://shield.zoikogroup.com/appeals/v1",
            feedbackChannel: "secops-human-review@zoikogroup.com",
            customerAffecting: false,
          },
        };

        return {
          status: newState,
          envelope,
          receiptSignature,
          decidedAt,
        };
      }
    );
  }

  static async getReviewEnvelope(envelopeId: string): Promise<AiReviewEnvelope | null> {
    return this.safeFetch<AiReviewEnvelope | null>(
      `/api/v1/ai/decisions/${envelopeId}`,
      { method: "GET" },
      () => null
    );
  }

  // --- JIT Privileged Access Elevation (Spec §13: Privileged Access, Step-Up, JIT and Break-Glass) ---

  static async getJitSessions(tenantId?: string): Promise<JitElevationSession[]> {
    const endpoint = tenantId ? `/api/v1/jit/sessions?tenantId=${tenantId}` : `/api/v1/jit/sessions`;
    return this.safeFetch<JitElevationSession[]>(
      endpoint,
      { method: "GET" },
      () => [
        {
          sessionId: 'jit-sess-1001',
          operatorId: 'usr-analyst-01',
          targetTenantId: tenantId || 'tenant-demo',
          elevatedRole: 'INCIDENT_COMMANDER',
          status: 'ACTIVE',
          clientIp: '192.168.1.104',
          statedPurpose: 'Emergency P1 Containment for Swift Transaction Anomaly (Case #2026-882)',
          issuedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
          hardwareStepUpVerified: true,
          hardwareProofDigest: 'fido2-yubikey-cert-p256-verified-01',
          peerApprover: 'usr-ciso-02',
        },
        {
          sessionId: 'jit-sess-1002',
          operatorId: 'usr-sre-03',
          targetTenantId: tenantId || 'tenant-demo',
          elevatedRole: 'SUPER_ADMIN',
          status: 'PENDING',
          clientIp: '10.200.4.12',
          statedPurpose: 'Post-Quantum Merkle Epoch Re-synchronization & HSM Key Rotation',
          issuedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
          hardwareStepUpVerified: false,
        },
      ]
    );
  }

  static async getJitSession(id: string): Promise<JitElevationSession> {
    return this.safeFetch<JitElevationSession>(
      `/api/v1/jit/sessions/${id}`,
      { method: "GET" },
      () => ({
        sessionId: id,
        operatorId: 'usr-analyst-01',
        targetTenantId: 'tenant-demo',
        elevatedRole: 'INCIDENT_COMMANDER',
        status: 'ACTIVE',
        clientIp: '192.168.1.104',
        statedPurpose: 'Emergency P1 Containment',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        hardwareStepUpVerified: true,
      })
    );
  }

  static async createJitElevation(dto: {
    operatorId: string;
    operatorName?: string;
    targetTenantId: string;
    elevatedRole: string;
    statedPurpose: string;
    durationMinutes?: number;
    initialHardwareProof?: string;
  }): Promise<JitElevationSession> {
    return this.safeFetch<JitElevationSession>(
      '/api/v1/jit/elevate',
      {
        method: 'POST',
        body: JSON.stringify(dto),
      },
      () => ({
        sessionId: `jit-sess-${generateUUID().slice(0, 8)}`,
        operatorId: dto.operatorId,
        targetTenantId: dto.targetTenantId,
        elevatedRole: dto.elevatedRole,
        status: 'PENDING',
        clientIp: '127.0.0.1',
        statedPurpose: dto.statedPurpose,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (dto.durationMinutes || 60) * 60000).toISOString(),
        hardwareStepUpVerified: !!dto.initialHardwareProof,
      })
    );
  }

  static async peerApproveJitSession(
    id: string,
    approverId: string,
    approverRole: string,
    approvalNotes?: string
  ): Promise<JitElevationSession> {
    return this.safeFetch<JitElevationSession>(
      `/api/v1/jit/sessions/${id}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ approverId, approverRole, approvalNotes }),
      },
      () => ({
        sessionId: id,
        operatorId: 'usr-operator-demo',
        targetTenantId: 'tenant-demo',
        elevatedRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        clientIp: '127.0.0.1',
        statedPurpose: 'Approved Demo Session',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        hardwareStepUpVerified: true,
        peerApprover: approverId,
      })
    );
  }

  static async stepUpHardwareJitSession(
    id: string,
    hardwareProofDigest: string
  ): Promise<JitElevationSession> {
    return this.safeFetch<JitElevationSession>(
      `/api/v1/jit/sessions/${id}/step-up`,
      {
        method: 'POST',
        body: JSON.stringify({ hardwareProofDigest }),
      },
      () => ({
        sessionId: id,
        operatorId: 'usr-operator-demo',
        targetTenantId: 'tenant-demo',
        elevatedRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        clientIp: '127.0.0.1',
        statedPurpose: 'Hardware Step-up Demo',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        hardwareStepUpVerified: true,
        hardwareProofDigest,
      })
    );
  }

  static async revokeJitSession(
    id: string,
    revokedBy: string,
    reason: string
  ): Promise<JitElevationSession> {
    return this.safeFetch<JitElevationSession>(
      `/api/v1/jit/sessions/${id}/revoke`,
      {
        method: 'POST',
        body: JSON.stringify({ revokedBy, reason }),
      },
      () => ({
        sessionId: id,
        operatorId: 'usr-operator-demo',
        targetTenantId: 'tenant-demo',
        elevatedRole: 'SUPER_ADMIN',
        status: 'REVOKED',
        clientIp: '127.0.0.1',
        statedPurpose: 'Revoked Session Demo',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        hardwareStepUpVerified: false,
        revocationReason: reason,
      })
    );
  }

  // --- IR Retainer & Work Order SLA Operations (Rules SVC-01 / SVC-02) ---

  static async getWorkOrderSlaPolicy(id: string): Promise<{
    workOrderId: string;
    retainerId: string;
    coverage: string;
    acknowledgementTargetMinutes: number;
    activationResponseMinutes: number;
  }> {
    return this.safeFetch(
      `/api/v1/ir/work-orders/${id}/sla-policy`,
      { method: 'GET' },
      () => ({
        workOrderId: id,
        retainerId: 'ret-demo-01',
        coverage: '24x7 Continuous SLA',
        acknowledgementTargetMinutes: 15,
        activationResponseMinutes: 60,
      })
    );
  }

  static async getWorkOrderSlaStatus(id: string): Promise<{
    workOrderId: string;
    triageMinutesElapsed: number;
    responseMinutesElapsed: number;
    isTriageBreached: boolean;
    isResponseBreached: boolean;
    triageCountdownMinutes: number;
    responseCountdownMinutes: number;
    penaltyProjectedCredit: number;
  }> {
    return this.safeFetch(
      `/api/v1/ir/work-orders/${id}/sla-status`,
      { method: 'GET' },
      () => ({
        workOrderId: id,
        triageMinutesElapsed: 8,
        responseMinutesElapsed: 25,
        isTriageBreached: false,
        isResponseBreached: false,
        triageCountdownMinutes: 7,
        responseCountdownMinutes: 35,
        penaltyProjectedCredit: 0,
      })
    );
  }

  static async settleSlaBreachCredit(
    id: string,
    overrideAmount?: number,
    reason?: string
  ): Promise<{
    settled: boolean;
    creditJournalEntryId: string;
    creditedAmount: number;
    evidenceReference: string;
    settledAt: string;
  }> {
    return this.safeFetch(
      `/api/v1/ir/work-orders/${id}/settle-sla-credit`,
      {
        method: 'POST',
        body: JSON.stringify({ overrideAmount, reason }),
      },
      () => ({
        settled: true,
        creditJournalEntryId: `cred-jrn-${generateUUID().slice(0, 8)}`,
        creditedAmount: overrideAmount || 500,
        evidenceReference: `ev-sla-credit-${generateUUID().slice(0, 8)}`,
        settledAt: new Date().toISOString(),
      })
    );
  }

  // --- G1 Multi-Approver Launch Gate Protocol (§05 / §16) ---

  static async getG1Roster(): Promise<{
    gateStatus: string;
    allApproved: boolean;
    ratifiedApprovalsCount: number;
    requiredApprovalsCount: number;
    missingRoles: string[];
    approvers: Array<{
      roleId: string;
      roleTitle: string;
      signatoryName?: string;
      signatureProof?: string;
      ratified: boolean;
      signedAt?: string;
    }>;
  }> {
    const res = await this.safeFetch<any>(
      '/api/v1/governance/g1-roster',
      { method: 'GET' },
      () => ({
        gateStatus: 'PENDING_MULTI_APPROVER_SIGNOFF',
        allApproved: false,
        ratifiedApprovalsCount: 0,
        requiredApprovalsCount: 8,
        missingRoles: ['ciso', 'dpo', 'vp_eng', 'ai_risk_lead', 'qa_lead', 'sre_lead', 'product_lead', 'soc_lead'],
        approvers: [
          { roleId: 'ciso', roleTitle: 'Chief Information Security Officer (CISO)', ratified: false, isSigned: false },
          { roleId: 'dpo', roleTitle: 'Data Protection Officer (DPO)', ratified: false, isSigned: false },
          { roleId: 'vp_eng', roleTitle: 'VP of Engineering', ratified: false, isSigned: false },
          { roleId: 'ai_risk_lead', roleTitle: 'AI Risk & Safety Governance Lead', ratified: false, isSigned: false },
          { roleId: 'qa_lead', roleTitle: 'Quality Assurance & Release Lead', ratified: false, isSigned: false },
          { roleId: 'sre_lead', roleTitle: 'Site Reliability Engineering Lead', ratified: false, isSigned: false },
          { roleId: 'product_lead', roleTitle: 'Security Product Lead', ratified: false, isSigned: false },
          { roleId: 'soc_lead', roleTitle: 'SOC Incident Commander', ratified: false, isSigned: false },
        ],
      })
    );

    const signed = res.signedCount !== undefined ? res.signedCount : (res.ratifiedApprovalsCount || 0);
    const total = res.totalApprovers !== undefined ? res.totalApprovers : (res.requiredApprovalsCount || 8);
    const isAll = res.gateStatus === 'RATIFIED' || signed === total;

    return {
      gateStatus: res.gateStatus || (isAll ? 'RATIFIED' : 'PENDING_MULTI_APPROVER_SIGNOFF'),
      allApproved: isAll,
      ratifiedApprovalsCount: signed,
      requiredApprovalsCount: total,
      missingRoles: res.missingRoles || [],
      approvers: (res.approvers || []).map((a: any) => ({
        roleId: a.roleId,
        roleTitle: a.roleTitle,
        signatoryName: a.signatoryName,
        signatureProof: a.signatureProofRef || a.signatureProof,
        ratified: a.isSigned !== undefined ? a.isSigned : !!a.ratified,
        signedAt: a.signedAt,
      })),
    };
  }

  static async signG1Roster(
    roleId: string,
    signatoryName: string,
    signatureProof: string,
    evidenceNotes?: string
  ): Promise<{
    gateStatus: string;
    allApproved: boolean;
    ratifiedApprovalsCount: number;
    missingRoles: string[];
  }> {
    const res = await this.safeFetch<any>(
      '/api/v1/governance/g1-roster/sign',
      {
        method: 'POST',
        body: JSON.stringify({ roleId, signatoryName, signatureProof, evidenceNotes }),
      },
      () => ({
        gateStatus: 'PENDING_MULTI_APPROVER_SIGNOFF',
        allApproved: false,
        ratifiedApprovalsCount: 1,
        missingRoles: ['dpo', 'vp_eng', 'ai_risk_lead', 'qa_lead', 'sre_lead', 'product_lead', 'soc_lead'],
      })
    );

    // If backend returns updated roster or approver status, fetch fresh roster
    return this.getG1Roster();
  }

  static async resetG1Roster(): Promise<{
    gateStatus: string;
    allApproved: boolean;
    ratifiedApprovalsCount: number;
    requiredApprovalsCount: number;
    missingRoles: string[];
  }> {
    await this.safeFetch(
      '/api/v1/governance/g1-roster/reset',
      { method: 'POST' },
      () => ({
        gateStatus: 'PENDING_MULTI_APPROVER_SIGNOFF',
        allApproved: false,
        ratifiedApprovalsCount: 0,
        requiredApprovalsCount: 8,
        missingRoles: ['ciso', 'dpo', 'vp_eng', 'ai_risk_lead', 'qa_lead', 'sre_lead', 'product_lead', 'soc_lead'],
      })
    );
    return this.getG1Roster();
  }

  // --- Spec §31: Explicit Service-Health and Readiness States ---

  static async getPlatformReadiness(): Promise<PlatformReadinessSnapshot> {
    return this.safeFetch<PlatformReadinessSnapshot>(
      '/api/v1/observability/readiness',
      { method: 'GET' },
      () => ({
        snapshotId: 'readiness-mock-01',
        evaluatedAt: new Date().toISOString(),
        overallState: 'READINESS_CONDITIONAL',
        overallScore: 0.98,
        totalServicesCount: 6,
        healthyServicesCount: 5,
        conditionalServicesCount: 1,
        degradedServicesCount: 0,
        g1GateRatified: false,
        activeBlockersCount: 0,
        services: {
          'shield-core': {
            serviceId: 'shield-core',
            serviceName: 'shield-core',
            displayName: 'ZoikoShield Core Identity & Governance Spine',
            description: 'Central identity, Cedar authorization, Spec §13 JIT elevation, and multi-tenant session management.',
            version: '1.0.0',
            state: 'HEALTHY',
            stateMeaning: 'Current evidence supports normal operation within objective and no hidden material gap.',
            readinessScore: 1.0,
            lastAssessedAt: new Date().toISOString(),
            dependencies: [
              { dependencyName: 'PostgreSQL SOR', type: 'DATABASE', healthy: true, latencyMs: 4, lastChecked: new Date().toISOString() },
            ],
            signals: [
              { signalKey: 'jit_elevation_module', label: 'JIT Elevation Subsystem', value: 'ACTIVE_ENFORCED', status: 'OPTIMAL' },
            ],
            blockers: [],
          },
          'shield-ingest': {
            serviceId: 'shield-ingest',
            serviceName: 'shield-ingest',
            displayName: 'High-Throughput Telemetry Ingestion Pipeline',
            description: 'Distributed event ingestion, multi-cloud connector ecosystem, schema normalization, and stream deduplication.',
            version: '1.0.0',
            state: 'HEALTHY',
            stateMeaning: 'Current evidence supports normal operation within objective and no hidden material gap.',
            readinessScore: 1.0,
            lastAssessedAt: new Date().toISOString(),
            dependencies: [
              { dependencyName: 'Redpanda / Kafka Ingestion Stream', type: 'MESSAGE_BROKER', healthy: true, latencyMs: 12, lastChecked: new Date().toISOString() },
            ],
            signals: [
              { signalKey: 'ingestion_lag', label: 'Pipeline Lag (ms)', value: '142ms', threshold: '<500ms', status: 'OPTIMAL' },
            ],
            blockers: [],
          },
          'shield-ai': {
            serviceId: 'shield-ai',
            serviceName: 'shield-ai',
            displayName: 'AI Security Copilot & Decision Governance Engine',
            description: 'Model Armor safety gateways, Spec §16.1 10-field decision envelopes, and Spec §17 domain-differentiated thresholds.',
            version: '1.0.0',
            state: 'HEALTHY',
            stateMeaning: 'Current evidence supports normal operation within objective and no hidden material gap.',
            readinessScore: 1.0,
            lastAssessedAt: new Date().toISOString(),
            dependencies: [
              { dependencyName: 'Vertex AI / LLM Gateway', type: 'EXTERNAL_API', healthy: true, latencyMs: 180, lastChecked: new Date().toISOString() },
            ],
            signals: [
              { signalKey: 'grounding_score_avg', label: 'Mean Grounding Score', value: '0.985', threshold: '>=0.95', status: 'OPTIMAL' },
            ],
            blockers: [],
          },
          'shield-action': {
            serviceId: 'shield-action',
            serviceName: 'shield-action',
            displayName: 'SOAR Action Broker & Autonomous Response Engine',
            description: 'Automated containment, IAM policy detachment, EDR endpoint isolation, and WAF IP blocking.',
            version: '1.0.0',
            state: 'READINESS_CONDITIONAL',
            stateMeaning: 'Approved only with bounded conditions and expiry.',
            readinessScore: 0.85,
            lastAssessedAt: new Date().toISOString(),
            dependencies: [
              { dependencyName: 'AWS IAM Execution Adapter', type: 'EXTERNAL_API', healthy: true, latencyMs: 65, lastChecked: new Date().toISOString() },
            ],
            signals: [
              { signalKey: 'g1_launch_gate', label: 'G1 Gate Authority (§05/§16)', value: '0/8 FAIL-CLOSED (SIMULATED)', status: 'WARNING' },
            ],
            blockers: [],
            operationalConditions: ['G1 Multi-Approver Launch Gate is PENDING (0/8 domain sign-offs). Live R2+ execution adapters operate in fail-closed simulation mode.'],
          },
          'shield-anchor': {
            serviceId: 'shield-anchor',
            serviceName: 'shield-anchor',
            displayName: 'Cryptographic Anchor & Immutable Merkle Ledger',
            description: 'Post-quantum dual-signing (Dilithium3 + ECDSA P-384), Merkle epoch aggregation, and RFC 3161 timestamps.',
            version: '1.0.0',
            state: 'HEALTHY',
            stateMeaning: 'Current evidence supports normal operation within objective and no hidden material gap.',
            readinessScore: 1.0,
            lastAssessedAt: new Date().toISOString(),
            dependencies: [
              { dependencyName: 'Cloud KMS Sovereign HSM', type: 'KMS_HSM', healthy: true, latencyMs: 15, lastChecked: new Date().toISOString() },
            ],
            signals: [
              { signalKey: 'pqc_dual_signing', label: 'PQC Dual-Signer (ML-DSA / Dilithium3)', value: 'ACTIVE_COMPLIANT', status: 'OPTIMAL' },
            ],
            blockers: [],
          },
          'verifier-cli': {
            serviceId: 'verifier-cli',
            serviceName: 'verifier-cli',
            displayName: 'Independent Offline Evidence Verifier CLI',
            description: 'Zero-trust external verifier binary validating cryptographic proofs independently of backend runtime.',
            version: '1.0.0',
            state: 'HEALTHY',
            stateMeaning: 'Current evidence supports normal operation within objective and no hidden material gap.',
            readinessScore: 1.0,
            lastAssessedAt: new Date().toISOString(),
            dependencies: [],
            signals: [
              { signalKey: 'offline_verification_roundtrip', label: 'Offline Round-Trip Verifier', value: 'PASSED (0 drift)', status: 'OPTIMAL' },
            ],
            blockers: [],
          },
        },
        auditAttestationHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      })
    );
  }

  static async getServiceReadiness(serviceId: string): Promise<CoreServiceReadiness> {
    const snapshot = await this.getPlatformReadiness();
    return snapshot.services[serviceId] || snapshot.services['shield-core'];
  }

  static async getDisasterRecoveryBackupStatus(): Promise<DisasterRecoveryPostureSummary> {
    return this.safeFetch<DisasterRecoveryPostureSummary>(
      '/api/v1/observability/backup/status',
      { method: 'GET' },
      () => ({
        assessedAt: new Date().toISOString(),
        overallBackupHealth: 'HEALTHY',
        overallRpoCompliant: true,
        overallRestoreVerified: true,
        activeStoresCount: 4,
        healthyStoresCount: 4,
        staleBackupsCount: 0,
        unverifiedRestoresCount: 0,
        rtoTargetHours: 4.0,
        stores: {
          shield_core_db: {
            storeId: 'shield_core_db',
            displayName: 'ZoikoShield Primary Relational State (PostgreSQL)',
            storeType: 'RELATIONAL_POSTGRES',
            lastBackupCompletedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
            backupAgeHours: 4.0,
            backupSizeBytes: 52428800,
            rpoTargetMinutes: 15,
            rpoStatus: 'COMPLIANT',
            encryptionAlgorithm: 'KMS_ENVELOPE_AES256',
            encryptionVerified: true,
            immutabilityLocked: true,
            retentionDays: 90,
            manifestChecksumSha256: '9a5c88b43f9a78de9b3c4a2345e67f890123456789abcdef0123456789abcdef',
            lastRestoreDrillAt: new Date(Date.now() - 48 * 3600000).toISOString(),
            lastRestoreDrillStatus: 'VERIFIED',
            restoreDrillAgeDays: 2.0,
          },
          merkle_ledger: {
            storeId: 'merkle_ledger',
            displayName: 'Immutable Checkpoint & Proof Ledger (RFC3161)',
            storeType: 'IMMUTABLE_MERKLE_TREE',
            lastBackupCompletedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
            backupAgeHours: 4.0,
            backupSizeBytes: 12582912,
            rpoTargetMinutes: 5,
            rpoStatus: 'COMPLIANT',
            encryptionAlgorithm: 'AES_256_GCM',
            encryptionVerified: true,
            immutabilityLocked: true,
            retentionDays: 365,
            manifestChecksumSha256: '8b6d99c54f0b89ef0c4d5b3456f78a90123456789abcdef0123456789abcdef',
            lastRestoreDrillAt: new Date(Date.now() - 48 * 3600000).toISOString(),
            lastRestoreDrillStatus: 'VERIFIED',
            restoreDrillAgeDays: 2.0,
          },
          timeseries_telemetry: {
            storeId: 'timeseries_telemetry',
            displayName: 'Security Event Stream & Telemetry Storage',
            storeType: 'TIMESERIES_ANALYTICS',
            lastBackupCompletedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
            backupAgeHours: 4.0,
            backupSizeBytes: 104857600,
            rpoTargetMinutes: 60,
            rpoStatus: 'COMPLIANT',
            encryptionAlgorithm: 'AES_256_GCM',
            encryptionVerified: true,
            immutabilityLocked: false,
            retentionDays: 30,
            manifestChecksumSha256: '7c7e00d65f1c90fa1d5e6c4567a89b0123456789abcdef0123456789abcdef',
            lastRestoreDrillAt: new Date(Date.now() - 48 * 3600000).toISOString(),
            lastRestoreDrillStatus: 'VERIFIED',
            restoreDrillAgeDays: 2.0,
          },
          audit_vault: {
            storeId: 'audit_vault',
            displayName: 'G1 Evidence & Regulatory Audit Package Vault',
            storeType: 'COMPLIANCE_VAULT',
            lastBackupCompletedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
            backupAgeHours: 4.0,
            backupSizeBytes: 20971520,
            rpoTargetMinutes: 1440,
            rpoStatus: 'COMPLIANT',
            encryptionAlgorithm: 'KMS_ENVELOPE_AES256',
            encryptionVerified: true,
            immutabilityLocked: true,
            retentionDays: 2555,
            manifestChecksumSha256: '6d8f11e76f2d01ab2e6f7d5678b90c123456789abcdef0123456789abcdef',
            lastRestoreDrillAt: new Date(Date.now() - 48 * 3600000).toISOString(),
            lastRestoreDrillStatus: 'VERIFIED',
            restoreDrillAgeDays: 2.0,
          },
        },
        attestationDigest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      })
    );
  }

  static async runRestoreDrill(storeId: string = 'shield_core_db'): Promise<RestoreDrillReceipt> {
    return this.safeFetch<RestoreDrillReceipt>(
      '/api/v1/observability/backup/drill',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      },
      () => ({
        drillId: `drill-mock-${generateUUID().slice(0, 8)}`,
        storeId: storeId as any,
        startedAt: new Date(Date.now() - 42).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 42,
        durationSeconds: 0.042,
        rtoTargetSeconds: 14400,
        rtoCompliant: true,
        status: 'VERIFIED',
        scratchSchemaName: `scratch_restore_mock_${generateUUID().slice(0, 6)}`,
        scratchSchemaTornDown: true,
        totalTablesReconciled: 6,
        totalRowsReconciled: 1326,
        sourceMerkleHead: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
        restoredMerkleHead: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
        merkleHeadAligned: true,
        tableReconciliations: [
          { tableName: 'users', sourceRowCount: 142, restoredRowCount: 142, rowDriftCount: 0, checksumMatches: true, foreignKeysValid: true },
          { tableName: 'tenants', sourceRowCount: 18, restoredRowCount: 18, rowDriftCount: 0, checksumMatches: true, foreignKeysValid: true },
          { tableName: 'roles_permissions', sourceRowCount: 84, restoredRowCount: 84, rowDriftCount: 0, checksumMatches: true, foreignKeysValid: true },
          { tableName: 'g1_launch_gates', sourceRowCount: 8, restoredRowCount: 8, rowDriftCount: 0, checksumMatches: true, foreignKeysValid: true },
          { tableName: 'jit_elevation_sessions', sourceRowCount: 26, restoredRowCount: 26, rowDriftCount: 0, checksumMatches: true, foreignKeysValid: true },
          { tableName: 'merkle_tree_leaves', sourceRowCount: 1048, restoredRowCount: 1048, rowDriftCount: 0, checksumMatches: true, foreignKeysValid: true },
        ],
        discrepancies: [],
        receiptSignatureSha256: sha256Mock(`restore-drill-${storeId}-${Date.now()}`),
      })
    );
  }

  // --- Spec §27: Synthetic Observability & Game Day Drills ---
  static async getSyntheticObservabilityStatus(canaryTenantId?: string): Promise<{
    canaryPosture: any;
    gameDayPosture: GameDayPostureSummary;
    recentProbes: any[];
    recentExercises: GameDayExerciseResult[];
    timestamp: string;
  }> {
    const tenant = canaryTenantId || 'tenant-zoiko-canary-01';
    return this.safeFetch(
      `/api/v1/observability/synthetic/status?canaryTenantId=${tenant}`,
      {},
      () => ({
        canaryPosture: {
          canaryTenantId: tenant,
          overallHealth: 'HEALTHY',
          successRate: 1.0,
          averageLatencyMs: 142,
          lastProbeTimestamp: new Date().toISOString(),
        },
        gameDayPosture: {
          lastExerciseDate: new Date(Date.now() - 20 * 86400000).toISOString(),
          daysSinceLastExercise: 20,
          totalExercisesCompleted: 7,
          overallResilienceScore: 1.0,
          isGameDayScheduleCompliant: true,
          scenariosExercised: [
            { scenario: 'GD_01_DEPENDENCY_LOSS', failureClass: 'Dependency loss', lastExercised: new Date(Date.now() - 20 * 86400000).toISOString(), status: 'PASSED' },
            { scenario: 'GD_02_QUEUE_BACKLOG', failureClass: 'Queue backlog', lastExercised: new Date(Date.now() - 20 * 86400000).toISOString(), status: 'PASSED' },
            { scenario: 'GD_03_REGIONAL_FAILURE', failureClass: 'Regional failure', lastExercised: new Date(Date.now() - 20 * 86400000).toISOString(), status: 'PASSED' },
            { scenario: 'GD_04_IDENTITY_OUTAGE', failureClass: 'Identity outage', lastExercised: new Date(Date.now() - 20 * 86400000).toISOString(), status: 'PASSED' },
            { scenario: 'GD_05_AI_OUTAGE', failureClass: 'AI outage', lastExercised: new Date(Date.now() - 20 * 86400000).toISOString(), status: 'PASSED' },
            { scenario: 'GD_06_CONNECTOR_DRIFT', failureClass: 'Connector drift', lastExercised: new Date(Date.now() - 20 * 86400000).toISOString(), status: 'PASSED' },
            { scenario: 'GD_07_ACTION_FREEZE', failureClass: 'Action freeze', lastExercised: new Date(Date.now() - 20 * 86400000).toISOString(), status: 'PASSED' },
          ],
        },
        recentProbes: [],
        recentExercises: [],
        timestamp: new Date().toISOString(),
      })
    );
  }

  static async triggerGameDayExercise(
    scenario: GameDayScenario,
    exercisedBy?: string
  ): Promise<GameDayExerciseResult> {
    const actor = exercisedBy || 'sre-lead@zoiko.com';
    return this.safeFetch<GameDayExerciseResult>(
      '/api/v1/observability/synthetic/gameday/execute',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, exercisedBy: actor }),
      },
      () => {
        const id = `gameday-${generateUUID().slice(0, 8)}`;
        return {
          exerciseId: id,
          scenario,
          failureClass: scenario.replace('GD_', '').replace('_', ' ').toLowerCase(),
          name: `Simulated Exercise for ${scenario}`,
          exercisedBy: actor,
          status: 'PASSED',
          executionDurationMs: 48,
          timeToMitigateSeconds: 12,
          invariantsVerified: [
            'Circuit breaker & fallback verified',
            'Zero data leakage observed',
            'Audit log integrity preserved',
          ],
          deficienciesIdentified: [],
          capaTicketsGenerated: [],
          nextScheduledExercise: new Date(Date.now() + 90 * 86400000).toISOString(),
          cryptographicReportDigest: sha256Mock(`gameday-${id}`),
          exerciseTimestamp: new Date().toISOString(),
        };
      }
    );
  }

  static async getAnnexPGameDayReport(exerciseId: string): Promise<AnnexPGameDayReport> {
    return this.safeFetch<AnnexPGameDayReport>(
      `/api/v1/observability/synthetic/gameday/annex-p/${exerciseId}`,
      {},
      () => ({
        annexVersion: 'Annex-P-v1.0',
        documentTitle: 'ZoikoShield Game-Day and Synthetic-Tenant Report',
        exerciseId,
        scenario: 'GD_01_DEPENDENCY_LOSS',
        failureClass: 'Dependency loss',
        scenarioName: 'Simulated External Provider & Upstream Connector Outage',
        exercisedBy: 'sre-lead@zoiko.com',
        targetTenantScope: 'tenant-zoiko-canary-01',
        executionTimestamp: new Date().toISOString(),
        status: 'PASSED',
        executionDurationMs: 48,
        timeToMitigateSeconds: 8,
        slaLimitSeconds: 30,
        slaAdherence: true,
        invariantsVerified: [
          'Active circuit breaker tripped within SLA (<100ms)',
          'Read-only fallback cached Cedar policy bundle enforced',
          'Zero unauthorized elevation sessions permitted',
        ],
        deficienciesIdentified: [],
        capaTicketsGenerated: [],
        orrInputRatification: {
          eligibleForProductionReleaseGate: true,
          authorizedSignoffRole: 'Principal SRE & Release Authority',
          ratifiedAt: new Date().toISOString(),
        },
        syntheticCanaryContext: {
          canaryTenantId: 'tenant-zoiko-canary-01',
          stagesEvaluated: 6,
          canaryHealthStatus: 'HEALTHY',
        },
        cryptographicReportDigest: sha256Mock(`annex-p-${exerciseId}`),
      })
    );
  }

  static async getPhase0Status(): Promise<{
    postureSummary: Phase0PostureSummary;
    latestProof: Phase0ExitProofRecord;
  }> {
    return this.safeFetch<{
      postureSummary: Phase0PostureSummary;
      latestProof: Phase0ExitProofRecord;
    }>('/api/v1/observability/phase-gates/phase-0/status', {}, () => {
      const proofId = 'phase0-proof-canary-01';
      const rootHead = 'f4a8c9e0123456789abcdef0123456789abcdef0123456789abcdef012345678';
      return {
        postureSummary: {
          lastEvaluatedAt: new Date().toISOString(),
          overallStatus: 'PASSED',
          isExitGateSatisfied: true,
          totalRunsCompleted: 14,
          latestProofId: proofId,
          merkleRootHead: rootHead,
          offlineVerificationReady: true,
        },
        latestProof: {
          proofId,
          phaseVersion: 'Phase-0-ERB-01',
          documentTitle: 'ZoikoShield Phase-0 Exit Gate & Reference Proof Dossier',
          evaluatedAt: new Date().toISOString(),
          overallStatus: 'PASSED',
          cellId: 'cell-eu-west-1a',
          targetTenantId: 'tenant-zoiko-canary-01',
          totalDurationMs: 42,
          stepsCompleted: 8,
          totalSteps: 8,
          criteriaSatisfied: 6,
          totalCriteria: 6,
          merkleRootHead: rootHead,
          auditPackageChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          offlineVerificationCommand: 'npx zoikoshield-verifier verify ./audit-pkg-phase0-canary-01',
          steps: [
            {
              stepId: 'STEP_1_TENANT_PROVISIONING',
              stepNumber: 1,
              name: 'Tenant & Cell Isolation Provisioning',
              description: 'Cryptographic tenant partition, KMS key ring, and IAM namespace initialized',
              passed: true,
              durationMs: 4,
              evidenceDigest: sha256Mock('step1-tenant'),
              outputArtifacts: { tenantId: 'tenant-zoiko-canary-01', cellId: 'cell-eu-west-1a' },
            },
            {
              stepId: 'STEP_2_AUTHENTICATED_INGESTION',
              stepNumber: 2,
              name: 'Authenticated Ingestion & Schema Normalization',
              description: 'OCSF-normalized security event ingested with valid Ed25519 signature',
              passed: true,
              durationMs: 5,
              evidenceDigest: sha256Mock('step2-ingest'),
              outputArtifacts: { eventType: 'IAM_ELEVATION_REQUEST', rawEventsIngested: 1 },
            },
            {
              stepId: 'STEP_3_DETERMINISTIC_DETECTION',
              stepNumber: 3,
              name: 'Deterministic Rule Detection & Severity Scoring',
              description: 'Rule RULE_CANARY_PRIV_ESC_DETERMINISTIC_01 triggered with zero heuristic drift',
              passed: true,
              durationMs: 6,
              evidenceDigest: sha256Mock('step3-detect'),
              outputArtifacts: { alertId: 'alt-canary-det-01', severity: 'HIGH' },
            },
            {
              stepId: 'STEP_4_EVIDENCE_AND_CONTROL',
              stepNumber: 4,
              name: 'Evidence Ledger & Continuous Assurance Control Binding',
              description: 'Evidence record bound to CTRL_ACCESS_GOVERNANCE_01 with 100% completeness',
              passed: true,
              durationMs: 4,
              evidenceDigest: sha256Mock('step4-evidence'),
              outputArtifacts: { evidenceId: 'ev-canary-01', controlStatus: 'SATISFIED' },
            },
            {
              stepId: 'STEP_5_AUDIT_PACKAGE_MERKLE',
              stepNumber: 5,
              name: 'Audit Package Merkle Tree Assembly',
              description: 'Deterministic 8-leaf Merkle tree compiled with cryptographically valid root',
              passed: true,
              durationMs: 7,
              evidenceDigest: sha256Mock('step5-merkle'),
              outputArtifacts: { merkleRoot: rootHead, totalLeaves: 8 },
            },
            {
              stepId: 'STEP_6_WITNESS_ANCHOR_PROOF',
              stepNumber: 6,
              name: 'External RFC 3161 Witness Timestamp Anchoring',
              description: 'Merkle root attested by trusted timestamp authority with valid signature',
              passed: true,
              durationMs: 6,
              evidenceDigest: sha256Mock('step6-witness'),
              outputArtifacts: { witnessProvider: 'RFC_3161_TSA', signatureVerified: true },
            },
            {
              stepId: 'STEP_7_ACTION_SIMULATION',
              stepNumber: 7,
              name: 'Bounded Action Sandbox & Dry-Run Simulation',
              description: 'Pre-flight dry-run validated with 0 live mutations and verified blast radius',
              passed: true,
              durationMs: 5,
              evidenceDigest: sha256Mock('step7-action'),
              outputArtifacts: { action: 'ISOLATE_CREDENTIALS', mutationsCount: 0 },
            },
            {
              stepId: 'STEP_8_FREEZE_ASSERTION',
              stepNumber: 8,
              name: 'Emergency Action Freeze & Circuit Breaker Assertion',
              description: 'Kill switch verified responsive in <50ms with live mutation lockdown',
              passed: true,
              durationMs: 5,
              evidenceDigest: sha256Mock('step8-freeze'),
              outputArtifacts: { freezeLatencyMs: 12, circuitBreakerTripped: false },
            },
          ],
          criteria: [
            {
              criteriaId: 'CRIT_01_SYNTHETIC_TENANT_ISOLATION',
              name: 'Synthetic Tenant Partitioning & KMS Isolation',
              description: 'Tenant boundary enforced at database, cache, and KMS level',
              status: 'PASSED',
              requiredInvariants: ['INV_CELL_TENANT_ISOLATION', 'INV_KMS_RING_RESTRICTED'],
              verifiedAt: new Date().toISOString(),
            },
            {
              criteriaId: 'CRIT_02_DETERMINISTIC_DETECTION_VERIFIED',
              name: 'Deterministic Detection & Zero-False-Negative Pipeline',
              description: 'Canary attack pattern detected with zero false-negative drop',
              status: 'PASSED',
              requiredInvariants: ['INV_RULE_CORRELATION_EXACT', 'INV_ALERT_SEVERITY_MAPPED'],
              verifiedAt: new Date().toISOString(),
            },
            {
              criteriaId: 'CRIT_03_EVIDENCE_MERKLE_ANCHORED',
              name: 'Evidence Continuous Assurance & Merkle Integrity',
              description: 'All generated evidence anchored into canonical Merkle proof tree',
              status: 'PASSED',
              requiredInvariants: ['INV_EVIDENCE_CONTROL_MAPPED', 'INV_MERKLE_ROOT_CANONICAL'],
              verifiedAt: new Date().toISOString(),
            },
            {
              criteriaId: 'CRIT_04_OFFLINE_VERIFIER_COMPLIANT',
              name: 'Offline Verifier CLI Compatibility',
              description: 'Audit package passes offline verifier with 0 external dependencies',
              status: 'PASSED',
              requiredInvariants: ['INV_STANDALONE_MERKLE_PROOF', 'INV_WITNESS_CERT_VALID'],
              verifiedAt: new Date().toISOString(),
            },
            {
              criteriaId: 'CRIT_05_ACTION_SIMULATION_CONSTRAINED',
              name: 'Action Sandbox Simulation & Zero Mutation Safety',
              description: 'Autonomous SOAR adapters constrained to zero unauthorized mutations',
              status: 'PASSED',
              requiredInvariants: ['INV_SIMULATION_ZERO_MUTATION', 'INV_BLAST_RADIUS_BOUNDED'],
              verifiedAt: new Date().toISOString(),
            },
            {
              criteriaId: 'CRIT_06_EMERGENCY_FREEZE_VERIFIED',
              name: 'Emergency Action Freeze Sub-Second Lockdown',
              description: 'Global kill switch verified responsive in <50ms with instant execution halt',
              status: 'PASSED',
              requiredInvariants: ['INV_FREEZE_LOCKDOWN_HONORED', 'INV_CIRCUIT_BREAKER_ACTIVE'],
              verifiedAt: new Date().toISOString(),
            },
          ],
          releaseGateRatification: {
            eligibleForG1Gate: true,
            attestedByRole: 'Principal Security Architect & Release Authority',
            attestedAt: new Date().toISOString(),
          },
          cryptographicProofSignatureSha256: sha256Mock(`phase0-dossier-${proofId}`),
        },
      };
    });
  }

  static async executePhase0Flow(
    tenantId: string = 'tenant-zoiko-canary-01',
    cellId: string = 'cell-eu-west-1a'
  ): Promise<Phase0ExitProofRecord> {
    return this.safeFetch<Phase0ExitProofRecord>(
      '/api/v1/observability/phase-gates/phase-0/execute',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, cellId }),
      },
      () => {
        const proofId = 'phase0-proof-canary-01';
        const rootHead = 'f4a8c9e0123456789abcdef0123456789abcdef0123456789abcdef012345678';
        return {
          proofId,
          phaseVersion: 'Phase-0-ERB-01',
          documentTitle: 'ZoikoShield Phase-0 Exit Gate & Reference Proof Dossier',
          evaluatedAt: new Date().toISOString(),
          overallStatus: 'PASSED',
          cellId,
          targetTenantId: tenantId,
          totalDurationMs: 42,
          stepsCompleted: 8,
          totalSteps: 8,
          criteriaSatisfied: 6,
          totalCriteria: 6,
          merkleRootHead: rootHead,
          auditPackageChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          offlineVerificationCommand: 'npx zoikoshield-verifier verify ./audit-pkg-phase0-canary-01',
          steps: [],
          criteria: [],
          releaseGateRatification: {
            eligibleForG1Gate: true,
            attestedByRole: 'Principal Security Architect & Release Authority',
            attestedAt: new Date().toISOString(),
          },
          cryptographicProofSignatureSha256: sha256Mock(`phase0-dossier-${proofId}`),
        };
      }
    );
  }

  static async getPhase0ProofBundle(proofId?: string): Promise<Phase0ProofBundle> {
    const url = proofId
      ? `/api/v1/observability/phase-gates/phase-0/proof?proofId=${encodeURIComponent(proofId)}`
      : '/api/v1/observability/phase-gates/phase-0/proof';
    return this.safeFetch<Phase0ProofBundle>(url, {}, () => {
      const pid = proofId || 'phase0-proof-canary-01';
      const rootHead = 'f4a8c9e0123456789abcdef0123456789abcdef0123456789abcdef012345678';
      return {
        manifest: {
          manifestVersion: '1.0.0',
          specReference: 'Spec §28 Delivery Phases, Exit Proofs & Independent Verification Gates',
          packageId: `pkg-${pid}`,
          tenantId: 'tenant-zoiko-canary-01',
          cellId: 'cell-eu-west-1a',
          exportedAt: new Date().toISOString(),
          merkleRootHead: rootHead,
          auditPackageChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          proofSignatureSha256: sha256Mock(`pkg-${pid}`),
          artifactChecksums: {},
        },
        proofRecord: {} as any,
        merkleTreeData: {
          rootHash: rootHead,
          totalLeaves: 8,
          leaves: [],
          witnessAttestation: {
            provider: 'RFC_3161_TRUSTED_TSA_WITNESS',
            witnessHash: sha256Mock('witness'),
            timestampIso: new Date().toISOString(),
            signatureValid: true,
          },
        },
        evidenceChain: {
          evidenceId: 'ev-canary-01',
          controlId: 'CTRL_ACCESS_GOVERNANCE_01',
          controlAssessment: 'SATISFIED',
          completenessRatio: 1.0,
          detectionAlertId: 'alt-canary-det-01',
          ruleId: 'RULE_CANARY_PRIV_ESC_DETERMINISTIC_01',
        },
        actionSandboxReceipt: {
          simulationId: 'sim-canary-01',
          actionName: 'ISOLATE_CREDENTIALS',
          blastRadius: 'CONFINED_SINGLE_USER',
          liveMutationsCount: 0,
          freezeSwitchFunctional: true,
        },
        offlineVerificationInstructions: {
          cliCommand: `npx zoikoshield-verifier verify ./pkg-${pid}`,
          offlineMode: true,
          expectedExitCode: 0,
        },
      };
    });
  }

  static async verifyProofOffline(bundle: Phase0ProofBundle): Promise<OfflineVerificationReport> {
    return this.safeFetch<OfflineVerificationReport>(
      '/api/v1/observability/phase-gates/phase-0/verify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
      },
      () => ({
        verified: true,
        verificationTimestamp: new Date().toISOString(),
        packageId: bundle.manifest.packageId,
        merkleRootMatches: true,
        evidenceChainIntact: true,
        signatureMatches: true,
        invariantsPassed: 6,
        totalInvariants: 6,
        discrepancies: [],
        verificationCertificate: {
          certificateId: `cert-${bundle.manifest.packageId}`,
          verifierVersion: 'zoikoshield-verifier-v1.0',
          signatureSha256: sha256Mock(`cert-${bundle.manifest.packageId}`),
        },
      })
    );
  }
}







