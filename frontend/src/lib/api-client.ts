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

export class ZoikoShieldApiClient {
  private static async safeFetch<T>(
    endpoint: string,
    options: RequestInit = {},
    fallbackFn: () => T
  ): Promise<T> {
    try {
      const res = await fetch(endpoint, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
    } catch {
      // Backend not running -> fallback
    }
    return fallbackFn();
  }

  // --- Step 1: Authentication ---
  static async login(email: string, password?: string): Promise<UserSession> {
    const session = await this.safeFetch<UserSession>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
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

  static async simulateResponseProposal(proposalId: string): Promise<SimulationReceipt> {
    const receipt = await this.safeFetch<SimulationReceipt>(
      `/api/v1/response-proposals/${proposalId}/simulate`,
      { method: "POST" },
      () => {
        return {
          id: `rcpt-sim-${generateUUID().slice(0, 8)}`,
          proposalId,
          commandId: `cmd-${generateUUID().slice(0, 8)}`,
          result: "SIMULATED",
          simulatedBlastRadius: 0.05,
          simulatedAt: new Date().toISOString(),
          stateDiffs: [
            {
              target: "victim.engineer@acme.com",
              beforeState: "ActiveSessions=3, LastMfa=2h_ago",
              afterState: "ActiveSessions=0, NextLoginMfaRequired=true",
              rollbackCommand: "RESTORE_USER_SESSION_CACHE",
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
          dilithiumSignature: `pqc_dilithium3_${sha256Mock(generateUUID()).slice(0, 48)}`,
          ed25519Signature: `ed25519_${sha256Mock(generateUUID()).slice(0, 48)}`,
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
      `/api/v1/ai-governance/incidents?tenantId=${tenantId || "default"}`,
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
      "/api/v1/ai-governance/incidents/declare",
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
      `/api/v1/ai-governance/incidents/${incidentId}/contain`,
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
      `/api/v1/ai-governance/incidents/${incidentId}/fallback`,
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
      `/api/v1/ai-governance/incidents/${incidentId}/rca`,
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
      `/api/v1/ai-governance/incidents/${incidentId}/resolve`,
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
      `/api/v1/ai-governance/incidents/${incidentId}/close`,
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
      "/api/v1/ai-governance/model-drift",
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
      "/api/v1/ai-governance/supply-chain-risk",
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
}


