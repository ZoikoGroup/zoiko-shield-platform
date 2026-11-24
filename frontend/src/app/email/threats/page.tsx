"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Search } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailThreatFindingRecord } from "@/lib/types";
import { EMAIL_COPY, EMAIL_STATE_COPY } from "@/lib/email-copy";
import { Button } from "@/components/ui/Button";
import {
  EmailErrorNotice,
  EmailNotice,
  EmailTime,
  EmailWorkspaceHeader,
  ProviderBadge,
  classifyEmailError,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

export default function EmailThreatQueuePage() {
  const [items, setItems] = useState<EmailThreatFindingRecord[]>([]);
  const [disclaimer, setDisclaimer] = useState<string>("");
  const [severity, setSeverity] = useState("");
  const [provider, setProvider] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  /** null = unknown (connector inventory could not be read). */
  const [sourceCount, setSourceCount] = useState<number | null>(null);

  const loadThreats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, connectors] = await Promise.all([
        ZoikoShieldApiClient.listEmailThreats({
          severity: severity || undefined,
          provider: provider || undefined,
          search: search || undefined,
        }),
        ZoikoShieldApiClient.listEmailConnectors().catch(() => null),
      ]);
      setItems(Array.isArray(res?.items) ? res.items : []);
      setDisclaimer(res?.completenessDisclaimer || "");
      setSourceCount(Array.isArray(connectors) ? connectors.length : null);
    } catch (err) {
      setItems([]);
      setError(classifyEmailError(err, "Failed to load email threats."));
    } finally {
      setLoading(false);
    }
  }, [severity, provider, search]);

  useEffect(() => {
    loadThreats();
  }, [loadThreats]);

  const filtersActive = Boolean(severity || provider || search);
  const emptyMessage = loading
    ? "Loading verified email threat findings…"
    : sourceCount === 0
      ? EMAIL_COPY.NO_CONNECTED_SOURCE
      : filtersActive
        ? "No email threat findings match the active filters."
        : EMAIL_STATE_COPY.NO_DATA_FOR_WINDOW;

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Threat Triage Queue"
        subtitle="Normalized Microsoft 365 and Google Workspace alerts with role-scoped metadata masking and explicit window completeness context."
        activeHref="/email/threats"
      />

      {disclaimer && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{disclaimer}</span>
        </div>
      )}

      <EmailErrorNotice
        error={error}
        onRetry={error?.kind === "DENIED" ? undefined : loadThreats}
      />

      {sourceCount === 0 && !error && (
        <EmailNotice tone="warning" title="No coverage">
          {EMAIL_COPY.NO_CONNECTED_SOURCE}
        </EmailNotice>
      )}

      <p className="text-[11px] text-slate-400">
        Phase 0 bulk actions are limited to assignment and investigation. Deleting, pulling back or
        quarantining messages is not available from this queue.
      </p>

      <div className="p-4 rounded-xl bg-raised border border-line flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg bg-surface border border-line text-xs">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            aria-label="Search threats"
            placeholder="Search by safe reference: subject token, threat class or source ref"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent outline-none text-slate-100"
          />
        </div>
        <select
          aria-label="Filter by severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="px-3 py-2 rounded-lg bg-surface border border-line text-xs text-slate-200"
        >
          <option value="">All severities</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>
        <select
          aria-label="Filter by provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="px-3 py-2 rounded-lg bg-surface border border-line text-xs text-slate-200"
        >
          <option value="">All providers</option>
          <option value="MICROSOFT_365">Microsoft 365 Defender</option>
          <option value="GOOGLE_WORKSPACE">Google Workspace Alert Center</option>
        </select>
        <Button variant="secondary" onClick={loadThreats} disabled={loading}>
          Apply Filters
        </Button>
      </div>

      {/* Desktop table (hidden on mobile <768px) */}
      <div className="hidden md:block rounded-xl bg-raised border border-line overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface border-b border-line font-mono text-[11px] text-slate-400 uppercase">
            <tr>
              <th className="p-3">Threat Class &amp; Ref</th>
              <th className="p-3">Provider</th>
              <th className="p-3">Severity</th>
              <th className="p-3">Status</th>
              <th className="p-3">Observed</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-surface/60">
                  <td className="p-3 space-y-0.5">
                    <div className="font-semibold text-slate-100">
                      {item.threat_class} ({item.provider_verdict})
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {item.subject_ref} · {item.source_event_ref}
                    </div>
                  </td>
                  <td className="p-3">
                    <ProviderBadge provider={item.provider} />
                  </td>
                  <td className="p-3 font-mono font-bold text-slate-200">
                    {item.severity}
                  </td>
                  <td className="p-3 font-mono text-cyan-300">{item.status}</td>
                  <td className="p-3 font-mono text-[11px] text-slate-400">
                    <EmailTime iso={item.observed_at} />
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/email/threats/${item.id}`}
                      className="text-cyan-400 hover:underline font-mono font-bold"
                    >
                      Investigate →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Responsive mobile disclosure cards (T21): severity, time, confidence and provenance stay visible */}
      <ul className="md:hidden space-y-3" aria-label="Email threat findings">
        {items.length === 0 && (
          <li className="p-4 rounded-xl bg-raised border border-line text-xs text-slate-300">
            {emptyMessage}
          </li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="p-4 rounded-xl bg-raised border border-line space-y-2 text-xs"
            data-testid="threat-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-100 break-all">{item.threat_class}</span>
              <span className="font-mono font-bold text-cyan-300">
                Severity: {item.severity}
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-1 text-[11px] font-mono text-slate-400">
              <div>
                <dt className="inline">Observed: </dt>
                <dd className="inline text-slate-200">
                  <EmailTime iso={item.observed_at} />
                </dd>
              </div>
              <div>
                <dt className="inline">Provider verdict: </dt>
                <dd className="inline text-slate-200">{item.provider_verdict}</dd>
              </div>
              <div>
                <dt className="inline">Source confidence: </dt>
                <dd className="inline text-slate-200">{item.source_confidence || "Not stated"}</dd>
              </div>
              <div>
                <dt className="inline">Provenance: </dt>
                <dd className="inline text-slate-200 break-all">
                  {item.source_event_ref} · policy {item.policy_version || "—"}
                </dd>
              </div>
              <div>
                <dt className="inline">Status: </dt>
                <dd className="inline text-slate-200">{item.status}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line">
              <ProviderBadge provider={item.provider} />
              <Link
                href={`/email/threats/${item.id}`}
                className="text-cyan-400 font-mono font-bold"
              >
                Investigate →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
