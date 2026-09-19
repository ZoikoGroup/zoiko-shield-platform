"use client";

import React, { useState } from "react";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Lock,
  Unlock,
  AlertOctagon,
  RotateCcw,
  FileCheck2,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Fingerprint,
  Layers,
  Zap,
  Play,
  Terminal,
  Server,
  Globe,
  Key,
  UserX,
  AlertTriangle,
  Flame,
  ArrowRight,
} from "lucide-react";
import {
  DegradedState,
  RecoveryState,
} from "@/components/states/mandatory-ui-states";
import { DualCustodyApprovalModal } from "@/components/cases/DualCustodyApprovalModal";

interface SimulationScenario {
  id: string;
  actionType: string;
  targetRef: string;
  provider: string;
  authorityLevel: "R1" | "R2" | "R3" | "R4";
  blastRadiusScore: number;
  compensatingCommand: string;
  reversibilityTier: "R1" | "R2";
  beforeState: string;
  afterState: string;
  impactSummary: string;
}

const SCENARIOS: SimulationScenario[] = [
  {
    id: "scen-edr-01",
    actionType: "ISOLATE_ENDPOINT",
    targetRef: "srv-db-prod-02.internal",
    provider: "CrowdStrike Falcon EDR",
    authorityLevel: "R2",
    blastRadiusScore: 0.05,
    compensatingCommand: "UNISOLATE_ENDPOINT",
    reversibilityTier: "R1",
    beforeState: "NETWORK_CONNECTED (All TCP/UDP Ingress/Egress Active)",
    afterState: "NETWORK_ISOLATED (Only Encrypted SOAR Tunnel Allowed)",
    impactSummary: "0 workstations affected. 1 server isolated. Zero downtime via active DB replica failover.",
  },
  {
    id: "scen-waf-01",
    actionType: "APPLY_WAF_BLOCK",
    targetRef: "198.51.100.42/32 (C2 Drop)",
    provider: "Cloud Perimeter WAF",
    authorityLevel: "R2",
    blastRadiusScore: 0.02,
    compensatingCommand: "REMOVE_WAF_BLOCK",
    reversibilityTier: "R1",
    beforeState: "INGRESS_PERMITTED (Edge inspection in mirror mode)",
    afterState: "INGRESS_DROPPED (403 Forbidden with 60m TTL auto-decay)",
    impactSummary: "Perimeter edge drop active across 12 global PoPs. Collateral impact: 0 legitimate users.",
  },
  {
    id: "scen-iam-01",
    actionType: "REVOKE_IAM_SESSION",
    targetRef: "arn:aws:iam::123456789012:role/DataPipelineExecutor",
    provider: "AWS IAM & STS",
    authorityLevel: "R3",
    blastRadiusScore: 0.15,
    compensatingCommand: "RESTORE_IAM_ACCESS",
    reversibilityTier: "R2",
    beforeState: "STS_SESSIONS_ACTIVE (Temporary session tokens valid for 4h)",
    afterState: "SESSIONS_REVOKED (Principal assumed-role sessions terminated immediately)",
    impactSummary: "Lateral movement vector severed. Ephemeral keys revoked. Safe rollback snapshot stored.",
  },
  {
    id: "scen-entra-01",
    actionType: "DISABLE_USER_ACCOUNT",
    targetRef: "victor.compromised@enterprise.corp",
    provider: "Microsoft Entra ID",
    authorityLevel: "R2",
    blastRadiusScore: 0.08,
    compensatingCommand: "RESTORE_USER_ACCOUNT",
    reversibilityTier: "R1",
    beforeState: "ACCOUNT_ENABLED (OAuth2 refresh tokens valid across M365)",
    afterState: "ACCOUNT_DISABLED (All active refresh tokens revoked via Continuous Access Evaluation)",
    impactSummary: "Single compromised credential quarantined. Identity cache snapshot preserved for fast restore.",
  },
];

export default function ActionsAndFreezePage() {
  const [state] = useDemoState();
  const [selectedAuthorityTier, setSelectedAuthorityTier] = useState<"R0" | "R1" | "R2" | "R3" | "R4">("R2");
  const [selectedScenario, setSelectedScenario] = useState<SimulationScenario>(SCENARIOS[0]);
  
  // Emergency Freeze State
  const [freezeScope, setFreezeScope] = useState<"GLOBAL" | "TENANT" | "ACTION_TYPE" | "CONNECTOR">("TENANT");
  const [freezeReason, setFreezeReason] = useState(
    "Suspected compromised lateral credentials under investigation"
  );
  const [isFrozen, setIsFrozen] = useState(false);
  const [activeFreezeId, setActiveFreezeId] = useState<string | null>(null);
  const [freezeLoading, setFreezeLoading] = useState(false);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeSimulationReceipt, setActiveSimulationReceipt] = useState<any | null>(null);

  // Rollback State
  const [rollbackToken, setRollbackToken] = useState(
    () => state.cases[0]?.responseProposal?.id ?? "ZS-ROLLBACK-TOKEN-8F7A9C2B"
  );
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [rollbackProgress, setRollbackProgress] = useState(0);
  const [rollbackStageText, setRollbackStageText] = useState("");
  
  // Dual-Custody State
  const [isDualCustodyOpen, setIsDualCustodyOpen] = useState(false);
  const [quorumReceipt, setQuorumReceipt] = useState<{
    quorumId: string;
    approver1: string;
    approver2: string;
    rollbackToken: string;
  } | null>(null);

  const handleToggleFreeze = async () => {
    setFreezeLoading(true);
    try {
      if (isFrozen && activeFreezeId) {
        await ZoikoShieldApiClient.releaseFreezeSOAR(activeFreezeId);
        setIsFrozen(false);
        setActiveFreezeId(null);
      } else {
        const result = await ZoikoShieldApiClient.freezeSOAR(freezeScope, freezeReason);
        setIsFrozen(true);
        setActiveFreezeId(result.freezeId);
      }
    } catch (err: any) {
      console.error("Freeze toggle error:", err);
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await ZoikoShieldApiClient.simulateResponseProposal(
        selectedScenario.id,
        selectedScenario.actionType,
        selectedScenario.targetRef
      );
      setActiveSimulationReceipt(res);
    } catch (err: any) {
      console.error("Simulation error:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleExecuteRollback = async () => {
    setRollbackLoading(true);
    setRollbackError(null);
    setRollbackSuccess(false);
    setRollbackProgress(20);
    setRollbackStageText("Validating token signature & single-use authorization in Merkle ledger");

    try {
      await new Promise((r) => setTimeout(r, 400));
      setRollbackProgress(50);
      setRollbackStageText(`Dispatching certified compensating adapter (${selectedScenario.compensatingCommand})`);

      await new Promise((r) => setTimeout(r, 500));
      setRollbackProgress(80);
      setRollbackStageText("Reconciling endpoint connectivity, identity cache & perimeter ACL");

      await ZoikoShieldApiClient.executeRollbackSOAR(rollbackToken);

      setRollbackProgress(100);
      setRollbackStageText("Compensating rollback successfully executed & anchored to cryptographic evidence epoch");
      setRollbackSuccess(true);
      setTimeout(() => setRollbackSuccess(false), 8000);
    } catch (err: any) {
      setRollbackError(err.message ?? "Rollback failed");
    } finally {
      setRollbackLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-[#0e121b] border border-amber-500/30 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white tracking-wide">
                    Governed SOAR Response &amp; Emergency Freeze Console
                  </h1>
                  <Badge variant={isFrozen ? "critical" : "healthy"}>
                    {isFrozen ? "LOCKDOWN ACTIVE" : "OPERATIONAL"}
                  </Badge>
                  <Badge variant="neutral">R0–R4 Authority Tiers</Badge>
                </div>
                <p className="text-xs text-slate-400">
                  Dual-Custody Quorum, Dry-Run Pre-Flight Simulation &amp; Automated Rollback Compensation (ADR-04)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
              Authority Engine: <span className="text-amber-400 font-bold">Dual-Custody Hardware Attested</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mandatory Degraded State if Frozen */}
      {isFrozen && (
        <DegradedState
          title="Emergency Autonomous Freeze Active (SOAR Halted)"
          message={`Tenant automation frozen: "${freezeReason}". Scope: ${freezeScope}. All live actions require human step-up authorization.`}
          fallbackReason="SOAR_EMERGENCY_KILLSWITCH_ENGAGED"
        />
      )}

      {/* R0–R4 Authority Tier Ladder Selector */}
      <Card className="p-5 space-y-4 border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100">
              SOAR Autonomous Response Authority Ladder (R0–R4)
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Active Tier Policy: <strong className="text-cyan-300">{selectedAuthorityTier}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 font-mono text-xs">
          {[
            {
              tier: "R0" as const,
              title: "R0: Observation",
              desc: "Read-only telemetry normalization & threat observation. Zero mutation.",
              badge: "INFORMATIONAL",
              badgeVariant: "neutral" as const,
              color: "border-slate-800 hover:border-slate-700",
            },
            {
              tier: "R1" as const,
              title: "R1: Dry-Run Sim",
              desc: "Blast-radius diff prediction & pre-flight simulation receipts.",
              badge: "GOVERNED DEFAULT",
              badgeVariant: "pass" as const,
              color: "border-blue-500/40 hover:border-blue-500/70",
            },
            {
              tier: "R2" as const,
              title: "R2: Dual-Custody",
              desc: "Perimeter & host containment with 2-of-N hardware sign-off.",
              badge: "QUORUM GATED",
              badgeVariant: "critical" as const,
              color: "border-amber-500/40 hover:border-amber-500/70",
            },
            {
              tier: "R3" as const,
              title: "R3: IAM Revoke",
              desc: "Automated credential revocation with single-use compensation.",
              badge: "STEP-UP SIGNED",
              badgeVariant: "critical" as const,
              color: "border-purple-500/40 hover:border-purple-500/70",
            },
            {
              tier: "R4" as const,
              title: "R4: Sovereign Self-Heal",
              desc: "Autonomous multi-layer containment with instant fail-closed kill-switch.",
              badge: "FAILSAFE GATED",
              badgeVariant: "ai" as const,
              color: "border-emerald-500/40 hover:border-emerald-500/70",
            },
          ].map((item) => {
            const isSelected = selectedAuthorityTier === item.tier;
            return (
              <div
                key={item.tier}
                onClick={() => setSelectedAuthorityTier(item.tier)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "bg-slate-900 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500"
                    : "bg-slate-950/60 " + item.color
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`font-bold ${isSelected ? "text-cyan-300" : "text-slate-200"}`}>
                    {item.title}
                  </span>
                  <Badge variant={item.badgeVariant}>{item.badge}</Badge>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Emergency Freeze & Rollback Trigger */}
        <div className="space-y-6">
          {/* Emergency Kill-Switch */}
          <Card className="p-5 space-y-4 border-amber-500/30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <AlertOctagon className="w-4 h-4 text-rose-500" />
                <span>Emergency SOAR Kill-Switch</span>
              </div>
              <Badge variant={isFrozen ? "critical" : "neutral"}>
                {isFrozen ? "ENGAGED" : "ARMED"}
              </Badge>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-400">Freeze Scope:</label>
                <select
                  value={freezeScope}
                  onChange={(e) => setFreezeScope(e.target.value as any)}
                  disabled={isFrozen}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="TENANT">TENANT (Lockdown Current Org Only)</option>
                  <option value="GLOBAL">GLOBAL (Platform-Wide Sovereign Freeze)</option>
                  <option value="ACTION_TYPE">ACTION_TYPE (Freeze Specific Action e.g. IAM Revoke)</option>
                  <option value="CONNECTOR">CONNECTOR (Freeze Ingestion Connector)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400">Reason / Incident Identifier:</label>
                <textarea
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  disabled={isFrozen}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <Button
                variant="primary"
                onClick={handleToggleFreeze}
                isLoading={freezeLoading}
                className={`w-full py-2.5 font-bold flex items-center justify-center gap-2 ${
                  isFrozen
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40 animate-pulse"
                    : "bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold shadow-lg shadow-amber-900/30"
                }`}
              >
                {isFrozen ? (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>Release Emergency Freeze</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Engage Emergency Freeze</span>
                  </>
                )}
              </Button>

              {isFrozen && activeFreezeId && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-[11px] text-rose-300 space-y-1">
                  <div>
                    🚨 <strong className="text-white">Active Freeze ID:</strong> {activeFreezeId}
                  </div>
                  <div>
                    Scope: {freezeScope} | Locked by: {state.session?.email ?? "sec-ops@enterprise.corp"}
                  </div>
                  <div className="text-slate-400 text-[10px]">
                    All automated SOAR mutations blocked with zero bypass.
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Rollback Redemption */}
          <Card className="p-5 space-y-4 border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>Single-Use Rollback Redemption</span>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs">
              {/* Dual-Custody Quorum Validation Trigger */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-purple-300 font-bold flex items-center gap-1.5 text-xs">
                    <Fingerprint className="w-4 h-4 text-purple-400" />
                    Dual-Custody Quorum Gate
                  </span>
                  <Badge variant={quorumReceipt ? "healthy" : "critical"}>
                    {quorumReceipt ? "QUORUM ATTESTED" : "FIDO2 2-OF-N REQUIRED"}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400">
                  Verify 2-of-N hardware attestation quorum to issue cryptographic rollback tokens and execute live containment.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsDualCustodyOpen(true)}
                  className="w-full text-xs font-mono bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-950/50"
                >
                  <Lock className="w-3.5 h-3.5" /> Launch Dual-Custody Hardware Gate
                </Button>
              </div>

              {/* Single-Use Token Input */}
              <div className="space-y-1.5">
                <label className="text-slate-400">Active Single-Use Rollback Token:</label>
                <input
                  type="text"
                  value={quorumReceipt?.rollbackToken || rollbackToken}
                  onChange={(e) => setRollbackToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              <Button
                variant="outline"
                className="w-full py-2 flex items-center justify-center gap-2 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
                onClick={handleExecuteRollback}
                isLoading={rollbackLoading}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Redeem Token &amp; Execute Rollback</span>
              </Button>

              {/* Multi-Stage Recovery State Visualizer */}
              {(rollbackLoading || rollbackSuccess) && (
                <RecoveryState
                  title="Automated Rollback Compensation Active"
                  message="Executing compensating action across certified provider adapters."
                  rollbackStage={rollbackStageText}
                  progressPercent={rollbackProgress}
                  rollbackToken={quorumReceipt?.rollbackToken || rollbackToken}
                  isReverted={rollbackSuccess}
                />
              )}

              {rollbackError && (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-[11px] text-rose-300">
                  ❌ {rollbackError}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right 2 Columns: Scenario Selector & Blast-Radius Diff Visualizer */}
        <div className="lg:col-span-2 space-y-6">
          {/* Containment Scenario Selector */}
          <Card className="p-5 space-y-4 border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Certified Action Scenarios &amp; Containment Drivers
                </h2>
              </div>
              <Badge variant="neutral">4 Certified Adapters</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
              {SCENARIOS.map((scen) => {
                const isSelected = selectedScenario.id === scen.id;
                return (
                  <div
                    key={scen.id}
                    onClick={() => {
                      setSelectedScenario(scen);
                      setActiveSimulationReceipt(null);
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-900/90 border-cyan-500 shadow-md ring-1 ring-cyan-500/60"
                        : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {scen.actionType === "ISOLATE_ENDPOINT" && <Server className="w-3.5 h-3.5 text-rose-400" />}
                        {scen.actionType === "APPLY_WAF_BLOCK" && <Globe className="w-3.5 h-3.5 text-amber-400" />}
                        {scen.actionType === "REVOKE_IAM_SESSION" && <Key className="w-3.5 h-3.5 text-purple-400" />}
                        {scen.actionType === "DISABLE_USER_ACCOUNT" && <UserX className="w-3.5 h-3.5 text-blue-400" />}
                        <span className="font-bold text-white text-[11px]">{scen.actionType}</span>
                      </div>
                      <Badge variant={scen.authorityLevel === "R3" ? "critical" : "pass"}>
                        {scen.authorityLevel}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-300 font-semibold truncate mb-1">
                      {scen.targetRef}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Provider: {scen.provider} | Rollback: {scen.compensatingCommand}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                <span>Blast Radius Risk:</span>
                <span className="text-emerald-400 font-bold font-mono">
                  {(selectedScenario.blastRadiusScore * 100).toFixed(0)}% (Low Collateral)
                </span>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRunSimulation}
                isLoading={isSimulating}
                className="flex items-center gap-2 font-mono text-xs bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950/40"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Run Pre-Flight Blast-Radius Simulation</span>
              </Button>
            </div>
          </Card>

          {/* Pre-Execution Simulation Receipt & Infrastructure Delta */}
          <Card className="p-6 space-y-5 border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Pre-Flight Blast-Radius Simulation &amp; Cryptographic State Delta
                </h2>
              </div>
              <Badge variant="anchored">Cryptographically Signed</Badge>
            </div>

            <div className="space-y-4">
              {/* Dual-Custody Attestation Card if present */}
              {quorumReceipt && (
                <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/50 space-y-3 font-mono text-xs shadow-[0_0_20px_rgba(168,85,247,0.15)] animate-in fade-in duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-purple-400" />
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40">
                        {quorumReceipt.quorumId.toUpperCase()}
                      </span>
                      <span className="text-slate-200 font-bold">Dual-Custody Cryptographic Quorum Receipt</span>
                    </div>
                    <Badge variant="pass">2/2 FIDO2 ATTESTED</Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 space-y-1">
                      <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                        <Fingerprint className="w-3.5 h-3.5" /> 1. Primary Initiator:
                      </span>
                      <div className="text-slate-100 font-semibold">{quorumReceipt.approver1}</div>
                      <div className="text-[10px] text-slate-400">FIDO2 Hardware Attestation: VERIFIED</div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 space-y-1">
                      <span className="text-purple-400 font-bold flex items-center gap-1.5">
                        <Fingerprint className="w-3.5 h-3.5" /> 2. Secondary Approver:
                      </span>
                      <div className="text-slate-100 font-semibold">{quorumReceipt.approver2}</div>
                      <div className="text-[10px] text-slate-400">Two-Man Invariant: VERIFIED DISTINCT</div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Issued Single-Use Rollback Token:</span>
                    <span className="text-cyan-300 font-bold bg-slate-950 px-2.5 py-1 rounded border border-cyan-500/30">
                      {quorumReceipt.rollbackToken}
                    </span>
                  </div>
                </div>
              )}

              {/* Simulation Result Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                      {activeSimulationReceipt ? `RECEIPT #${activeSimulationReceipt.id || activeSimulationReceipt.receiptId}` : `SCENARIO: ${selectedScenario.id.toUpperCase()}`}
                    </span>
                    <span className="text-slate-300 font-bold">{selectedScenario.actionType}</span>
                  </div>
                  <Badge variant="healthy">
                    {activeSimulationReceipt ? "SIMULATED & SIGNED" : "READY FOR DRY-RUN"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 font-bold">Target Resource:</span>
                    <div className="text-amber-300 font-bold mt-0.5 truncate">{selectedScenario.targetRef}</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 font-bold">Execution Authority:</span>
                    <div className="text-purple-400 font-bold mt-0.5">{selectedScenario.authorityLevel} (Dual-Custody)</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-slate-400 font-bold">Compensating Action:</span>
                    <div className="text-cyan-300 font-bold mt-0.5">{selectedScenario.compensatingCommand}</div>
                  </div>
                </div>

                {/* State Delta Diff Box */}
                <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2.5 text-[11px]">
                  <div className="text-cyan-400 font-bold flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> PREDICTED INFRASTRUCTURE STATE DELTA:
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="p-2.5 rounded bg-rose-950/20 border border-rose-500/30 space-y-1">
                      <span className="text-rose-300 font-bold text-[10px] uppercase tracking-wider">Before State:</span>
                      <p className="text-slate-300 text-[11px] leading-relaxed">{selectedScenario.beforeState}</p>
                    </div>
                    <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/30 space-y-1">
                      <span className="text-emerald-300 font-bold text-[10px] uppercase tracking-wider">After State:</span>
                      <p className="text-slate-300 text-[11px] leading-relaxed">{selectedScenario.afterState}</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800 text-slate-300 text-[11px]">
                    <strong className="text-slate-200">Impact Assessment: </strong>
                    {selectedScenario.impactSummary}
                  </div>

                  {activeSimulationReceipt && (
                    <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                      <span>Safety Attestation Hash:</span>
                      <span className="text-cyan-300 font-mono font-semibold">
                        {activeSimulationReceipt.safetyAttestationHash}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Dual-Custody Approval Modal */}
      <DualCustodyApprovalModal
        isOpen={isDualCustodyOpen}
        onClose={() => setIsDualCustodyOpen(false)}
        caseId={state.cases[0]?.id || "case-live-01"}
        proposalId={selectedScenario.id}
        actionType={selectedScenario.actionType}
        targetResource={selectedScenario.targetRef}
        blastRadiusScore={selectedScenario.blastRadiusScore}
        reversibilityTier={selectedScenario.reversibilityTier}
        rollbackCommand={selectedScenario.compensatingCommand}
        onQuorumApproved={(receipt) => {
          setQuorumReceipt(receipt);
          setRollbackToken(receipt.rollbackToken);
        }}
      />
    </div>
  );
}
