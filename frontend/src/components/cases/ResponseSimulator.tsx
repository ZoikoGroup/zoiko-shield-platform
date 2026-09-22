"use client";

import React, { useState } from "react";
import { Case, HumanDecision, ResponseProposal, SimulationReceipt } from "@/lib/types";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  UserCheck,
  Server,
  Play,
  CheckCircle2,
  AlertOctagon,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Fingerprint,
  Users,
  Lock,
  Key,
  Sparkles,
} from "lucide-react";

interface ResponseSimulatorProps {
  currentCase: Case;
  onUpdateCase: () => void;
}

export const ResponseSimulator: React.FC<ResponseSimulatorProps> = ({
  currentCase,
  onUpdateCase,
}) => {
  const [decisionNotes, setDecisionNotes] = useState(
    currentCase.decision?.decisionNotes ||
      "Confirmed hostile brute-force attack from external IP. Approving session invalidation recommendation."
  );
  const [decisionType, setDecisionType] = useState<HumanDecision["decisionType"]>(
    currentCase.decision?.decisionType || "CONFIRMED_INCIDENT"
  );
  const [isRecordingDecision, setIsRecordingDecision] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isOrgFrozen, setIsOrgFrozen] = useState(false);
  const [activeFreezeId, setActiveFreezeId] = useState<string | null>(null);
  const [isFreezing, setIsFreezing] = useState(false);

  // Dual-Custody Quorum & FIDO2 Attestation State
  const [quorumStep, setQuorumStep] = useState<
    "IDLE" | "INITIATING" | "PENDING_SECOND" | "APPROVING_SECOND" | "FINALIZED"
  >("IDLE");
  const [quorumData, setQuorumData] = useState<{
    quorumId: string;
    rollbackToken: string;
    signature: string;
    secondaryApprover?: string;
  } | null>(null);
  const [initiatorFidoKey] = useState("YubiKey 5 FIPS (NFC #YK-9842)");
  const [secondaryApproverName] = useState("David Ross (Incident Commander)");
  const [secondaryFidoKey] = useState("Apple Touch ID (Passkey / FIDO2)");

  const handleInitiateQuorum = async () => {
    setQuorumStep("INITIATING");
    // Simulate FIDO2 WebAuthn Hardware Presence Challenge
    setTimeout(() => {
      const qId = `quorum-${Date.now().toString(36)}`;
      const rbToken = `ZS-ROLLBACK-TOKEN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      setQuorumData({
        quorumId: qId,
        rollbackToken: rbToken,
        signature: "",
      });
      setQuorumStep("PENDING_SECOND");
    }, 800);
  };

  const handleApproveSecondaryQuorum = async () => {
    setQuorumStep("APPROVING_SECOND");
    setTimeout(() => {
      if (quorumData) {
        setQuorumData({
          ...quorumData,
          secondaryApprover: secondaryApproverName,
          signature: `ZS-QRM-SIG-${Math.random().toString(36).substring(2, 14).toUpperCase()}`,
        });
      }
      setQuorumStep("FINALIZED");
    }, 900);
  };

  const handleRecordDecision = async () => {
    setIsRecordingDecision(true);
    try {
      await ZoikoShieldApiClient.recordHumanDecision(
        currentCase.id,
        decisionType,
        decisionNotes
      );
      onUpdateCase();
    } catch (err) {
      console.error("Record Decision Error:", err);
    } finally {
      setIsRecordingDecision(false);
    }
  };

  const handleSimulate = async () => {
    if (!currentCase.responseProposal) return;
    setIsSimulating(true);
    try {
      await ZoikoShieldApiClient.simulateResponseProposal(
        currentCase.responseProposal.id
      );
      onUpdateCase();
    } catch (err) {
      console.error("Simulation Error:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleToggleFreeze = async () => {
    setIsFreezing(true);
    try {
      if (isOrgFrozen && activeFreezeId) {
        await ZoikoShieldApiClient.releaseFreezeSOAR(activeFreezeId);
        setIsOrgFrozen(false);
        setActiveFreezeId(null);
      } else {
        const result = await ZoikoShieldApiClient.freezeSOAR(
          "TENANT",
          `Emergency freeze initiated from case ${currentCase.id} response workspace`
        );
        setIsOrgFrozen(true);
        setActiveFreezeId(result.freezeId);
      }
    } catch (err) {
      console.error("Freeze toggle error:", err);
    } finally {
      setIsFreezing(false);
    }
  };

  const hasDecision = !!currentCase.decision;
  const proposal = currentCase.responseProposal;
  const receipt = currentCase.simulationReceipt;

  return (
    <div className="space-y-6">
      {/* 1. Human Decision Section */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-100 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              Human Decision Recording
            </h3>
            <p className="text-xs text-slate-400">
              Analyst validation required to authorize SOAR remediation proposals.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasDecision && <Badge variant="pass">DECISION RECORDED</Badge>}
            <Button
              size="sm"
              variant={isOrgFrozen ? "danger" : "outline"}
              onClick={() => handleToggleFreeze()}
              isLoading={isFreezing}
              className="text-[10px] font-mono h-7"
            >
              <AlertOctagon className="w-3 h-3 text-rose-400" />
              <span>{isOrgFrozen ? "ORG EMERGENCY FROZEN" : "Emergency Freeze (Kill-Switch)"}</span>
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-400">
                Decision Outcome (`outcome`):
              </label>
              <select
                value={decisionType}
                onChange={(e) => setDecisionType(e.target.value as any)}
                disabled={hasDecision}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono disabled:opacity-70"
              >
                <option value="CONFIRMED_INCIDENT">
                  CONFIRMED_INCIDENT (Threat Confirmed)
                </option>
                <option value="INCIDENT_DECLARATION">
                  INCIDENT_DECLARATION (Formal SOC Escalation)
                </option>
                <option value="FALSE_POSITIVE">
                  FALSE_POSITIVE (Rule Tune Required)
                </option>
                <option value="NEEDS_MORE_INFO">
                  NEEDS_MORE_INFO (Request Secondary Telemetry)
                </option>
                <option value="BENIGN_ANOMALY">
                  BENIGN_ANOMALY (Authorized Activity)
                </option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-400">
                Analyst Identity:
              </label>
              <input
                type="text"
                value={currentCase.ownerName}
                disabled
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono text-slate-400">
              Analyst Justification Notes:
            </label>
            <textarea
              rows={2}
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              disabled={hasDecision}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono disabled:opacity-70"
            />
          </div>

          {!hasDecision && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleRecordDecision()}
              isLoading={isRecordingDecision}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Record Official Decision</span>
            </Button>
          )}

          {hasDecision && (
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 font-mono">
              <span>
                Signed by: {currentCase.decision?.actorName} • {formatTimestamp(currentCase.decision?.timestamp)}
              </span>
              <span className="text-[10px] text-slate-400">
                Evidence Bound: {currentCase.decision?.evidenceIds.length} Leaves
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* 2. Response Proposal & Sandbox Simulation */}
      {proposal && (
        <Card className="space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                <Server className="w-4 h-4 text-violet-400" />
                SOAR Response Action Proposal
              </h3>
              <p className="text-xs text-slate-400">
                Dry-run simulation models state diffs and blast radius before any live execution.
              </p>
            </div>
            <Badge variant={proposal.status === "SIMULATED" ? "simulated" : "pending"}>
              {proposal.status}
            </Badge>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">PROPOSED ACTION:</span>
                <span className="text-cyan-300 font-bold">{proposal.actionType}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">TARGET ASSET:</span>
                <span className="text-slate-200">{proposal.targetAsset}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">AUTHORITY LEVEL:</span>
                <span className="text-amber-400">{proposal.authorityLevel}</span>
              </div>
            </div>

            {!receipt && (
              <div className="pt-2">
                <Button
                  variant="ai"
                  onClick={() => handleSimulate()}
                  isLoading={isSimulating}
                >
                  <Play className="w-4 h-4" />
                  <span>Simulate Response Action (Dry-Run)</span>
                </Button>
              </div>
            )}
          </div>

          {/* Simulation Receipt Banner */}
          {receipt && (
            <div className="rounded-2xl bg-[#0f131d] border-2 border-dashed border-violet-500/40 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-violet-500/20">
                <div className="flex items-center gap-2">
                  <Badge variant="simulated">SIMULATION RECEIPT</Badge>
                  <span className="text-xs font-mono font-bold text-violet-300">
                    NO LIVE COLLATERAL EFFECT
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Simulated: {formatTimestamp(receipt.simulatedAt)}
                </span>
              </div>

              {/* Blast Radius & Stat Diffs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                <div className="p-3 rounded-lg bg-violet-950/30 border border-violet-500/20">
                  <span className="text-slate-400 text-[10px] block">SIMULATED BLAST RADIUS:</span>
                  <span className="text-emerald-400 text-lg font-bold">
                    {(receipt.simulatedBlastRadius * 100).toFixed(0)}% (MINIMAL)
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-violet-950/30 border border-violet-500/20">
                  <span className="text-slate-400 text-[10px] block">COLLATERAL DAMAGE RISK:</span>
                  <span className="text-cyan-300 text-sm font-semibold">
                    {String(receipt.observedEffect.collateralDamageRisk || "ZERO")}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-violet-950/30 border border-violet-500/20">
                  <span className="text-slate-400 text-[10px] block">SESSIONS INVALIDATED:</span>
                  <span className="text-amber-400 text-sm font-semibold">
                    {String(receipt.observedEffect.sessionsTerminated || 3)} Active Sessions
                  </span>
                </div>
              </div>

              {/* State Transitions Diff */}
              <div className="space-y-2">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase">
                  Simulated State Transition Diff:
                </span>
                {receipt.stateDiffs.map((diff, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs space-y-1"
                  >
                    <div className="text-slate-300 font-semibold">{diff.target}</div>
                    <div className="text-rose-400">- Before: {diff.beforeState}</div>
                    <div className="text-emerald-400">+ After:  {diff.afterState}</div>
                    <div className="text-cyan-400 text-[10px] pt-1">
                      Rollback Hook: {diff.rollbackCommand}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-slate-500 border-t border-slate-800">
                <span>Receipt ID: {receipt.id}</span>
                <span>SHA-256 Attestation: {truncateHash(receipt.safetyAttestationHash, 8, 8)}</span>
              </div>
            </div>
          )}

          {/* 3. Two-Man Rule Dual-Custody Approval Quorum (R2+ Containment Governance) */}
          {receipt && (
            <div className="rounded-2xl bg-gradient-to-b from-[#0f172a] to-[#090d16] border border-cyan-500/30 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Badge variant="pass">2-MAN RULE QUORUM</Badge>
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    FIDO2 Hardware Step-Up Reauthorization (R2/R3/R4)
                  </span>
                </div>
                <Badge variant={quorumStep === "FINALIZED" ? "pass" : "pending"}>
                  {quorumStep === "FINALIZED"
                    ? "QUORUM REACHED (AUTHORIZED)"
                    : quorumStep === "PENDING_SECOND"
                    ? "AWAITING SECONDARY CO-SIGN"
                    : "QUORUM REQUIRED"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                {/* Approver 1: Lead Analyst Initiator */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-semibold text-slate-200">
                      <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
                      1. Initiating Approver
                    </span>
                    <span className="text-cyan-400 font-bold">
                      {quorumStep !== "IDLE" ? "ATTESTED" : "PENDING"}
                    </span>
                  </div>
                  <div className="text-slate-100 font-bold">
                    {currentCase.ownerName || "Sarah Chen (Security Operations Lead)"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Hardware Key: {initiatorFidoKey}
                  </div>

                  {(quorumStep === "IDLE" || quorumStep === "INITIATING") && (
                    <Button
                      variant="cyan"
                      size="sm"
                      className="w-full mt-2 text-[11px]"
                      onClick={handleInitiateQuorum}
                      isLoading={quorumStep === "INITIATING"}
                    >
                      <Fingerprint className="w-3.5 h-3.5" />
                      <span>Initiate Quorum (Touch FIDO2 Key)</span>
                    </Button>
                  )}
                </div>

                {/* Approver 2: Incident Commander */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-semibold text-slate-200">
                      <Users className="w-3.5 h-3.5 text-purple-400" />
                      2. Secondary Approver (Distinct)
                    </span>
                    <span className="text-purple-400 font-bold">
                      {quorumStep === "FINALIZED" ? "CO-SIGNED" : "REQUIRED"}
                    </span>
                  </div>
                  <div className="text-slate-100 font-bold">{secondaryApproverName}</div>
                  <div className="text-[10px] text-slate-500">
                    Hardware Key: {secondaryFidoKey}
                  </div>

                  {(quorumStep === "PENDING_SECOND" || quorumStep === "APPROVING_SECOND") && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full mt-2 text-[11px] bg-purple-600 hover:bg-purple-500 text-white"
                      onClick={handleApproveSecondaryQuorum}
                      isLoading={quorumStep === "APPROVING_SECOND"}
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Co-Sign Quorum (Touch FIDO2 Key)</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Finalized Quorum Receipt & Rollback Token */}
              {quorumStep === "FINALIZED" && quorumData && (
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between text-emerald-400 font-bold text-[11px]">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Cryptographic Dual-Custody Quorum Finalized
                    </span>
                    <span>Status: RATIFIED</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                    <div>
                      <span className="text-slate-400 block text-[10px]">QUORUM ID:</span>
                      <span className="text-slate-200 font-semibold">{quorumData.quorumId}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">SINGLE-USE ROLLBACK TOKEN:</span>
                      <span className="text-amber-300 font-bold break-all">
                        {quorumData.rollbackToken}
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-emerald-500/20 flex items-center justify-between">
                    <span>Quorum Signature: {quorumData.signature}</span>
                    <span className="text-emerald-400 font-semibold">Ready for G1 Production Dispatch</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
