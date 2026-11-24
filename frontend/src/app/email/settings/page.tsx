"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailAccessGrant } from "@/lib/types";
import { EMAIL_COPY } from "@/lib/email-copy";
import { AuditorGrantForm, type ShareableManifest } from "@/components/email/AuditorGrantForm";
import {
  ConnectorStatusBadge,
  EmailErrorNotice,
  EmailLoadingNotice,
  EmailNotice,
  EmailTime,
  EmailWorkspaceHeader,
  ProviderBadge,
  classifyEmailError,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

function grantState(g: EmailAccessGrant): string {
  if (g.revokedAt) return "Revoked";
  if (!g.active || Date.parse(g.expiresAt) <= Date.now()) return "Expired";
  return "Active";
}

export default function EmailSettingsGovernancePage() {
  const [settings, setSettings] = useState<any>(null);
  const [privacy, setPrivacy] = useState<any>(null);
  const [grants, setGrants] = useState<EmailAccessGrant[] | null>(null);
  const [grantsError, setGrantsError] = useState<ClassifiedEmailError | null>(null);
  const [manifests, setManifests] = useState<ShareableManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);

  // Requests can settle after the page unmounts; never update state then.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadGrants = useCallback(async () => {
    try {
      const res = await ZoikoShieldApiClient.listEmailAccessGrants();
      if (!mountedRef.current) return;
      setGrants(Array.isArray(res?.grants) ? res.grants : []);
      setGrantsError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setGrants(null);
      setGrantsError(classifyEmailError(err, "Failed to load access grants."));
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        ZoikoShieldApiClient.getEmailSettings(),
        ZoikoShieldApiClient.getEmailPrivacyInventory(),
      ]);
      if (!mountedRef.current) return;
      setSettings(s);
      setPrivacy(p);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(classifyEmailError(err, "Failed to load governance inventory."));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    if (!mountedRef.current) return;
    await loadGrants();
    if (!mountedRef.current) return;
    try {
      const list = await ZoikoShieldApiClient.listEmailEvidenceManifests();
      if (mountedRef.current) setManifests(Array.isArray(list) ? list : []);
    } catch {
      if (mountedRef.current) setManifests([]);
    }
  }, [loadGrants]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Security Settings, Privacy & Access"
        subtitle="Review collection scope, retention, permission grants and exports. Auditor grants are time-limited and apply only to the manifests you choose."
        activeHref="/email/settings"
      />

      <EmailErrorNotice error={error} onRetry={error?.kind === "DENIED" ? undefined : loadAll} />
      {loading && !settings && !error && <EmailLoadingNotice label="Loading governance inventory…" />}

      {privacy && (
        <section className="p-5 rounded-xl bg-raised border border-cyan-500/30 text-xs space-y-2">
          <h2 className="flex items-center gap-2 font-bold text-cyan-300">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>
              Privacy posture: {privacy.dataMinimizationMode} · Raw message body storage:{" "}
              {privacy.rawBodyStorageEnabled ? "enabled" : "disabled"}
            </span>
          </h2>
          <p className="text-slate-300">
            Investigation evidence is retained for the configured retention period and any legal
            hold; deletion follows the approved retention schedule.
          </p>
          {(privacy.sources || []).length === 0 ? (
            <p className="text-slate-300">{EMAIL_COPY.NO_CONNECTED_SOURCE}</p>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {(privacy.sources || []).map((s: any) => (
                <li key={s.connectionId} className="p-3 rounded-lg bg-surface border border-line space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">{s.displayName}</span>
                    <ConnectorStatusBadge
                      status={s.status}
                      statusReason={s.statusReason ?? s.status_reason}
                      consentExpiresAt={s.consentExpiresAt ?? s.consent_expires_at}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                    <ProviderBadge provider={s.provider} />
                    <span>
                      {s.residencyCode} · {s.retentionDays}d retention
                      {s.legalHold ? " · legal hold" : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="p-5 rounded-xl bg-raised border border-line space-y-2 text-xs">
        <h2 className="text-sm font-bold text-slate-100">External Auditor Access Grants</h2>
        <EmailErrorNotice error={grantsError} onRetry={grantsError?.kind === "DENIED" ? undefined : loadGrants} />
        {grants && grants.length === 0 && (
          <p className="text-slate-400">No auditor grants have been issued.</p>
        )}
        {grants && grants.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Auditor access grants by manifest</caption>
              <thead className="font-mono text-[11px] text-slate-400 uppercase">
                <tr>
                  <th scope="col" className="p-2">Manifest</th>
                  <th scope="col" className="p-2">Auditor</th>
                  <th scope="col" className="p-2">Expires</th>
                  <th scope="col" className="p-2">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {grants.map((g) => (
                  <tr key={`${g.manifestId}-${g.auditorPrincipalId}`}>
                    <td className="p-2 font-mono break-all">{g.manifestId}</td>
                    <td className="p-2 font-mono">{g.auditorPrincipalId}</td>
                    <td className="p-2">
                      <EmailTime iso={g.expiresAt} />
                    </td>
                    <td className="p-2 font-mono font-bold">{grantState(g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AuditorGrantForm manifests={manifests} onGranted={loadGrants} />

      {settings?.recentAudit && (
        <section className="p-5 rounded-xl bg-raised border border-line space-y-2 text-xs">
          <h2 className="text-sm font-bold text-slate-100">Recent Email Governance Audit Events</h2>
          {settings.recentAudit.length === 0 ? (
            <EmailNotice tone="info">No audit events recorded yet.</EmailNotice>
          ) : (
            <ul className="space-y-1.5">
              {settings.recentAudit.map((evt: any) => (
                <li
                  key={evt.id}
                  className="p-2.5 rounded-lg bg-surface border border-line flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]"
                >
                  <span className="text-cyan-300">{evt.event_type}</span>
                  <span className="text-slate-400">
                    Actor: {evt.actor_id} · <EmailTime iso={evt.created_at} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
