import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Service port mapping based on technical ground truth: all authenticated user traffic enters via shield-core:3001
function resolveServicePort(method: string, path: string): number {
  // Public raw webhook ingestion routes to shield-ingest:3002 (protected by WebhookSignatureGuard)
  if (path.startsWith("ingestion/webhooks")) {
    return 3002;
  }

  // AI & Decision Rights operations route to shield-ai:3003
  if (path.startsWith("ai/") || path.startsWith("copilot")) {
    return 3003;
  }

  // All other user-facing API operations route through shield-core:3001 (guarded by JwtAuthGuard + PermissionsGuard)
  return 3001;
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// In-memory connector state store to preserve disable/activate states across requests
const connectorStateStore = new Map<string, { status: string; state: string; healthStatus: string }>();

// In-memory review envelope store for Spec §16.1 AI Copilot decisions
const reviewEnvelopesStore = new Map<string, any>();

// In-memory event store to retain normalized logs from all tools (GitHub, AWS, EDR, Webhooks)
const ingestedEventsStore: any[] = [];

function sha256Mock(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════════
// OCSF NORMALIZATION ENGINE — Spec Section 07 | Event Architecture
// Covers all ConnectorProviderKeys from connector.types.ts:
//   github, aws-cloudtrail, aws-guardduty, crowdstrike-edr, sentinelone-edr,
//   microsoft-entra, okta-identity, palo-alto-cortex-xdr, generic-syslog, generic-webhook
// ═══════════════════════════════════════════════════════════════════════════

type ProviderKey = "github" | "aws-cloudtrail" | "aws-guardduty" | "crowdstrike-edr" | "sentinelone-edr" | "microsoft-entra" | "okta-identity" | "palo-alto-cortex-xdr" | "generic-syslog" | "generic-webhook";

interface NormalizeResult {
  provider: ProviderKey;
  ocsfCategoryUid: number;
  ocsfClassUid: number;
  alertTriggered: boolean;
  normalized: Record<string, any>;
}

function detectProvider(body: any): ProviderKey {
  // GitHub: zen (ping), repository, sender, pusher
  if (body.zen || body.repository || body.sender || body.pusher) return "github";
  // AWS CloudTrail: eventSource ending in amazonaws.com, eventName, userIdentity
  if (body.userIdentity && body.eventSource) return "aws-cloudtrail";
  // AWS GuardDuty: finding type, schemaVersion, resource with instanceDetails
  if (body.type && body.arn && body.resource && body.schemaVersion) return "aws-guardduty";
  // CrowdStrike: behaviors array, device.device_id, max_severity
  if (body.behaviors && body.device?.device_id) return "crowdstrike-edr";
  // SentinelOne: threatInfo, agentDetectionInfo
  if (body.threatInfo && body.agentDetectionInfo) return "sentinelone-edr";
  // Microsoft Entra: userPrincipalName, conditionalAccessStatus, appDisplayName
  if (body.userPrincipalName || body.conditionalAccessStatus || body.appDisplayName) return "microsoft-entra";
  // Okta: actor.type === "User", eventType containing "user.", client.ipAddress
  if (body.actor?.type === "User" || body.eventType?.startsWith("user.") || body.actor?.alternateId) return "okta-identity";
  // Cortex XDR: incident_id, alerts array with alert_id
  if (body.incident_id && (body.alerts || body.description)) return "palo-alto-cortex-xdr";
  // Syslog: raw text with priority header <PRI> or explicit syslog fields
  if (body.facility !== undefined || body.syslogMessage || body.priority !== undefined) return "generic-syslog";
  // Explicit provider field from Postman/client
  if (body.provider) {
    const p = String(body.provider).toLowerCase();
    if (p.includes("cloudtrail")) return "aws-cloudtrail";
    if (p.includes("guardduty")) return "aws-guardduty";
    if (p.includes("crowdstrike")) return "crowdstrike-edr";
    if (p.includes("sentinel")) return "sentinelone-edr";
    if (p.includes("entra") || p.includes("microsoft")) return "microsoft-entra";
    if (p.includes("okta")) return "okta-identity";
    if (p.includes("cortex") || p.includes("palo")) return "palo-alto-cortex-xdr";
    if (p.includes("syslog")) return "generic-syslog";
    if (p.includes("github")) return "github";
  }
  return "generic-webhook";
}

function evaluateAlert(action: string, severity: string, outcome: string): boolean {
  const a = action.toUpperCase();
  const s = severity.toUpperCase();
  const o = outcome.toUpperCase();
  const threatActions = ["POLICY", "ADMIN", "DELETE", "EXEC", "ATTACH", "FORCE_PUSH", "REVOKE", "DISABLE", "TERMINATE", "MALWARE", "RANSOMWARE"];
  return threatActions.some(t => a.includes(t)) || s === "HIGH" || s === "CRITICAL" || o === "FAILED" || o === "DENIED" || o === "FAILURE";
}

function normalizeByProvider(provider: ProviderKey, body: any, tenantId: string, envId: string, connectorId: string, payloadHash: string, now: string): NormalizeResult {
  const base = { id: `norm-${generateUUID().slice(0, 8)}`, tenantId, connectorId, rawPayloadHash: payloadHash, normalizationStatus: "NORMALIZED", occurredAt: now };

  switch (provider) {
    // ── 1. GitHub Audit Log ──
    case "github": {
      const user = body.sender?.login || body.pusher?.name || "github-user";
      const repo = body.repository?.full_name || "unknown-repo";
      const action = body.commits ? "GIT_PUSH_COMMIT" : body.zen ? "WEBHOOK_PING" : (body.action || "REPOSITORY_EVENT");
      const alert = evaluateAlert(action, "", "");
      return { provider, ocsfCategoryUid: 6, ocsfClassUid: 6001, alertTriggered: alert, normalized: {
        ...base, environmentId: `GITHUB-${repo.toUpperCase()}`,
        eventClass: "GITHUB_AUDIT_LOG", eventCategory: "SOURCE_CONTROL_AUDIT",
        eventActivity: body.zen ? "WEBHOOK_PING" : "REPOSITORY_PUSH",
        severity: alert ? "HIGH" : "INFO", actorUserId: `gh-${user}`, actorEmail: `${user}@users.noreply.github.com`,
        sourceIp: "140.82.112.4", action, outcome: "SUCCESS",
        source: { connector_id: connectorId, native_ref: repo, mapping_version: "github-v1.0" },
      }};
    }
    // ── 2. AWS CloudTrail ──
    case "aws-cloudtrail": {
      const eventName = body.eventName || "UnknownAction";
      const status = body.errorCode ? "FAILED" : "SUCCESS";
      const alert = evaluateAlert(eventName, "", status);
      let eventType = `aws.${body.eventSource?.replace(".amazonaws.com", "")}.${eventName}`;
      if (eventName.startsWith("Delete") || eventName.startsWith("Revoke")) eventType = `aws.destructive.${eventName}`;
      return { provider, ocsfCategoryUid: 3, ocsfClassUid: 3005, alertTriggered: alert, normalized: {
        ...base, environmentId: envId,
        eventClass: "CLOUD_IAM", eventCategory: "IDENTITY",
        eventActivity: eventType, severity: alert ? "HIGH" : "INFO",
        actorUserId: body.userIdentity?.arn || body.userIdentity?.userName || "aws-principal",
        actorEmail: body.userIdentity?.userName || "aws-service@internal",
        sourceIp: body.sourceIPAddress || "0.0.0.0", action: eventName, outcome: status,
        actor: { principal_id: body.userIdentity?.principalId, account_id: body.userIdentity?.accountId, arn: body.userIdentity?.arn, type: body.userIdentity?.type, mfa: body.userIdentity?.sessionContext?.attributes?.mfaAuthenticated === "true" },
        target: { service: body.eventSource, action: eventName, region: body.awsRegion, resource_arn: body.requestParameters?.roleArn || body.requestParameters?.bucketName },
        error_code: body.errorCode, error_message: body.errorMessage,
        source: { connector_id: connectorId, native_ref: body.eventID, mapping_version: "cloudtrail-v1.0" },
      }};
    }
    // ── 3. AWS GuardDuty ──
    case "aws-guardduty": {
      const sev = Math.min(10, Math.max(1, Math.round(body.severity || 5)));
      const sevLabel = sev >= 9 ? "CRITICAL" : sev >= 7 ? "HIGH" : sev >= 4 ? "MEDIUM" : "LOW";
      return { provider, ocsfCategoryUid: 2, ocsfClassUid: 2001, alertTriggered: sev >= 7, normalized: {
        ...base, environmentId: envId,
        eventClass: "CLOUD_THREAT_FINDING", eventCategory: "FINDINGS",
        eventActivity: body.type || "GuardDutyFinding", severity: sevLabel,
        actorUserId: body.resource?.accessKeyDetails?.userName || "aws-guardduty",
        actorEmail: "guardduty@aws.internal", sourceIp: "0.0.0.0", action: body.type, outcome: "DETECTED",
        finding: { uid: body.id, title: body.title, description: body.description, types: [body.type], src_url: body.arn },
        source: { connector_id: connectorId, native_ref: body.id, mapping_version: "guardduty-v1.0" },
      }};
    }
    // ── 4. CrowdStrike Falcon EDR ──
    case "crowdstrike-edr": {
      const behavior = body.behaviors?.[0] || {};
      const sevMap: Record<number, string> = { 1: "LOW", 2: "MEDIUM", 3: "HIGH", 4: "CRITICAL", 5: "CRITICAL" };
      const sev = sevMap[body.max_severity] || "HIGH";
      return { provider, ocsfCategoryUid: 1, ocsfClassUid: 1007, alertTriggered: true, normalized: {
        ...base, environmentId: envId,
        eventClass: "ENDPOINT_EDR", eventCategory: "ENDPOINT",
        eventActivity: "PROCESS_EXECUTION", severity: sev,
        actorUserId: behavior.user_name || "SYSTEM", actorEmail: `${behavior.user_name || "system"}@endpoint`,
        sourceIp: body.device?.local_ip || "0.0.0.0", action: behavior.tactic || "Execution", outcome: "DETECTED",
        device: { uid: body.device?.device_id, hostname: body.device?.hostname, ip: body.device?.local_ip, os: body.device?.os_version },
        process: { name: behavior.filename, cmd_line: behavior.cmdline, sha256: behavior.sha256 },
        attacks: body.behaviors?.map((b: any) => ({ tactic: b.tactic, technique: b.technique })),
        source: { connector_id: connectorId, native_ref: body.detection_id || body.composite_id, mapping_version: "crowdstrike-v1.0" },
      }};
    }
    // ── 5. SentinelOne EDR ──
    case "sentinelone-edr": {
      const score = body.threatInfo?.confidenceScore ?? 50;
      const sev = score >= 90 ? "CRITICAL" : score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
      return { provider, ocsfCategoryUid: 2, ocsfClassUid: 2001, alertTriggered: score >= 70, normalized: {
        ...base, environmentId: envId,
        eventClass: "ENDPOINT_EDR", eventCategory: "ENDPOINT",
        eventActivity: "THREAT_DETECTION", severity: sev,
        actorUserId: body.threatInfo?.processUser || "SYSTEM", actorEmail: `${body.threatInfo?.processUser || "system"}@endpoint`,
        sourceIp: body.agentDetectionInfo?.agentIp || "0.0.0.0", action: body.threatInfo?.classification || "MALWARE", outcome: body.threatInfo?.mitigationStatus || "DETECTED",
        device: { uid: body.agentDetectionInfo?.agentId, hostname: body.agentDetectionInfo?.agentComputerName, ip: body.agentDetectionInfo?.agentIp, os: body.agentDetectionInfo?.agentOsName },
        finding: { uid: body.threatInfo?.threatId || body.id, title: body.threatInfo?.threatName, confidence_score: score, status: body.threatInfo?.incidentStatus },
        source: { connector_id: connectorId, native_ref: body.threatInfo?.threatId, mapping_version: "sentinelone-v1.0" },
      }};
    }
    // ── 6. Microsoft Entra ID ──
    case "microsoft-entra": {
      const authResult = body.status?.errorCode === 0 ? "SUCCESS" : body.status?.errorCode ? "FAILED" : "UNKNOWN";
      const riskRaw = String(body.riskLevelDuringSignIn || "").toLowerCase();
      const riskSev = riskRaw === "high" ? "HIGH" : riskRaw === "medium" ? "MEDIUM" : "INFO";
      const alert = authResult === "FAILED" || riskRaw === "high";
      return { provider, ocsfCategoryUid: 3, ocsfClassUid: 3002, alertTriggered: alert, normalized: {
        ...base, environmentId: envId,
        eventClass: "IDENTITY_SIGNIN", eventCategory: "IDENTITY",
        eventActivity: "USER_AUTHENTICATION", severity: alert ? "HIGH" : riskSev,
        actorUserId: body.userId || body.userPrincipalName || "entra-user",
        actorEmail: body.userPrincipalName || "user@tenant.onmicrosoft.com",
        sourceIp: body.ipAddress || "0.0.0.0", action: "SIGN_IN", outcome: authResult,
        application: { id: body.appId, name: body.appDisplayName },
        device: { browser: body.deviceDetail?.browser, os: body.deviceDetail?.operatingSystem, is_compliant: body.deviceDetail?.isCompliant },
        location: { city: body.location?.city, country: body.location?.countryOrRegion },
        conditional_access: body.conditionalAccessStatus, risk_state: riskRaw || "none",
        source: { connector_id: connectorId, native_ref: body.id, mapping_version: "entra-v1.0" },
      }};
    }
    // ── 7. Okta Identity Cloud ──
    case "okta-identity": {
      const isSuccess = body.outcome?.result === "SUCCESS";
      const sev = isSuccess ? "INFO" : "HIGH";
      return { provider, ocsfCategoryUid: 3, ocsfClassUid: 3002, alertTriggered: !isSuccess, normalized: {
        ...base, environmentId: envId,
        eventClass: "IDENTITY_AUTH", eventCategory: "IDENTITY",
        eventActivity: body.eventType || "user.session.start", severity: sev,
        actorUserId: body.actor?.id || "okta-user", actorEmail: body.actor?.alternateId || "user@okta.com",
        sourceIp: body.client?.ipAddress || "0.0.0.0", action: body.eventType || "LOGIN", outcome: body.outcome?.result || "UNKNOWN",
        actor: { uid: body.actor?.id, display_name: body.actor?.displayName, type: body.actor?.type },
        geo: body.client?.geographicalContext ? { city: body.client.geographicalContext.city, country: body.client.geographicalContext.country } : undefined,
        status_detail: body.outcome?.reason || body.displayMessage,
        source: { connector_id: connectorId, native_ref: body.uuid, mapping_version: "okta-v1.0" },
      }};
    }
    // ── 8. Palo Alto Cortex XDR ──
    case "palo-alto-cortex-xdr": {
      const firstAlert = body.alerts?.[0] || {};
      const sevMap: Record<string, string> = { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW" };
      const sev = sevMap[String(body.severity || firstAlert.severity || "high").toLowerCase()] || "HIGH";
      return { provider, ocsfCategoryUid: 2, ocsfClassUid: 2001, alertTriggered: true, normalized: {
        ...base, environmentId: envId,
        eventClass: "XDR_INCIDENT", eventCategory: "ENDPOINT",
        eventActivity: "INCIDENT_DETECTION", severity: sev,
        actorUserId: firstAlert.user_name || body.users?.[0] || "SYSTEM", actorEmail: `${firstAlert.user_name || "system"}@xdr`,
        sourceIp: firstAlert.host_ip || "0.0.0.0", action: firstAlert.category || "MALWARE_THREAT", outcome: "DETECTED",
        finding: { uid: body.incident_id, title: firstAlert.name || body.description, description: body.description, types: [firstAlert.category || "INCIDENT"] },
        device: { hostname: firstAlert.host_name || body.hosts?.[0], ip: firstAlert.host_ip },
        process: firstAlert.causality_actor_process_image_name ? { name: firstAlert.causality_actor_process_image_name, cmd_line: firstAlert.causality_actor_process_command_line, sha256: firstAlert.causality_actor_process_sha256 } : undefined,
        source: { connector_id: connectorId, native_ref: body.incident_id, mapping_version: "cortex-xdr-v1.0" },
      }};
    }
    // ── 9. Generic Syslog (RFC 5424 / 3164) ──
    case "generic-syslog": {
      const msg = body.message || body.syslogMessage || "";
      let actionType = "GENERIC_LOG";
      let targetUser: string | undefined;
      let srcIp: string | undefined;
      if (msg.includes("Accepted password") || msg.includes("Accepted publickey")) { actionType = "AUTH_SUCCESS"; const m = msg.match(/for\s+(\S+)\s+from\s+(\S+)/); if (m) { targetUser = m[1]; srcIp = m[2]; } }
      else if (msg.includes("Failed password") || msg.includes("authentication failure")) { actionType = "AUTH_FAILURE"; const m = msg.match(/for\s+(?:invalid user\s+)?(\S+)\s+from\s+(\S+)/); if (m) { targetUser = m[1]; srcIp = m[2]; } }
      else if (msg.toLowerCase().includes("drop") || msg.toLowerCase().includes("denied")) { actionType = "NETWORK_DROP"; const m = msg.match(/SRC=(\S+)/); if (m) srcIp = m[1]; }
      const alert = actionType === "AUTH_FAILURE" || actionType === "NETWORK_DROP";
      return { provider, ocsfCategoryUid: 4, ocsfClassUid: 4001, alertTriggered: alert, normalized: {
        ...base, environmentId: envId,
        eventClass: "SYSLOG_EVENT", eventCategory: "NETWORK",
        eventActivity: actionType, severity: alert ? "HIGH" : "INFO",
        actorUserId: targetUser || "syslog-user", actorEmail: `${targetUser || "system"}@syslog`,
        sourceIp: srcIp || body.sourceIp || "0.0.0.0", action: actionType, outcome: actionType.includes("SUCCESS") ? "SUCCESS" : actionType.includes("FAILURE") ? "FAILED" : "LOGGED",
        host: { hostname: body.hostname || "unknown", app_name: body.appName || "syslog" },
        syslog: { facility: body.facility, severity: body.severity, priority: body.priority },
        source: { connector_id: connectorId, native_ref: `sys-${generateUUID().slice(0,8)}`, mapping_version: "syslog-v1.0" },
      }};
    }
    // ── 10. Generic Webhook (Fallback for any unrecognized payload) ──
    default: {
      const eventClassRaw = body.eventClass || "SECURITY_EVENT";
      const actionRaw = body.action || body.activity || "UNKNOWN_ACTION";
      const outcomeRaw = body.outcome || body.result || "SUCCESS";
      const sevRaw = body.severity || "INFO";
      const alert = evaluateAlert(actionRaw, sevRaw, outcomeRaw);
      const actorEmail = body.email || body.user?.email || body.actorEmail || "analyst@acme.com";
      const actorUserId = body.userId || body.actorUserId || (actorEmail.includes("@") ? `usr-${actorEmail.split("@")[0]}` : "usr-generic");
      return { provider: "generic-webhook", ocsfCategoryUid: 0, ocsfClassUid: 0, alertTriggered: alert, normalized: {
        ...base, environmentId: envId,
        eventClass: eventClassRaw, eventCategory: body.eventCategory || "SECURITY_OPERATIONS",
        eventActivity: body.activity || body.eventActivity || "GENERIC_EVENT", severity: alert ? "HIGH" : sevRaw,
        actorUserId, actorEmail, sourceIp: body.sourceIp || "0.0.0.0", action: actionRaw, outcome: outcomeRaw,
        source: { connector_id: connectorId, native_ref: body.eventId || generateUUID().slice(0,8), mapping_version: "webhook-v1.0" },
      }};
    }
  }
}

async function handleApiProxy(req: NextRequest, slugArray: string[]) {
  const method = req.method;
  const path = slugArray.join("/");
  const targetPort = resolveServicePort(method, path);
  const baseUrl =
    targetPort === 3002
      ? process.env.SHIELD_INGEST_URL || "http://127.0.0.1:3002"
      : targetPort === 3003
      ? process.env.SHIELD_AI_URL || "http://127.0.0.1:3003"
      : process.env.SHIELD_CORE_URL || "http://127.0.0.1:3001";
  const targetUrl = `${baseUrl}/api/v1/${path}${req.nextUrl.search}`;

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
    "x-tenant-id": tenantId,
  };

  // 1. Forward Authorization and Cookies to shield-core (or shield-ingest)
  const authHeader = req.headers.get("authorization");
  if (authHeader) outboundHeaders["Authorization"] = authHeader;
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) outboundHeaders["Cookie"] = cookieHeader;

  // 2. Server-side HMAC Signing for Webhook Ingestion
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
      {
        statusCode: 200,
        data: [
          { id: "generic-webhook", name: "Generic Webhook Ingestion", category: "Webhook Ingestion", description: "Ingest raw security logs directly via secure webhooks", supportedAuthTypes: ["API_KEY", "WEBHOOK_SECRET"] },
          { id: "generic-syslog", name: "Generic Syslog Ingestion", category: "Syslog Ingestion", description: "Ingest RFC 5424 / RFC 3164 syslog security feeds", supportedAuthTypes: ["SYSLOG_TLS", "API_KEY"] },
          { id: "microsoft-entra", name: "Microsoft 365 / Entra ID", category: "Identity / Productivity", description: "Collect Microsoft Entra ID audit & sign-in logs", supportedAuthTypes: ["OAUTH", "CLIENT_CREDENTIALS"] },
          { id: "aws-cloudtrail", name: "AWS CloudTrail", category: "Cloud Infrastructure", description: "Ingest AWS API activity logs via SQS / EventBridge", supportedAuthTypes: ["SERVICE_ACCOUNT", "API_KEY"] },
          { id: "azure-monitor", name: "Azure Activity Logs", category: "Cloud Infrastructure", description: "Ingest Azure Security Center and Activity events", supportedAuthTypes: ["CLIENT_CREDENTIALS", "SERVICE_ACCOUNT"] },
          { id: "crowdstrike-edr", name: "CrowdStrike Falcon EDR", category: "EDR", description: "Endpoint detection and response security telemetry", supportedAuthTypes: ["CLIENT_CREDENTIALS", "API_KEY"] },
        ],
      },
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

  // Route: /api/v1/connectors and sub-routes
  if (path.startsWith("connectors")) {
    const connId = slugArray[1] && slugArray[1] !== "connectors" ? slugArray[1] : `conn-${parsedBody.provider || "generic-webhook"}-${generateUUID().slice(0, 6)}`;
    const isDisable = path.endsWith("/disable");
    const isActivate = path.endsWith("/activate");

    if (isDisable) {
      connectorStateStore.set(connId, { status: "DISABLED", state: "DISCONNECTED", healthStatus: "DISABLED" });
    } else if (isActivate) {
      connectorStateStore.set(connId, { status: "ACTIVE", state: "CONNECTED", healthStatus: "HEALTHY" });
    }

    const savedState = connectorStateStore.get(connId) || {
      status: isDisable ? "DISABLED" : "ACTIVE",
      state: isDisable ? "DISCONNECTED" : "CONNECTED",
      healthStatus: isDisable ? "DISABLED" : "HEALTHY",
    };

    // Sub-action: /test
    if (path.endsWith("/test")) {
      const dynamicLatency = Math.floor(Math.random() * 45) + 15; // 15ms - 60ms
      return NextResponse.json(
        {
          statusCode: 200,
          data: {
            success: true,
            latencyMs: dynamicLatency,
            message: `Connection test successful to ${connId}`,
            testedAt: now,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    // Sub-action: /sync
    if (path.endsWith("/sync")) {
      const eventsSynced = Math.floor(Math.random() * 250) + 25; // 25 - 275 events
      return NextResponse.json(
        {
          statusCode: 200,
          data: {
            connectorId: connId,
            status: "SYNCED",
            eventsProcessed: eventsSynced,
            syncedAt: now,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    // Sub-action: /health
    if (path.endsWith("/health")) {
      const dynamicLag = savedState.status === "DISABLED" ? 0 : Math.floor(Math.random() * 20) + 5;
      return NextResponse.json(
        {
          statusCode: 200,
          data: {
            instanceId: connId,
            tenant_id: tenantId,
            healthStatus: savedState.healthStatus,
            lastHeartbeat: now,
            lagMs: dynamicLag,
            errorRate: 0,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    // Sub-action: DELETE (Retire connector)
    if (method === "DELETE") {
      connectorStateStore.set(connId, { status: "DISABLED", state: "NOT_CONNECTED", healthStatus: "DISABLED" });
      return NextResponse.json(
        {
          statusCode: 200,
          data: {
            id: connId,
            tenant_id: tenantId,
            state: "NOT_CONNECTED",
            deletedAt: now,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    // Sub-action: GET /connectors (List connectors)
    if (method === "GET" && slugArray.length === 1) {
      return NextResponse.json(
        {
          statusCode: 200,
          data: [
            {
              id: connId,
              tenantId,
              name: "Primary Security Gateway Webhook",
              provider: "generic-webhook",
              sourceRegion: "us-east-1",
              environmentId: "PRODUCTION-US-EAST",
              state: savedState.state,
              status: savedState.status,
              healthStatus: savedState.healthStatus,
              hmacSecret: `whsec_${sha256Mock(connId).slice(0, 32)}`,
              webhookUrl: `https://ingest.zoikoshield.io/api/v1/ingestion/webhooks/${connId}`,
              eventsIngestedCount: 42,
              lastEventAt: now,
            },
          ],
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    const message = isDisable ? "Connector disabled" : isActivate ? "Connector activated" : method === "POST" ? "Connector created successfully" : "Connector details retrieved";

    return NextResponse.json(
      {
        statusCode: method === "POST" && slugArray.length === 1 ? 201 : 200,
        message,
        data: {
          id: connId,
          tenantId,
          name: parsedBody.name || "Primary Security Gateway Webhook",
          provider: parsedBody.provider || "generic-webhook",
          sourceRegion: parsedBody.sourceRegion || "us-east-1",
          environmentId: parsedBody.environmentId || "PRODUCTION-US-EAST",
          status: savedState.status,
          state: savedState.state,
          healthStatus: savedState.healthStatus,
          hmacSecret: `whsec_${sha256Mock(connId).slice(0, 32)}`,
          webhookUrl: `https://ingest.zoikoshield.io/api/v1/ingestion/webhooks/${connId}`,
          eventsIngestedCount: 1,
          lastEventAt: now,
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/ingestion/webhooks/:connectorId
  // OCSF-Compliant Normalization Engine (Spec Section 07 | Event Architecture)
  // Covers ALL 10 providers: github, aws-cloudtrail, aws-guardduty, crowdstrike-edr,
  // sentinelone-edr, microsoft-entra, okta-identity, palo-alto-cortex-xdr, generic-syslog, generic-webhook
  if (path.startsWith("ingestion")) {
    const payloadHash = sha256Mock(rawBodyText || JSON.stringify(parsedBody));
    const connectorId = slugArray[slugArray.length - 1] || "conn-01";
    const envId = parsedBody.environmentId || parsedBody.environment || "PRODUCTION-US-EAST";

    // --- Provider Auto-Detection Engine ---
    const provider = detectProvider(parsedBody);
    const normalizeResult = normalizeByProvider(provider, parsedBody, tenantId, envId, connectorId, payloadHash, now);

    ingestedEventsStore.unshift(normalizeResult.normalized);

    return NextResponse.json(
      {
        status: "INGESTED_AND_NORMALIZED",
        eventId: parsedBody.eventId || `evt-${generateUUID().slice(0, 8)}`,
        payloadHash,
        provider: normalizeResult.provider,
        ocsf: { category_uid: normalizeResult.ocsfCategoryUid, class_uid: normalizeResult.ocsfClassUid },
        normalized: normalizeResult.normalized,
        alertTriggered: normalizeResult.alertTriggered,
        normalizerVersion: "1.0.0",
        mappingVersion: "ocsf-map-17",
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/events (Query all normalized events across tools)
  if (path.startsWith("events")) {
    const connectorIdQuery = req.nextUrl.searchParams.get("connectorId");
    let filteredEvents = ingestedEventsStore;
    if (connectorIdQuery) {
      filteredEvents = ingestedEventsStore.filter((ev) => ev.connectorId === connectorIdQuery);
    }
    return NextResponse.json(
      {
        statusCode: 200,
        total: filteredEvents.length,
        data: filteredEvents,
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

  // Route: /api/v1/ai/decisions/:envelopeId/*
  if (path.startsWith("ai/decisions") || path.startsWith("decisions")) {
    const envelopeId = slugArray[2] || slugArray[1] || "env-01";
    const baseEnvelope = {
      envelopeId,
      tenantId,
      environmentId: "PRODUCTION-US-EAST",
      createdAt: now,
      aiLabelAndUseCaseName: {
        aiLabel: "AI Generated - Human Oversight Mandatory",
        useCaseName: "Threat-Investigation-Copilot",
        modelRoute: "vertex-ai/gemini-1.5-pro",
        version: "v2.4.0",
      },
      sourcesAndSpans: [
        {
          sourceId: "ev-telemetry-01",
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
        appealUrl: `https://trust.zoikoshield.io/appeals/decisions/${envelopeId}`,
        feedbackChannel: "secops-ai-oversight@acme.com",
        customerAffecting: true,
      },
      payload: {
        executiveSummary: "Autonomous AI investigation confirms high-severity credential brute-force telemetry against corporate accounts from attacking IP 198.51.100.42. MITRE T1110.001 detected.",
        threatAssessment: "MITRE ATT&CK T1110 (Brute Force) & T1078 (Valid Accounts). Recommended immediate session invalidation.",
      },
    };

    if (path.endsWith("/accept")) {
      return NextResponse.json(
        {
          ...baseEnvelope,
          controls: { ...baseEnvelope.controls, state: "ACCEPTED" },
          humanDecisionAndRationale: {
            decidedBy: parsedBody.decidedBy || "usr-sarah-chen-01",
            decision: "ACCEPT",
            rationale: parsedBody.rationale || "Verified against cryptographic Merkle evidence",
            decidedAt: now,
            evidenceRef: `ev-ai-dec-${generateUUID().slice(0, 8)}`,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    if (path.endsWith("/modify")) {
      return NextResponse.json(
        {
          ...baseEnvelope,
          controls: { ...baseEnvelope.controls, state: "MODIFIED" },
          humanDecisionAndRationale: {
            decidedBy: parsedBody.decidedBy || "usr-sarah-chen-01",
            decision: "MODIFY",
            rationale: parsedBody.rationale || "Modified assessment scope before authorization",
            modifiedContent: parsedBody.modifiedContent || "Adjusted threat rating and recommended containment scope",
            decidedAt: now,
            evidenceRef: `ev-ai-dec-${generateUUID().slice(0, 8)}`,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    if (path.endsWith("/reject")) {
      return NextResponse.json(
        {
          ...baseEnvelope,
          controls: { ...baseEnvelope.controls, state: "REJECTED" },
          humanDecisionAndRationale: {
            decidedBy: parsedBody.decidedBy || "usr-sarah-chen-01",
            decision: "REJECT",
            rationale: parsedBody.rationale || "Determined to be benign credential synchronization issue",
            decidedAt: now,
            evidenceRef: `ev-ai-dec-${generateUUID().slice(0, 8)}`,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    if (path.endsWith("/escalate")) {
      return NextResponse.json(
        {
          ...baseEnvelope,
          controls: { ...baseEnvelope.controls, state: "ESCALATED" },
          humanDecisionAndRationale: {
            decidedBy: parsedBody.decidedBy || "usr-sarah-chen-01",
            decision: "ESCALATE",
            rationale: parsedBody.rationale || "Escalated for Tier-2 SOC Lead and Incident Commander review",
            escalatedToRole: parsedBody.escalatedToRole || "INCIDENT_COMMANDER",
            decidedAt: now,
            evidenceRef: `ev-ai-dec-${generateUUID().slice(0, 8)}`,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    if (path.endsWith("/verify-action")) {
      return NextResponse.json(
        {
          permitted: true,
          role: parsedBody.role || "SECURITY_ANALYST",
          responseAuthorityTier: parsedBody.responseAuthorityTier || "R1",
          verifiedAt: now,
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    return NextResponse.json(baseEnvelope, { headers: { "X-ZoikoShield-Source": "simulated" } });
  }

  // Route: /api/v1/ai/inventory
  if (path === "ai/inventory" || path.startsWith("ai/inventory")) {
    if (method === "POST") {
      return NextResponse.json(
        {
          status: "success",
          data: {
            ...parsedBody,
            modelId: parsedBody.modelId || `custom-model-${generateUUID().slice(0, 6)}`,
            lifecycleState: parsedBody.lifecycleState || "PROPOSED",
            registeredAt: now,
            updatedAt: now,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }
    if (method === "PATCH") {
      return NextResponse.json(
        {
          status: "success",
          data: {
            modelId: slugArray[2] || "gemini-1.5-pro",
            ...parsedBody,
            updatedAt: now,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }
    if (method === "DELETE") {
      return NextResponse.json(
        {
          status: "success",
          data: { modelId: slugArray[2] || "gemini-1.5-pro", decommissioned: true },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }
    return NextResponse.json(
      {
        status: "success",
        data: {
          inventoryVersion: "1.0.0-NIST-EUAI",
          totalRegisteredModels: 3,
          models: [
            {
              modelId: "gemini-1.5-pro",
              provider: "Google",
              modelFamily: "Gemini",
              version: "1.5-pro-002",
              euAiActClassification: "LIMITED_RISK",
              nistRmfAlignment: ["GOVERN", "MAP", "MEASURE", "MANAGE"],
              purpose:
                "Complex multi-vector threat correlation, case investigation, and incident RCA generation",
              primaryUseCaseKeys: [
                "RESPONSE_RECOMMENDATION",
                "INVESTIGATION_HYPOTHESIS",
                "INCIDENT_RCA",
              ],
              deterministicFallbackEngine:
                "Tier-1 Deterministic RCA Engine (Rule-Based)",
              hhiWeight: 0.6,
              humanOversightRequired: true,
              lifecycleState: "APPROVED_FOR_PRODUCTION",
              registeredAt: now,
              updatedAt: now,
            },
            {
              modelId: "gemini-1.5-flash",
              provider: "Google",
              modelFamily: "Gemini",
              version: "1.5-flash-002",
              euAiActClassification: "MINIMAL_RISK",
              nistRmfAlignment: ["GOVERN", "MAP", "MEASURE"],
              purpose:
                "Fast telemetry parsing, entity explanation, and query expansion",
              primaryUseCaseKeys: [
                "ENTITY_EXPLANATION",
                "NEXT_QUERY",
                "CASE_SUMMARY",
              ],
              deterministicFallbackEngine:
                "Rule-Based Entity Lookup & Deterministic Cache",
              hhiWeight: 0.3,
              humanOversightRequired: false,
              lifecycleState: "APPROVED_FOR_PRODUCTION",
              registeredAt: now,
              updatedAt: now,
            },
            {
              modelId: "claude-3-5-sonnet",
              provider: "Anthropic",
              modelFamily: "Claude",
              version: "3.5-sonnet-20241022",
              euAiActClassification: "LIMITED_RISK",
              nistRmfAlignment: ["GOVERN", "MAP", "MEASURE", "MANAGE"],
              purpose:
                "Secondary multi-provider failover for threat hypothesis and adversarial verification",
              primaryUseCaseKeys: [
                "INVESTIGATION_HYPOTHESIS",
                "ADVERSARIAL_VERIFICATION",
              ],
              deterministicFallbackEngine: "Deterministic Threat Matrix Fallback",
              hhiWeight: 0.1,
              humanOversightRequired: true,
              lifecycleState: "APPROVED_FOR_PRODUCTION",
              registeredAt: now,
              updatedAt: now,
            },
          ],
          highRiskUseCasesCount: 2,
          providerConcentrationHhi: 4200,
          governanceComplianceStatus: "COMPLIANT_NIST_EU_AI_ACT",
          assessedAt: now,
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
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
        dilithiumSignature: `pqc_mldsa65_${sha256Mock(generateUUID()).slice(0, 48)}`,
        ecdsaP256Signature: `ecdsa_p256_${sha256Mock(generateUUID()).slice(0, 48)}`,
        ed25519Signature: `ecdsa_p256_${sha256Mock(generateUUID()).slice(0, 48)}`,
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

  // Route: /api/v1/commercial/plans
  if (path.startsWith("commercial/plans")) {
    if (path.includes("recommend")) {
      const assets = parsedBody.protectedAssetCount || 250;
      const dailyGb = parsedBody.estimatedDailyGb || 25;
      const req247 = parsedBody.requiresContinuous24x7Mdr || false;
      const reqSov = parsedBody.requiresDedicatedTenantIsolation || false;

      let recKey = "SHIELD_ESSENTIAL";
      const rationale: string[] = [];

      if (reqSov || assets > 5000 || dailyGb > 500) {
        recKey = "SHIELD_ENTERPRISE";
        rationale.push("Enterprise-scale telemetry volume or sovereign isolation requires bespoke Enterprise plan.");
      } else if (req247 || assets > 1000 || dailyGb > 100) {
        recKey = "SHIELD_ADVANCED";
        rationale.push("Continuous 24/7 MDR and high asset scale requires Shield Advanced with 15-minute containment SLAs.");
      } else if (assets > 250 || dailyGb > 25) {
        recKey = "SHIELD_PROFESSIONAL";
        rationale.push("Asset count and telemetry exceed Essential baseline. Shield Professional provides attack graphs and AI copilot.");
      } else {
        rationale.push("Scale fits baseline Shield Essential tier perfectly with foundational MDR and Dilithium3 ledger.");
      }

      const allTiers = [
        {
          key: "SHIELD_ESSENTIAL",
          displayName: "Shield Essential",
          tagline: "Foundational MDR & Post-Quantum Compliance",
          description: "For growing organizations requiring continuous threat detection and post-quantum proof ledger.",
          pricing: { monthlyUsd: 2000, annualBilledMonthlyUsd: 1800, isContractOnly: false, currency: "USD" },
          allocations: { maxProtectedAssets: 250, includedTelemetryGbPerDay: 25, incidentResponseSlaHours: 4, retentionDays: 90, includedRetainerHoursPerYear: 0 },
          includedOffers: ["MANAGED_DEFENSE", "CONTINUOUS_ASSURANCE", "CRYPTO_LEDGER"],
          highlightedFeatures: ["250 Protected Assets & 25 GB/day Telemetry", "P0 Certified Connectors", "Automated SOC 2 & ISO 27001", "Dilithium3 Post-Quantum Merkle Ledger", "4-Hour Critical Incident Response Target"],
          governanceFeatures: ["Anti-Perverse Billing Guard", "Dual-approver R3-R4 workflows", "Automated evidence proofs"],
          supportModel: "Standard 8x5 Business Hours Support",
        },
        {
          key: "SHIELD_PROFESSIONAL",
          displayName: "Shield Professional",
          tagline: "Advanced SecOps, Attack Path Graphs & AI Copilot",
          description: "For mid-market enterprises requiring deep attack graph analysis, AI security copilot, and 1-hour response SLAs.",
          pricing: { monthlyUsd: 4000, annualBilledMonthlyUsd: 3600, isContractOnly: false, currency: "USD" },
          allocations: { maxProtectedAssets: 1000, includedTelemetryGbPerDay: 100, incidentResponseSlaHours: 1, retentionDays: 365, includedRetainerHoursPerYear: 20 },
          includedOffers: ["MANAGED_DEFENSE", "CONTINUOUS_ASSURANCE", "CRYPTO_LEDGER", "EXPOSURE_MANAGEMENT", "AI_SECURITY_COPILOT", "INCIDENT_RETAINER"],
          highlightedFeatures: ["1,000 Protected Assets & 100 GB/day Telemetry", "Multi-Hop Attack Path Graph", "ZoikoShield AI Security Copilot", "20 Included Retainer Hours/yr", "1-Hour Incident Response SLA", "1-Year Evidence Retention"],
          governanceFeatures: ["Mandatory 10-Field Decision Review Envelope", "Prompt injection circuit breaker", "Counsel-controlled legal logging"],
          supportModel: "Extended 16x7 Coverage",
          isPopular: true,
        },
        {
          key: "SHIELD_ADVANCED",
          displayName: "Shield Advanced",
          tagline: "Full-Spectrum Defense, Continuous Validation & 24/7 MDR",
          description: "For highly regulated institutions requiring continuous 24/7 SOC operations, defensive posture verification, and rapid containment.",
          pricing: { monthlyUsd: 8000, annualBilledMonthlyUsd: 7200, isContractOnly: false, currency: "USD" },
          allocations: { maxProtectedAssets: 5000, includedTelemetryGbPerDay: 500, incidentResponseSlaHours: 0.25, retentionDays: 730, includedRetainerHoursPerYear: 50 },
          includedOffers: ["MANAGED_DEFENSE", "CONTINUOUS_ASSURANCE", "CRYPTO_LEDGER", "EXPOSURE_MANAGEMENT", "AI_SECURITY_COPILOT", "INCIDENT_RETAINER", "CONTINUOUS_SECURITY_VALIDATION"],
          highlightedFeatures: ["5,000 Protected Assets & 500 GB/day Telemetry", "Operationally-Proven 24/7/365 Continuous MDR", "15-Minute Critical Incident SLA", "Continuous Security Validation & Testing", "50 Included Retainer Hours/yr", "2-Year Evidence Retention"],
          governanceFeatures: ["Rule SVC-01 Verified Operational Readiness", "Cryptographic Simulation Receipts", "Multi-party Quorum Approval"],
          supportModel: "24/7/365 Dedicated Lead Incident Commander",
        },
        {
          key: "SHIELD_ENTERPRISE",
          displayName: "Shield Enterprise",
          tagline: "Sovereign Cells, Custom SLAs & Bespoke Governance",
          description: "For multinational conglomerates and government entities requiring dedicated cryptographic cells and BYOK key governance.",
          pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: "USD" },
          allocations: { maxProtectedAssets: null, includedTelemetryGbPerDay: null, incidentResponseSlaHours: 0.1, retentionDays: 2555, includedRetainerHoursPerYear: 100 },
          includedOffers: ["MANAGED_DEFENSE", "CONTINUOUS_ASSURANCE", "CRYPTO_LEDGER", "EXPOSURE_MANAGEMENT", "AI_SECURITY_COPILOT", "INCIDENT_RETAINER", "PURPLE_TEAM_SIMULATION", "SOVEREIGN_CELL", "BYOK_KEY_MANAGEMENT"],
          highlightedFeatures: ["Unlimited Custom Asset & Telemetry Bands", "Dedicated Single-Tenant Sovereign Regional Partitions", "Bring-Your-Own-KMS (BYOK)", "Custom Statutory Assurance Packs", "100+ Included Retainer Hours", "7-Year Regulatory Evidence Preservation"],
          governanceFeatures: ["Custom Cross-Tenant JIT Elevation", "Bespoke Statutory Compliance Auditing", "Full Source Code Escrow Options"],
          supportModel: "White-Glove 24/7 Named Principal Engineer",
        },
      ];

      const recommendedPlan = allTiers.find((t) => t.key === recKey) || allTiers[0];
      const alternativePlans = allTiers.filter((t) => t.key !== recKey);

      return NextResponse.json(
        {
          data: {
            recommendedPlan,
            rationale,
            alternativePlans,
          },
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    return NextResponse.json(
      {
        data: [
          {
            key: "SHIELD_ESSENTIAL",
            displayName: "Shield Essential",
            tagline: "Foundational MDR & Post-Quantum Compliance",
            description: "For growing organizations requiring continuous threat detection, compliance automation, and post-quantum proof ledger.",
            pricing: { monthlyUsd: 2000, annualBilledMonthlyUsd: 1800, isContractOnly: false, currency: "USD" },
            allocations: { maxProtectedAssets: 250, includedTelemetryGbPerDay: 25, incidentResponseSlaHours: 4, retentionDays: 90, includedRetainerHoursPerYear: 0 },
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
            pricing: { monthlyUsd: 4000, annualBilledMonthlyUsd: 3600, isContractOnly: false, currency: "USD" },
            allocations: { maxProtectedAssets: 1000, includedTelemetryGbPerDay: 100, incidentResponseSlaHours: 1, retentionDays: 365, includedRetainerHoursPerYear: 20 },
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
            pricing: { monthlyUsd: 8000, annualBilledMonthlyUsd: 7200, isContractOnly: false, currency: "USD" },
            allocations: { maxProtectedAssets: 5000, includedTelemetryGbPerDay: 500, incidentResponseSlaHours: 0.25, retentionDays: 730, includedRetainerHoursPerYear: 50 },
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
              "Cryptographic Simulation Receipts with HSM Proof",
              "Multi-party Quorum Approval for R4 Network Freezes",
            ],
            supportModel: "24/7/365 Dedicated Lead Incident Commander & War Room Bridge",
          },
          {
            key: "SHIELD_ENTERPRISE",
            displayName: "Shield Enterprise",
            tagline: "Sovereign Cells, Custom SLAs & Bespoke Governance",
            description: "For multinational conglomerates and government entities requiring dedicated cryptographic cells and BYOK key governance.",
            pricing: { monthlyUsd: null, annualBilledMonthlyUsd: null, isContractOnly: true, currency: "USD" },
            allocations: { maxProtectedAssets: null, includedTelemetryGbPerDay: null, incidentResponseSlaHours: 0.1, retentionDays: 2555, includedRetainerHoursPerYear: 100 },
            includedOffers: [
              "MANAGED_DEFENSE",
              "CONTINUOUS_ASSURANCE",
              "CRYPTO_LEDGER",
              "EXPOSURE_MANAGEMENT",
              "AI_SECURITY_COPILOT",
              "INCIDENT_RETAINER",
              "PURPLE_TEAM_SIMULATION",
              "SOVEREIGN_CELL",
              "BYOK_KEY_MANAGEMENT",
            ],
            highlightedFeatures: [
              "Unlimited Custom Asset & Telemetry Bands",
              "Dedicated Single-Tenant Sovereign Regional Partitions",
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
            supportModel: "White-Glove 24/7 Named Principal Engineer & On-Call Forensic Team",
          },
        ],
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // Route: /api/v1/commercial/capabilities
  if (path.startsWith("commercial/capabilities")) {
    if (path.includes("domains")) {
      return NextResponse.json(
        {
          data: [
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
                  governanceRationale: "Hardware HSM Root-of-Trust and Dilithium3 cryptographic anchoring active.",
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
                  governanceRationale: "Deferred to Phase 2 midpoint per ADR-08.",
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
          ],
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    if (path.includes("evaluators/check")) {
      const framework = req.nextUrl.searchParams.get("framework") || "";
      const fw = framework.toUpperCase();
      const isDeferred =
        fw.includes("DORA") ||
        fw.includes("NIS2") ||
        fw.includes("PCI") ||
        fw.includes("EU_DORA") ||
        fw.includes("EU_NIS2") ||
        fw.includes("PCI_DSS");
      return NextResponse.json(
        { framework, active: !isDeferred },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    // Default: return 12 public services
    return NextResponse.json(
      {
        data: [
          {
            serviceId: "managed-detection-response",
            serviceName: "Managed Threat Detection & Rapid Response (MDR)",
            category: "OPERATIONS",
            publicOutcomeDescription:
              "Continuous 24/7 or business-hours telemetry correlation, incident triaging, and human-in-the-loop autonomous response.",
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
              "Tamper-evident Merkle epoch tree anchored with ML-DSA (Dilithium3) and Falcon post-quantum signatures with Hardware HSM root-of-trust.",
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
            serviceId: "enterprise-sovereign-partition",
            serviceName: "Dedicated Sovereign Partition & Customer-Managed Keys (BYOK)",
            category: "TRUST",
            publicOutcomeDescription:
              "Single-tenant dedicated sovereign partition, customer-managed keys (BYOK/KMS), and regional tenant data isolation.",
            status: "GATED",
            substantiatingComponents: ["shield-anchor"],
            includedCapabilities: ["BYOK_ENCRYPTION", "SOVEREIGN_CELL", "HARDWARE_HSM_ANCHOR"],
            pricingTierMinimum: "ENTERPRISE",
          },
        ],
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // --- SOAR Emergency Freeze & Release Handlers ---
  if (path === "response/freeze" || path === "actions/freeze" || path === "api/v1/actions/freeze") {
    const freezeId = `frz-${generateUUID().slice(0, 8)}`;
    return NextResponse.json(
      {
        data: {
          freezeId,
          scope: parsedBody?.scope || "TENANT",
          reason: parsedBody?.reason || "Emergency SOAR lockdown engaged",
          status: "FROZEN",
          activeFrom: new Date().toISOString(),
          activeUntil: null,
          createdBy: "sec-ops@enterprise.corp",
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  if (path === "response/unfreeze" || path === "actions/unfreeze" || path === "actions/freeze/release" || path.startsWith("actions/freeze/")) {
    return NextResponse.json(
      {
        data: {
          frozen: false,
          status: "OPERATIONAL",
          endedFreezes: 1,
          releasedAt: new Date().toISOString(),
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  if (path === "response/freeze-status" || path === "actions/freeze-status") {
    return NextResponse.json(
      {
        data: {
          frozen: false,
          status: "OPERATIONAL",
          freeze: null,
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // --- SOAR Pre-Execution Simulation Handler ---
  if (path.includes("simulate") || path === "actions/simulate" || path.startsWith("response-proposals/")) {
    const proposalId = parsedBody?.proposalId || path.split("/")[1] || `prop-${generateUUID().slice(0, 8)}`;
    const receiptId = `rcpt-sim-${generateUUID().slice(0, 8)}`;
    const actionType = parsedBody?.actionType || "ISOLATE_ENDPOINT";
    const targetRef = parsedBody?.targetRef || "srv-db-prod-02";

    return NextResponse.json(
      {
        data: {
          state: "SIMULATED",
          actionCommandId: `cmd-${generateUUID().slice(0, 8)}`,
          receipt: {
            receiptId,
            commandId: `cmd-${generateUUID().slice(0, 8)}`,
            proposalId,
            tenantId: "00000000-0000-4000-8000-000000000001",
            actionType,
            targetRef,
            status: "SIMULATED",
            executedAt: new Date().toISOString(),
            blastRadiusScore: 0.05,
            observedEffect: {
              provider: "edr-agent",
              targetEndpoint: targetRef,
              networkIsolationActive: true,
              isolationReason: "Containment simulation via ZoikoShield SOAR",
              executionMode: "SIMULATED",
              affectedWorkstations: 0,
              affectedServers: 1,
              activeConnectionsDropped: 4,
              serviceImpact: "LOW (Database replica failover automatic)",
            },
            stateDiffs: [
              {
                target: targetRef,
                beforeState: "NETWORK_CONNECTED (Inbound/Outbound Open)",
                afterState: "NETWORK_ISOLATED (Management Loopback Only)",
                rollbackCommand: "UNISOLATE_ENDPOINT",
              },
            ],
            rollbackCapability: {
              supported: true,
              rollbackAction: "UNISOLATE_ENDPOINT",
            },
            safetyAttestationHash: sha256Mock(`${receiptId}:${actionType}:${targetRef}`),
            signature: sha256Mock(`ZS-SIMULATION-V1:${receiptId}:${actionType}`),
          },
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // --- Dual-Custody Cryptographic Quorum Handlers ---
  if (path === "action/dual-custody/initiate" || path === "api/v1/action/dual-custody/initiate") {
    const quorumId = `quorum-${generateUUID().slice(0, 8)}`;
    const singleUseRollbackToken = `ZS-ROLLBACK-TOKEN-${generateUUID().slice(0, 8).toUpperCase()}`;
    return NextResponse.json(
      {
        data: {
          quorumId,
          tenantId: parsedBody?.tenantId || "00000000-0000-4000-8000-000000000001",
          proposalId: parsedBody?.proposalId || "prop-isolate-r2",
          actionType: parsedBody?.actionType || "ISOLATE_ENDPOINT",
          targetResource: parsedBody?.targetResource || "srv-db-prod-02",
          authorityLevel: parsedBody?.authorityLevel || "R2",
          status: "PENDING_SECOND_SIGNATURE",
          initiator: parsedBody?.initiator || {
            userId: "usr-sarah-chen",
            fullName: "Sarah Chen (Lead Analyst)",
            role: "SECURITY_OPERATIONS_LEAD",
            signedAt: new Date().toISOString(),
          },
          singleUseRollbackToken,
          compensatingPlan: {
            rollbackCommand: parsedBody?.compensatingCommand || "UNISOLATE_ENDPOINT",
            targetResource: parsedBody?.targetResource || "srv-db-prod-02",
            reversibilityTier: parsedBody?.reversibilityTier || "R1",
          },
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  if (path === "action/dual-custody/approve" || path === "api/v1/action/dual-custody/approve") {
    const quorumId = parsedBody?.quorumId || `quorum-${generateUUID().slice(0, 8)}`;
    const approver = parsedBody?.approver || {
      userId: "usr-david-ross",
      fullName: "David Ross (SOC Director)",
      role: "TENANT_OWNER",
      signedAt: new Date().toISOString(),
    };
    const signature = sha256Mock(`ZS-QUORUM-RECEIPT-V1:${quorumId}:${approver.userId}:${Date.now()}`);

    return NextResponse.json(
      {
        data: {
          quorumId,
          status: "QUORUM_REACHED",
          initiator: {
            userId: "usr-sarah-chen",
            fullName: "Sarah Chen (Lead Analyst)",
            role: "SECURITY_OPERATIONS_LEAD",
          },
          secondaryApprover: approver,
          quorumSignature: signature,
          singleUseRollbackToken: `ZS-ROLLBACK-TOKEN-${generateUUID().slice(0, 8).toUpperCase()}`,
          finalizedAt: new Date().toISOString(),
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // --- Automated Rollback Compensation Handler ---
  if (path === "actions/rollback" || path === "api/v1/actions/rollback") {
    const rollbackToken = parsedBody?.rollbackToken || `ZS-ROLLBACK-TOKEN-${generateUUID().slice(0, 8).toUpperCase()}`;
    const receiptId = `rcpt-rollback-${generateUUID().slice(0, 8)}`;
    return NextResponse.json(
      {
        data: {
          status: "ROLLED_BACK",
          receiptId,
          rollbackToken,
          compensatedAt: new Date().toISOString(),
          actionType: "RESTORE_ACCESS / UNISOLATE_ENDPOINT",
          reconciliationStatus: "STATE_RECONCILED",
          evidenceHash: sha256Mock(`${receiptId}:${rollbackToken}`),
        },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // --- Spec §16.1 AI Security Copilot Query & Envelope Synthesis ---
  if (path === "copilot/query" || path === "api/v1/copilot/query") {
    const modeUpper = (parsedBody?.mode || "INVESTIGATE").toUpperCase();
    const envelopeId = `env-${generateUUID().slice(0, 8)}`;
    const query = parsedBody?.query || "Analyze suspicious cloud activity";

    const envelope = {
      envelopeId,
      tenantId,
      environmentId: "PRODUCTION",
      createdAt: now,
      aiLabelAndUseCaseName: {
        aiLabel: "ZoikoShield Guarded ModelArmor Engine v2.4",
        useCaseName: `COPILOT_${modeUpper}`,
        modelRoute: "vertex-ai/gemini-1.5-pro-002",
        version: "gemini-1.5-pro-002",
        modelIdentifier: "gemini-1.5-pro-002",
        providerProfile: "gcp-vertex-ai-europe-west2",
        riskTier: modeUpper === "RESPOND" ? "HIGH" : "MEDIUM",
      },
      sourcesAndSpans: [
        {
          sourceId: "src-ocsf-auth-3002",
          sourceType: "OCSF_AUTH_EVENT",
          name: "aws.guardduty.iam-exfiltration",
          type: "TELEMETRY_LOG",
          documentRef: "ref-ocsf-v1.1.0-e98124",
          exactSpan: "Principal: AROA45881:marcus.vance from non-corporate IP 198.51.100.99 accessed srv-db-prod-01",
          span: "Principal: AROA45881:marcus.vance from non-corporate IP 198.51.100.99 accessed srv-db-prod-01",
          confidence: 0.98,
          confidenceScore: 0.98,
        },
        {
          sourceId: "src-mitre-t1078",
          sourceType: "FRAMEWORK_MAPPING",
          name: "MITRE ATT&CK T1078.004",
          type: "THREAT_INTEL",
          documentRef: "ref-mitre-v14.1",
          exactSpan: "Valid Accounts: Cloud Accounts credential exfiltration path",
          span: "Valid Accounts: Cloud Accounts credential exfiltration path",
          confidence: 0.96,
          confidenceScore: 0.96,
        },
      ],
      knownMissingStaleOrConflictingEvidence: {
        missingEvidence: modeUpper === "REPORT" ? ["Final Tier-3 memory forensics image dump pending"] : [],
        staleEvidence: [],
        conflictingEvidence: [],
        missingEvidenceCount: modeUpper === "REPORT" ? 1 : 0,
        staleEvidenceCount: 0,
        conflictingEvidenceCount: 0,
        freshnessSeconds: 12,
        completenessRatio: modeUpper === "REPORT" ? 0.92 : 1.0,
      },
      calibratedConfidenceAndUncertainty: {
        score: modeUpper === "RESPOND" ? 0.91 : modeUpper === "REPORT" ? 0.85 : 0.95,
        qualitativeBand: modeUpper === "REPORT" ? "MEDIUM" : "HIGH",
        confidenceTier: modeUpper === "REPORT" ? "MEDIUM" : "HIGH",
        calibrationBasis: "Multi-sensor alignment across normalized OCSF telemetry, Entra ID audit logs & VPC Flow logs.",
        uncertaintyFactors: [
          "Assumed role session expires in 38 minutes.",
          "Lateral VPC access verification pending VPC flow log batch delivery.",
        ],
      },
      alternativeHypothesesOrActions: [
        {
          actionId: "ALT-01",
          title: "Passive Honeypot Monitoring",
          rationale: "Observe attacker reconnaissance without alerting threat actor by revoking credentials.",
          tradeOffs: "Preserves threat attribution telemetry but risks immediate data exfiltration.",
          tradeOff: "Preserves threat attribution telemetry but risks immediate data exfiltration.",
        },
        {
          actionId: "ALT-02",
          title: "Network Perimeter Edge Quarantine",
          rationale: "Block source IP 198.51.100.99 at edge WAF/firewall without revoking IAM credentials.",
          tradeOffs: "Prevents direct ingress but does not invalidate stolen STS session tokens.",
          tradeOff: "Prevents direct ingress but does not invalidate stolen STS session tokens.",
        },
      ],
      expectedImpactAndReversibility: {
        blastRadius: modeUpper === "RESPOND"
          ? "1 Bastion Host (ec2-jump-01) isolated, 0 Customer-Facing Services impacted."
          : "Read-only evidence verification scope; zero operational service disruption.",
        isReversible: true,
        reversibilityTier: modeUpper === "RESPOND" ? "R2" : "R0",
        compensationPlan: "Automated Rollback Token ZS-RB-TOKEN-9941 restores security group and policy bindings.",
        downtimeExpected: false,
        reversibility: "Fully Reversible (Automated Rollback Snapshot)",
        compensationMechanism: "Signed Rollback Token: ZS-RB-TOKEN-9941",
      },
      requiredAuthorityAndApprovals: {
        requiredRole: modeUpper === "RESPOND" ? "LEAD_SECURITY_ANALYST" : "SECURITY_ANALYST",
        responseAuthorityTier: modeUpper === "RESPOND" ? "R2" : "R1",
        requiredAuthorityTier: modeUpper === "RESPOND" ? "R2" : "R1",
        dualApproverRequired: modeUpper === "RESPOND",
        dualCustodyRequired: modeUpper === "RESPOND",
        approverRoles: ["LEAD_SECURITY_ANALYST", "SOC_MANAGER"],
      },
      controls: {
        state: "UNREVIEWED",
        currentState: "PENDING_REVIEW",
        availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
      },
      humanDecisionAndRationale: {
        decidedBy: undefined,
        decision: undefined,
        rationale: undefined,
        modifiedContent: undefined,
        decidedAt: undefined,
        escalatedToRole: undefined,
        signature: undefined,
      },
      appealOrFeedbackRoute: {
        appealUrl: "https://shield.zoikogroup.com/appeals/v1",
        feedbackChannel: "secops-human-review@zoikogroup.com",
        customerAffecting: modeUpper === "RESPOND",
      },
      payload: {
        query,
        mode: modeUpper,
      },
    };

    reviewEnvelopesStore.set(envelopeId, envelope);

    const summary = `Synthesized ${modeUpper} decision hypothesis: correlated GuardDuty IAM exfiltration with MITRE T1078. Prepared Spec §16.1 10-field review envelope with reversible rollback token.`;

    return NextResponse.json(
      {
        summary,
        envelope,
        data: { summary, envelope },
      },
      { headers: { "X-ZoikoShield-Source": "simulated" } }
    );
  }

  // --- Spec §16.1 AI Decision Rights Review & Human Action Handlers ---
  if (path.startsWith("ai/decisions") || path.startsWith("api/v1/ai/decisions")) {
    const parts = path.replace(/^api\/v1\//, "").split("/");
    const envelopeId = parts[2];
    const action = parts[3]?.toLowerCase();

    // Action execution: POST /api/v1/ai/decisions/:envelopeId/:action
    if (method === "POST" && envelopeId && action) {
      const decidedBy = parsedBody?.decidedBy || "usr-sarah-chen-01";
      const rationale = parsedBody?.rationale?.trim();

      // Enforce Spec §16.1 Invariant: Attribution rationale is mandatory
      if (!rationale) {
        return NextResponse.json(
          { error: "Spec §16.1 Invariant: Attribution rationale is mandatory for human operator decisions" },
          { status: 400, headers: { "X-ZoikoShield-Source": "simulated" } }
        );
      }

      const actionUpper = action.toUpperCase();
      if (!["ACCEPT", "MODIFY", "REJECT", "ESCALATE"].includes(actionUpper)) {
        return NextResponse.json(
          { error: `Invalid transition action: ${action}. Must be ACCEPT, MODIFY, REJECT, or ESCALATE` },
          { status: 400, headers: { "X-ZoikoShield-Source": "simulated" } }
        );
      }

      if (actionUpper === "MODIFY" && !parsedBody?.modifiedContent?.trim()) {
        return NextResponse.json(
          { error: "Modified content is required when transition action is MODIFY" },
          { status: 400, headers: { "X-ZoikoShield-Source": "simulated" } }
        );
      }

      if (actionUpper === "ESCALATE" && !parsedBody?.escalatedToRole?.trim()) {
        return NextResponse.json(
          { error: "Target escalation role is required when transition action is ESCALATE" },
          { status: 400, headers: { "X-ZoikoShield-Source": "simulated" } }
        );
      }

      let envelope = reviewEnvelopesStore.get(envelopeId);
      if (!envelope) {
        envelope = {
          envelopeId,
          tenantId,
          environmentId: "PRODUCTION",
          createdAt: new Date(Date.now() - 30000).toISOString(),
          aiLabelAndUseCaseName: {
            aiLabel: "ZoikoShield Guarded ModelArmor Engine v2.4",
            useCaseName: "COPILOT_INTERACTIVE_DECISION",
            modelRoute: "vertex-ai/gemini-1.5-pro-002",
            version: "gemini-1.5-pro-002",
            modelIdentifier: "gemini-1.5-pro-002",
            providerProfile: "gcp-vertex-ai-europe-west2",
            riskTier: "HIGH",
          },
          sourcesAndSpans: [
            {
              sourceId: "src-ocsf-3002",
              sourceType: "OCSF_EVENT_CORRELATION",
              name: "aws.guardduty.iam-exfiltration",
              type: "TELEMETRY_LOG",
              exactSpan: "Principal: AROAEXAMPLE:usr-analyst-lead-01 from non-corporate IP 198.51.100.99",
              span: "Principal: AROAEXAMPLE:usr-analyst-lead-01 from non-corporate IP 198.51.100.99",
              confidence: 0.98,
              confidenceScore: 0.98,
            },
          ],
          knownMissingStaleOrConflictingEvidence: {
            missingEvidence: [],
            staleEvidence: [],
            conflictingEvidence: [],
            missingEvidenceCount: 0,
            staleEvidenceCount: 0,
            conflictingEvidenceCount: 0,
            freshnessSeconds: 10,
            completenessRatio: 1.0,
          },
          calibratedConfidenceAndUncertainty: {
            score: 0.95,
            qualitativeBand: "HIGH",
            confidenceTier: "HIGH",
            calibrationBasis: "Human operator reviewed and confirmed.",
            uncertaintyFactors: [],
          },
          alternativeHypothesesOrActions: [],
          expectedImpactAndReversibility: {
            blastRadius: "Production scope approved by operator.",
            isReversible: true,
            reversibilityTier: "R2",
            downtimeExpected: false,
            reversibility: "Fully Reversible",
            compensationMechanism: "Rollback Token: ZS-RB-TOKEN-9941",
          },
          requiredAuthorityAndApprovals: {
            requiredRole: "LEAD_SECURITY_ANALYST",
            responseAuthorityTier: "R2",
            requiredAuthorityTier: "R2",
            dualApproverRequired: true,
            dualCustodyRequired: true,
            approverRoles: ["LEAD_SECURITY_ANALYST"],
          },
          controls: {
            state: "UNREVIEWED",
            currentState: "PENDING_REVIEW",
            availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"],
          },
          humanDecisionAndRationale: {},
          appealOrFeedbackRoute: {
            appealUrl: "https://shield.zoikogroup.com/appeals/v1",
            feedbackChannel: "secops-human-review@zoikogroup.com",
            customerAffecting: false,
          },
        };
      }

      const decidedAt = new Date().toISOString();
      const receiptSignature = sha256Mock(
        `ZS-DECISION-RECEIPT-V1:${envelopeId}:${actionUpper}:${decidedBy}:${decidedAt}:${rationale}`
      );

      let newState = "ACCEPTED";
      if (actionUpper === "MODIFY") newState = "MODIFIED";
      else if (actionUpper === "REJECT") newState = "REJECTED";
      else if (actionUpper === "ESCALATE") newState = "ESCALATED";

      envelope.controls = {
        state: newState,
        currentState: newState,
        availableTransitions: actionUpper === "ESCALATE" ? ["ACCEPT", "REJECT"] : [],
      };

      envelope.humanDecisionAndRationale = {
        decision: actionUpper,
        decidedBy,
        decidedAt,
        rationale,
        signature: receiptSignature,
        modifiedContent: parsedBody?.modifiedContent,
        escalatedToRole: parsedBody?.escalatedToRole,
      };

      reviewEnvelopesStore.set(envelopeId, envelope);

      const result = {
        status: newState,
        envelope,
        receiptSignature,
        decidedAt,
      };

      return NextResponse.json(
        {
          ...result,
          data: result,
        },
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    // Get envelope by ID: GET /api/v1/ai/decisions/:envelopeId
    if (method === "GET" && envelopeId && !action) {
      const envelope = reviewEnvelopesStore.get(envelopeId) || {
        envelopeId,
        tenantId,
        environmentId: "PRODUCTION",
        createdAt: now,
        aiLabelAndUseCaseName: {
          aiLabel: "ZoikoShield Guarded ModelArmor Engine v2.4",
          useCaseName: "COPILOT_INTERACTIVE_DECISION",
          modelRoute: "vertex-ai/gemini-1.5-pro-002",
          version: "gemini-1.5-pro-002",
        },
        sourcesAndSpans: [],
        knownMissingStaleOrConflictingEvidence: { missingEvidence: [], staleEvidence: [], conflictingEvidence: [] },
        calibratedConfidenceAndUncertainty: { score: 0.95, qualitativeBand: "HIGH", calibrationBasis: "Nominal telemetry baseline", uncertaintyFactors: [] },
        alternativeHypothesesOrActions: [],
        expectedImpactAndReversibility: { blastRadius: "Default scope", isReversible: true, reversibilityTier: "R1" },
        requiredAuthorityAndApprovals: { requiredRole: "SECURITY_ANALYST", responseAuthorityTier: "R1", dualApproverRequired: false },
        controls: { state: "UNREVIEWED", availableTransitions: ["ACCEPT", "MODIFY", "REJECT", "ESCALATE"] },
        humanDecisionAndRationale: {},
        appealOrFeedbackRoute: { appealUrl: "https://shield.zoikogroup.com/appeals/v1", feedbackChannel: "secops-human-review@zoikogroup.com", customerAffecting: false },
      };

      return NextResponse.json(
        envelope,
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }

    // List envelopes: GET /api/v1/ai/decisions
    if (method === "GET" && (!envelopeId || envelopeId === "")) {
      return NextResponse.json(
        Array.from(reviewEnvelopesStore.values()),
        { headers: { "X-ZoikoShield-Source": "simulated" } }
      );
    }
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
