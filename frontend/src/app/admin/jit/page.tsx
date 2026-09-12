"use client";

import React, { useState } from "react";
import { useDemoState, saveDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { JitElevationSession } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Modal } from "@/ui/Modal";
import {
  KeyRound,
  Lock,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Fingerprint,
} from "lucide-react";
import {
  UnauthorizedState,
  LoadingState,
  RecoveryState,
  StaleState,
} from "@/components/states/mandatory-ui-states";
import { useEventStream } from "@/lib/use-event-stream";

export default function JitEnclavePage() {
  const [state, setState] = useDemoState();
  const [isElevationModalOpen, setIsElevationModalOpen] = useState(false);
  const [justification, setJustification] = useState(
    "Critical incident triage requiring temporary Cross-Tenant Break-Glass access."
  );
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Per-second tick for live JIT countdown timers
  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Subscribe to real-time SSE stream for JIT elevation updates
  const { isConnected: isSseConnected } = useEventStream({
    tenantId: state.tenant.id,
    enabled: true,
    onEvent: (event) => {
      const eventType = String(event.type);
      if (
        eventType === "jit.elevation.revoked" ||
        eventType === "jit.elevation.expired" ||
        eventType === "JIT_ELEVATION_REVOKED" ||
        eventType === "JIT_ELEVATION_EXPIRED"
      ) {
        const payload = event.data;
        if (payload?.sessionId) {
          const sessId = String(payload.sessionId);
          setState((prev) => ({
            ...prev,
            jitSessions: prev.jitSessions.map((s) =>
              s.sessionId === sessId ? { ...s, status: "REVOKED" as const } : s
            ),
          }));
        }
      }
    },
  });

  const handleRequestElevation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // 1. Request dual-authorized JIT elevation
      const result = await ZoikoShieldApiClient.requestJitElevation(state.tenant.id, justification, durationMinutes);

      // 2. Perform FIDO2 / WebAuthn hardware step-up challenge verification
      const stepUpPayload = {
        type: "webauthn.get",
        challenge: btoa(`jit-stepup-${result.requestId}-${Date.now()}`),
        origin: typeof window !== "undefined" ? window.location.origin : "https://shield.zoiko.internal",
      };
      const clientDataJson = btoa(JSON.stringify(stepUpPayload));
      const mockSignature = btoa(`fido2-sig-${result.requestId}-${state.session.userId}`);
      
      const stepUpResult = await ZoikoShieldApiClient.verifyJitStepUp(
        result.requestId,
        state.session.userId,
        clientDataJson,
        mockSignature,
        "direct-hardware-token"
      );

      // 3. Build a JitElevationSession from the API response and persist to state
      const newSession: JitElevationSession = {
        sessionId: result.requestId,
        operatorId: state.session.userId,
        targetTenantId: state.tenant.id,
        elevatedRole: result.requestedRole,
        status: "ACTIVE",
        clientIp: "127.0.0.1",
        statedPurpose: justification,
        issuedAt: new Date().toISOString(),
        expiresAt: result.expiresAt,
        hardwareStepUpVerified: stepUpResult.verified,
        hardwareProofDigest: stepUpResult.hardwareProofDigest,
        peerApprover: result.approverPeerAdmin,
      };
      const updated = { ...state, jitSessions: [newSession, ...state.jitSessions] };
      saveDemoState(updated);
      setIsElevationModalOpen(false);
    } catch (err) {
      console.error("JIT elevation error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (sessionId: string) => {
    try {
      await ZoikoShieldApiClient.revokeJitElevation(sessionId);
      // Reflect revocation in state
      const updated = {
        ...state,
        jitSessions: state.jitSessions.map((s) =>
          s.sessionId === sessionId ? { ...s, status: "REVOKED" as const } : s
        ),
      };
      saveDemoState(updated);
    } catch (err) {
      console.error("JIT revoke error:", err);
    }
  };

  const calculateRemainingSeconds = (expiresAt: string): number => {
    const diff = Math.floor((new Date(expiresAt).getTime() - currentTime) / 1000);
    return diff > 0 ? diff : 0;
  };

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
  };



  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="ai">PLATFORM ADMIN ONLY</Badge>
            <span className="text-xs font-mono text-purple-400 font-bold">
              CROSS-TENANT SUPPORT ACCESS (PLATFORM_ROLE_MANAGE)
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
              isSseConnected
                ? "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300"
                : "bg-amber-950/80 border border-amber-500/40 text-amber-300"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSseConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {isSseConnected ? "SSE LIVE STREAM" : "POLLING FALLBACK"}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Platform Admin: Support Access & Dual-Approval JIT
          </h1>
          <p className="text-sm text-slate-400">
            Time-decaying Just-In-Time cross-tenant access gated by peer admin dual-approval on `shield-core:3001` with Nitro / SGX hardware attestation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => setIsElevationModalOpen(true)}>
            <KeyRound className="w-4 h-4" />
            <span>Request JIT Elevation</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Active JIT Sessions */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
              <KeyRound className="w-4 h-4 text-cyan-400" />
              Active & Historic JIT Elevation Tickets
            </h3>
            <span className="text-xs font-mono text-slate-400">
              {state.jitSessions.length} Tickets
            </span>
          </div>

          <div className="space-y-3">
            {state.jitSessions.map((session, idx) => {
              const remainingSecs = calculateRemainingSeconds(session.expiresAt);
              const isSessionExpired = session.status === "ACTIVE" && remainingSecs === 0;

              return (
                <div
                  key={session.sessionId || idx}
                  className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 font-mono text-xs text-slate-300"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-400">{session.sessionId}</span>
                    <div className="flex items-center gap-2">
                      {session.status === "ACTIVE" && !isSessionExpired && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-md">
                          <Clock className="w-3 h-3 text-amber-400 animate-spin" style={{ animationDuration: "6s" }} />
                          {formatCountdown(remainingSecs)}
                        </span>
                      )}
                      <Badge variant={isSessionExpired ? "critical" : session.status === "ACTIVE" ? "pass" : "pending"}>
                        {isSessionExpired ? "EXPIRED" : session.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-slate-200 font-semibold font-sans text-xs flex items-center justify-between">
                    <span>Target Role: {session.elevatedRole}</span>
                    {session.peerApprover && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        Approver: {session.peerApprover}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 italic">
                    &quot;{session.statedPurpose}&quot;
                  </p>

                  {/* Hardware Attestation Tag */}
                  {session.hardwareStepUpVerified && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-md">
                      <Fingerprint className="w-3 h-3 text-emerald-400" />
                      <span>FIDO2 HARDWARE ATTESTED</span>
                      {session.hardwareProofDigest && (
                        <span className="text-slate-500">({session.hardwareProofDigest.slice(0, 12)}...)</span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-900 text-[10px] text-slate-500">
                    <span>Issued: {formatTimestamp(session.issuedAt)}</span>
                    <span>Expires: {formatTimestamp(session.expiresAt)}</span>
                  </div>
                  {session.status === "ACTIVE" && !isSessionExpired && (
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleRevoke(session.sessionId)}
                      >
                        Instant Revocation
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right: Hardware Confidential Enclave Attestation */}
        <Card variant="cyber" className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20">
            <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
              <Lock className="w-4 h-4 text-purple-400" />
              Confidential Computing Enclave Bridge (TEE)
            </h3>
            <Badge variant="pass">NITRO VALID</Badge>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 font-mono text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">ENCLAVE PLATFORM:</span>
              <span className="text-purple-400 font-bold">AWS Nitro Enclaves</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">PCR0 (IMAGE SHA-384):</span>
              <span className="text-cyan-300">b4f8...91a2</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">PCR1 (KERNEL DIGEST):</span>
              <span className="text-cyan-300">c81e...47d9</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">PCR2 (APPLICATION APP):</span>
              <span className="text-cyan-300">e2a0...7b31</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-900">
              <span className="text-slate-500">ATTESTATION NONCE:</span>
              <span className="text-emerald-400">NONCE_998124_VALID</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ROOT OF TRUST:</span>
              <span className="text-slate-200">AWS Nitro Root CA (X.509)</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs text-purple-200 leading-relaxed font-sans">
            Cryptographic keys and SOAR execution tokens are generated and sealed directly inside isolated hardware enclaves, completely invisible to host hypervisors.
          </div>
        </Card>
      </div>

      {/* Elevation Modal */}
      <Modal
        isOpen={isElevationModalOpen}
        onClose={() => setIsElevationModalOpen(false)}
        title="Request Just-In-Time Role Elevation"
        description="FIDO2 / WebAuthn authenticated emergency access elevation."
      >
        <form onSubmit={handleRequestElevation} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">
              Elevation Justification (Audited):
            </label>
            <textarea
              rows={2}
              required
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">
              Duration (Minutes):
            </label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
            >
              <option value={15}>15 Minutes (Break-Glass Fast)</option>
              <option value={30}>30 Minutes (Standard Triage)</option>
              <option value={60}>60 Minutes (Deep Remediation)</option>
            </select>
          </div>

          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-2 text-xs font-mono text-cyan-300">
            <Fingerprint className="w-4 h-4 text-cyan-400" />
            <span>FIDO2 Passkey / WebAuthn verification simulated on submit.</span>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsElevationModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              <CheckCircle2 className="w-4 h-4" />
              <span>Grant JIT Elevation</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
