"use client";

import React, { useState, useEffect } from "react";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { AttackPathTrajectory } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Compass,
  Sparkles,
  Search,
  Crosshair,
  ShieldAlert,
  GitBranch,
  Flame,
  CheckCircle2,
  Terminal,
  Activity,
  Layers,
  ArrowRight,
  Database,
  Cpu,
} from "lucide-react";
import {
  LoadingState,
  DegradedState,
  PartialState,
  StaleState,
} from "@/components/states/mandatory-ui-states";

interface StepTrace {
  step: number;
  thought: string;
  action: string;
  toolInput: string;
  observation: string;
}

export default function ThreatHuntingPage() {
  const [state] = useDemoState();
  const [hypothesis, setHypothesis] = useState(
    "Adversary using compromised Entra ID tokens to stage ransomware via lateral SMB connections across high-value database servers."
  );
  const [isHunting, setIsHunting] = useState(false);
  const [huntCompleted, setHuntCompleted] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>("all");
  const [huntError, setHuntError] = useState<string | null>(null);
  const [attackTrajectory, setAttackTrajectory] = useState<AttackPathTrajectory | null>(null);

  // Use the first available case ID, or a fallback
  const activeCaseId = state.cases[0]?.id ?? "case-demo-01";

  useEffect(() => {
    let mounted = true;
    ZoikoShieldApiClient.getAttackPathTrajectory(activeCaseId)
      .then((trajectory) => {
        if (mounted) {
          setAttackTrajectory(trajectory);
        }
      })
      .catch((err) => console.warn("Could not load initial trajectory:", err));
    return () => {
      mounted = false;
    };
  }, [activeCaseId]);

  const [reasoningTrace, setReasoningTrace] = useState<StepTrace[]>([
    {
      step: 1,
      thought:
        "Analyzing initial detection telemetry and querying Evidence Ledger for anomalous authentication tokens on tenant-bank-01.",
      action: "query_evidence_ledger",
      toolInput: JSON.stringify({
        tenantId: "tenant-bank-01",
        query: "eventType:AUTHENTICATION AND outcome:SUCCESS",
      }),
      observation:
        "Retrieved 3 evidence items with verified SHA-256 digests. Found token issued from non-corporate IP: 198.51.100.99.",
    },
    {
      step: 2,
      thought:
        "Correlating observed authentication IP against MITRE ATT&CK enterprise tactics.",
      action: "lookup_mitre_ttp",
      toolInput: JSON.stringify({ ttpId: "T1078.004", techniqueName: "Valid Accounts: Cloud Accounts" }),
      observation:
        "Matched technique T1078.004 with 89% confidence. Identified lateral movement trajectory targeting srv-db-prod-01.",
    },
    {
      step: 3,
      thought:
        "Tracing multi-hop attack graph from compromised identity to crown-jewel assets.",
      action: "trace_attack_graph_hops",
      toolInput: JSON.stringify({ startNode: "usr-compromised-analyst", maxHops: 3 }),
      observation:
        "Discovered 3-hop critical attack path: Developer Laptop → Bastion Host (ec2-jump-01) → Production Customer Database (srv-db-prod-01).",
    },
    {
      step: 4,
      thought:
        "Evaluating infrastructure blast radius before recommending SOAR containment.",
      action: "predict_blast_radius",
      toolInput: JSON.stringify({ targetHost: "srv-db-prod-01", actionType: "ISOLATE_ENDPOINT" }),
      observation:
        "Predicted Blast Radius: 1 Host, 4 Active Database Connections, ZERO Customer-Facing Web Outage. Containment is safe to execute.",
    },
  ]);

  const handleStartHunt = async () => {
    setIsHunting(true);
    setHuntCompleted(false);
    setHuntError(null);

    try {
      // Call the real AI investigation summary API and attack trajectory for the active case
      const [aiSummary, trajectory] = await Promise.all([
        ZoikoShieldApiClient.generateAiInvestigationSummary(activeCaseId),
        ZoikoShieldApiClient.getAttackPathTrajectory(activeCaseId),
      ]);

      setAttackTrajectory(trajectory);

      // Build a ReAct-style trace from the real AI output
      const newTrace: StepTrace[] = [
        {
          step: 1,
          thought: "Querying Evidence Ledger for telemetry anchored in Merkle epoch.",
          action: "query_evidence_ledger",
          toolInput: JSON.stringify({
            caseId: activeCaseId,
            query: "eventType:AUTHENTICATION AND outcome:FAILED",
          }),
          observation:
            aiSummary.citations.length > 0
              ? `Retrieved ${aiSummary.citations.length} cryptographically-verified evidence citation(s). ${aiSummary.citations[0]?.description ?? ""}`
              : "Retrieved evidence digests from anchored Merkle epoch #1043.",
        },
        {
          step: 2,
          thought: aiSummary.hypotheses[0]?.title
            ? `Evaluating hypothesis: "${aiSummary.hypotheses[0].title}"`
            : "Correlating observed OCSF events against known adversary TTPs in MITRE ATT&CK.",
          action: "lookup_mitre_ttp",
          toolInput: JSON.stringify({
            assessment: aiSummary.threatAssessment,
            likelihood: aiSummary.hypotheses[0]?.likelihood ?? "HIGH",
          }),
          observation:
            aiSummary.hypotheses[0]?.supportingEvidence?.join(", ") ??
            "MITRE T1110 (Brute Force) and T1078 (Valid Accounts) matched with high confidence.",
        },
        {
          step: 3,
          thought: "Synthesizing executive threat narrative from AI investigation.",
          action: "synthesize_threat_narrative",
          toolInput: JSON.stringify({ modelArmorVerdict: aiSummary.modelArmorVerdict }),
          observation: aiSummary.executiveSummary,
        },
        {
          step: 4,
          thought: "Evaluating recommended containment actions from AI analysis.",
          action: "predict_blast_radius",
          toolInput: JSON.stringify({ recommendedActions: aiSummary.recommendedActions }),
          observation: aiSummary.recommendedActions.join(" | "),
        },
      ];
      setReasoningTrace(newTrace);
      setHuntCompleted(true);
    } catch (err: any) {
      console.error("Threat hunt error:", err);
      setHuntError(err.message ?? "AI investigation failed.");
    } finally {
      setIsHunting(false);
    }
  };

  const availableTools = [
    {
      id: "query_evidence_ledger",
      name: "Evidence Ledger Query",
      desc: "Queries immutable SHA-256 evidence chain",
      icon: <Database className="w-4 h-4 text-cyan-400" />,
    },
    {
      id: "lookup_mitre_ttp",
      name: "MITRE ATT&CK Matrix",
      desc: "Correlates techniques, tactics and adversary TTPs",
      icon: <Crosshair className="w-4 h-4 text-purple-400" />,
    },
    {
      id: "trace_attack_graph_hops",
      name: "Attack Graph Hop Tracer",
      desc: "Calculates shortest paths to crown-jewel assets",
      icon: <GitBranch className="w-4 h-4 text-rose-400" />,
    },
    {
      id: "predict_blast_radius",
      name: "Blast Radius Estimator",
      desc: "Simulates downtime and downstream impact",
      icon: <Flame className="w-4 h-4 text-amber-400" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-[#0e121b] border border-purple-500/30 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <Compass className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white tracking-wide">
                    Autonomous Threat Hunting Copilot
                  </h1>
                  <Badge variant="ai">ReAct Agent V1</Badge>
                  <Badge variant="healthy">Model Armor Protected</Badge>
                </div>
                <p className="text-xs text-slate-400">
                  Architecture: <span className="font-mono text-cyan-400">ADR-06</span> (Threat Hunting Engine) &amp; <span className="font-mono text-cyan-400">ADR-11</span> (AI Copilot)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
              Provider: <span className="text-purple-400 font-bold">Vertex AI Gemini (gemini-1.5-pro-002 [derived])</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
              Case:{" "}
              <span className="text-cyan-400 font-bold font-mono">
                {state.cases[0]?.id ?? "No active case"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Hunt Configuration & Tools */}
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Investigation Hypothesis</span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs text-slate-400 font-medium">
                Adversary Hypothesis / Hunting Trigger Prompt:
              </label>
              <textarea
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-purple-500 font-mono resize-none leading-relaxed"
                placeholder="Enter threat hunting hypothesis..."
              />

              {!state.cases[0] && (
                <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-300 text-[11px] font-mono">
                  ⚠️ No active case found. Run telemetry ingestion first to generate a case for AI
                  analysis.
                </div>
              )}

              {huntError && (
                <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-[11px] font-mono">
                  ❌ {huntError}
                </div>
              )}

              <Button
                variant="primary"
                className="w-full py-2.5 font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 shadow-lg shadow-purple-900/30"
                onClick={() => handleStartHunt()}
                disabled={isHunting}
              >
                {isHunting ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" />
                    <span>Executing ReAct Reasoning Loop...</span>
                  </>
                ) : (
                  <>
                    <Compass className="w-4 h-4" />
                    <span>Execute Threat Hunt</span>
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Autonomous Tool Capabilities */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>Governed Tool Broker Capabilities</span>
              </div>
              <Badge variant="neutral">4 Tools Armed</Badge>
            </div>

            <div className="space-y-2.5">
              {availableTools.map((tool) => (
                <div
                  key={tool.id}
                  onClick={() => setSelectedTool(tool.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedTool === tool.id
                      ? "bg-purple-500/10 border-purple-500/50 shadow-md shadow-purple-900/20"
                      : "bg-slate-900/50 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      {tool.icon}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">{tool.name}</div>
                      <div className="text-[11px] text-slate-400">{tool.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right 2 Columns: Multi-Turn ReAct Reasoning Loop */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-purple-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  ReAct Reasoning Loop &amp; Step Trace Execution
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${isHunting ? "bg-amber-500 animate-pulse" : "bg-emerald-500 animate-pulse"}`}
                />
                <span className="text-xs font-mono text-slate-400">
                  {isHunting
                    ? "AI Agent Running..."
                    : `Step Cycle: Active (${reasoningTrace.length}/4 Steps Completed)`}
                </span>
              </div>
            </div>

            {/* ReAct Trace Step Cards */}
            {isHunting && (
              <LoadingState
                title="Executing ReAct Threat Hunting Reasoning Loop..."
                message="Querying sovereign Merkle evidence ledger and correlating MITRE ATT&CK enterprise vectors."
                regionalCell="us-east-1"
              />
            )}

            {huntError && (
              <DegradedState
                title="Threat Copilot Fallback Engaged"
                message="Live Vertex AI inference unavailable. Reverting to deterministic signature and graph correlation."
                fallbackReason={huntError}
              />
            )}

            <div className="space-y-4">
              {reasoningTrace.map((trace) => (
                <div
                  key={trace.step}
                  className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-3 hover:border-purple-500/30 transition-all font-mono"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                        STEP #{trace.step}
                      </span>
                      <span className="text-slate-400">Action:</span>
                      <span className="text-cyan-400 font-bold">{trace.action}</span>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>

                  {/* Thought */}
                  <div className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="text-purple-400 font-semibold mr-1.5">🧠 THOUGHT:</span>
                    {trace.thought}
                  </div>

                  {/* Tool Call & Observation */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80">
                      <div className="text-cyan-400 font-semibold mb-1">🛠️ TOOL INPUT:</div>
                      <pre className="text-slate-400 overflow-x-auto">{trace.toolInput}</pre>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/80">
                      <div className="text-emerald-400 font-semibold mb-1">🔍 OBSERVATION:</div>
                      <p className="text-slate-300 leading-relaxed">{trace.observation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive Multi-Hop Attack Graph Canvas & Blast Radius */}
            <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-rose-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                    Multi-Hop Attack Path Trajectory (§14 Graph Explorer)
                  </h3>
                </div>
                <Badge variant={attackTrajectory?.severity === "CRITICAL" ? "critical" : "high"}>
                  {attackTrajectory ? `${attackTrajectory.totalHops}-Hop ${attackTrajectory.severity} Path` : "3-Hop Critical Path"}
                </Badge>
              </div>

              {/* Node Sequence Visualizer */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                {(attackTrajectory?.nodes || [
                  {
                    nodeId: "node-entry",
                    stepNumber: 1,
                    label: "usr-compromised-analyst",
                    role: "ENTRYPOINT" as const,
                    mitreTechnique: "T1078.004",
                    techniqueName: "Valid Accounts: Cloud Accounts",
                    targetEntity: "usr-compromised-analyst",
                    evidenceDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    description: "Compromised Entra ID session token from untrusted IP 198.51.100.99.",
                    riskScore: 89,
                    status: "DETECTED" as const,
                  },
                  {
                    nodeId: "node-pivot",
                    stepNumber: 2,
                    label: "ec2-jump-01 (Bastion)",
                    role: "PIVOT" as const,
                    mitreTechnique: "T1021.002",
                    techniqueName: "Remote Services: SMB/Windows Admin Shares",
                    targetEntity: "ec2-jump-01",
                    evidenceDigest: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
                    description: "Lateral SMB pivot across private VPC subnet 10.0.4.0/24.",
                    riskScore: 78,
                    status: "CORRELATED" as const,
                  },
                  {
                    nodeId: "node-target",
                    stepNumber: 3,
                    label: "srv-db-prod-01 (PII Database)",
                    role: "CROWN_JEWEL" as const,
                    mitreTechnique: "T1098.004",
                    techniqueName: "Account Manipulation: SSH Authorized Keys",
                    targetEntity: "srv-db-prod-01",
                    evidenceDigest: "185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969",
                    description: "Target database holding 2.4M customer records.",
                    riskScore: 96,
                    status: "CORRELATED" as const,
                  },
                ]).map((node, idx) => {
                  const isEntry = node.role === "ENTRYPOINT";
                  const isPivot = node.role === "PIVOT";

                  const cardStyle = isEntry
                    ? "bg-purple-950/20 border-purple-500/30 text-purple-400"
                    : isPivot
                    ? "bg-amber-950/20 border-amber-500/30 text-amber-400"
                    : "bg-rose-950/30 border-rose-500/40 text-rose-400";

                  return (
                    <div key={node.nodeId || `node-${idx}`} className={`p-3.5 rounded-xl border space-y-1.5 ${cardStyle}`}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span>NODE {node.stepNumber ?? idx + 1}: {node.role}</span>
                        <span>{node.mitreTechnique}</span>
                      </div>
                      <div className="font-bold text-slate-200 truncate">{node.label}</div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{node.description}</p>
                      <div className="text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/60 truncate">
                        Digest: {node.evidenceDigest ? `${node.evidenceDigest.slice(0, 16)}...` : "Anchored"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Blast Radius & One-Click Dual-Custody Dispatch */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-bold text-slate-200">Blast Radius Assessment:</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Containment Target: <strong className="text-amber-300">{attackTrajectory?.blastRadius.targetHost || "srv-db-prod-01"}</strong> | Estimated Outage: <strong className="text-emerald-400">{attackTrajectory?.blastRadius.projectedDowntimeSec ?? 0}s (Policy-Level Process Isolation [derived])</strong> | Verdict: <span className="text-cyan-300 font-bold">{attackTrajectory?.blastRadius.containmentSafetyVerdict || "SAFE_TO_EXECUTE"}</span>
                  </p>
                </div>

                <a
                  href="/actions"
                  className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-900/30 transition-all"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Dispatch to Dual-Custody Approval</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Final Copilot Conclusion */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 to-cyan-950/40 border border-purple-500/40 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-300 font-mono">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>THREAT COPILOT SYNTHESIS &amp; RECOMMENDED CONTAINMENT</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-mono">
                {huntCompleted && state.cases[0]?.aiSummary ? (
                  <>
                    ✔{" "}
                    <strong className="text-white">AI Analysis Complete:</strong>{" "}
                    {state.cases[0].aiSummary.executiveSummary}
                    <br />✔{" "}
                    <strong className="text-white">Recommended Actions:</strong>{" "}
                    {state.cases[0].aiSummary.recommendedActions?.join(" | ")}
                  </>
                ) : (
                  <>
                    ✔{" "}
                    <strong className="text-white">Confirmed Threat:</strong> Active lateral
                    movement identified along attack path:{" "}
                    <span className="text-cyan-300 font-bold">
                      usr-analyst ➔ ec2-jump-01 ➔ srv-db-prod-01
                    </span>
                    .
                    <br />✔{" "}
                    <strong className="text-white">Recommended Governed SOAR Action:</strong>{" "}
                    Dispatch{" "}
                    <span className="text-rose-400 font-bold">ISOLATE_ENDPOINT</span> on{" "}
                    <span className="text-amber-300 font-mono">srv-db-prod-01</span> via Authority
                    Tier{" "}
                    <span className="text-purple-300 font-bold">
                      R2 (Simulation Containment with Single-Use Rollback Token)
                    </span>
                    .
                  </>
                )}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
