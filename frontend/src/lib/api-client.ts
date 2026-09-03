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
} from "./types";
import { getInitialDemoState, saveDemoState, DemoState } from "./demo-state";
import { generateUUID, sha256Mock } from "./utils";

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

  // --- Step 2: Organization Onboarding ---
  static async createOrganization(data: {
    organizationName: string;
    slug: string;
    legalEntityName: string;
    environmentName: string;
    homeRegion: string;
  }): Promise<Tenant> {
    const newTenant = await this.safeFetch<Tenant>(
      "/api/v1/onboarding/organization",
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

  // --- Step 8: AI Investigation Summary ---
  static async generateAiInvestigationSummary(caseId: string): Promise<AiInvestigationSummary> {
    const summary = await this.safeFetch<AiInvestigationSummary>(
      `/api/v1/ai/cases/${caseId}/summary`,
      { method: "POST" },
      () => {
        const state = getState();
        const currentCase = state.cases.find((c) => c.id === caseId);
        const targetEmail = currentCase?.evidenceList[0]?.rawPayload
          ? (currentCase.evidenceList[0].rawPayload as any).affectedIdentities?.[0] || "victim.engineer@acme.com"
          : "victim.engineer@acme.com";

        return {
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
      currentCase.timeline.push({
        id: `tl-${generateUUID().slice(0, 6)}`,
        timestamp: new Date().toISOString(),
        title: "AI Investigation Narrative Synthesized",
        description: "AI Copilot generated attack timeline with 1 verified citation under Model Armor screening.",
        actor: "shield-ai / ModelArmorGateway",
        type: "AI_INVESTIGATED",
      });
    }
    state.currentStep = 8;
    saveDemoState(state);
    return summary;
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
}
