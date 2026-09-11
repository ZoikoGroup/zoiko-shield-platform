"use client";

import React, { useState } from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  ShieldAlert,
  AlertTriangle,
  Flame,
  Activity,
  Zap,
  Lock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Sparkles,
  Server,
  Layers,
} from "lucide-react";
import {
  LoadingState,
  DegradedState,
  PartialState,
  UnauthorizedState,
} from "@/components/states/mandatory-ui-states";

interface AiIncidentRecord {
  incidentId: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "ACTIVE" | "CONTAINED" | "RESOLVED";
  detectedAt: string;
  modelAffected: string;
  threatType: "PROMPT_INJECTION" | "PSI_MODEL_DRIFT" | "DATA_LEAKAGE" | "HALLUCINATION_ANOMALY";
  killSwitchEngaged: boolean;
}

export default function AiIncidentConsolePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [activeKillSwitch, setActiveKillSwitch] = useState<"NONE" | "DEGRADED" | "SHUTDOWN">("DEGRADED");
  const [isEngaging, setIsEngaging] = useState(false);
  const [incidents, setIncidents] = useState<AiIncidentRecord[]>([
    {
      incidentId: "inc-ai-2026-001",
      title: "Adversarial Multi-Turn Prompt Injection Bypass Attempt",
      severity: "CRITICAL",
      status: "CONTAINED",
      detectedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      modelAffected: "gemini-1.5-pro",
      threatType: "PROMPT_INJECTION",
      killSwitchEngaged: true,
    },
    {
      incidentId: "inc-ai-2026-002",
      title: "Population Stability Index (PSI) Feature Shift in Embedding Distribution",
      severity: "HIGH",
      status: "ACTIVE",
      detectedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      modelAffected: "text-embedding-004",
      threatType: "PSI_MODEL_DRIFT",
      killSwitchEngaged: false,
    },
  ]);

  const handleToggleKillSwitch = async (targetMode: "NONE" | "DEGRADED" | "SHUTDOWN") => {
    setIsEngaging(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setActiveKillSwitch(targetMode);
    } finally {
      setIsEngaging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="critical">§23 SAFETY GATE</Badge>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              AI INCIDENT LIFECYCLE &amp; KILL-SWITCH CONSOLE
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            AI Incident &amp; Safety Containment Console
          </h1>
          <p className="text-sm text-slate-400">
            Real-time monitoring of Model Armor prompt filters, PSI drift alarms, and dual-custody emergency kill-switches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={activeKillSwitch === "NONE" ? "healthy" : "critical"} className="px-3 py-1 font-mono text-xs">
            {activeKillSwitch === "NONE" ? "ALL LLMS ONLINE" : `KILL-SWITCH: ${activeKillSwitch}`}
          </Badge>
        </div>
      </div>

      {activeKillSwitch === "DEGRADED" && (
        <DegradedState
          title="Deterministic Fallback Active"
          message="Cloud LLM endpoints degraded to Tier-1 deterministic rule engine due to active PSI drift incident."
          fallbackReason="POPULATION_STABILITY_INDEX_DRIFT_EXCEEDED"
          retryAction={() => handleToggleKillSwitch("NONE")}
        />
      )}

      {/* Top 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card variant="cyber" className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-rose-400 font-bold">
              <Flame className="w-4 h-4" /> Active Incidents
            </span>
            <Badge variant="critical">{incidents.filter((i) => i.status === "ACTIVE").length} Active</Badge>
          </div>
          <div className="text-2xl font-black text-slate-100 font-mono">
            {incidents.length} Total Registered
          </div>
          <p className="text-[11px] text-slate-500 font-mono">
            Zero uncontained critical safety violations allowed under G1 release gate.
          </p>
        </Card>

        <Card variant="cyber" className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-amber-400 font-bold">
              <Activity className="w-4 h-4" /> Model Drift PSI
            </span>
            <Badge variant="ai">PSI: 0.282</Badge>
          </div>
          <div className="text-2xl font-black text-amber-300 font-mono">
            Significant Shift
          </div>
          <p className="text-[11px] text-slate-500 font-mono">
            Threshold: PSI &gt; 0.25 trips deterministic safe degradation.
          </p>
        </Card>

        <Card variant="cyber" className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <ShieldAlert className="w-4 h-4" /> Model Armor Filters
            </span>
            <Badge variant="pass">100% BLOCKED</Badge>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            0 Pass-Throughs
          </div>
          <p className="text-[11px] text-slate-500 font-mono">
            3-Layer defense (Regex, Classifier, Sandbox Canary) active.
          </p>
        </Card>
      </div>

      {/* Emergency Kill-Switch Controls */}
      <Card variant="cyber" className="p-6 border-rose-500/30 bg-rose-950/10 space-y-4">
        <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-rose-400" />
            <h2 className="text-sm font-bold text-slate-100 font-mono">
              Emergency AI Circuit Breaker &amp; Kill-Switch Controls
            </h2>
          </div>
          <Badge variant="critical">Dual-Custody Authorized</Badge>
        </div>

        <p className="text-xs text-slate-300">
          In the event of prompt injection escape, model weight poisoning, or regulatory non-compliance, authorized operators can instantly divert all inference to deterministic fallbacks or hard-shutdown AI endpoints.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => handleToggleKillSwitch("NONE")}
            isLoading={isEngaging}
            className={`text-xs font-mono border-slate-700 ${activeKillSwitch === "NONE" ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300" : ""}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Normal Cloud LLM Inference</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => handleToggleKillSwitch("DEGRADED")}
            isLoading={isEngaging}
            className={`text-xs font-mono border-slate-700 ${activeKillSwitch === "DEGRADED" ? "bg-amber-950/40 border-amber-500/50 text-amber-300" : ""}`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Degrade to Deterministic Rules</span>
          </Button>

          <Button
            variant="primary"
            onClick={() => handleToggleKillSwitch("SHUTDOWN")}
            isLoading={isEngaging}
            className={`text-xs font-mono bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 ${activeKillSwitch === "SHUTDOWN" ? "ring-2 ring-rose-400" : ""}`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Hard AI Endpoint Shutdown</span>
          </Button>
        </div>
      </Card>

      {/* Incidents Table */}
      <Card variant="cyber" className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100 font-mono">
              Live AI Safety Incidents Register (§23)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Auto-Anchored to Evidence Ledger
          </span>
        </div>

        <div className="space-y-3 font-mono text-xs">
          {incidents.map((incident) => (
            <div
              key={incident.incidentId}
              className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-colors space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 font-bold">
                    {incident.incidentId}
                  </span>
                  <Badge variant={incident.severity === "CRITICAL" ? "critical" : "ai"}>
                    {incident.severity}
                  </Badge>
                  <span className="text-slate-200 font-semibold">{incident.title}</span>
                </div>
                <Badge variant={incident.status === "RESOLVED" ? "pass" : "pending"}>
                  {incident.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                <div>Model: <span className="text-slate-200">{incident.modelAffected}</span></div>
                <div>Threat: <span className="text-amber-300">{incident.threatType}</span></div>
                <div>Kill-Switch: <span className={incident.killSwitchEngaged ? "text-rose-400 font-bold" : "text-slate-400"}>{incident.killSwitchEngaged ? "ENGAGED" : "OFF"}</span></div>
                <div>Detected: <span className="text-slate-200">{new Date(incident.detectedAt).toLocaleTimeString()}</span></div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
