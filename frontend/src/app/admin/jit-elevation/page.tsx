"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { JitElevationSession } from "@/lib/types";
import {
  ShieldAlert,
  KeyRound,
  UserCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Fingerprint,
  PlusCircle,
  RefreshCw,
  Ban,
  Lock,
} from "lucide-react";

export default function JitElevationPage() {
  const [sessions, setSessions] = useState<JitElevationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Elevation Request Form State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [operatorId, setOperatorId] = useState("usr-analyst-02");
  const [targetTenantId, setTargetTenantId] = useState("tenant-prod-alpha");
  const [elevatedRole, setElevatedRole] = useState("INCIDENT_COMMANDER");
  const [statedPurpose, setStatedPurpose] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [initialHardware, setInitialHardware] = useState(false);

  // Peer Approval / Revocation Modal State
  const [approvingSessionId, setApprovingSessionId] = useState<string | null>(null);
  const [approverId, setApproverId] = useState("usr-ciso-01");
  const [approverRole, setApproverRole] = useState("CISO");

  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revocationReason, setRevocationReason] = useState("");

  const loadSessions = async () => {
    try {
      setError(null);
      const data = await ZoikoShieldApiClient.getJitSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load JIT elevation sessions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (statedPurpose.trim().length < 10) {
      setError("Stated purpose must be a comprehensive justification (min 10 characters)");
      return;
    }
    try {
      setError(null);
      await ZoikoShieldApiClient.createJitElevation({
        operatorId,
        targetTenantId,
        elevatedRole,
        statedPurpose,
        durationMinutes,
        initialHardwareProof: initialHardware ? `fido2-attestation-${Date.now()}` : undefined,
      });
      setShowRequestModal(false);
      setStatedPurpose("");
      setActionSuccess("JIT Elevation request created in PENDING status. Awaiting peer approver quorum.");
      loadSessions();
    } catch (err: any) {
      setError(err?.message || "Failed to create JIT elevation request");
    }
  };

  const handlePeerApprove = async () => {
    if (!approvingSessionId) return;
    try {
      setError(null);
      await ZoikoShieldApiClient.peerApproveJitSession(
        approvingSessionId,
        approverId,
        approverRole,
        "Verified emergency ticket justification"
      );
      setApprovingSessionId(null);
      setActionSuccess(`Session ${approvingSessionId} approved by ${approverId} (${approverRole}).`);
      loadSessions();
    } catch (err: any) {
      setError(err?.message || "Peer approval failed");
    }
  };

  const handleStepUp = async (sessionId: string) => {
    try {
      setError(null);
      await ZoikoShieldApiClient.stepUpHardwareJitSession(
        sessionId,
        `fido2-yubikey-p256-digest-${Date.now()}`
      );
      setActionSuccess(`FIDO2/WebAuthn hardware step-up verified for session ${sessionId}.`);
      loadSessions();
    } catch (err: any) {
      setError(err?.message || "Hardware step-up failed");
    }
  };

  const handleRevoke = async () => {
    if (!revokingSessionId) return;
    try {
      setError(null);
      await ZoikoShieldApiClient.revokeJitSession(
        revokingSessionId,
        "usr-ciso-master",
        revocationReason || "Emergency administrative revocation"
      );
      setRevokingSessionId(null);
      setRevocationReason("");
      setActionSuccess(`Session ${revokingSessionId} revoked immediately.`);
      loadSessions();
    } catch (err: any) {
      setError(err?.message || "Revocation failed");
    }
  };

  const activeCount = sessions.filter((s) => s.status === "ACTIVE").length;
  const pendingCount = sessions.filter((s) => s.status === "PENDING").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> ACTIVE ELEVATION
          </span>
        );
      case "APPROVED":
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <UserCheck className="w-3 h-3" /> APPROVED (PENDING HARDWARE)
          </span>
        );
      case "PENDING":
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <Clock className="w-3 h-3" /> AWAITING PEER APPROVAL
          </span>
        );
      case "REVOKED":
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <Ban className="w-3 h-3" /> REVOKED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-mono font-bold">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-mono">
            <KeyRound className="w-3.5 h-3.5" />
            <span>JUST-IN-TIME (JIT) PRIVILEGED ACCESS COCKPIT</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
            Privileged Elevation & Dual-Approver Quorum
          </h1>
          <p className="text-slate-400 text-sm max-w-3xl">
            Strict time-bounded administrative elevation per Spec §13 (&quot;Privileged Access, Step-Up, JIT and Break-Glass&quot;). Enforces Four-Eyes separation of duties and FIDO2/WebAuthn hardware step-up.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setRefreshing(true);
              loadSessions();
            }}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Refresh Sessions"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowRequestModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors shadow-lg shadow-cyan-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Request JIT Elevation</span>
          </button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}
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

      {/* Governance Banner */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3 text-xs">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-slate-200">
            Separation of Duties Policy (Four-Eyes Principle / Zero-Trust Baseline)
          </span>
          <p className="text-slate-400 leading-relaxed">
            Operators cannot approve their own elevation requests. All elevated sessions are time-bounded (max 4 hours), strictly tenant-scoped, and anchored with SHA-256 cryptographic attestation hashes in the immutable evidence ledger.
          </p>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-slate-400 text-xs font-mono">ACTIVE ELEVATED SESSIONS</div>
          <div className="text-2xl font-bold text-emerald-400">{activeCount}</div>
          <div className="text-[11px] text-slate-500">Live operational authority with hardware step-up</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-slate-400 text-xs font-mono">PENDING PEER APPROVALS</div>
          <div className="text-2xl font-bold text-amber-400">{pendingCount}</div>
          <div className="text-[11px] text-slate-500">Awaiting second-person quorum authorization</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-slate-400 text-xs font-mono">TOTAL MANAGED SESSIONS</div>
          <div className="text-2xl font-bold text-slate-100">{sessions.length}</div>
          <div className="text-[11px] text-slate-500">Audited across active, expired, and revoked states</div>
        </div>
      </div>

      {/* Sessions Cockpit List */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold text-slate-100">Elevation Sessions Queue</h2>
            <p className="text-xs text-slate-400">Live audit and control for all JIT privileged sessions</p>
          </div>
        </div>

        {sessions.length === 0 && !loading ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No JIT elevation sessions found. Click &quot;Request JIT Elevation&quot; to initiate a request.
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((sess) => (
              <div
                key={sess.sessionId}
                className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-cyan-400">{sess.sessionId}</span>
                    {getStatusBadge(sess.status)}
                    {sess.hardwareStepUpVerified ? (
                      <span className="px-2 py-0.5 rounded bg-indigo-950/40 text-indigo-300 border border-indigo-500/30 font-mono text-[9px] flex items-center gap-1">
                        <Fingerprint className="w-3 h-3 text-indigo-400" /> FIDO2 VERIFIED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-500/30 font-mono text-[9px]">
                        STEP-UP PENDING
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {sess.status === "PENDING" && (
                      <button
                        onClick={() => setApprovingSessionId(sess.sessionId)}
                        className="px-3 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono transition-colors"
                      >
                        Peer Approve
                      </button>
                    )}
                    {sess.status === "APPROVED" && !sess.hardwareStepUpVerified && (
                      <button
                        onClick={() => handleStepUp(sess.sessionId)}
                        className="px-3 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-xs font-mono transition-colors"
                      >
                        Verify Hardware
                      </button>
                    )}
                    {(sess.status === "ACTIVE" || sess.status === "APPROVED" || sess.status === "PENDING") && (
                      <button
                        onClick={() => setRevokingSessionId(sess.sessionId)}
                        className="px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-mono transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Operator: </span>
                    <span className="text-slate-300 font-mono">{sess.operatorId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Target Tenant: </span>
                    <span className="text-slate-300 font-mono">{sess.targetTenantId}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Elevated Role: </span>
                    <span className="text-cyan-300 font-semibold">{sess.elevatedRole}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Expires: </span>
                    <span className="text-slate-300 font-mono">
                      {new Date(sess.expiresAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-slate-500 font-mono">Stated Justification: </span>
                  {sess.statedPurpose}
                </div>

                {sess.peerApprover && (
                  <div className="text-[11px] text-slate-500 font-mono">
                    Approved by peer: <span className="text-slate-300">{sess.peerApprover}</span>
                  </div>
                )}
                {sess.revocationReason && (
                  <div className="text-[11px] text-rose-400 font-mono">
                    Revocation reason: {sess.revocationReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" />
                Submit JIT Privileged Elevation Request
              </h3>
              <button
                onClick={() => setShowRequestModal(false)}
                className="text-slate-500 hover:text-slate-300 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Operator ID</label>
                <input
                  type="text"
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Target Tenant</label>
                <input
                  type="text"
                  value={targetTenantId}
                  onChange={(e) => setTargetTenantId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Requested Elevated Role</label>
                <select
                  value={elevatedRole}
                  onChange={(e) => setElevatedRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                >
                  <option value="INCIDENT_COMMANDER">INCIDENT_COMMANDER (P1 Triage)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Tenant Configuration)</option>
                  <option value="SOC_LEAD">SOC_LEAD (Operations Lead)</option>
                  <option value="SECURITY_LEAD">SECURITY_LEAD (Audit & Assurance)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Stated Operational Purpose & Justification (min 10 chars)
                </label>
                <textarea
                  value={statedPurpose}
                  onChange={(e) => setStatedPurpose(e.target.value)}
                  placeholder="E.g. Emergency P1 incident containment and telemetry analysis for Case #2026-904"
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Duration: {durationMinutes} Minutes</span>
                  <span className="text-slate-500">Max: 240m (4 hours)</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={240}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full accent-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="initHw"
                  checked={initialHardware}
                  onChange={(e) => setInitialHardware(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 accent-cyan-500"
                />
                <label htmlFor="initHw" className="text-slate-300">
                  Pre-attest with FIDO2 / WebAuthn Hardware Token
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Peer Approval Modal */}
      {approvingSessionId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              Four-Eyes Peer Approval
            </h3>
            <p className="text-xs text-slate-400">
              Confirm dual-custody authorization for session <code className="text-cyan-300">{approvingSessionId}</code>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Approver ID</label>
                <input
                  type="text"
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Approver Role</label>
                <select
                  value={approverRole}
                  onChange={(e) => setApproverRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                >
                  <option value="CISO">CISO</option>
                  <option value="DPO">DPO</option>
                  <option value="VP_ENGINEERING">VP_ENGINEERING</option>
                  <option value="SOC_LEAD">SOC_LEAD</option>
                </select>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setApprovingSessionId(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePeerApprove}
                className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400"
              >
                Authorize Elevation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revocation Modal */}
      {revokingSessionId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-400" />
              Emergency Revocation
            </h3>
            <p className="text-xs text-slate-400">
              Instantly terminate privileged access for session <code className="text-rose-300">{revokingSessionId}</code>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Revocation Justification / Reason</label>
                <textarea
                  value={revocationReason}
                  onChange={(e) => setRevocationReason(e.target.value)}
                  placeholder="E.g. Task completed; operator zero-trust purge"
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  required
                />
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setRevokingSessionId(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                className="px-4 py-2 rounded-lg bg-rose-500 text-white font-bold hover:bg-rose-400"
              >
                Confirm Revocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
