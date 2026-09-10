"use client";

import React, { useState } from "react";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import {
  AiIncident,
  AiIncidentSeverity,
  AiIncidentState,
  AiIncidentTrigger,
} from "@/lib/types";
import {
  ShieldAlert,
  AlertOctagon,
  Sparkles,
  Layers,
  CheckCircle2,
  RefreshCw,
  Zap,
  Activity,
  ArrowRight,
  TrendingDown,
  Server,
  FileCheck2,
  Flame,
  AlertTriangle,
  Lock,
  Cpu,
  ShieldX,
} from "lucide-react";
import {
  DegradedState,
  RecoveryState,
  LoadingState,
  StaleState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";

export default function AiGovernancePage() {
  const [state, , isHydrated] = useDemoState();
  const [activeTab, setActiveTab] = useState<string>("incidents");
  const [isDeclaring, setIsDeclaring] = useState<boolean>(false);
  const [isRcaModalOpen, setIsRcaModalOpen] = useState<boolean>(false);
  const [activeRca, setActiveRca] = useState<{
    incident: AiIncident;
    rcaSummary: string;
    fiveWhys: string[];
    rootCauseClass: string;
    recommendedFixes: string[];
  } | null>(null);

  // Declare Incident Form State
  const [newTitle, setNewTitle] = useState("");
  const [newSeverity, setNewSeverity] = useState<AiIncidentSeverity>("SEV1_CRITICAL");
  const [newTrigger, setNewTrigger] = useState<AiIncidentTrigger>("PROMPT_INJECTION");
  const [newModel, setNewModel] = useState("gemini-1.5-pro");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  if (!isHydrated) return null;

  const incidents = state.aiIncidents || [];
  const modelDrifts = state.modelDriftReports || [];
  const supplyChain = state.aiSupplyChain || {
    hhiIndex: 4200,
    concentrationLevel: "MODERATE",
    primaryProvider: "Google Cloud Vertex AI",
    providerShares: { "Google Cloud Vertex AI (Gemini)": 60, "Anthropic (Claude)": 30, "Self-Hosted": 10 },
    allTier1FallbackReady: true,
  };
  const complianceDrift = state.complianceDrift || {
    tenantId: state.tenant.id,
    status: "COMPLIANT",
    score: 98.4,
    lastAssessedAt: new Date().toISOString(),
    slaAlarms: [],
  };

  const handleDeclareIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setActionLoadingId("declare");
    try {
      await ZoikoShieldApiClient.declareAiIncident({
        tenantId: state.tenant.id,
        title: newTitle,
        severity: newSeverity,
        trigger: newTrigger,
        affectedModel: newModel,
        declaredBy: state.session.fullName,
      });
      setIsDeclaring(false);
      setNewTitle("");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleContain = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      await ZoikoShieldApiClient.containAiIncident(incidentId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleFallback = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      await ZoikoShieldApiClient.activateAiFallback(incidentId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRca = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      const rcaResult = await ZoikoShieldApiClient.analyzeAiIncidentRca(incidentId);
      setActiveRca(rcaResult);
      setIsRcaModalOpen(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolve = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      await ZoikoShieldApiClient.resolveAiIncident(
        incidentId,
        "Model Armor pre-filter rule deployed and inference test suite confirmed zero hallucination drift."
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleClose = async (incidentId: string) => {
    setActionLoadingId(incidentId);
    try {
      await ZoikoShieldApiClient.closeAiIncident(incidentId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemediateAlarm = async (alarmId: string) => {
    setActionLoadingId(alarmId);
    try {
      await ZoikoShieldApiClient.remediateComplianceDrift(alarmId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStateBadge = (st: AiIncidentState) => {
    switch (st) {
      case "DECLARED":
        return <Badge variant="critical">DECLARED</Badge>;
      case "CONTAINED_KILL_SWITCH":
        return <Badge variant="high">KILL-SWITCH ENGAGED</Badge>;
      case "FALLBACK_ACTIVE":
        return <Badge variant="medium">FALLBACK ACTIVE</Badge>;
      case "ROOT_CAUSE_ANALYZED":
        return <Badge variant="ai">RCA ANALYZED</Badge>;
      case "RESOLVED":
        return <Badge variant="pass">RESOLVED</Badge>;
      case "CLOSED":
        return <Badge variant="neutral">CLOSED</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#121422] via-[#10141f] to-[#1a1128] border border-cyan-500/30 shadow-[0_0_35px_rgba(6,182,212,0.12)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-cyan-400 tracking-wider uppercase">
              GOVERNANCE & SAFETY COCKPIT (§21, §23, §24, §55)
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-3">
            AI Safety, Incident Lifecycle & Drift Operations
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            Deterministic circuit breakers, Emergency Kill-Switch controls, Population Stability Index (PSI) drift monitoring, and Multi-Vendor Supply Chain HHI concentration governance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="cyan" size="md" onClick={() => setIsDeclaring(true)}>
            <Flame className="w-4 h-4 text-rose-400" />
            <span>Declare AI Incident</span>
          </Button>
        </div>
      </div>

      {/* Non-Destructive Invariant Alert Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center gap-3 text-xs font-mono text-slate-300">
        <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
        <div>
          <span className="font-bold text-cyan-300">ERB-01 Non-Destructive Guardrail:</span> All emergency kill-switch containment and Tier-1 fallback routing actions execute in verifiable <span className="text-violet-300 font-semibold">Simulation Sandbox Mode</span>.
        </div>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ACTIVE AI INCIDENTS</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {incidents.filter((i) => i.state !== "CLOSED").length}
          </div>
          <div className="text-[11px] text-rose-400 font-mono">
            {incidents.filter((i) => i.killSwitchEngaged).length} Kill-Switch active
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>MODEL DRIFT (PSI)</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {modelDrifts.filter((d) => d.status !== "STABLE").length > 0 ? "DRIFT DETECTED" : "ALL STABLE"}
          </div>
          <div className="text-[11px] text-amber-400 font-mono">
            Max PSI: {Math.max(...modelDrifts.map((d) => d.populationStabilityIndex), 0.042)}
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>SUPPLY CHAIN HHI</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {supplyChain.hhiIndex}
          </div>
          <div className="text-[11px] text-purple-400 font-mono">
            {supplyChain.concentrationLevel} Concentration
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>COMPLIANCE POSTURE</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {complianceDrift.score.toFixed(1)}%
          </div>
          <div className="text-[11px] text-emerald-400 font-mono">
            {complianceDrift.slaAlarms.length} Real-Time SLA Alarms
          </div>
        </Card>
      </div>

      {/* Mandatory UI States Integration */}
      {incidents.some((i) => i.killSwitchEngaged) && (
        <DegradedState
          title="AI Safety Kill-Switch Engaged (Deterministic Fallback Active)"
          message="One or more LLM models are contained under emergency circuit breaker. Deterministic rules active."
          fallbackReason="EMERGENCY_AI_KILL_SWITCH_TRIGGERED"
        />
      )}

      {incidents.some((i) => i.fallbackModeActive && !i.killSwitchEngaged) && (
        <RecoveryState
          title="AI Multi-Vendor Tier-1 Failover in Progress"
          message="Routing inference queries to certified Tier-1 secondary model fallback provider."
          rollbackStage="Active Anthropic Claude / Deterministic Rule Switchover"
          progressPercent={85}
        />
      )}

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          {
            id: "incidents",
            label: "§23 Incident Lifecycle & Kill-Switch",
            icon: <Flame className="w-4 h-4" />,
            badge: incidents.filter((i) => i.state !== "CLOSED").length,
          },
          {
            id: "drift",
            label: "§21 Model Drift & PSI",
            icon: <Activity className="w-4 h-4" />,
            badge: modelDrifts.length,
          },
          {
            id: "supply-chain",
            label: "§24 AI Supply Chain Risk (HHI)",
            icon: <Layers className="w-4 h-4" />,
          },
          {
            id: "compliance-drift",
            label: "§55 Compliance Drift & SLA Alarms",
            icon: <FileCheck2 className="w-4 h-4" />,
            badge: complianceDrift.slaAlarms.length || undefined,
          },
        ]}
      />

      {/* Tab 1: §23 AI Incident Lifecycle & Kill-Switch */}
      {activeTab === "incidents" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {incidents.map((incident, idx) => (
              <Card key={`${incident.id || "inc"}-${idx}`} className="space-y-4 border-l-4 border-l-rose-500">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs font-mono font-bold text-cyan-400">{incident.id}</span>
                      <Badge variant={incident.severity === "SEV1_CRITICAL" ? "critical" : "high"}>
                        {incident.severity}
                      </Badge>
                      {getStateBadge(incident.state)}
                      <span className="text-xs font-mono text-slate-400">Model: {incident.affectedModel}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-100">{incident.title}</h3>
                  </div>

                  <div className="text-xs font-mono text-slate-400">
                    Trigger: <span className="text-slate-200">{incident.trigger}</span> | Declared by:{" "}
                    <span className="text-slate-200">{incident.declaredBy}</span>
                  </div>
                </div>

                {/* State Transition Timeline Indicator */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span>STATE MACHINE TRANSITIONS</span>
                    <span>Current: <strong className="text-cyan-400">{incident.state}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto text-xs font-mono py-1">
                    <span className={`px-2 py-1 rounded ${incident.state === "DECLARED" ? "bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40" : "bg-slate-800 text-slate-400"}`}>1. DECLARED</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "CONTAINED_KILL_SWITCH" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40" : incident.killSwitchEngaged ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"}`}>2. KILL_SWITCH</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "FALLBACK_ACTIVE" ? "bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40" : incident.fallbackModeActive ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"}`}>3. FALLBACK</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "ROOT_CAUSE_ANALYZED" ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40" : incident.rootCauseSummary ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"}`}>4. RCA</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "RESOLVED" ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40" : incident.resolvedAt ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-400"}`}>5. RESOLVED</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className={`px-2 py-1 rounded ${incident.state === "CLOSED" ? "bg-slate-700 text-slate-200 font-bold" : "bg-slate-800 text-slate-400"}`}>6. CLOSED</span>
                  </div>
                </div>

                {incident.rootCauseSummary && (
                  <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs font-mono text-purple-200 space-y-1">
                    <span className="font-bold text-purple-300">Root Cause Summary (§23 RCA):</span>
                    <p className="text-slate-300">{incident.rootCauseSummary}</p>
                  </div>
                )}

                {/* Lifecycle Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  {incident.state === "DECLARED" && (
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleContain(incident.id)}
                    >
                      <ShieldX className="w-3.5 h-3.5" />
                      <span>Engage Kill-Switch (Simulated)</span>
                    </Button>
                  )}

                  {(incident.state === "DECLARED" || incident.state === "CONTAINED_KILL_SWITCH") && (
                    <Button
                      variant="ai"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleFallback(incident.id)}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Activate Tier-1 Fallback Model</span>
                    </Button>
                  )}

                  {(incident.state === "CONTAINED_KILL_SWITCH" || incident.state === "FALLBACK_ACTIVE" || incident.state === "ROOT_CAUSE_ANALYZED") && (
                    <Button
                      variant="cyan"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleRca(incident.id)}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Synthesize 5-Whys RCA</span>
                    </Button>
                  )}

                  {incident.state === "ROOT_CAUSE_ANALYZED" && (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleResolve(incident.id)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolve Incident</span>
                    </Button>
                  )}

                  {incident.state === "RESOLVED" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={actionLoadingId === incident.id}
                      onClick={() => handleClose(incident.id)}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Archive & Close Incident</span>
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: §21 Model Stability & Population Stability Index (PSI) */}
      {activeTab === "drift" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Model Drift & Population Stability Index (§21)
                </h3>
                <p className="text-xs text-slate-400">
                  Statistical evaluation comparing active telemetry inference token distributions against validated baseline embeddings.
                </p>
              </div>
              <Badge variant="healthy">PSI Thresholds: &lt;0.10 Stable | &gt;0.25 Critical</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {modelDrifts.map((report, idx) => (
                <div
                  key={`${report.modelId || "model"}-${idx}`}
                  className={`p-4 rounded-xl border ${
                    report.status === "CRITICAL_DRIFT_DETECTED"
                      ? "bg-rose-950/20 border-rose-500/40"
                      : report.status === "WARNING_DRIFT_DETECTED"
                      ? "bg-amber-950/20 border-amber-500/40"
                      : "bg-slate-900/60 border-slate-800"
                  } space-y-3 font-mono`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">{report.modelId}</span>
                    <Badge variant={report.status === "STABLE" ? "pass" : report.status === "WARNING_DRIFT_DETECTED" ? "medium" : "critical"}>
                      {report.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">PSI Metric:</span>
                      <span className={`font-bold ${report.populationStabilityIndex >= 0.25 ? "text-rose-400" : report.populationStabilityIndex >= 0.10 ? "text-amber-400" : "text-emerald-400"}`}>
                        {report.populationStabilityIndex.toFixed(3)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Token Length PSI:</span>
                      <span>{report.tokenLengthPsi.toFixed(3)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Confidence Shift:</span>
                      <span className={report.confidenceShiftPct < 0 ? "text-amber-400" : "text-emerald-400"}>
                        {report.confidenceShiftPct > 0 ? `+${report.confidenceShiftPct}%` : `${report.confidenceShiftPct}%`}
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${report.populationStabilityIndex >= 0.25 ? "bg-rose-500" : report.populationStabilityIndex >= 0.10 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(100, report.populationStabilityIndex * 300)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: §24 AI Supply Chain Concentration Risk */}
      {activeTab === "supply-chain" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  AI Model Supply Chain Concentration (§24)
                </h3>
                <p className="text-xs text-slate-400">
                  Herfindahl-Hirschman Index (HHI) monitoring single-vendor dependence across foundation model providers.
                </p>
              </div>
              <Badge variant="ai">HHI Score: {supplyChain.hhiIndex}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold text-slate-200">Provider Inference Share</h4>
                <div className="space-y-3">
                  {Object.entries(supplyChain.providerShares).map(([provider, share]) => (
                    <div key={provider} className="space-y-1 text-xs font-mono">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>{provider}</span>
                        <span className="font-bold text-cyan-400">{share}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-cyan-500 h-full" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold text-slate-200">Multi-Vendor Fallback Posture</h4>
                <div className="space-y-2.5 text-xs text-slate-300 font-mono">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-800/60">
                    <span>Primary Provider:</span>
                    <span className="text-cyan-300 font-bold">{supplyChain.primaryProvider}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-slate-800/60">
                    <span>Concentration Level:</span>
                    <span className="text-purple-300 font-bold">{supplyChain.concentrationLevel}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-slate-800/60">
                    <span>Tier-1 Fallback Standby:</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> READY (Claude & vLLM)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: §55 Continuous Compliance Drift & SLA Alarms */}
      {activeTab === "compliance-drift" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-400" />
                  Continuous Compliance Drift & Real-Time SLA Alarms (§55)
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time telemetry evaluation against SOC2 CC6.1, ISO27001, and HIPAA compliance thresholds.
                </p>
              </div>
              <Badge variant="pass">Overall Compliance: {complianceDrift.score.toFixed(1)}%</Badge>
            </div>

            {complianceDrift.slaAlarms.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-emerald-400 bg-emerald-950/20 border border-emerald-500/30 rounded-xl">
                ✓ All Continuous Compliance Controls Operating Within Nominal SLA Tolerances. Zero Alarms.
              </div>
            ) : (
              <div className="space-y-3">
                {complianceDrift.slaAlarms.map((alarm, idx) => (
                  <div
                    key={`${alarm.alarmId || "alarm"}-${idx}`}
                    className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="high">{alarm.severity}</Badge>
                        <span className="font-bold text-cyan-300">{alarm.controlId}</span>
                        <span className="text-slate-400 text-[11px]">{alarm.alarmId}</span>
                      </div>
                      <p className="text-slate-300 font-sans text-xs">{alarm.reason}</p>
                    </div>

                    <Button
                      variant="cyan"
                      size="sm"
                      isLoading={actionLoadingId === alarm.alarmId}
                      onClick={() => handleRemediateAlarm(alarm.alarmId)}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Simulate Auto-Remediation</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Declare Incident Modal */}
      <Modal
        isOpen={isDeclaring}
        onClose={() => setIsDeclaring(false)}
        title="Declare Safety Incident (§23)"
        description="Initiate formal AI Safety incident lifecycle tracking with automatic containment options."
      >
        <form onSubmit={handleDeclareIncident} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">Incident Title / Symptom</label>
            <input
              type="text"
              required
              placeholder="e.g. Indirect Prompt Injection Bypass in Log Classifier"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-sans"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Severity Level</label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as AiIncidentSeverity)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <option value="SEV1_CRITICAL">SEV1_CRITICAL (Kill-Switch Candidate)</option>
                <option value="SEV2_HIGH">SEV2_HIGH (Fallback Recommended)</option>
                <option value="SEV3_MEDIUM">SEV3_MEDIUM</option>
                <option value="SEV4_LOW">SEV4_LOW</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Trigger Mechanism</label>
              <select
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value as AiIncidentTrigger)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <option value="PROMPT_INJECTION">PROMPT_INJECTION</option>
                <option value="MODEL_HALLUCINATION">MODEL_HALLUCINATION</option>
                <option value="MODEL_DRIFT_CRITICAL">MODEL_DRIFT_CRITICAL</option>
                <option value="DATA_LEAKAGE">DATA_LEAKAGE</option>
                <option value="TOOL_MISUSE">TOOL_MISUSE</option>
                <option value="OPERATOR_MANUAL">OPERATOR_MANUAL</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">Affected Model</label>
            <input
              type="text"
              required
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsDeclaring(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" type="submit" isLoading={actionLoadingId === "declare"}>
              <Flame className="w-3.5 h-3.5" />
              <span>Declare Incident</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* RCA 5-Whys Analysis Modal */}
      {activeRca && (
        <Modal
          isOpen={isRcaModalOpen}
          onClose={() => setIsRcaModalOpen(false)}
          title="Automated 5-Whys Root Cause Analysis (§23)"
          description={`Automated deep-dive analysis for incident ${activeRca.incident.id}`}
        >
          <div className="space-y-4 font-mono text-xs text-slate-300">
            <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-500/40 space-y-1">
              <span className="font-bold text-purple-300">Executive RCA Summary:</span>
              <p className="text-slate-200 font-sans text-xs">{activeRca.rcaSummary}</p>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-cyan-300">5-Whys Causality Chain:</span>
              <div className="space-y-1.5 pl-2 border-l-2 border-cyan-500/40">
                {activeRca.fiveWhys.map((why, idx) => (
                  <p key={idx} className="text-slate-300">
                    {why}
                  </p>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-emerald-300">Recommended Engineering Fixes:</span>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                {activeRca.recommendedFixes.map((fix, idx) => (
                  <li key={idx}>{fix}</li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <Button variant="primary" size="sm" onClick={() => setIsRcaModalOpen(false)}>
                Close RCA Viewer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
