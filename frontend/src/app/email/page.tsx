"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, ShieldAlert } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailOverviewResponse } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  EmailTruthBanner,
  EmailWorkspaceHeader,
  ProtectionStateBadge,
  ProviderBadge,
} from "@/components/email/EmailSecurityUi";

export default function EmailOverviewPage() {
  const [overview, setOverview] = useState<EmailOverviewResponse | null>(null);
  const [windowHours, setWindowHours] = useState<number>(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ZoikoShieldApiClient.getEmailOverview({ windowHours });
      setOverview(data);
    } catch (err) {
      setOverview(null);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load email security posture from ZoikoShield backend.",
      );
    } finally {
      setLoading(false);
    }
  }, [windowHours]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Threat Intelligence Overview"
        subtitle="Bounded read-only email threat visibility across Microsoft 365 Defender and Google Workspace Alert Center. Coverage reflects verified telemetry windows only."
        activeHref="/email"
        actions={
          <>
            <select
              aria-label="Telemetry window"
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-raised border border-line text-xs font-mono text-slate-200"
            >
              <option value={24}>Last 24 hours</option>
              <option value={168}>Last 7 days</option>
              <option value={720}>Last 30 days</option>
            </select>
            <Button variant="secondary" onClick={loadOverview} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
            <Link
              href="/email/connectors/setup"
              className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
            >
              <span>Connect Email Source</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </>
        }
      />

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="secondary" onClick={loadOverview}>
            Retry
          </Button>
        </div>
      )}

      {overview && (
        <>
          <EmailTruthBanner
            state={overview.protectionState}
            message={overview.truthBanner}
            phase2Locked={overview.phase2ActionsLocked}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-raised border border-line space-y-2">
              <div className="text-[11px] font-mono text-slate-400 uppercase">
                Protection State
              </div>
              <ProtectionStateBadge state={overview.protectionState} />
              <div className="text-[11px] text-slate-400 font-mono">
                Active policy: {overview.activePolicyVersion || "None activated"}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-raised border border-line space-y-1">
              <div className="text-[11px] font-mono text-slate-400 uppercase">
                Connected Sources
              </div>
              <div className="text-2xl font-black text-slate-100 tabular-nums">
                {overview.connectorsSummary.active} / {overview.connectorsSummary.total}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Degraded: {overview.connectorsSummary.degraded} · Revoked:{" "}
                {overview.connectorsSummary.revoked}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-raised border border-line space-y-1">
              <div className="text-[11px] font-mono text-slate-400 uppercase">
                Coverage Denominator
              </div>
              <div className="text-2xl font-black text-cyan-300 tabular-nums">
                {overview.coverageDenominator.ingestedEvents} /{" "}
                {overview.coverageDenominator.eligibleEvents}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Grade: {overview.coverageDenominator.completenessGrade} · Gaps:{" "}
                {overview.coverageDenominator.missingEvents}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-raised border border-line space-y-1">
              <div className="text-[11px] font-mono text-slate-400 uppercase">
                Open Email Findings
              </div>
              <div className="text-2xl font-black text-slate-100 tabular-nums">
                {overview.openFindingsCount}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Critical: {overview.criticalFindingsCount} · Pending actions:{" "}
                {overview.pendingActionsCount}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl bg-raised border border-line p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-100">
                  Configured Email Telemetry Sources
                </h2>
                <Link
                  href="/email/connectors"
                  className="text-xs font-mono text-cyan-400 hover:underline"
                >
                  Manage all →
                </Link>
              </div>
              {overview.providers.length === 0 ? (
                <div className="p-6 rounded-lg bg-surface border border-line text-center space-y-2">
                  <p className="text-xs text-slate-400">
                    No Microsoft 365 or Google Workspace email source connected yet.
                  </p>
                  <Link
                    href="/email/connectors/setup"
                    className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 hover:underline"
                  >
                    <span>Start read-only onboarding wizard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {overview.providers.map((p) => (
                    <li
                      key={p.id}
                      className="p-3 rounded-lg bg-surface border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">
                            {p.displayName}
                          </span>
                          <ProviderBadge provider={p.provider} />
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Residency: {p.residencyCode} · Last sync:{" "}
                          {p.lastSyncAt ? formatTimestamp(p.lastSyncAt) : "Never"}
                        </div>
                      </div>
                      <ProtectionStateBadge state={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl bg-raised border border-line p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-100">
                  Recent Email Threats
                </h2>
                <Link
                  href="/email/threats"
                  className="text-xs font-mono text-cyan-400 hover:underline"
                >
                  Open queue →
                </Link>
              </div>
              {overview.recentThreats.length === 0 ? (
                <div className="p-6 rounded-lg bg-surface border border-line text-center text-xs text-slate-400">
                  No open email findings recorded in the selected window.
                </div>
              ) : (
                <ul className="space-y-2">
                  {overview.recentThreats.map((t) => (
                    <li
                      key={t.id}
                      className="p-3 rounded-lg bg-surface border border-line flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <Link
                          href={`/email/threats/${t.id}`}
                          className="font-semibold text-cyan-300 hover:underline truncate block"
                        >
                          {t.threatClass} ({t.providerVerdict})
                        </Link>
                        <div className="text-[11px] font-mono text-slate-400">
                          {t.severity} · {t.status} · {formatTimestamp(t.observedAt)}
                        </div>
                      </div>
                      <ProviderBadge provider={t.provider} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
