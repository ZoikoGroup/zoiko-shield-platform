"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { TelemetryNormalized } from "@/lib/types";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  Radio,
  Send,
  Zap,
  CheckCircle2,
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
  "eventId": "evt-raw-auth-storm-01",
  "eventType": "user.authentication.failure",
  "occurredAt": "2026-09-02T08:00:00.000Z",
  "user": {
    "id": "usr-victim-99",
    "email": "victim.engineer@acme.com"
  },
  "sourceIp": "198.51.100.42",
  "result": "FAILED",
  "attemptCount": 5,
  "threatSignature": "T1110.001 - Password Spraying"
}`);
  const [isSending, setIsSending] = useState(false);
  const [lastNormalized, setLastNormalized] = useState<TelemetryNormalized | null>(null);
  const [alertTriggered, setAlertTriggered] = useState(false);

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
      setAlertTriggered(res.alertTriggered);
    } catch (err: any) {
      alert("Invalid JSON payload or Ingestion error: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const attackPresets = [
    {
      title: "Attack 1: Credential Stuffing Burst",
      desc: "5 failed logins from 198.51.100.42 (T1110.001)",
      payload: {
        eventId: "evt-failed-login-burst-99",
        eventType: "user.authentication.failure",
        occurredAt: new Date().toISOString(),
        email: "victim.engineer@acme.com",
        sourceIp: "198.51.100.42",
        action: "PASSWORD_AUTH",
        outcome: "FAILED",
        severity: "HIGH",
        eventClass: "AUTHENTICATION",
        activity: "LOGIN_ATTEMPT",
      },
    },
    {
      title: "Attack 2: EDR LSASS Memory Dump",
      desc: "Suspicious procdump process on prod worker host (T1003)",
      payload: {
        eventId: "evt-edr-lsass-dump-02",
        eventType: "endpoint.process.anomaly",
        occurredAt: new Date().toISOString(),
        email: "attacker.compromise@acme.com",
        sourceIp: "10.0.4.18",
        action: "PROCESS_EXECUTION",
        outcome: "BLOCKED",
        severity: "CRITICAL",
        eventClass: "EDR_PROCESS",
        activity: "PROCESS_SPAWN",
        processName: "procdump.exe -ma lsass.exe",
      },
    },
    {
      title: "Attack 3: CloudTrail IAM Escalation",
      desc: "AdministratorAccess policy attached to service role (T1078)",
      payload: {
        eventId: "evt-iam-escalation-03",
        eventType: "cloud.iam.policy_change",
        occurredAt: new Date().toISOString(),
        email: "compromised-key@acme.com",
        sourceIp: "203.0.113.88",
        action: "ATTACH_USER_POLICY",
        outcome: "SUCCESS",
        severity: "HIGH",
        eventClass: "CLOUD_IAM",
        activity: "POLICY_ATTACH",
        policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
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
            Inject synthetic security telemetry, inspect schema validation, and view OCSF-aligned normalization.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="cyan" onClick={() => router.push("/alerts")}>
            <span>Proceed to Alerts Queue</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {attackPresets.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => setRawJson(JSON.stringify(preset.payload, null, 2))}
            className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 text-left transition-all group cursor-pointer space-y-1"
          >
            <span className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors block">
              {preset.title}
            </span>
            <p className="text-[11px] font-mono text-slate-400">{preset.desc}</p>
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
            rows={12}
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

        {/* Right: Normalized View */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-emerald-400" />
              Normalized Telemetry Record (`TelemetryNormalized`)
            </h3>
            {lastNormalized && <Badge variant="pass">NORMALIZED</Badge>}
          </div>

          {lastNormalized ? (
            <div className="space-y-4 font-mono text-xs">
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
                  <span className="text-slate-500">ACTIVITY:</span>
                  <span className="text-amber-400 font-semibold">{lastNormalized.eventActivity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">ACTOR:</span>
                  <span className="text-slate-200">{lastNormalized.actorEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SOURCE IP:</span>
                  <span className="text-rose-400">{lastNormalized.sourceIp}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">OUTCOME:</span>
                  <Badge variant={lastNormalized.outcome === "FAILED" ? "critical" : "pass"}>
                    {lastNormalized.outcome}
                  </Badge>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-900">
                  <span className="text-slate-500">SHA-256 RAW HASH:</span>
                  <span className="text-cyan-300">{truncateHash(lastNormalized.rawPayloadHash, 10, 8)}</span>
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
              Click &quot;Ingest &amp; Normalize Payload&quot; on the left to observe real-time parsing, normalization, and detection rule triggering.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
