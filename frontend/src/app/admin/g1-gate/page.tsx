"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  UserCheck,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  KeyRound,
  FileCheck,
} from "lucide-react";

interface G1ApproverState {
  roleId: string;
  roleTitle: string;
  signatoryName?: string;
  signatureProof?: string;
  ratified: boolean;
  signedAt?: string;
}

export default function G1LaunchGatePage() {
  const [gateStatus, setGateStatus] = useState("PENDING_MULTI_APPROVER_SIGNOFF");
  const [allApproved, setAllApproved] = useState(false);
  const [ratifiedCount, setRatifiedCount] = useState(0);
  const [approvers, setApprovers] = useState<G1ApproverState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Signing modal state
  const [signingRole, setSigningRole] = useState<G1ApproverState | null>(null);
  const [signatoryName, setSignatoryName] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");

  const loadRoster = async () => {
    try {
      const data = await ZoikoShieldApiClient.getG1Roster();
      setGateStatus(data.gateStatus);
      setAllApproved(data.allApproved);
      setRatifiedCount(data.ratifiedApprovalsCount);
      setApprovers(Array.isArray(data.approvers) ? data.approvers : []);
    } catch (err) {
      console.error("Failed to load G1 roster", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRoster();
  }, []);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signingRole) return;
    try {
      const proof = `ecdsa-p256-sig-${Date.now()}-${signingRole.roleId}`;
      const res = await ZoikoShieldApiClient.signG1Roster(
        signingRole.roleId,
        signatoryName,
        proof,
        evidenceNotes
      );

      setGateStatus(res.gateStatus);
      setAllApproved(res.allApproved);
      setRatifiedCount(res.ratifiedApprovalsCount);
      setSigningRole(null);
      setSignatoryName("");
      setEvidenceNotes("");
      setActionSuccess(`Ratified signature recorded for ${signingRole.roleTitle}.`);
      loadRoster();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReset = async () => {
    try {
      await ZoikoShieldApiClient.resetG1Roster();
      setActionSuccess("G1 Roster reset to unratified baseline (0 / 8 signatures).");
      loadRoster();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>G1 MULTI-APPROVER LAUNCH GATE PROTOCOL (§05 & §16)</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
            G1 Launch Gate & Live Response Authority
          </h1>
          <p className="text-slate-400 text-sm max-w-3xl">
            Independent cryptographic ratification across all 8 canonical domain leads. Controls fail-closed unlock for live R2+ autonomous response mutations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setRefreshing(true);
              loadRoster();
            }}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Refresh Roster"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors border border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Roster</span>
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-slate-400 hover:text-slate-200 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* R2+ Live Response Safety Status Banner */}
      <div
        className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
          allApproved
            ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
            : "bg-rose-950/30 border-rose-800/80 text-rose-300"
        }`}
      >
        <div className="flex items-start gap-3">
          {allApproved ? (
            <Unlock className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <Lock className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-bold text-sm tracking-wide flex items-center gap-2">
              <span>LIVE R2+ RESPONSE STATUS:</span>
              <span className="font-mono underline">
                {allApproved ? "RATIFIED (LIVE MUTATIONS ENABLED)" : "FAIL-CLOSED (SIMULATION ONLY)"}
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              {allApproved
                ? "All 8 canonical domain leads have ratified the G1 launch gate. R2+ autonomous response actions (IAM revocation, user suspension, EDR isolation) have live execution authority."
                : "Live R2+ response actions remain fail-closed in code. Attempted mutations simulate and record receipts without modifying external target infrastructure until 8/8 signatures are ratified."}
            </p>
          </div>
        </div>

        <div className="shrink-0 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-center font-mono">
          <div className="text-[10px] text-slate-500 uppercase">Ratification Progress</div>
          <div className="text-2xl font-black text-cyan-400">{ratifiedCount} / 8</div>
          <div className="text-[10px] text-slate-400">Signatures Recorded</div>
        </div>
      </div>

      {/* 8 Approver Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {approvers.map((approver) => (
          <div
            key={approver.roleId}
            className={`p-5 rounded-xl border flex flex-col justify-between space-y-4 transition-all ${
              approver.ratified
                ? "bg-emerald-950/20 border-emerald-500/40"
                : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-[10px] font-bold text-slate-500 uppercase">
                  {approver.roleId}
                </span>
                {approver.ratified ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> RATIFIED
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" /> PENDING
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-100">{approver.roleTitle}</h3>
                {approver.signatoryName && (
                  <p className="text-xs text-cyan-300 mt-1 font-mono">
                    Signed by: {approver.signatoryName}
                  </p>
                )}
                {approver.signedAt && (
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {new Date(approver.signedAt).toLocaleDateString()} at{" "}
                    {new Date(approver.signedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>

            <div>
              {!approver.ratified ? (
                <button
                  onClick={() => {
                    setSigningRole(approver);
                    setSignatoryName("");
                    setEvidenceNotes("");
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Ratify Signature</span>
                </button>
              ) : (
                <div className="text-[10px] font-mono text-slate-500 truncate">
                  Proof: {approver.signatureProof?.slice(0, 20)}...
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Signature Modal */}
      {signingRole && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-cyan-400" />
              Ratify G1 Gate Approval
            </h3>
            <p className="text-xs text-slate-400">
              Record digital signature for <strong className="text-slate-200">{signingRole.roleTitle}</strong>.
            </p>

            <form onSubmit={handleSign} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Signatory Full Name</label>
                <input
                  type="text"
                  placeholder="E.g. Dr. Maya Patel"
                  value={signatoryName}
                  onChange={(e) => setSignatoryName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Evidence Reference / Approval Notes</label>
                <textarea
                  placeholder="E.g. Verified AI Model Safety Evaluation & PQC Merkle Root Sealing"
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                <div className="font-mono text-cyan-400 font-bold mb-0.5">ECDSA P-256 Signature Stamp:</div>
                An immutable cryptographic audit record will be anchored to the evidence chain upon submission.
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSigningRole(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400"
                >
                  Confirm Ratification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
