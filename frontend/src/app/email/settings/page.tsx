"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  EmailWorkspaceHeader,
  ProtectionStateBadge,
  ProviderBadge,
} from "@/components/email/EmailSecurityUi";

export default function EmailSettingsGovernancePage() {
  const [settings, setSettings] = useState<any>(null);
  const [privacy, setPrivacy] = useState<any>(null);
  const [auditorPrincipalId, setAuditorPrincipalId] = useState("auditor-ext-01");
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [s, p] = await Promise.all([
        ZoikoShieldApiClient.getEmailSettings(),
        ZoikoShieldApiClient.getEmailPrivacyInventory(),
      ]);
      setSettings(s);
      setPrivacy(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load governance inventory.");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleGrantAuditor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await ZoikoShieldApiClient.grantEmailAuditorAccess({
        auditorPrincipalId,
        expiresInHours,
      });
      setMessage(
        `Time-bounded SECURITY_AUDITOR access granted until ${formatTimestamp(res?.expiresAt)} (T09).`,
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant auditor access.");
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Access Governance, Privacy & Auditor Grants"
        subtitle="Manage hashed-indicator data minimization posture, time-limited external auditor grants (1-168 hours), emergency revocation, and immutable access audit trails."
        activeHref="/email/settings"
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

      {privacy && (
        <div className="p-5 rounded-xl bg-raised border border-cyan-500/30 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-cyan-300">
            <ShieldCheck className="w-4 h-4" />
            <span>
              Privacy Posture: {privacy.dataMinimizationMode} (Raw Mailbox Body Storage:{" "}
              {String(Boolean(privacy.rawBodyStorageEnabled))})
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {(privacy.sources || []).map((s: any) => (
              <div
                key={s.connectionId}
                className="p-3 rounded-lg bg-surface border border-line space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-100">{s.displayName}</span>
                  <ProtectionStateBadge state={s.status} />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <ProviderBadge provider={s.provider} />
                  <span>
                    {s.residencyCode} · {s.retentionDays}d
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={handleGrantAuditor}
        className="p-5 rounded-xl bg-raised border border-line grid grid-cols-1 md:grid-cols-3 gap-3 items-end text-xs"
      >
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">External Auditor Principal ID</span>
          <input
            type="text"
            required
            value={auditorPrincipalId}
            onChange={(e) => setAuditorPrincipalId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono"
          />
        </label>
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">Expiry Window (1-168 hours)</span>
          <input
            type="number"
            min={1}
            max={168}
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono"
          />
        </label>
        <Button type="submit" variant="cyan">
          Grant Bounded Auditor Access
        </Button>
      </form>

      {settings?.recentAudit && (
        <div className="p-5 rounded-xl bg-raised border border-line space-y-2 text-xs">
          <h2 className="text-sm font-bold text-slate-100">
            Recent Email Governance Audit Events
          </h2>
          <div className="space-y-1.5">
            {settings.recentAudit.map((evt: any) => (
              <div
                key={evt.id}
                className="p-2.5 rounded-lg bg-surface border border-line flex items-center justify-between font-mono text-[11px]"
              >
                <span className="text-cyan-300">{evt.event_type}</span>
                <span className="text-slate-400">
                  Actor: {evt.actor_id} · {formatTimestamp(evt.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
