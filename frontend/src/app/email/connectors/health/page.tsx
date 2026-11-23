"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailSourceConnectionRecord } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  EmailWorkspaceHeader,
  ProtectionStateBadge,
  ProviderBadge,
} from "@/components/email/EmailSecurityUi";

export default function EmailConnectorHealthPage() {
  const [windows, setWindows] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<EmailSourceConnectionRecord[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [windowStart, setWindowStart] = useState(
    new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 16),
  );
  const [windowEnd, setWindowEnd] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [reason, setReason] = useState("Reconcile delayed upstream webhook interval");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [rec, conns] = await Promise.all([
        ZoikoShieldApiClient.listEmailReconciliations(),
        ZoikoShieldApiClient.listEmailConnectors(),
      ]);
      setWindows(Array.isArray(rec) ? rec : []);
      const connList = Array.isArray(conns) ? conns : [];
      setConnectors(connList);
      if (!connectionId && connList[0]?.id) {
        setConnectionId(connList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reconciliations.");
    }
  }, [connectionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBackfill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectionId) return;
    setError(null);
    setMessage(null);
    try {
      await ZoikoShieldApiClient.requestEmailBackfill(connectionId, {
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString(),
        reason,
      });
      setMessage("Bounded recovery backfill initiated cleanly (<=90 days validated).");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backfill request failed.");
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Ingestion Health, Gaps & Reconciliation"
        subtitle="Track expected versus ingested provider telemetry per hour, identify missing or rejected DLQ messages, and request bounded historical backfills (max 90 days)."
        activeHref="/email/connectors/health"
        actions={
          <Button variant="secondary" onClick={loadData}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Windows</span>
          </Button>
        }
      />

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

      {connectors.length > 0 && (
        <form
          onSubmit={handleBackfill}
          className="p-5 rounded-xl bg-raised border border-line grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-xs"
        >
          <label className="space-y-1 block">
            <span className="font-mono text-slate-400">Source Connector</span>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
            >
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name} ({c.status})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 block">
            <span className="font-mono text-slate-400">Window Start</span>
            <input
              type="datetime-local"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
            />
          </label>
          <label className="space-y-1 block">
            <span className="font-mono text-slate-400">Window End</span>
            <input
              type="datetime-local"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
            />
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              aria-label="Backfill reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
            />
            <Button type="submit" variant="cyan">
              Run Backfill
            </Button>
          </div>
        </form>
      )}

      <div className="rounded-xl bg-raised border border-line overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface border-b border-line font-mono text-[11px] text-slate-400 uppercase">
            <tr>
              <th className="p-3">Source</th>
              <th className="p-3">Window</th>
              <th className="p-3">Expected</th>
              <th className="p-3">Ingested</th>
              <th className="p-3">Rejected</th>
              <th className="p-3">Missing</th>
              <th className="p-3">Completeness</th>
              <th className="p-3">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {windows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-400">
                  No reconciliation coverage windows recorded yet.
                </td>
              </tr>
            ) : (
              windows.map((w) => (
                <tr key={w.id} className="hover:bg-surface/60">
                  <td className="p-3">
                    {w.connection ? (
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-100">
                          {w.connection.display_name}
                        </div>
                        <ProviderBadge provider={w.connection.provider} />
                      </div>
                    ) : (
                      w.connection_id
                    )}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-slate-300">
                    {formatTimestamp(w.window_start)} → {formatTimestamp(w.window_end)}
                  </td>
                  <td className="p-3 font-mono tabular-nums">{w.expected_count}</td>
                  <td className="p-3 font-mono tabular-nums text-emerald-300">
                    {w.ingested_count}
                  </td>
                  <td className="p-3 font-mono tabular-nums text-amber-300">
                    {w.rejected_count}
                  </td>
                  <td className="p-3 font-mono tabular-nums text-rose-300">
                    {w.missing_count}
                  </td>
                  <td className="p-3 font-mono">{w.completeness_grade}</td>
                  <td className="p-3">
                    <ProtectionStateBadge state={w.source_health} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
