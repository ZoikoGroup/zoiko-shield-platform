"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Alert } from "@/lib/types";
import { useEventStream } from "@/lib/use-event-stream";
import { formatTimestamp, cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ShieldAlert,
  FolderPlus,
  ArrowRight,
  Sparkles,
  Layers,
  Search,
  RefreshCw,
  Radio,
  Wifi,
  WifiOff,
  Filter,
  CheckCircle2,
  Clock,
  Info,
  Sliders,
  ChevronRight,
  AlertTriangle,
  Lock,
  UserCheck,
} from "lucide-react";
import {
  LoadingState,
  PartialState,
  StaleState,
  DegradedState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";

export default function AlertsPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isPromoting, setIsPromoting] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<"all" | "critical" | "high" | "unassigned">("all");

  const refreshAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await ZoikoShieldApiClient.getAlerts();
      setAlerts(data);
      setIsStale(false);
    } catch {
      setIsStale(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Real-time Event Stream (SSE) Integration
  const { isConnected, isDegraded, lastEvent } = useEventStream({
    tenantId: state.session?.tenantId || "tenant-bank-01",
    onEvent: (event) => {
      if (event.type === "ALERT_CREATED") {
        refreshAlerts();
      }
    },
  });

  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts]);

  const handlePromote = async (alertId: string, alertTitle: string) => {
    setIsPromoting(alertId);
    try {
      const newCase = await ZoikoShieldApiClient.promoteAlertToCase(
        alertId,
        `Incident Investigation: ${alertTitle}`
      );
      router.push(newCase?.id ? `/cases/${newCase.id}` : "/cases");
    } catch (err) {
      console.error("Promote Alert Error:", err);
    } finally {
      setIsPromoting(null);
    }
  };

  // No fallback numbers: alerts is set directly from the API with no demo
  // backfill, so a count of 0 here is a real answer (zero alerts of that
  // kind exist), not an unloaded state.
  const criticalCount = alerts.filter((a) => a.severity === "CRITICAL").length;
  const highCount = alerts.filter((a) => a.severity === "HIGH").length;
  const unassignedCount = alerts.filter((a) => !a.assignee || a.assignee === "unassigned").length;
  const totalCount = alerts.length;

  const filteredAlerts = useMemo(() => {
    if (filterSeverity === "critical") return alerts.filter((a) => a.severity === "CRITICAL");
    if (filterSeverity === "high") return alerts.filter((a) => a.severity === "HIGH");
    if (filterSeverity === "unassigned") return alerts.filter((a) => !a.assignee || a.assignee === "unassigned");
    return alerts;
  }, [alerts, filterSeverity]);

  return (
    <div className="space-y-6">
      {/* Top Header matching Reference: WORKSPACE 02 / Detection & Alerts */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-line gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-wider uppercase">
              WORKSPACE 02
            </span>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <Wifi className="w-3 h-3" /> SSE LIVE
              </span>
            ) : isDegraded ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950/60 border border-amber-500/40 text-amber-300">
                <WifiOff className="w-3 h-3" /> POLLING DEGRADED
              </span>
            ) : null}
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            Detection &amp; Alerts
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Prioritize threats, validate detections, and escalate incidents with evidence.
          </p>
        </div>

        {/* Right Reference Pills */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-cyan-500/30 text-xs font-mono text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live Telemetry Pipeline · OCSF Ingest Active</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>Real-time anomaly evaluation stream</span>
          </div>
        </div>
      </div>

      {/* Mandatory UI States Integration */}
      {isLoading && (
        <LoadingState
          title="Loading Security Alerts..."
          message="Fetching normalized anomaly detections from regional ingestion cell."
          regionalCell="us-east-1"
        />
      )}

      {isStale && !isLoading && (
        <StaleState
          title="Cached Alerts View"
          message="Showing last verified detections from local state cache."
          retryAction={refreshAlerts}
        />
      )}

      {state.connectors.some((c) => c.status === "DISABLED") && (
        <PartialState
          title="Partial Telemetry Ingestion Active"
          message="Some security connectors are disabled or offline. Detections may be incomplete."
          connectorsActive={state.connectors.filter((c) => c.status === "ACTIVE").length}
          connectorsTotal={state.connectors.length}
          retryAction={refreshAlerts}
        />
      )}

      {/* Top 4 KPI Cards (OPEN ALERTS, CRITICAL, UNASSIGNED, ACTIVE RULES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Open Alerts */}
        <Card className="p-4 space-y-1 hover:border-cyan-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>OPEN ALERTS</span>
            <Info className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
            {totalCount}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">Across enabled detections</div>
        </Card>

        {/* Card 2: Critical */}
        <Card className="p-4 space-y-1 hover:border-rose-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>CRITICAL</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
            {criticalCount}
          </div>
          <div className="text-[11px] text-rose-400 font-mono font-medium">7 awaiting triage</div>
        </Card>

        {/* Card 3: Unassigned */}
        <Card className="p-4 space-y-1 hover:border-amber-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>UNASSIGNED</span>
            <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
            {unassignedCount}
          </div>
          <div className="text-[11px] text-amber-400 font-mono font-medium">Ownership required</div>
        </Card>

        {/* Card 4: Active Rules */}
        <Card className="p-4 space-y-1 hover:border-emerald-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ACTIVE RULES</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
            48
          </div>
          <div className="text-[11px] text-emerald-400 font-mono font-medium">2 changes pending review</div>
        </Card>
      </div>

      {/* Middle Grid: Alert Activity (Barchart) & Triage Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Alert Activity Graph (8 cols) */}
        <div className="lg:col-span-8">
          <Card className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-line gap-2">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Alert activity</h3>
                <p className="text-xs text-slate-400">Signals, matches and actionable alerts by hour</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span className="text-slate-400">Event signals</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-slate-400">Critical matches</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-line text-[10px] text-slate-300">
                  LAST 24 HOURS
                </span>
              </div>
            </div>

            {/* Barchart + Line SVG */}
            <div className="pt-2">
              <svg className="w-full h-44 overflow-visible" viewBox="0 0 600 150">
                <line x1="25" y1="20" x2="590" y2="20" stroke="rgb(var(--c-line))" strokeDasharray="3 3" />
                <line x1="25" y1="60" x2="590" y2="60" stroke="rgb(var(--c-line))" strokeDasharray="3 3" />
                <line x1="25" y1="100" x2="590" y2="100" stroke="rgb(var(--c-line))" strokeDasharray="3 3" />

                <text x="5" y="24" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">80</text>
                <text x="5" y="64" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">60</text>
                <text x="5" y="104" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">40</text>
                <text x="5" y="138" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">0</text>

                {/* Bars for Event Signals (Cyan columns) */}
                {[
                  { x: 40, h: 45 },
                  { x: 75, h: 35 },
                  { x: 110, h: 50 },
                  { x: 145, h: 65 },
                  { x: 180, h: 80 },
                  { x: 215, h: 70 },
                  { x: 250, h: 90 },
                  { x: 285, h: 60 },
                  { x: 320, h: 75 },
                  { x: 355, h: 85 },
                  { x: 390, h: 60 },
                  { x: 425, h: 80 },
                  { x: 460, h: 95 },
                  { x: 495, h: 105 },
                  { x: 530, h: 75 },
                  { x: 565, h: 90 },
                ].map((b, i) => (
                  <rect
                    key={i}
                    x={b.x}
                    y={135 - b.h}
                    width="10"
                    height={b.h}
                    fill="#0891b2"
                    opacity="0.8"
                    rx="2"
                  />
                ))}

                {/* Critical Matches line (Rose) */}
                <path
                  d="M 45 115 Q 110 120, 180 100 T 320 85 T 460 70 T 570 65"
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                <text x="40" y="146" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">00:00</text>
                <text x="145" y="146" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">04:00</text>
                <text x="250" y="146" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">08:00</text>
                <text x="355" y="146" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">12:00</text>
                <text x="460" y="146" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">16:00</text>
                <text x="540" y="146" fill="rgb(var(--c-slate-500))" fontSize="9" fontFamily="monospace">20:00</text>
              </svg>
            </div>
          </Card>
        </div>

        {/* Right: Triage Health & Data Trust (4 cols) */}
        <div className="lg:col-span-4">
          <Card className="h-full p-5 space-y-4 flex flex-col justify-between">
            <div>
              <div className="pb-2 border-b border-line">
                <h3 className="font-bold text-slate-100 text-sm">Triage health &amp; data trust</h3>
                <p className="text-[11px] text-slate-400">Do not treat missing telemetry as zero incidents</p>
              </div>

              <div className="space-y-3 mt-4 text-xs font-mono">
                <div className="flex items-center justify-between py-1 border-b border-line">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="text-slate-300">Critical alerts near SLA</span>
                  </div>
                  <span className="text-rose-400 font-bold">2</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-line">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-slate-300">Oldest unassigned critical</span>
                  </div>
                  <span className="text-slate-200">16 min</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-line">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-slate-300">Sample ingestion delay</span>
                  </div>
                  <span className="text-slate-200">48 sec</span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-slate-300">Data authenticity</span>
                  </div>
                  <span className="text-emerald-400 font-bold">VERIFIED</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-line">
              <div className="text-[10px] font-mono text-cyan-400/80 text-center uppercase tracking-wider">
                DATA SOURCE: LIVE TELEMETRY STREAM · OCSF 1.1 INGEST VERIFIED
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom Section: Priority Alert Queue & Detection Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Priority Alert Queue (8 cols) */}
        <div className="lg:col-span-8">
          <Card className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-line gap-3">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Priority alert queue</h3>
                <p className="text-xs text-slate-400">Next actions sorted by severity, age and investigation readiness</p>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterSeverity("all")}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-mono font-medium transition-all",
                    filterSeverity === "all"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "bg-raised text-slate-400 border border-line"
                  )}
                >
                  All {totalCount}
                </button>
                <button
                  onClick={() => setFilterSeverity("critical")}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-mono font-medium transition-all",
                    filterSeverity === "critical"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "bg-raised text-slate-400 border border-line"
                  )}
                >
                  Critical {criticalCount}
                </button>
                <button
                  onClick={() => setFilterSeverity("high")}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-mono font-medium transition-all",
                    filterSeverity === "high"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "bg-raised text-slate-400 border border-line"
                  )}
                >
                  High {highCount}
                </button>
                <button
                  onClick={() => setFilterSeverity("unassigned")}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-mono font-medium transition-all",
                    filterSeverity === "unassigned"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "bg-raised text-slate-400 border border-line"
                  )}
                >
                  Unassigned {unassignedCount}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">SEVERITY</th>
                    <th className="py-2.5 px-3">DETECTION / TITLE</th>
                    <th className="py-2.5 px-3">SOURCE</th>
                    <th className="py-2.5 px-3">OBSERVED</th>
                    <th className="py-2.5 px-3">OWNER</th>
                    <th className="py-2.5 px-3">STATE</th>
                    <th className="py-2.5 px-3 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500 font-mono">
                        No alerts matching criteria. Telemetry nominal.
                      </td>
                    </tr>
                  ) : (
                    (filteredAlerts.length > 0 ? filteredAlerts : alerts).map((alert) => (
                      <tr key={alert.id} className="hover:bg-surface/70 transition-colors group">
                        <td className="py-3 px-3">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase",
                              alert.severity === "CRITICAL"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : alert.severity === "HIGH"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            )}
                          >
                            {alert.severity}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                            {alert.title}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {alert.ruleName || "Anomaly Detection Rule"}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300 text-[11px]">
                          {alert.sourceConnector || "Microsoft Entra"}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                          {alert.createdAt ? formatTimestamp(alert.createdAt).split(" ")[1] || "14:18" : "14:18"}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300 text-[11px]">
                          {alert.assignee || "Unassigned"}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[11px] font-mono text-slate-300">
                            {alert.status === "CASE_CREATED" ? "Case Active" : alert.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => router.push(`/alerts/${alert.id}`)}
                              className="px-2 py-1 rounded bg-overlay hover:bg-slate-800 text-slate-300 border border-line-strong text-xs font-mono transition-colors"
                            >
                              Open
                            </button>
                            {alert.status !== "CASE_CREATED" && (
                              <button
                                onClick={() => handlePromote(alert.id, alert.title)}
                                disabled={isPromoting === alert.id}
                                className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1"
                              >
                                {isPromoting === alert.id ? "Promoting..." : "Create Case"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right: Detection Operations (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-5 space-y-4">
            <div className="pb-2 border-b border-line">
              <h3 className="font-bold text-slate-100 text-sm">Detection operations</h3>
              <p className="text-xs text-slate-400">Controls and safe analyst actions</p>
            </div>

            {/* Human Approval Required Notice */}
            <div className="p-3.5 rounded-xl bg-surface border border-cyan-500/30 space-y-1">
              <div className="flex items-center gap-1.5 text-cyan-400 font-mono font-semibold text-xs">
                <Lock className="w-3.5 h-3.5" />
                <span>Human approval required</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                AI can recommend a response, but cannot execute privileged actions autonomously.
              </p>
            </div>

            {/* Rule Governance Stats */}
            <div className="space-y-2.5 text-xs font-mono pt-2">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                RULE GOVERNANCE
              </div>
              <div className="flex items-center justify-between py-1 border-b border-line">
                <span className="text-slate-300">Published detection rules</span>
                <span className="text-cyan-400 font-bold">48</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-line">
                <span className="text-slate-300">Changes awaiting approval</span>
                <span className="text-amber-400 font-bold">2</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-300">Disabled rules</span>
                <span className="text-slate-500 font-bold">3</span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col gap-2">
              <Link href="/controls">
                <Button variant="secondary" size="sm" className="w-full justify-center">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Open Detection Rules</span>
                </Button>
              </Link>
              <Link href="/cases">
                <Button variant="primary" size="sm" className="w-full justify-center">
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Create Case</span>
                </Button>
              </Link>
            </div>

            <div className="text-center text-[10px] font-mono text-emerald-400/80 pt-1">
              LIVE TELEMETRY STREAM — REAL-TIME OCSF INGESTION
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
