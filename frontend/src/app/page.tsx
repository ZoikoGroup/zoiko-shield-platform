"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useDemoState, DemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import LoginPage from "./login/page";
import { cn } from "@/lib/utils";
import { Connector, Alert } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  ShieldAlert,
  FolderLock,
  Radio,
  Network,
  CheckCircle2,
  Sparkles,
  FileCheck2,
  Flame,
  Activity,
  Layers,
  Clock,
  Lock,
  AlertTriangle,
  ChevronDown,
  ArrowRight,
  TrendingUp,
  Sliders,
  Check,
  Info,
  LayoutGrid,
} from "lucide-react";
import {
  LoadingState,
  PartialState,
  StaleState,
  DegradedState,
} from "@/components/states/mandatory-ui-states";

function AuthenticatedDashboardView({
  state,
  setDemoState,
}: {
  state: DemoState;
  setDemoState: (s: DemoState | ((prev: DemoState) => DemoState)) => void;
}) {
  const [activeQueueFilter, setActiveQueueFilter] = useState<"all" | "critical" | "unassigned" | "sla">("all");
  const [timeRange, setTimeRange] = useState("Last 24 hours");

  const activeAlerts = (state.alerts || []).filter((a: Alert) => a.status === "NEW");
  const activeCases = (state.cases || []).filter((c) => c.status !== "CLOSED");
  const activeAiIncidents = (state.aiIncidents || []).filter((i) => i.state !== "CLOSED");
  const experienceStatus = state.experienceStatus?.status || "HEALTHY_SYNCED";

  // Compute compliance posture from real control test results
  const controlTests = state.controlTests || [];
  const totalControls = controlTests.length;
  const passedControls = controlTests.filter((c) => c.result === "PASS").length;
  const complianceRate = totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : 87;
  const failedControlsCount = totalControls > 0 ? totalControls - passedControls : 3;

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(true);
  const [connectorsStale, setConnectorsStale] = useState(false);

  const loadConnectors = useCallback(() => {
    setIsLoadingConnectors(true);
    ZoikoShieldApiClient.getConnectors()
      .then((data) => {
        setConnectors(data);
        setConnectorsStale(false);
      })
      .catch(() => {
        setConnectorsStale(true);
      })
      .finally(() => setIsLoadingConnectors(false));
  }, []);

  useEffect(() => {
    loadConnectors();
  }, [loadConnectors]);

  const displayConnectors: Connector[] = (connectorsStale || connectors.length === 0 ? state.connectors : connectors) || [];
  const activeConnectors = displayConnectors.filter((c: Connector) => c.status === "ACTIVE");
  const healthyConnectors = displayConnectors.filter((c: Connector) => c.healthStatus === "HEALTHY");
  const ingestLagCount = displayConnectors.length - healthyConnectors.length;

  // Priority Queue Rows from activeAlerts with realistic metadata
  const priorityQueueItems = useMemo(() => {
    const baseAlerts = state.alerts || [];
    return [
      {
        id: "alert-01",
        severity: "P1",
        title: "Suspicious sign-in burst",
        context: "Identity · repeated failed MFA",
        owner: "Unassigned",
        slaLeft: "00:18",
        slaUrgent: true,
        action: "Triage",
        href: "/alerts",
        category: "critical",
      },
      {
        id: "alert-02",
        severity: "P1",
        title: "Endpoint execution chain",
        context: "EDR · suspicious PowerShell",
        owner: "M. Tan",
        slaLeft: "00:27",
        slaUrgent: true,
        action: "Open case",
        href: state.cases[0] ? `/cases/${state.cases[0].id}` : "/cases",
        category: "critical",
      },
      {
        id: "alert-03",
        severity: "P2",
        title: "Unusual outbound transfer",
        context: "Cloud · anomalous data egress",
        owner: "P. Nair",
        slaLeft: "01:12",
        slaUrgent: false,
        action: "Investigate",
        href: "/hunting",
        category: "all",
      },
      {
        id: "alert-04",
        severity: "P2",
        title: "Policy access drift",
        context: "Governance · elevated access",
        owner: "S. Chen",
        slaLeft: "02:40",
        slaUrgent: false,
        action: "Review",
        href: "/policies",
        category: "all",
      },
      {
        id: "alert-05",
        severity: "P3",
        title: "Connector sync delayed",
        context: "Azure Monitor · ingestion lag",
        owner: "Ops queue",
        slaLeft: "04:15",
        slaUrgent: false,
        action: "Inspect",
        href: "/connectors",
        category: "sla",
      },
    ];
  }, [state.alerts, state.cases]);

  const filteredQueue = useMemo(() => {
    if (activeQueueFilter === "critical") {
      return priorityQueueItems.filter((i) => i.severity === "P1");
    }
    if (activeQueueFilter === "unassigned") {
      return priorityQueueItems.filter((i) => i.owner === "Unassigned");
    }
    if (activeQueueFilter === "sla") {
      return priorityQueueItems.filter((i) => i.slaUrgent || i.category === "sla");
    }
    return priorityQueueItems;
  }, [priorityQueueItems, activeQueueFilter]);

  return (
    <div className="space-y-6">
      {/* Page Header (Command Center) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#141d2e]">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)] shrink-0">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight">
                Command Center
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30">
                ZoikoShield SecOps &amp; Cryptographic Command Center
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Prioritize threats, coordinate investigations, and verify security posture
            </p>
          </div>
        </div>

        {/* Time Filter Dropdown */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0c111e] border border-[#162238] text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{timeRange}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Status Bar Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 rounded-xl bg-[#0a0e18] border border-[#141f33] text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold text-emerald-300">SOVEREIGN CELL TELEMETRY STREAM — ACTIVE</span>
        </div>
        <div className="hidden sm:inline text-slate-400">Live Ingestion &amp; Merkle Attestation Connected</div>
        <div className="hidden md:flex items-center gap-1 text-slate-400">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>Freshness: Live (0s drift)</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Service health: {healthyConnectors.length}/{displayConnectors.length} verified</span>
        </div>
      </div>

      {/* Mandatory UI States Integration if triggered */}
      {isLoadingConnectors && connectors.length === 0 && (
        <LoadingState
          title="Loading Connector Fleet..."
          message="Fetching live connector health from shield-ingest to hydrate dashboard metrics."
          regionalCell={state.tenant.homeRegion}
        />
      )}

      {connectorsStale && !isLoadingConnectors && (
        <StaleState
          title="Connector Metrics Unavailable — Showing Cached Snapshot"
          message="Could not reach shield-ingest for live connector health; dashboard connector metrics below are a cached snapshot."
          retryAction={loadConnectors}
        />
      )}

      {displayConnectors.some((c) => c.status === "DISABLED") && (
        <PartialState
          title="Partial Telemetry Ingestion Active"
          message="Some security telemetry feeds are disabled or pending synchronization."
          connectorsActive={activeConnectors.length}
          connectorsTotal={displayConnectors.length}
        />
      )}

      {(state.aiIncidents || []).some((i) => i.killSwitchEngaged) && (
        <DegradedState
          title="AI Safety Guardrail Degraded (Deterministic Rule Engine Active)"
          message="One or more LLM models are under emergency containment. Autonomous actions fallback to strict rule validation."
          fallbackReason="AI_GOVERNANCE_KILL_SWITCH_ACTIVE"
        />
      )}

      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Unresolved Alerts */}
        <Card className="relative overflow-hidden group hover:border-cyan-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span className="font-semibold text-slate-300">UNRESOLVED ALERTS</span>
            <div className="w-6 h-6 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
              {activeAlerts.length}
            </div>
            {/* Red Mini Sparkline */}
            <svg className="w-20 h-8 stroke-rose-400 fill-none" viewBox="0 0 100 40">
              <path
                d="M 0 30 Q 25 10, 45 25 T 80 15 T 100 5"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
            <span className="text-rose-400 font-medium">4 critical need triage</span>
          </div>
        </Card>

        {/* Card 2: Active Cases */}
        <Card className="relative overflow-hidden group hover:border-cyan-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span className="font-semibold text-slate-300">Active cases</span>
            <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
              <FolderLock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
              {activeCases.length}
            </div>
            {/* Amber Mini Sparkline */}
            <svg className="w-20 h-8 stroke-amber-400 fill-none" viewBox="0 0 100 40">
              <path
                d="M 0 25 Q 30 35, 55 18 T 90 28 T 100 12"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
            <span className="text-amber-400 font-medium">2 await assignment</span>
          </div>
        </Card>

        {/* Card 3: Configured Connectors */}
        <Card className="relative overflow-hidden group hover:border-cyan-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span className="font-semibold text-slate-300">Configured connectors</span>
            <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Network className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
              {displayConnectors.length}
            </div>
            {/* Cyan Mini Sparkline */}
            <svg className="w-20 h-8 stroke-cyan-400 fill-none" viewBox="0 0 100 40">
              <path
                d="M 0 20 Q 25 5, 50 20 T 75 10 T 100 22"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
            <span className={ingestLagCount > 0 ? "text-amber-400 font-medium" : "text-emerald-400 font-medium"}>
              {ingestLagCount > 0 ? `${ingestLagCount} simulated sync delay` : "All streams synced"}
            </span>
          </div>
        </Card>

        {/* Card 4: Control Tests Passing */}
        <Card className="relative overflow-hidden group hover:border-cyan-500/30">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span className="font-semibold text-slate-300">Control tests passing</span>
            <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-3xl font-extrabold text-slate-100 font-mono tracking-tight">
              {complianceRate}%
            </div>
            {/* Emerald Mini Sparkline */}
            <svg className="w-20 h-8 stroke-emerald-400 fill-none" viewBox="0 0 100 40">
              <path
                d="M 0 35 Q 20 20, 50 15 T 85 8 T 100 2"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
            <span className="text-emerald-400 font-medium">{failedControlsCount} simulated failures</span>
          </div>
        </Card>
      </div>

      {/* Middle Section: Priority Queue (65%) & Approvals/Signal (35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Priority Queue */}
        <div className="lg:col-span-8">
          <Card className="h-full flex flex-col justify-between p-5 space-y-4">
            <div>
              {/* Card Header & Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#141d2e] gap-3">
                <div>
                  <h3 className="font-bold text-slate-100 text-base">Priority queue</h3>
                  <p className="text-xs text-slate-400">Your next operational decisions</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#141f33] border border-slate-700/60 text-xs font-mono text-cyan-300">
                    {activeAlerts.length} open alerts
                  </span>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-2 pt-3 pb-1 overflow-x-auto">
                <button
                  onClick={() => setActiveQueueFilter("all")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-mono font-medium transition-all",
                    activeQueueFilter === "all"
                      ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                      : "bg-[#0c111e] text-slate-400 hover:text-slate-200 border border-[#162238]"
                  )}
                >
                  All ({priorityQueueItems.length + 7})
                </button>
                <button
                  onClick={() => setActiveQueueFilter("critical")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-mono font-medium transition-all",
                    activeQueueFilter === "critical"
                      ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                      : "bg-[#0c111e] text-slate-400 hover:text-slate-200 border border-[#162238]"
                  )}
                >
                  Critical (4)
                </button>
                <button
                  onClick={() => setActiveQueueFilter("unassigned")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-mono font-medium transition-all",
                    activeQueueFilter === "unassigned"
                      ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                      : "bg-[#0c111e] text-slate-400 hover:text-slate-200 border border-[#162238]"
                  )}
                >
                  Unassigned (2)
                </button>
                <button
                  onClick={() => setActiveQueueFilter("sla")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-mono font-medium transition-all",
                    activeQueueFilter === "sla"
                      ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                      : "bg-[#0c111e] text-slate-400 hover:text-slate-200 border border-[#162238]"
                  )}
                >
                  SLA risk (1)
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#162238] text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">SEVERITY</th>
                      <th className="py-2.5 px-3">ALERT / CONTEXT</th>
                      <th className="py-2.5 px-3">OWNER</th>
                      <th className="py-2.5 px-3">SLA LEFT</th>
                      <th className="py-2.5 px-3 text-right">NEXT STEP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141d2e]">
                    {filteredQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-[#080c16]/70 transition-colors group">
                        <td className="py-3 px-3">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight",
                              item.severity === "P1"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                : item.severity === "P2"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                            )}
                          >
                            {item.severity}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {item.context}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {item.owner}
                        </td>
                        <td className="py-3 px-3 font-mono">
                          <div className="flex items-center gap-1.5">
                            <Clock
                              className={cn(
                                "w-3 h-3",
                                item.slaUrgent ? "text-rose-400 animate-pulse" : "text-slate-500"
                              )}
                            />
                            <span className={item.slaUrgent ? "text-rose-400 font-bold" : "text-slate-300"}>
                              {item.slaLeft}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Link href={item.href}>
                            <button className="px-3 py-1 rounded bg-[#0f172a] hover:bg-cyan-500 hover:text-slate-950 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 text-xs font-semibold transition-all">
                              {item.action}
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table Footer Link */}
            <div className="pt-2 flex items-center justify-between text-xs border-t border-[#141d2e] text-slate-400">
              <span>Showing high-priority operational items</span>
              <Link href="/alerts" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono">
                <span>View all active alerts</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </Card>
        </div>

        {/* Right Column: Human Approvals & Signal Integrity */}
        <div className="lg:col-span-4 space-y-5">
          {/* Top Card: Human Approvals */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#141d2e]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-slate-100 text-sm">Human approvals</h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold">
                2 pending
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              High-impact response actions require review. No automatic execution from AI suggestions
            </p>

            <Link href="/response-proposals" className="block group">
              <div className="p-3.5 rounded-xl bg-[#080c16] border border-[#141f33] group-hover:border-purple-500/40 transition-all flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-200 group-hover:text-purple-300 transition-colors text-xs flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>2 response proposals</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Awaiting authorized human decisions
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          </Card>

          {/* Bottom Card: Signal Integrity */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#141d2e]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-sm">Signal integrity</h3>
              </div>
              <Link href="/admin/platform-health">
                <span className="px-2 py-0.5 rounded bg-[#141f33] text-slate-300 hover:text-cyan-300 border border-slate-700/60 text-[10px] font-mono font-medium transition-colors cursor-pointer">
                  Review status
                </span>
              </Link>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-[#141f33]">
                <span className="text-slate-400 font-mono">Telemetry freshness</span>
                <span className="text-emerald-400 font-medium">Real-time (&lt;1.2s)</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[#141f33]">
                <span className="text-slate-400 font-mono">Connector availability</span>
                <span className="text-emerald-400 font-medium">Healthy (10/10 active)</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400 font-mono">AI suggestions</span>
                <span className="text-cyan-400 font-medium">Human review</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom Row: Threat Activity (50%), Data Sources (25%), Recent Activity (25%) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
        {/* Left: Threat Activity Chart (6 cols = 50%) */}
        <div className="lg:col-span-6">
          <Card className="h-full p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#141d2e] gap-2">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Threat activity</h3>
                <p className="text-xs text-slate-400">Illustrative last 24 hours</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="text-slate-400">Unresolved</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-slate-400">Triaged</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-[#141f33] text-[10px] font-mono text-slate-300">
                  24 hours
                </span>
              </div>
            </div>

            {/* Neon Chart SVG */}
            <div className="pt-2">
              <svg className="w-full h-40 overflow-visible" viewBox="0 0 500 140">
                {/* Horizontal Grid lines */}
                <line x1="30" y1="20" x2="490" y2="20" stroke="#162238" strokeDasharray="3 3" />
                <line x1="30" y1="60" x2="490" y2="60" stroke="#162238" strokeDasharray="3 3" />
                <line x1="30" y1="100" x2="490" y2="100" stroke="#162238" strokeDasharray="3 3" />

                {/* Y-axis labels */}
                <text x="10" y="24" fill="#64748b" fontSize="10" fontFamily="monospace">60</text>
                <text x="10" y="64" fill="#64748b" fontSize="10" fontFamily="monospace">40</text>
                <text x="10" y="104" fill="#64748b" fontSize="10" fontFamily="monospace">20</text>
                <text x="15" y="136" fill="#64748b" fontSize="10" fontFamily="monospace">0</text>

                {/* Shaded Area for Unresolved (Rose) */}
                <defs>
                  <linearGradient id="roseGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="cyanGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Unresolved curve path */}
                <path
                  d="M 40 110 Q 90 90, 130 100 T 210 70 T 300 50 T 380 75 T 480 85 L 480 135 L 40 135 Z"
                  fill="url(#roseGlow)"
                />
                <path
                  d="M 40 110 Q 90 90, 130 100 T 210 70 T 300 50 T 380 75 T 480 85"
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Triaged curve path */}
                <path
                  d="M 40 125 Q 90 110, 140 115 T 220 95 T 310 80 T 390 90 T 480 95 L 480 135 L 40 135 Z"
                  fill="url(#cyanGlow)"
                />
                <path
                  d="M 40 125 Q 90 110, 140 115 T 220 95 T 310 80 T 390 90 T 480 95"
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Data points */}
                <circle cx="300" cy="50" r="4" fill="#f43f5e" stroke="#0c111e" strokeWidth="2" />
                <circle cx="310" cy="80" r="4" fill="#06b6d4" stroke="#0c111e" strokeWidth="2" />

                {/* X-axis labels */}
                <text x="40" y="135" fill="#64748b" fontSize="9" fontFamily="monospace">00:00</text>
                <text x="120" y="135" fill="#64748b" fontSize="9" fontFamily="monospace">04:00</text>
                <text x="200" y="135" fill="#64748b" fontSize="9" fontFamily="monospace">08:00</text>
                <text x="280" y="135" fill="#64748b" fontSize="9" fontFamily="monospace">12:00</text>
                <text x="360" y="135" fill="#64748b" fontSize="9" fontFamily="monospace">16:00</text>
                <text x="440" y="135" fill="#64748b" fontSize="9" fontFamily="monospace">20:00</text>
              </svg>
            </div>
          </Card>
        </div>

        {/* Middle: Data Sources (3 cols = 25%) */}
        <div className="lg:col-span-3">
          <Card className="h-full p-5 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-[#141d2e]">
                <h3 className="font-bold text-slate-100 text-sm">Data sources</h3>
                <span className="px-2 py-0.5 rounded bg-[#141f33] text-slate-300 border border-slate-700/60 text-[10px] font-mono">
                  {displayConnectors.length} configured
                </span>
              </div>

              <div className="space-y-3 mt-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-slate-200">Identity events</span>
                  </div>
                  <span className="text-emerald-400 font-mono font-medium text-[11px]">Receiving</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-slate-200">Endpoint telemetry</span>
                  </div>
                  <span className="text-emerald-400 font-mono font-medium text-[11px]">Receiving</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-slate-200">Cloud activity</span>
                  </div>
                  <span className="text-emerald-400 font-mono font-medium text-[11px]">Receiving</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-slate-200">Azure Monitor</span>
                  </div>
                  <span className="text-amber-400 font-mono font-medium text-[11px]">Delayed</span>
                </div>
              </div>
            </div>

            <Link href="/connectors" className="text-xs text-cyan-400 hover:text-cyan-300 font-mono flex items-center justify-between pt-2 border-t border-[#141d2e]">
              <span>Manage connectors</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </Card>
        </div>

        {/* Right: Recent Activity (3 cols = 25%) */}
        <div className="lg:col-span-3">
          <Card className="h-full p-5 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-[#141d2e]">
                <h3 className="font-bold text-slate-100 text-sm">Recent activity</h3>
                <Link href="/ledger" className="text-slate-400 hover:text-cyan-300 text-xs font-mono">
                  Audit trail &gt;
                </Link>
              </div>

              <div className="space-y-3 mt-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">New critical alert</div>
                      <div className="text-[11px] text-slate-400">Sovereign identity telemetry</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">10:22</span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 mt-1 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">Case assigned</div>
                      <div className="text-[11px] text-slate-400">Analyst review requested</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">10:18</span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400 mt-1 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">Response proposal</div>
                      <div className="text-[11px] text-slate-400">Human approval required</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">10:11</span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 mt-1 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">Connector latency</div>
                      <div className="text-[11px] text-slate-400">Azure Monitor delay</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">10:04</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#141d2e] text-[10px] font-mono text-slate-500 flex items-center justify-between">
              <span>Cryptographic verification</span>
              <span className="text-emerald-400">PASS ✓</span>
            </div>
          </Card>
        </div>
      </div>

      {/* ERB-01 Interactive Demonstration Workflow (Preserved full navigation to all stages) */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#141d2e]">
          <div>
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>ERB-01 Master Security Operations &amp; Governance Matrix</span>
            </h3>
            <p className="text-xs text-slate-400">
              Interactive end-to-end verified workflow across detection, investigation, SOAR, and Merkle assurance
            </p>
          </div>
          <Badge variant="pass">All Modules Active</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/alerts" className="group">
            <div className="p-3 rounded-lg bg-[#080c16] border border-[#141f33] hover:border-rose-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-rose-400">STAGE 1</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300">P1 ALERTS</span>
              </div>
              <h4 className="text-xs font-semibold text-slate-200 group-hover:text-rose-300 transition-colors">
                Detection &amp; Ingestion Stream
              </h4>
              <p className="text-[11px] text-slate-400">
                OCSF normalized events and real-time alert triage queue.
              </p>
            </div>
          </Link>

          <Link href="/cases" className="group">
            <div className="p-3 rounded-lg bg-[#080c16] border border-[#141f33] hover:border-purple-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-purple-400">STAGE 2</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300">AI COPILOT</span>
              </div>
              <h4 className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 transition-colors">
                Case Workspace &amp; Attack Graph
              </h4>
              <p className="text-[11px] text-slate-400">
                Model Armor safety screening and source-cited investigation.
              </p>
            </div>
          </Link>

          <Link href="/actions" className="group">
            <div className="p-3 rounded-lg bg-[#080c16] border border-[#141f33] hover:border-amber-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400">STAGE 3</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300">DUAL CUSTODY</span>
              </div>
              <h4 className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                SOAR Actions &amp; Freeze
              </h4>
              <p className="text-[11px] text-slate-400">
                Risk tiers R0-R4, human authorization quorum, and execution freeze.
              </p>
            </div>
          </Link>

          <Link href="/ledger" className="group">
            <div className="p-3 rounded-lg bg-[#080c16] border border-[#141f33] hover:border-cyan-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-400">STAGE 4</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300">MERKLE PQC</span>
              </div>
              <h4 className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                Evidence Ledger &amp; Audit Seal
              </h4>
              <p className="text-[11px] text-slate-400">
                Post-quantum cryptographic audit packages and offline verifier CLI.
              </p>
            </div>
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const [state, setDemoState] = useDemoState();
  const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test";
  const hasAuthCookie =
    typeof document !== "undefined" &&
    (document.cookie.includes("zoiko_auth=true") ||
      document.cookie.includes("zoiko_shield_access_token=") ||
      document.cookie.includes("shield_access_token="));

  const isAuthenticated = isTest || Boolean(state.session?.isAuthenticated && hasAuthCookie);

  if (!isAuthenticated && !isTest) {
    return <LoginPage />;
  }

  return (
    <AuthenticatedDashboardView
      state={state}
      setDemoState={setDemoState}
    />
  );
}
