"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  CheckCircle2,
  Lock,
  Mail,
  RefreshCw,
  ShieldAlert,
  Unlock,
} from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatTimestamp } from "@/lib/utils";

export type FreezeScopeOption =
  | "GLOBAL"
  | "REGIONAL"
  | "TENANT"
  | "CONNECTOR"
  | "ACTION_TYPE";

interface FreezeRecord {
  id?: string;
  freezeId?: string;
  scope?: string;
  scope_ref?: string | null;
  reason?: string;
  created_by?: string;
  active_from?: string;
  active_until?: string | null;
}

interface EmailActionProposalSummary {
  id: string;
  provider: string;
  requested_action: string;
  risk_class: string;
  status: string;
}

const SCOPE_METADATA: Record<
  FreezeScopeOption,
  { label: string; dualCustodyUnfreeze: boolean; description: string; placeholder?: string }
> = {
  TENANT: {
    label: "Tenant (Current Tenant)",
    dualCustodyUnfreeze: false,
    description:
      "Halts all automated SOAR and Phase 2 email mutations for this tenant immediately.",
  },
  CONNECTOR: {
    label: "Connector / Email Provider",
    dualCustodyUnfreeze: false,
    description:
      "Blocks execution against a specific connector or email provider (e.g. MICROSOFT_365, GOOGLE_WORKSPACE).",
    placeholder: "MICROSOFT_365 or GOOGLE_WORKSPACE",
  },
  ACTION_TYPE: {
    label: "Action Type",
    dualCustodyUnfreeze: false,
    description:
      "Blocks a specific remediation action across the tenant (e.g. QUARANTINE_MESSAGE, REVOKE_MAILBOX_SESSIONS).",
    placeholder: "QUARANTINE_MESSAGE",
  },
  REGIONAL: {
    label: "Regional Cell (Dual-Custody Unfreeze)",
    dualCustodyUnfreeze: true,
    description:
      "Halts automated response across an entire regional cell. Releasing requires 2 distinct approvers.",
    placeholder: "eu-west-1",
  },
  GLOBAL: {
    label: "Global Platform (Dual-Custody Unfreeze)",
    dualCustodyUnfreeze: true,
    description:
      "Emergency platform-wide kill switch halting all live estate mutations. Releasing requires 2 distinct approvers.",
  },
};

export default function FreezeCenterPage() {
  const scopeSelectId = useId();
  const scopeRefInputId = useId();
  const reasonInputId = useId();
  const durationSelectId = useId();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string>("OPERATIONAL");
  const [activeFreeze, setActiveFreeze] = useState<FreezeRecord | null>(null);
  const [emailProposals, setEmailProposals] = useState<EmailActionProposalSummary[]>([]);
  const [phase2Locked, setPhase2Locked] = useState(true);

  const [scope, setScope] = useState<FreezeScopeOption>("TENANT");
  const [scopeRef, setScopeRef] = useState("");
  const [reason, setReason] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFreezeState = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [freezeRes, emailRes] = await Promise.all([
        ZoikoShieldApiClient.getFreezeStatusSOAR(),
        ZoikoShieldApiClient.listEmailActions().catch(() => ({
          phase2ActionsLocked: true,
          proposals: [],
        })),
      ]);
      const frozen = Boolean(freezeRes?.frozen);
      setIsFrozen(frozen);
      setStatusLabel(freezeRes?.status || (frozen ? "FROZEN" : "OPERATIONAL"));
      setActiveFreeze(freezeRes?.freeze ?? null);
      setPhase2Locked(emailRes?.phase2ActionsLocked !== false);
      setEmailProposals(
        Array.isArray(emailRes?.proposals) ? emailRes.proposals : [],
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Failed to read freeze status from backend: ${err.message}`
          : "Failed to read freeze status from backend.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFreezeState();
  }, [loadFreezeState]);

  const handleEngageFreeze = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMessage("A documented freeze justification is required before engaging a kill switch.");
      return;
    }

    const composedReason =
      scopeRef.trim() && (scope === "CONNECTOR" || scope === "ACTION_TYPE" || scope === "REGIONAL")
        ? `[${scope}:${scopeRef.trim()}] ${trimmedReason}`
        : trimmedReason;

    setSubmitting(true);
    try {
      const res = await ZoikoShieldApiClient.freezeSOAR(scope, composedReason);
      const freezeId = res?.freezeId || (res as { data?: { id?: string } })?.data?.id || "active-freeze";
      setIsFrozen(true);
      setStatusLabel("FROZEN");
      setActiveFreeze({
        id: freezeId,
        scope,
        scope_ref: scopeRef.trim() || null,
        reason: composedReason,
        created_by: res?.initiatedBy || "current-operator",
        active_from: res?.timestamp || new Date().toISOString(),
      });
      setStatusMessage(
        `Emergency freeze engaged (${scope}). All matching SOAR and Phase 2 email actions are now blocked fail-closed.`,
      );
      setReason("");
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Freeze was not confirmed by backend; state unchanged: ${err.message}`
          : "Freeze was not confirmed by backend; state unchanged.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReleaseFreeze = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setSubmitting(true);
    try {
      const freezeId = activeFreeze?.id || activeFreeze?.freezeId || "active-freeze";
      await ZoikoShieldApiClient.releaseFreezeSOAR(freezeId);
      setIsFrozen(false);
      setStatusLabel("OPERATIONAL");
      setActiveFreeze(null);
      setStatusMessage(
        "Freeze released and recorded. Reconcile any paused email or SOAR actions before re-executing.",
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `Unfreeze was not confirmed by backend; freeze remains active: ${err.message}`
          : "Unfreeze was not confirmed by backend; freeze remains active.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedScopeMeta = SCOPE_METADATA[scope];
  const needsScopeRef =
    scope === "CONNECTOR" || scope === "ACTION_TYPE" || scope === "REGIONAL";
  const pendingEmailActions = emailProposals.filter((p) =>
    ["PROPOSED", "SIMULATED", "PENDING_APPROVAL", "AUTHORISED"].includes(
      String(p.status || "").toUpperCase(),
    ),
  );

  return (
    <main className="space-y-6" aria-labelledby="freeze-center-heading">
      {/* Header */}
      <header className="surface-card rounded-2xl p-6 border border-line bg-gradient-to-r from-raised via-surface to-canvas shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <AlertOctagon className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  id="freeze-center-heading"
                  className="text-xl font-bold tracking-tight text-slate-100"
                >
                  Emergency Freeze Center
                </h1>
                <Badge
                  variant={isFrozen ? "critical" : "healthy"}
                  className="font-mono text-[11px]"
                >
                  {isFrozen ? "LOCKDOWN ACTIVE" : statusLabel}
                </Badge>
                <Badge variant="neutral" className="font-mono text-[11px]">
                  Fail-Closed Kill Switch
                </Badge>
              </div>
              <p className="text-xs text-slate-400 max-w-3xl">
                Engage and release operational execution freezes across Global, Regional, Tenant,
                Connector, and Action-Type scopes. Active freezes immediately block live SOAR and
                Phase 2 post-delivery email mutations before provider dispatch.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/cases/incidents/command"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              Incident Command
            </Link>
            <Link
              href="/email/actions"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              Email Actions
            </Link>
            <Button
              type="button"
              variant="secondary"
              onClick={loadFreezeState}
              disabled={loading}
              aria-label="Refresh freeze status"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Live status & error announcements */}
      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Current Freeze Posture Banner */}
      <section
        aria-labelledby="freeze-posture-heading"
        className={`rounded-2xl border p-5 ${
          isFrozen
            ? "border-rose-500/50 bg-rose-950/20"
            : "border-emerald-500/30 bg-emerald-950/10"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2
              id="freeze-posture-heading"
              className="text-sm font-bold text-slate-100 flex items-center gap-2"
            >
              {isFrozen ? (
                <Lock className="w-4 h-4 text-rose-400" aria-hidden="true" />
              ) : (
                <Unlock className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              )}
              <span>
                {loading
                  ? "Checking live freeze posture..."
                  : isFrozen
                    ? "Execution Freeze Active — Live Response Blocked"
                    : "No Active Tenant Freeze — Governed Execution Operational"}
              </span>
            </h2>
            <p className="text-xs text-slate-300">
              {isFrozen && activeFreeze?.reason
                ? `Active reason: ${activeFreeze.reason}`
                : "Proposals still enforce R0–R4 authority, dual custody, Cedar authorization, blast-radius checks, and per-tenant command signing."}
            </p>
          </div>

          {isFrozen && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleReleaseFreeze}
              disabled={submitting}
            >
              <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{submitting ? "Releasing..." : "Release Tenant Freeze"}</span>
            </Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engage Freeze Form */}
        <section
          aria-labelledby="engage-freeze-heading"
          className="surface-card rounded-2xl bg-raised/90 border border-line p-5 space-y-4"
        >
          <div className="border-b border-line pb-3">
            <h2 id="engage-freeze-heading" className="text-sm font-bold text-slate-100">
              Engage Emergency Freeze
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Blocks matching response actions fail-closed at checkpoint evaluation.
            </p>
          </div>

          <form onSubmit={handleEngageFreeze} className="space-y-4 text-xs" noValidate>
            <div className="space-y-1.5">
              <label htmlFor={scopeSelectId} className="block font-mono text-slate-300">
                Freeze Scope
              </label>
              <select
                id={scopeSelectId}
                value={scope}
                onChange={(e) => setScope(e.target.value as FreezeScopeOption)}
                aria-describedby="freeze-scope-help"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {(Object.keys(SCOPE_METADATA) as FreezeScopeOption[]).map((key) => (
                  <option key={key} value={key}>
                    {SCOPE_METADATA[key].label}
                  </option>
                ))}
              </select>
              <p id="freeze-scope-help" className="text-[11px] text-slate-400">
                {selectedScopeMeta.description}
                {selectedScopeMeta.dualCustodyUnfreeze
                  ? " Dual-custody unfreeze (2 distinct approvers) applies."
                  : ""}
              </p>
            </div>

            {needsScopeRef && (
              <div className="space-y-1.5">
                <label htmlFor={scopeRefInputId} className="block font-mono text-slate-300">
                  Target Scope Reference
                </label>
                <input
                  id={scopeRefInputId}
                  type="text"
                  value={scopeRef}
                  onChange={(e) => setScopeRef(e.target.value)}
                  placeholder={selectedScopeMeta.placeholder}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor={durationSelectId} className="block font-mono text-slate-300">
                Review / Auto-Expiry Window
              </label>
              <select
                id={durationSelectId}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <option value="30">30 minutes</option>
                <option value="60">60 minutes (Standard Incident Containment)</option>
                <option value="240">4 hours (Extended Investigation)</option>
                <option value="indefinite">Indefinite (Manual Release Required)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={reasonInputId} className="block font-mono text-slate-300">
                Justification &amp; Incident Reference (Required)
              </label>
              <textarea
                id={reasonInputId}
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. INC-2026-441: Suspected anomalous M365 write token usage; halting post-delivery mutations pending audit"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              />
            </div>

            <Button type="submit" variant="primary" disabled={submitting}>
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{submitting ? "Engaging Freeze..." : "Engage Emergency Freeze"}</span>
            </Button>
          </form>
        </section>

        {/* Active Freezes & Email Action Impact */}
        <section
          aria-labelledby="freeze-impact-heading"
          className="surface-card rounded-2xl bg-raised/90 border border-line p-5 space-y-4"
        >
          <div className="border-b border-line pb-3">
            <h2 id="freeze-impact-heading" className="text-sm font-bold text-slate-100">
              Active Freezes &amp; Email Action Impact
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live backend freeze records and queued Phase 2 email remediation proposals.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <caption className="sr-only">Active emergency freeze records</caption>
              <thead>
                <tr className="border-b border-line text-left text-slate-400">
                  <th scope="col" className="py-2 pr-3">Scope</th>
                  <th scope="col" className="py-2 pr-3">Reason</th>
                  <th scope="col" className="py-2 pr-3">Initiated By</th>
                  <th scope="col" className="py-2">Active Since</th>
                </tr>
              </thead>
              <tbody>
                {isFrozen && activeFreeze ? (
                  <tr className="border-b border-line/50">
                    <td className="py-2 pr-3 text-rose-300 font-bold">
                      {activeFreeze.scope || "TENANT"}
                    </td>
                    <td className="py-2 pr-3 text-slate-200">
                      {activeFreeze.reason || "Emergency freeze active"}
                    </td>
                    <td className="py-2 pr-3 text-slate-300">
                      {activeFreeze.created_by || "operator"}
                    </td>
                    <td className="py-2 text-slate-400">
                      {activeFreeze.active_from
                        ? formatTimestamp(activeFreeze.active_from)
                        : "active"}
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-slate-400">
                      No active freezes recorded for this tenant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-line bg-surface/70 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                <span>Email Remediation Subsystem Posture</span>
              </h3>
              <Badge variant={phase2Locked ? "medium" : "healthy"} className="font-mono text-[10px]">
                {phase2Locked ? "PHASE 2 LOCKED" : "PHASE 2 ENABLED"}
              </Badge>
            </div>
            <p className="text-slate-400">
              {pendingEmailActions.length} queued or authorised email action proposal
              {pendingEmailActions.length === 1 ? "" : "s"} will be{" "}
              {isFrozen ? "blocked by the active freeze" : "checked against freeze status on execution"}.
            </p>
            <Link
              href="/email/actions"
              className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              Inspect Email Action Proposals
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
