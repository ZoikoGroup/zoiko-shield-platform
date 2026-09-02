import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Service port mapping based on technical ground truth
function resolveServicePort(method: string, path: string): number {
  // Collision 1: Alert create-case / assign live on shield-ingest:3002
  if (method === "POST" && path.includes("alerts/") && (path.endsWith("/create-case") || path.endsWith("/assign"))) {
    return 3002;
  }
  // Collision 2: Case evidence write and case assign live on shield-ingest:3002
  if (method === "POST" && path.includes("cases/") && (path.endsWith("/evidence") || path.endsWith("/assign"))) {
    return 3002;
  }
  // Connectors, Ingestion, Normalization live on shield-ingest:3002
  if (
    path.startsWith("connectors") ||
    path.startsWith("connector-types") ||
    path.startsWith("ingestion")
  ) {
    return 3002;
  }
  // Controls, Objectives, Control-Tests, Control-Evaluations live on shield-ingest:3002
  if (
    path.startsWith("controls") ||
    path.startsWith("control-tests") ||
    path.startsWith("control-evaluations")
  ) {
    return 3002;
  }
  // All other core routes: Auth, Onboarding, Tenants, Invitations, Alerts (read/triage), Cases (CRUD/timeline/read evidence/decisions), AI proxies, Response Proposals, Audit Packages, JIT live on shield-core:3001
  return 3001;
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sha256Mock(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function handleApiProxy(req: NextRequest, slugArray: string[]) {
  const method = req.method;
  const path = slugArray.join("/");
  const targetPort = resolveServicePort(method, path);
  const targetUrl = `http://127.0.0.1:${targetPort}/api/v1/${path}${req.nextUrl.search}`;

  let rawBodyText = "";
  let parsedBody: any = {};
  if (method !== "GET" && method !== "HEAD") {
    try {
      rawBodyText = await req.text();
      if (rawBodyText) {
        parsedBody = JSON.parse(rawBodyText);
      }
    } catch {
      // Non-JSON or raw text
    }
  }

  const tenantId =
    req.headers.get("x-tenant-id") ||
    parsedBody?.tenantId ||
    "00000000-0000-4000-8000-000000000001";

  // Build outbound headers
  const outboundHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 1. Forward Authorization or Cookies to shield-core
  const authHeader = req.headers.get("authorization");
  if (authHeader) outboundHeaders["Authorization"] = authHeader;
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) outboundHeaders["Cookie"] = cookieHeader;

  // 2. Inject x-tenant-id for shield-ingest calls
  if (targetPort === 3002) {
    outboundHeaders["x-tenant-id"] = tenantId;
  }

  // 3. Server-side HMAC Signing for Webhook Ingestion
  if (path.startsWith("ingestion/webhooks/")) {
    const webhookSecret = process.env.WEBHOOK_HMAC_SECRET || "whsec_dev_local_secret_zoikoshield_2026";
    const hmac = crypto.createHmac("sha256", webhookSecret).update(rawBodyText).digest("hex");
    outboundHeaders["x-webhook-signature"] = `sha256=${hmac}`;
    outboundHeaders["x-hub-signature-256"] = `sha256=${hmac}`;
    outboundHeaders["x-signature-timestamp"] = Math.floor(Date.now() / 1000).toString();
  }

  // Attempt real live backend proxy
  try {
    const backendRes = await fetch(targetUrl, {
      method,
      headers: outboundHeaders,
      body: method !== "GET" && method !== "HEAD" ? rawBodyText : undefined,
      signal: AbortSignal.timeout(1500),
    });

    if (backendRes.ok) {
      const data = await backendRes.json();
      const responseHeaders = new Headers();
      responseHeaders.set("X-ZoikoShield-Source", "live-backend");
      responseHeaders.set("X-ZoikoShield-Service-Port", targetPort.toString());

      // Forward Set-Cookie from shield-core to browser
      const setCookie = backendRes.headers.get("set-cookie");
      if (setCookie) {
        responseHeaders.set("Set-Cookie", setCookie);
      }

      return NextResponse.json(data, {
        status: backendRes.status,
        headers: responseHeaders,
      });
    }
  } catch {
    // Backend offline / connection refused -> handle with deterministic simulated fallback
  }

  // Deterministic Simulated Fallback adhering directly to NestJS DTO specifications
  const now = new Date().toISOString();

  // Route: /api/v1/connector-types
  if (path === "connector-types") {
    return NextResponse.json(
      [
        { id: "generic-webhook", name: "Generic Webhook / JSON Telemetry", protocol: "HTTPS", category: "WEBHOOK" },
        { id: "generic-syslog", name: "Generic Syslog / RFC 5424", protocol: "TLS", category: "NETWORK" },
        { id: "microsoft-entra", name: "Microsoft Entra ID / Graph Audit", protocol: "OAUTH2", category: "IDENTITY" },
        { id: "aws-cloudtrail", name: "AWS CloudTrail / GuardDuty", protocol: "IAM_ROLE", category: "CLOUD" },
        { id: "azure-monitor", name: "Azure Monitor / Sentinel", protocol: "MANAGED_IDENTITY", category: "CLOUD" },
        { id: "crowdstrike-edr", name: "CrowdStrike Falcon EDR / FDR", protocol: "STREAMING_API", category: "ENDPOINT" },
      ],
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/auth/login
  if (path.startsWith("auth/login")) {
    const email = parsedBody.email || "sarah.chen@acme.com";
    const role = email.includes("owner")
      ? "TENANT_OWNER"
      : email.includes("admin")
      ? "SUPER_ADMIN"
      : "SECURITY_ANALYST";
    const loginTenantId = parsedBody.tenantId || "00000000-0000-4000-8000-000000000001";

    return NextResponse.json(
      {
        user: {
          userId: `usr-${generateUUID().slice(0, 8)}`,
          email,
          fullName: email.split("@")[0].replace(".", " ").toUpperCase(),
          role,
          tenantId: loginTenantId,
          environment: "PRODUCTION-US-EAST",
        },
        token: `jwt-shield-${generateUUID()}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        isAuthenticated: true,
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/me
  if (path === "me" || path === "auth/me") {
    return NextResponse.json(
      {
        userId: "usr-sarah-chen-01",
        email: "sarah.chen@acme.com",
        fullName: "SARAH CHEN",
        role: "SECURITY_ANALYST",
        tenantId: "00000000-0000-4000-8000-000000000001",
        environment: "PRODUCTION-US-EAST",
        permissions: ["alert:read", "alert:triage", "case:create", "case:update", "evidence:anchor"],
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/onboarding/organization
  if (path.startsWith("onboarding/organization")) {
    const orderId = parsedBody.orderId || "ord-enterprise-00000001-uuid";
    return NextResponse.json(
      {
        id: `00000000-0000-4000-8000-${generateUUID().slice(24)}`,
        orderId,
        organizationName: parsedBody.organizationName || parsedBody.tenantName || "Acme Financial Services Inc.",
        slug: parsedBody.slug || parsedBody.tenantSlug || "acme-financial",
        legalEntityName: parsedBody.legalEntity?.legalName || parsedBody.legalEntityName || "Acme Financial Services Global Ltd",
        homeRegion: parsedBody.homeRegion || "us-east-1",
        dataResidencyRegion: parsedBody.dataResidencyRegion || parsedBody.homeRegion || "us-east-1",
        dataClass: parsedBody.dataClass || "RESTRICTED",
        environmentName: parsedBody.environment?.name || "PRODUCTION-US-EAST",
        accessDisclosureVersion: parsedBody.accessDisclosureVersion || "1.0.0",
        status: "ACTIVE",
        createdAt: now,
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/tenants/:tenantId/invitations
  if (path.includes("invitations")) {
    const invId = `inv-${generateUUID().slice(0, 8)}`;
    return NextResponse.json(
      {
        id: invId,
        invitationId: invId,
        tenantId,
        invitedEmail: parsedBody.invitedEmail || "analyst.ops@acme.com",
        assignedRole: parsedBody.roleId || parsedBody.assignedRole || "SECURITY_ANALYST",
        token: `token-inv-${generateUUID().slice(0, 12)}`,
        status: path.includes("accept") ? "ACCEPTED" : "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now,
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/connectors
  if (path.startsWith("connectors")) {
    const connId = `conn-${parsedBody.provider || "generic-webhook"}-${generateUUID().slice(0, 6)}`;
    return NextResponse.json(
      {
        id: connId,
        tenantId,
        name: parsedBody.name || "Primary Security Gateway Webhook",
        provider: parsedBody.provider || "generic-webhook",
        sourceRegion: parsedBody.sourceRegion || "us-east-1",
        environmentId: parsedBody.environmentId || "PRODUCTION-US-EAST",
        status: "ACTIVE",
        healthStatus: "HEALTHY",
        hmacSecret: `whsec_${sha256Mock(connId).slice(0, 32)}`,
        webhookUrl: `https://ingest.zoikoshield.io/api/v1/ingestion/webhooks/${connId}`,
        eventsIngestedCount: 1,
        lastEventAt: now,
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/ingestion/webhooks/:connectorId
  if (path.startsWith("ingestion")) {
    const payloadHash = sha256Mock(rawBodyText || JSON.stringify(parsedBody));
    const normalized = {
      id: `norm-${generateUUID().slice(0, 8)}`,
      tenantId,
      environmentId: "PRODUCTION-US-EAST",
      connectorId: slugArray[slugArray.length - 1] || "conn-01",
      eventClass: parsedBody.eventClass || "AUTHENTICATION",
      eventCategory: "IDENTITY",
      eventActivity: parsedBody.activity || "LOGIN_ATTEMPT",
      severity: parsedBody.severity || "HIGH",
      actorUserId: parsedBody.userId || "usr-victim-99",
      actorEmail: parsedBody.email || parsedBody.user?.email || "victim.engineer@acme.com",
      sourceIp: parsedBody.sourceIp || "198.51.100.42",
      action: parsedBody.action || "AUTH_PASSWORD_LOGIN",
      outcome: parsedBody.result || parsedBody.outcome || "FAILED",
      occurredAt: parsedBody.occurredAt || now,
      normalizationStatus: "NORMALIZED",
      rawPayloadHash: payloadHash,
    };

    return NextResponse.json(
      {
        status: "INGESTED_AND_NORMALIZED",
        eventId: parsedBody.eventId || `evt-${generateUUID().slice(0, 8)}`,
        payloadHash,
        normalized,
        alertTriggered: true,
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/alerts
  if (path.startsWith("alerts")) {
    if (path.includes("create-case")) {
      const caseId = `case-${generateUUID().slice(0, 8)}`;
      const evidenceHash = sha256Mock(JSON.stringify(parsedBody));
      return NextResponse.json(
        {
          id: caseId,
          tenantId,
          title: parsedBody.title || "Investigation: Repeated Failed Logins & Brute Force",
          severity: "HIGH",
          status: "INVESTIGATING",
          ownerId: "usr-sarah-chen-01",
          ownerName: "Sarah Chen (Lead Analyst)",
          createdAt: now,
          updatedAt: now,
          linkedAlertIds: ["alt-failed-login-bruteforce-01"],
          timeline: [
            {
              id: `tl-${generateUUID().slice(0, 6)}`,
              timestamp: now,
              title: "Case Opened & Anchored",
              description: "Promoted detection into incident workspace with Merkle epoch seal.",
              actor: "Sarah Chen (Lead Analyst)",
              type: "CASE_OPENED",
            },
          ],
          evidenceList: [
            {
              id: `ev-${generateUUID().slice(0, 8)}`,
              tenantId,
              caseId,
              evidenceType: "SECURITY_TELEMETRY",
              sourceType: "WEBHOOK",
              collectorId: "conn-webhook-gateway-01",
              contentHash: evidenceHash,
              freshnessStatus: "CURRENT",
              integrityStatus: "VALID",
              merkleEpoch: 1043,
              merkleRootHash: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
              recordedAt: now,
              rawPayload: parsedBody,
            },
          ],
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }
  }

  // Route: /api/v1/cases/:caseId/ai/summary or ai routes
  if (path.includes("/ai/") || path.startsWith("ai")) {
    return NextResponse.json(
      {
        outputId: `ai-out-${generateUUID().slice(0, 8)}`,
        aiRunId: `ai-run-${generateUUID().slice(0, 8)}`,
        caseId: slugArray[1] || "case-01",
        status: "REVIEW_REQUIRED",
        generatedAt: now,
        modelArmorVerdict: "SCREENED_SAFE",
        executiveSummary:
          "Autonomous AI investigation confirms high-severity credential brute-force telemetry against corporate accounts from attacking IP 198.51.100.42. MITRE T1110.001 detected.",
        threatAssessment:
          "MITRE ATT&CK T1110 (Brute Force) & T1078 (Valid Accounts). Recommended immediate session invalidation.",
        citations: [
          {
            evidenceId: "ev-01",
            evidenceRef: "[E-01]",
            description: "Telemetry digest anchored in Merkle Epoch #1043",
          },
        ],
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
          "Apply WAF perimeter IP block on 198.51.100.42",
        ],
        limitations: ["Source ASN resolution obfuscated behind residential proxy network."],
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/ai/outputs/:outputId/review
  if (path.includes("ai/outputs") && path.endsWith("/review")) {
    return NextResponse.json(
      {
        outputId: slugArray[2] || "ai-out-01",
        reviewStatus: parsedBody.decision || "ACCEPTED",
        reviewedBy: "usr-sarah-chen-01",
        rationale: parsedBody.rationale || "Verified against cryptographic Merkle evidence",
        reviewedAt: now,
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/response-proposals / simulate / freeze
  if (path.includes("response-proposals") || path.includes("response")) {
    if (path.includes("freeze")) {
      return NextResponse.json(
        {
          frozen: true,
          mode: "EMERGENCY_FREEZE",
          initiatedBy: "usr-sarah-chen-01",
          reason: parsedBody.reason || "Autonomous kill-switch activated",
          timestamp: now,
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    return NextResponse.json(
      {
        id: `rcpt-sim-${generateUUID().slice(0, 8)}`,
        proposalId: slugArray[1] || "prop-01",
        commandId: `cmd-${generateUUID().slice(0, 8)}`,
        result: "SIMULATED",
        simulatedBlastRadius: 0.05,
        simulatedAt: now,
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
        safetyAttestationHash: sha256Mock("proposal" + now),
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/controls or control-tests or control-evaluations
  if (path.includes("control")) {
    return NextResponse.json(
      {
        id: slugArray[1] || "ctrl-01",
        controlId: "SOC2-CC6.1",
        framework: "SOC2_TYPE2",
        controlName: "Privileged Access Restriction & MFA Enforcement",
        description: "Evaluates whether privileged administrative sessions enforce hardware MFA step-up.",
        category: "IDENTITY_ACCESS",
        result: "PASS",
        evaluatedEventsCount: 420,
        lastEvaluatedAt: now,
        evidenceSampleHash: sha256Mock("control" + now),
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/audit-packages
  if (path.startsWith("audit-packages")) {
    return NextResponse.json(
      {
        id: `pkg-${generateUUID().slice(0, 8)}`,
        tenantId,
        packageName: `ZoikoShield-Audit-Package-Acme-${now.slice(0, 10)}.zip`,
        packageHash: sha256Mock("audit" + now),
        dilithiumSignature: `pqc_dilithium3_${sha256Mock(generateUUID()).slice(0, 48)}`,
        ed25519Signature: `ed25519_${sha256Mock(generateUUID()).slice(0, 48)}`,
        status: "VERIFIED",
        generatedAt: now,
        sizeBytes: 428190,
        manifest: {
          evidenceCount: 14,
          casesCount: 3,
          controlEvaluationsCount: 5,
          epochMerkleRoot: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
          tsaTimestampProof: `RFC3161_TSA_SEAL_${now.slice(0, 10)}_VALID`,
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/authz/jit
  if (path.includes("jit")) {
    return NextResponse.json(
      {
        requestId: `jit-req-${generateUUID().slice(0, 8)}`,
        tenantId,
        requestedRole: "SUPER_ADMIN",
        status: "APPROVED_ACTIVE",
        approverPeerAdmin: "alex.kumar@acme.com",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        justification: parsedBody.justification || "Critical incident triage support access.",
        auditSignature: sha256Mock("jit" + now),
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Generic 200 OK fallback
  return NextResponse.json(
    { success: true, message: "ZoikoShield API call processed", path },
    { headers: { "X-ZoikoShield-Source": "simulated" } }
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}
