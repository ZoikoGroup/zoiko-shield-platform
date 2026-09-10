"use client";

import React, { useState } from "react";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { truncateHash } from "@/lib/utils";
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
  Fingerprint,
} from "lucide-react";
import {
  DegradedState,
  RecoveryState,
  UnauthorizedState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";
import { DualCustodyApprovalModal } from "@/components/cases/DualCustodyApprovalModal";

export default function ActionsAndFreezePage() {
  const [state] = useDemoState();
  const [freezeScope, setFreezeScope] = useState<"GLOBAL" | "TENANT" | "ACTION_TYPE" | "CONNECTOR">("TENANT");
  const [freezeReason, setFreezeReason] = useState(
    "Suspected compromised lateral credentials under investigation"
  );
  const [isFrozen, setIsFrozen] = useState(false);
  const [activeFreezeId, setActiveFreezeId] = useState<string | null>(null);
  const [freezeLoading, setFreezeLoading] = useState(false);

  const [rollbackToken, setRollbackToken] = useState(
    () =>
      state.cases[0]?.responseProposal?.id ??
      "ZS-ROLLBACK-TOKEN-8F7A9C2B"
  );
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [rollbackProgress, setRollbackProgress] = useState(0);
  const [rollbackStageText, setRollbackStageText] = useState("");
  const [isDualCustodyOpen, setIsDualCustodyOpen] = useState(false);
  const [quorumReceipt, setQuorumReceipt] = useState<{
    quorumId: string;
    approver1: string;
    approver2: string;
    rollbackToken: string;
  } | null>(null);

  // Real simulation receipt from demo state (populated after case/response simulation)
  const simulationReceipt = state.cases[0]?.simulationReceipt;
  const responseProposal = state.cases[0]?.responseProposal;

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

  const handleExecuteRollback = async () => {
    setRollbackLoading(true);
    setRollbackError(null);
    setRollbackSuccess(false);
    setRollbackProgress(25);
    setRollbackStageText("Validating token signature & single-use authorization");

    try {
      await new Promise((r) => setTimeout(r, 400));
      setRollbackProgress(50);
      setRollbackStageText("Dispatching compensating adapter (RESTORE_USER_SESSION_CACHE / UNISOLATE_ENDPOINT)");

      await new Promise((r) => setTimeout(r, 500));
      setRollbackProgress(75);
      setRollbackStageText("Reconciling endpoint connectivity & identity cache");

      const proposalId = responseProposal?.id ?? rollbackToken;
      await ZoikoShieldApiClient.simulateResponseProposal(proposalId);

      setRollbackProgress(100);
      setRollbackStageText("Compensating rollback successfully finalized & anchored");
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
                  Specification:{" "}
                  <span className="font-mono text-cyan-400">ZS-ENG-DRS-001</span> &amp;{" "}
                  <span className="font-mono text-cyan-400">ZS-ENG-EVID-001</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
              Authority Engine: <span className="text-amber-400 font-bold">Dual-Custody Enabled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mandatory UI States */}
      {isFrozen && (
        <DegradedState
          title="Emergency Autonomous Freeze Active (SOAR Halted)"
          message={`Tenant automation frozen: "${freezeReason}". Scope: ${freezeScope}. All live actions require human step-up authorization.`}
          fallbackReason="SOAR_EMERGENCY_KILLSWITCH_ENGAGED"
        />
      )}

      {rollbackLoading && (
        <RecoveryState
          title="Executing Automated Compensation Rollback"
          message="Reverting modified session credentials and restoring pre-incident state diff."
          rollbackStage="SOAR Compensating Action Adapter"
          progressPercent={65}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Emergency Freeze Controller */}
        <div className="space-y-6">
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
                  rows={3}
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
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>Single-Use Rollback Redemption</span>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs">
              {/* Dual-Custody Quorum Validation Trigger (Simulation & Governance Mode) */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-purple-300 font-bold flex items-center gap-1.5 text-xs">
                    <Fingerprint className="w-4 h-4 text-purple-400" />
                    Dual-Custody Quorum Validation
                  </span>
                  <Badge variant={quorumReceipt ? "healthy" : "ai"}>
                    {quorumReceipt ? "QUORUM ATTESTED" : "FIDO2 2-OF-N (SIMULATION)"}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400">
                  Verify 2-of-N hardware attestation quorum and generate pre-computed rollback tokens in simulation mode (Live execution gated per Master Build Plan §2, §18).
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsDualCustodyOpen(true)}
                  className="w-full text-xs font-mono bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500"
                >
                  <Lock className="w-3.5 h-3.5" /> Validate Dual-Custody Quorum &amp; Challenge
                </Button>
              </div>

              {/* Single-Use Token Rollback Section */}
              {responseProposal ? (
                <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-cyan-300 text-[11px]">
                  ✓ Active Token from case{" "}
                  <span className="font-bold">{state.cases[0]?.id}</span>:
                  <br />
                  <span className="text-slate-300">{quorumReceipt?.rollbackToken || responseProposal.id}</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-slate-400">Single-Use Rollback Token:</label>
                  <input
                    type="text"
                    value={rollbackToken}
                    onChange={(e) => setRollbackToken(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              <Button
                variant="outline"
                className="w-full py-2 flex items-center justify-center gap-2 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/10"
                onClick={handleExecuteRollback}
                isLoading={rollbackLoading}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Redeem Single-Use Token &amp; Execute Rollback</span>
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

        {/* Right 2 Columns: Live Pre-Execution Simulation Receipts */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Pre-Execution Dry-Run Simulation Receipts &amp; Receipts Ledger
                </h2>
              </div>
              <Badge variant="anchored">Cryptographically Signed</Badge>
            </div>

            <div className="space-y-4">
              {simulationReceipt ? (
                /* Real simulation receipt from demo state */
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                        RECEIPT #{simulationReceipt.id}
                      </span>
                      <span className="text-slate-300 font-bold">
                        {responseProposal?.actionType ?? "SOAR Response"}
                      </span>
                    </div>
                    <Badge variant="healthy">SIMULATED &amp; SIGNED</Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-400 font-bold">Action Type:</span>
                      <div className="text-rose-400 font-bold mt-0.5">
                        {responseProposal?.actionType ?? "RESET_USER_SESSIONS"}
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-400 font-bold">Target Asset:</span>
                      <div className="text-amber-300 font-bold mt-0.5">
                        {responseProposal?.targetAsset ?? "victim.engineer@acme.com"}
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-400 font-bold">Authority Tier:</span>
                      <div className="text-purple-400 font-bold mt-0.5">
                        {responseProposal?.authorityLevel ?? "R1_RECOMMEND"}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-2 text-[11px]">
                    <div className="text-cyan-400 font-bold">PREDICTED INFRASTRUCTURE STATE DELTA:</div>
                    {simulationReceipt.stateDiffs?.map((diff, i) => (
                      <div key={i} className="space-y-1 text-slate-300">
                        <div>
                          <span className="text-slate-500">Target:</span> {diff.target}
                        </div>
                        <div>
                          <span className="text-slate-500">Before:</span> {diff.beforeState}
                        </div>
                        <div>
                          <span className="text-slate-500">After:</span> {diff.afterState}
                        </div>
                        <div>
                          <span className="text-slate-500">Rollback:</span> {diff.rollbackCommand}
                        </div>
                      </div>
                    ))}
                    <div className="pt-1 border-t border-slate-800">
                      <span className="text-slate-500">Safety Hash:</span>{" "}
                      <span className="text-cyan-300">
                        {simulationReceipt.safetyAttestationHash?.slice(0, 32) ?? ""}...
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* No simulation receipt yet — static example */
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                        RECEIPT #rcpt-f2092389-00c4
                      </span>
                      <span className="text-slate-300 font-bold">EDR Host Containment</span>
                    </div>
                    <Badge variant="healthy">SIMULATED &amp; SIGNED</Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-400 font-bold">Action Type:</span>
                      <div className="text-rose-400 font-bold mt-0.5">ISOLATE_ENDPOINT</div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-400 font-bold">Target Host:</span>
                      <div className="text-amber-300 font-bold mt-0.5">srv-db-prod-02</div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-400 font-bold">Authority Tier:</span>
                      <div className="text-purple-400 font-bold mt-0.5">R2 (Containment)</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-2 text-[11px]">
                    <div className="text-cyan-400 font-bold">PREDICTED INFRASTRUCTURE STATE DELTA:</div>
                    <pre className="text-[10px] text-slate-300 overflow-x-auto leading-relaxed">
{`{
  "targetHost": "srv-db-prod-02",
  "expectedState": "NETWORK_ISOLATED",
  "blastRadius": {
    "affectedWorkstations": 0,
    "affectedServers": 1,
    "activeConnectionsDropped": 4,
    "serviceImpact": "LOW (Database replica failover automatic)"
  },
  "compensatingAction": "UNISOLATE_ENDPOINT",
  "rollbackTokenHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}`}
                    </pre>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-amber-300 text-[11px]">
                    ℹ️ No live simulation receipt yet. Complete the Case → Response Simulator flow to
                    see real receipt data here.
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Dual-Custody Approval Modal */}
      <DualCustodyApprovalModal
        isOpen={isDualCustodyOpen}
        onClose={() => setIsDualCustodyOpen(false)}
        caseId={state.cases[0]?.id || "case-live-01"}
        proposalId={state.cases[0]?.responseProposal?.id || "prop-isolate-r2"}
        actionType="ISOLATE_ENDPOINT"
        targetResource="srv-db-prod-02"
        blastRadiusScore={0.05}
        reversibilityTier="R1"
        rollbackCommand="UNISOLATE_ENDPOINT"
        onQuorumApproved={(receipt) => {
          setQuorumReceipt(receipt);
          setRollbackToken(receipt.rollbackToken);
        }}
      />
    </div>
  );
}
