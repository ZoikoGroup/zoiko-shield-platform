"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailProviderType } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import {
  EmailWorkspaceHeader,
  ProviderBadge,
} from "@/components/email/EmailSecurityUi";

export default function EmailActionsPage() {
  const [proposals, setProposals] = useState<any[]>([]);
  const [phase2Locked, setPhase2Locked] = useState(true);
  const [provider, setProvider] = useState<EmailProviderType>("MICROSOFT_365");
  const [requestedAction, setRequestedAction] = useState<
    | "QUARANTINE_MESSAGE"
    | "PULL_BACK_MESSAGE"
    | "REMOVE_FORWARDING_RULE"
    | "REVOKE_MAILBOX_SESSIONS"
  >("QUARANTINE_MESSAGE");
  const [targetRef, setTargetRef] = useState("msg-ref-sample-001");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadActions = useCallback(async () => {
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.listEmailActions();
      setPhase2Locked(res?.phase2ActionsLocked !== false);
      setProposals(Array.isArray(res?.proposals) ? res.proposals : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email action proposals.");
    }
  }, []);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const handlePropose = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await ZoikoShieldApiClient.proposeEmailAction({
        provider,
        requestedAction,
        targetRefs: targetRef
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        consentScope:
          provider === "MICROSOFT_365"
            ? "SecurityActions.ReadWrite.All"
            : "gmail.modify",
        riskClass: "R3",
      });
      setMessage("Action proposal created. Pre-flight simulation is mandatory before approval (E13).");
      await loadActions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to propose action.");
    }
  };

  const handleActionStep = async (
    id: string,
    step: "simulate" | "approve" | "execute" | "rollback",
  ) => {
    setError(null);
    setMessage(null);
    try {
      if (step === "simulate") await ZoikoShieldApiClient.simulateEmailAction(id);
      if (step === "approve")
        await ZoikoShieldApiClient.approveEmailAction(id, { decision: "APPROVE" });
      if (step === "execute") await ZoikoShieldApiClient.executeEmailAction(id);
      if (step === "rollback")
        await ZoikoShieldApiClient.rollbackEmailAction(id, "Operator requested compensation");
      setMessage(`Action step '${step}' completed cleanly.`);
      await loadActions();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Action '${step}' blocked.`);
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Post-Delivery Email Actions (Phase 2 Gated)"
        subtitle="Propose, dry-run simulate, and dual-custody approve post-delivery email remediation actions with partial failure reconciliation."
        activeHref="/email/actions"
      />

      {phase2Locked && (
        <div
          role="status"
          className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2.5"
        >
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Phase 2 Gate Locked (T18): Proposals and non-mutating dry-run simulations work cleanly, while live mailbox execution remains disabled until ENABLE_EMAIL_PHASE2_ACTIONS=true.
          </span>
        </div>
      )}

      {message && (
        <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handlePropose}
        className="p-5 rounded-xl bg-raised border border-line grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-xs"
      >
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as EmailProviderType)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
          >
            <option value="MICROSOFT_365">Microsoft 365 Defender</option>
            <option value="GOOGLE_WORKSPACE">Google Workspace Alert Center</option>
          </select>
        </label>
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">Requested Action</span>
          <select
            value={requestedAction}
            onChange={(e) => setRequestedAction(e.target.value as any)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
          >
            <option value="QUARANTINE_MESSAGE">QUARANTINE_MESSAGE</option>
            <option value="PULL_BACK_MESSAGE">PULL_BACK_MESSAGE</option>
            <option value="REMOVE_FORWARDING_RULE">REMOVE_FORWARDING_RULE</option>
            <option value="REVOKE_MAILBOX_SESSIONS">REVOKE_MAILBOX_SESSIONS</option>
          </select>
        </label>
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">Target Message / Rule Refs</span>
          <input
            type="text"
            required
            value={targetRef}
            onChange={(e) => setTargetRef(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono"
          />
        </label>
        <Button type="submit" variant="cyan">
          Create Proposal
        </Button>
      </form>

      <div className="space-y-3 text-xs">
        {proposals.map((p) => (
          <div
            key={p.id}
            className="p-5 rounded-xl bg-raised border border-line space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100">
                  {p.requested_action} ({p.risk_class})
                </span>
                <ProviderBadge provider={p.provider} />
              </div>
              <span className="font-mono font-bold text-cyan-300">{p.status}</span>
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              Initiator: {p.initiated_by} · Approver: {p.approved_by || "Pending distinct approver"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => handleActionStep(p.id, "simulate")}
              >
                Simulate (Dry-Run)
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleActionStep(p.id, "approve")}
              >
                Approve (Dual Custody)
              </Button>
              <Button
                variant="primary"
                onClick={() => handleActionStep(p.id, "execute")}
                disabled={phase2Locked}
              >
                {phase2Locked ? "Execute Locked (Phase 0/1)" : "Execute Action"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleActionStep(p.id, "rollback")}
              >
                Rollback / Compensate
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
