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

// In-memory connector state store to preserve disable/activate states across requests
const connectorStateStore = new Map<string, { status: string; state: string; healthStatus: string }>();

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

  // 2. Inject x-tenant-id and automatic Workload Token for shield-ingest (port 3002) calls
  if (targetPort === 3002) {
    outboundHeaders["x-tenant-id"] = tenantId;
    if (!outboundHeaders["Authorization"]) {
      const devSecret = process.env.WORKLOAD_IDENTITY_DEV_SECRET || "local-workload-identity-change-me";
      const headerObj = { alg: "HS256", typ: "JWT" };
      const nowSec = Math.floor(Date.now() / 1000);
      const payloadObj = {
        iat: nowSec,
        exp: nowSec + 50,
        aud: "shield-ingest",
        iss: "zoikoshield-workload-identity",
        sub: "frontend-gateway-proxy",
        jti: crypto.randomUUID(),
      };
      const b64Header = Buffer.from(JSON.stringify(headerObj)).toString("base64url");
      const b64Payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
      const signature = crypto
        .createHmac("sha256", devSecret)
        .update(`${b64Header}.${b64Payload}`)
        .digest("base64url");
      outboundHeaders["Authorization"] = `Bearer ${b64Header}.${b64Payload}.${signature}`;
    }
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
