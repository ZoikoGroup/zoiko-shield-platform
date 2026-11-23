"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Search, ShieldAlert } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailThreatFindingRecord } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  EmailWorkspaceHeader,
  ProviderBadge,
} from "@/components/email/EmailSecurityUi";

export default function EmailThreatQueuePage() {
  const [items, setItems] = useState<EmailThreatFindingRecord[]>([]);
  const [disclaimer, setDisclaimer] = useState<string>("");
  const [severity, setSeverity] = useState("");
  const [provider, setProvider] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadThreats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.listEmailThreats({
        severity: severity || undefined,
        provider: provider || undefined,
        search: search || undefined,
      });
      setItems(Array.isArray(res?.items) ? res.items : []);
      setDisclaimer(res?.completenessDisclaimer || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email threats.");
    } finally {
      setLoading(false);
    }
  }, [severity, provider, search]);

  useEffect(() => {
    loadThreats();
  }, [loadThreats]);

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

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-4 rounded-xl bg-raised border border-line flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg bg-surface border border-line text-xs">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            aria-label="Search threats"
            placeholder="Filter by subject token, threat class, or source ref..."
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
                  {loading
                    ? "Loading verified email threat findings..."
                    : "No email threat findings match the active filter criteria."}
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
                    {formatTimestamp(item.observed_at)}
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

      {/* Responsive mobile disclosure cards */}
      <div className="md:hidden space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-xl bg-raised border border-line space-y-2 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100">{item.threat_class}</span>
              <span className="font-mono font-bold text-cyan-300">{item.severity}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              {item.subject_ref}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-line">
              <ProviderBadge provider={item.provider} />
              <Link
                href={`/email/threats/${item.id}`}
                className="text-cyan-400 font-mono font-bold"
              >
                Investigate →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
