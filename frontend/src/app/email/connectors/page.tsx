"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Play, PowerOff, RefreshCw } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailSourceConnectionRecord } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  EmailWorkspaceHeader,
  ProtectionStateBadge,
  ProviderBadge,
} from "@/components/email/EmailSecurityUi";

export default function EmailConnectorsPage() {
  const [connectors, setConnectors] = useState<EmailSourceConnectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await ZoikoShieldApiClient.listEmailConnectors();
      setConnectors(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connectors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnectors();
  }, [loadConnectors]);

  const handleTest = async (id: string) => {
    setFeedback(null);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.testEmailConnector(id);
      setFeedback(`Connectivity probe result for ${id}: ${res?.status || "VERIFIED"}`);
      await loadConnectors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connectivity check failed.");
    }
  };

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokingId || !revokeReason.trim()) return;
    setError(null);
    setFeedback(null);
    try {
      await ZoikoShieldApiClient.disconnectEmailConnector(revokingId, revokeReason.trim());
      setFeedback(`Access revoked for source ${revokingId}. Collection halted (T16).`);
      setRevokingId(null);
      setRevokeReason("");
      await loadConnectors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke connector.");
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Source Connectors Inventory"
        subtitle="Manage read-only Microsoft 365 Defender (/security/alerts_v2) and Google Workspace Alert Center sources. Phase 2 mailbox writes remain fail-closed unless explicitly authorized."
        activeHref="/email/connectors"
        actions={
          <>
            <Button variant="secondary" onClick={loadConnectors} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
            <Link
              href="/email/connectors/setup"
              className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
            >
              <span>Add Read-Only Source</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </>
        }
      />

      {feedback && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedback}</span>
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

      {revokingId && (
        <form
          onSubmit={handleRevoke}
          className="p-4 rounded-xl bg-raised border border-rose-500/40 space-y-3"
        >
          <div className="text-xs font-bold text-rose-300">
            Confirm Immediate Access Revocation &amp; Collection Halt ({revokingId})
          </div>
          <input
            type="text"
            required
            placeholder="Mandatory governance reason for disconnecting source..."
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-xs text-slate-100"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary">
              Revoke Access Now
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRevokingId(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {connectors.length === 0 && !loading ? (
        <div className="p-8 rounded-xl bg-raised border border-line text-center space-y-3">
          <p className="text-sm font-semibold text-slate-200">
            No Email Sources Connected
          </p>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            ZoikoShield requires an explicit read-only connection to Microsoft 365 Defender or Google Workspace Alert Center before email findings can be ingested.
          </p>
          <Link
            href="/email/connectors/setup"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
          >
            <span>Open Onboarding Wizard</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {connectors.map((c) => (
            <div
              key={c.id}
              className="p-5 rounded-xl bg-raised border border-line space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-100">
                    {c.display_name}
                  </div>
                  <ProviderBadge provider={c.provider} />
                </div>
                <ProtectionStateBadge state={c.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-400 bg-surface p-3 rounded-lg border border-line">
                <div>Residency: {c.residency_code}</div>
                <div>Frequency: {c.sync_frequency}</div>
                <div>Retention: {c.retention_days}d</div>
                <div>
                  Last sync: {c.last_sync_at ? formatTimestamp(c.last_sync_at) : "Never"}
                </div>
              </div>

              <div className="text-[11px] font-mono text-slate-400">
                Granted scopes:{" "}
                <span className="text-slate-200">
                  {c.granted_scopes?.join(", ") || "Pending consent"}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
                <Button
                  variant="secondary"
                  onClick={() => handleTest(c.id)}
                  disabled={c.status === "REVOKED"}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Test Connectivity</span>
                </Button>
                <Link
                  href="/email/connectors/health"
                  className="min-h-[36px] inline-flex items-center px-3 py-1.5 rounded-lg bg-surface border border-line text-slate-200 hover:border-cyan-500/40 font-mono text-xs"
                >
                  Reconciliation &amp; Gaps
                </Link>
                {c.status !== "REVOKED" && (
                  <Button
                    variant="secondary"
                    onClick={() => setRevokingId(c.id)}
                  >
                    <PowerOff className="w-3.5 h-3.5 text-rose-400" />
                    <span>Disconnect</span>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
