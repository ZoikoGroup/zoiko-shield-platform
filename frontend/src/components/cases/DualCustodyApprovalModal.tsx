"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ShieldCheck,
  Lock,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  KeyRound,
  Fingerprint,
} from "lucide-react";

export interface DualCustodyModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  proposalId: string;
  actionType: string;
  targetResource: string;
  blastRadiusScore?: number;
  reversibilityTier?: string;
  rollbackCommand?: string;
  onQuorumApproved: (receipt: {
    quorumId: string;
    approver1: string;
    approver2: string;
    rollbackToken: string;
  }) => void;
}

export const DualCustodyApprovalModal: React.FC<DualCustodyModalProps> = ({
  isOpen,
  onClose,
  caseId,
  proposalId,
  actionType,
  targetResource,
  blastRadiusScore = 0.05,
  reversibilityTier = "R1",
  rollbackCommand = "RESTORE_USER_SESSION_CACHE",
  onQuorumApproved,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [initiatorFido2Signed, setInitiatorFido2Signed] = useState(false);
  const [secondaryApproverName, setSecondaryApproverName] = useState("David Ross (SOC Director)");
  const [secondaryApproverRole, setSecondaryApproverRole] = useState("TENANT_OWNER");
  const [secondaryFido2Signed, setSecondaryFido2Signed] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initiatorName = "Sarah Chen (Lead Analyst)";
  const initiatorRole = "SECURITY_OPERATIONS_LEAD";
  const singleUseRollbackToken = `ZS-ROLLBACK-TOKEN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const handleInitiatorSign = () => {
    setInitiatorFido2Signed(true);
    setStep(2);
  };

  const handleSecondarySign = () => {
    // Check non-negotiable two-man rule: approver !== initiator
    if (secondaryApproverName.toLowerCase().includes("sarah chen")) {
      setErrorMessage("Dual-Custody Violation: Initiator cannot self-approve their own containment action!");
      return;
    }
    setErrorMessage(null);
    setSecondaryFido2Signed(true);
    setStep(3);
  };

  const handleFinalizeQuorum = () => {
    setIsAuthorizing(true);
    setTimeout(() => {
      onQuorumApproved({
        quorumId: `quorum-${Math.random().toString(36).substring(2, 9)}`,
        approver1: initiatorName,
        approver2: secondaryApproverName,
        rollbackToken: singleUseRollbackToken,
      });
      setIsAuthorizing(false);
      onClose();
    }, 600);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Dual-Custody Cryptographic Approval Quorum"
      maxWidth="xl"
    >
      <div className="space-y-5 text-xs text-slate-300">
        {/* Banner Alert */}
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3 text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-semibold text-amber-100">Live R2 Remediation Quorum Required</h4>
            <p className="text-[11px] text-amber-300/80">
              ZS-ENG-ACT-001 §8: High-impact containment actions require 2 distinct authorized security leads with hardware token attestation before live dispatch.
            </p>
          </div>
        </div>

        {/* Action Parameters & Safety Guardrails */}
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400">Target Action:</span>
            <Badge variant="critical">{actionType}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400">Target Resource:</span>
            <span className="font-mono text-slate-100 font-semibold">{targetResource}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400">Blast Radius Risk:</span>
            <span className="text-emerald-400 font-mono font-bold">{(blastRadiusScore * 100).toFixed(0)}% (Low Collateral)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400">Reversibility Tier:</span>
            <span className="text-cyan-400 font-mono font-semibold">Tier {reversibilityTier} (Automated Compensation)</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <span className="font-mono text-slate-400 flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
              Compensating Command:
            </span>
            <span className="font-mono text-blue-300 bg-blue-950/50 px-2 py-0.5 rounded border border-blue-500/30">
              {rollbackCommand}
            </span>
          </div>
        </div>

        {/* Step Progression */}
        <div className="grid grid-cols-2 gap-3">
          {/* Step 1: Initiator Attestation */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              initiatorFido2Signed
                ? "bg-emerald-950/20 border-emerald-500/40"
                : "bg-slate-900/60 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase">1. Primary Initiator</span>
              {initiatorFido2Signed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Fingerprint className="w-4 h-4 text-cyan-400 animate-pulse" />
              )}
            </div>
            <p className="font-semibold text-slate-100">{initiatorName}</p>
            <p className="text-[10px] font-mono text-cyan-400/80">{initiatorRole}</p>

            {!initiatorFido2Signed && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleInitiatorSign}
                className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-mono"
              >
                <Fingerprint className="w-3.5 h-3.5" /> Touch FIDO2 Security Key
              </Button>
            )}
          </div>

          {/* Step 2: Secondary Approver Attestation */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              secondaryFido2Signed
                ? "bg-emerald-950/20 border-emerald-500/40"
                : step === 2
                ? "bg-slate-900/60 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                : "bg-slate-950/40 border-slate-800 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">2. Secondary Approver</span>
              {secondaryFido2Signed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <KeyRound className="w-4 h-4 text-purple-400" />
              )}
            </div>
            <p className="font-semibold text-slate-100">{secondaryApproverName}</p>
            <p className="text-[10px] font-mono text-purple-400/80">{secondaryApproverRole}</p>

            {step === 2 && !secondaryFido2Signed && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleSecondarySign}
                className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-mono bg-purple-600 hover:bg-purple-500"
              >
                <Fingerprint className="w-3.5 h-3.5" /> Attest Secondary Hardware Key
              </Button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
            ❌ {errorMessage}
          </div>
        )}

        {/* Final Step: Pre-computed Rollback Token and Dispatch */}
        {step === 3 && (
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-2 font-mono">
            <div className="flex items-center justify-between text-emerald-300 text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Dual-Custody Cryptographic Quorum Reached
              </span>
              <Badge variant="pass">2/2 SIGNED</Badge>
            </div>
            <div className="text-[11px] text-slate-300 flex items-center justify-between pt-1">
              <span>Single-Use Rollback Token:</span>
              <span className="text-cyan-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {singleUseRollbackToken}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isAuthorizing}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleFinalizeQuorum}
            disabled={step !== 3 || isAuthorizing}
            className="flex items-center gap-2 font-mono font-bold"
          >
            <Lock className="w-3.5 h-3.5" />
            {isAuthorizing ? "Dispatching Governed Command..." : "Authorize & Execute Live Containment"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
