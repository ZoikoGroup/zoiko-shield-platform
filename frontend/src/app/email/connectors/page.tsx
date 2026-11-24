"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ListChecks,
  Play,
  PowerOff,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type {
  EmailConnectorCapabilities,
  EmailConnectorSyncResult,
  EmailConnectorTestResult,
  EmailProviderCatalogueEntry,
  EmailSourceConnectionRecord,
} from "@/lib/types";
import { EMAIL_COPY, EMAIL_STATE_COPY } from "@/lib/email-copy";
import { Button } from "@/components/ui/Button";
import {
  CapabilityReportView,
  ConnectorStatusBadge,
  EmailErrorNotice,
  EmailLoadingNotice,
  EmailNotice,
  EmailTime,
  EmailWorkspaceHeader,
  ProviderBadge,
  classifyEmailError,
  effectiveConnectorStatus,
  providerLabel,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

export default function EmailConnectorsPage() {
  const [connectors, setConnectors] = useState<EmailSourceConnectionRecord[]>([]);
  const [providers, setProviders] = useState<EmailProviderCatalogueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [testResults, setTestResults] = useState<Record<string, EmailConnectorTestResult>>({});
  const [syncResults, setSyncResults] = useState<Record<string, EmailConnectorSyncResult>>({});
  const [drawer, setDrawer] = useState<{
    connectionId: string;
    data: EmailConnectorCapabilities | null;
    error: ClassifiedEmailError | null;
  } | null>(null);
  const drawerTitleId = useId();
  const revokeReasonId = useId();

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, catalogue] = await Promise.all([
        ZoikoShieldApiClient.listEmailConnectors(),
        ZoikoShieldApiClient.listEmailProviders().catch(() => [] as EmailProviderCatalogueEntry[]),
      ]);
      setConnectors(Array.isArray(list) ? list : []);
      setProviders(Array.isArray(catalogue) ? catalogue : []);
    } catch (err) {
      setError(classifyEmailError(err, "Failed to load connectors."));
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
      setTestResults((prev) => ({ ...prev, [id]: res }));
      setFeedback(
        res?.passed
          ? `Connection test passed for ${id} (${res.status}). Review the capability report before activating.`
          : `Connection test did not pass for ${id} (${res?.status || "UNVERIFIED"}). The source is not active.`,
      );
      await loadConnectors();
    } catch (err) {
      setError(classifyEmailError(err, "Connectivity check failed."));
    }
  };

  const handleActivate = async (id: string) => {
    setFeedback(null);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.activateEmailConnector(id);
      const eff = effectiveConnectorStatus(res?.status, res?.status_reason, res?.consent_expires_at);
      setFeedback(
        eff.status === "ACTIVE"
          ? `Source ${id} is active.`
          : `Source ${id} activated with status ${eff.status}${eff.reason ? ` (${eff.reason})` : ""}.`,
      );
      await loadConnectors();
    } catch (err) {
      setError(classifyEmailError(err, "Activation failed."));
    }
  };

  const handleSync = async (id: string) => {
    setFeedback(null);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.syncEmailConnector(id);
      setSyncResults((prev) => ({ ...prev, [id]: res }));
      await loadConnectors();
    } catch (err) {
      setError(classifyEmailError(err, "Sync request failed."));
    }
  };

  const openCapabilities = async (id: string) => {
    setDrawer({ connectionId: id, data: null, error: null });
    try {
      const data = await ZoikoShieldApiClient.getEmailConnectorCapabilities(id);
      setDrawer({ connectionId: id, data, error: null });
    } catch (err) {
      setDrawer({
        connectionId: id,
        data: null,
        error: classifyEmailError(err, "Failed to load capabilities."),
      });
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
      setError(classifyEmailError(err, "Failed to revoke connector."));
    }
  };

  const disabledProviders = providers.filter((p) => !p.enabled);

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Source Connectors Inventory"
        subtitle="Manage read-only Microsoft 365 Defender (/security/alerts_v2), Google Workspace Alert Center and eligible Zoiko Mail sources. Phase 2 mailbox writes remain fail-closed unless explicitly authorized."
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
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </>
        }
      />

      {feedback && (
        <EmailNotice tone="success">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            {feedback}
          </span>
        </EmailNotice>
      )}

      <EmailErrorNotice
        error={error}
        onRetry={error?.kind === "DENIED" ? undefined : loadConnectors}
      />

      {disabledProviders.length > 0 && (
        <EmailNotice tone="info" title="Providers not available for this tenant">
          <ul className="list-disc pl-4 space-y-0.5">
            {disabledProviders.map((p) => (
              <li key={p.provider}>
                {p.displayName || providerLabel(p.provider)}: {p.reasonDisabled || "Not enabled."}
              </li>
            ))}
          </ul>
        </EmailNotice>
      )}

      {revokingId && (
        <form
          onSubmit={handleRevoke}
          className="p-4 rounded-xl bg-raised border border-rose-500/40 space-y-3"
        >
          <label htmlFor={revokeReasonId} className="block text-xs font-bold text-rose-300">
            Confirm Immediate Access Revocation &amp; Collection Halt ({revokingId})
          </label>
          <input
            id={revokeReasonId}
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
            <Button type="button" variant="secondary" onClick={() => setRevokingId(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {drawer && (
        <section
          role="dialog"
          aria-labelledby={drawerTitleId}
          className="p-5 rounded-xl bg-raised border border-cyan-500/40 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id={drawerTitleId} className="text-sm font-bold text-slate-100">
              Capabilities &amp; Scope — {drawer.connectionId}
            </h2>
            <Button variant="secondary" onClick={() => setDrawer(null)} aria-label="Close capabilities">
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
          <EmailErrorNotice error={drawer.error} />
          {!drawer.data && !drawer.error && <EmailLoadingNotice label="Loading capability inventory…" />}
          {drawer.data && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CapabilityReportView report={drawer.data} />
              <dl className="space-y-1.5 font-mono text-[11px]">
                <div>
                  <dt className="text-slate-400">Requested scopes</dt>
                  <dd className="text-slate-200 break-all">
                    {drawer.data.requestedScopes?.join(", ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Granted scopes (provider-reported)</dt>
                  <dd className="text-slate-200 break-all">
                    {drawer.data.grantedScopes?.join(", ") || "None granted"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Licence assumptions</dt>
                  <dd className="text-slate-200 break-all">
                    {Object.keys(drawer.data.licenceAssumptions || {}).length === 0
                      ? "None recorded"
                      : JSON.stringify(drawer.data.licenceAssumptions)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Last test</dt>
                  <dd className="text-slate-200">
                    {drawer.data.lastTestStatus || "Never tested"} ·{" "}
                    <EmailTime iso={drawer.data.lastTestedAt} />
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </section>
      )}

      {loading && connectors.length === 0 && !error ? (
        <EmailLoadingNotice label="Loading email sources…" />
      ) : connectors.length === 0 && !error ? (
        <div className="p-8 rounded-xl bg-raised border border-line text-center space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">No Email Sources Connected</h2>
          <p className="text-xs text-slate-300 max-w-lg mx-auto">
            {EMAIL_COPY.NO_CONNECTED_SOURCE}
          </p>
          <Link
            href="/email/connectors/setup"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
          >
            <span>Open Onboarding Wizard</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {connectors.map((c) => {
            const eff = effectiveConnectorStatus(c.status, c.status_reason, c.consent_expires_at);
            const test = testResults[c.id];
            const sync = syncResults[c.id];
            const collecting = eff.status === "ACTIVE" || eff.status === "DEGRADED";
            return (
              <div
                key={c.id}
                className="p-5 rounded-xl bg-raised border border-line space-y-3 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-slate-100">{c.display_name}</h2>
                    <ProviderBadge provider={c.provider} />
                  </div>
                  <ConnectorStatusBadge
                    status={c.status}
                    statusReason={c.status_reason}
                    consentExpiresAt={c.consent_expires_at}
                  />
                </div>

                {(eff.status === "SUSPENDED" || eff.status === "REVOKED") && (
                  <EmailNotice tone="warning">
                    {EMAIL_STATE_COPY.DISCONNECTED_SOURCE}
                    {eff.reason === "CONSENT_EXPIRED" &&
                      " Consent has expired; reconnect the source to resume collection."}
                  </EmailNotice>
                )}
                {eff.status === "VALIDATING" && (
                  <EmailNotice tone="info">{EMAIL_STATE_COPY.HANDSHAKE_NOT_SUCCESS}</EmailNotice>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] text-slate-400 bg-surface p-3 rounded-lg border border-line">
                  <div>Residency: {c.residency_code}</div>
                  <div>Frequency: {c.sync_frequency}</div>
                  <div>Retention: {c.retention_days}d</div>
                  <div>
                    Last sync: <EmailTime iso={c.last_sync_at} />
                  </div>
                  <div>
                    Consent expires: <EmailTime iso={c.consent_expires_at} fallback="Not recorded" />
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-400">
                  Granted scopes:{" "}
                  <span className="text-slate-200">
                    {c.granted_scopes?.join(", ") || "Pending consent"}
                  </span>
                </div>

                {test && (
                  <div className="p-3 rounded-lg bg-surface border border-line space-y-2">
                    <div className="font-mono font-bold text-slate-200">
                      Test result: {test.passed ? "Passed" : "Not passed"} ({test.status}) ·{" "}
                      <EmailTime iso={test.testedAt} />
                    </div>
                    <CapabilityReportView report={test.capabilityReport || {}} />
                  </div>
                )}

                {sync && (
                  <div
                    role="status"
                    className="p-3 rounded-lg bg-surface border border-line font-mono text-[11px] text-slate-300 space-y-1"
                  >
                    <div>
                      Sync {sync.status}: ingested {sync.ingestedCount}, rejected{" "}
                      {sync.rejectedCount}, duplicates {sync.duplicateCount}, expected{" "}
                      {sync.expectedCount ?? "unknown (provider gives no total)"} · completeness{" "}
                      {sync.completenessGrade}
                    </div>
                    {sync.completenessGrade !== "COMPLETE" && (
                      <div className="font-sans text-amber-200">{EMAIL_COPY.SOURCE_LAG}</div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
                  <Button
                    variant="secondary"
                    onClick={() => handleTest(c.id)}
                    disabled={eff.status === "REVOKED" || c.provider === "ZOIKO_MAIL"}
                  >
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Test Connection</span>
                  </Button>
                  {eff.status === "VALIDATING" && c.provider !== "ZOIKO_MAIL" && (
                    <Button variant="cyan" onClick={() => handleActivate(c.id)}>
                      <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Activate</span>
                    </Button>
                  )}
                  {collecting && c.provider !== "ZOIKO_MAIL" && (
                    <Button variant="secondary" onClick={() => handleSync(c.id)}>
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Sync Now</span>
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => openCapabilities(c.id)}>
                    <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>View Scope &amp; Capabilities</span>
                  </Button>
                  <Link
                    href="/email/connectors/health"
                    className="min-h-[36px] inline-flex items-center px-3 py-1.5 rounded-lg bg-surface border border-line text-slate-200 hover:border-cyan-500/40 font-mono text-xs"
                  >
                    Reconciliation &amp; Gaps
                  </Link>
                  {eff.status !== "REVOKED" && (
                    <Button variant="secondary" onClick={() => setRevokingId(c.id)}>
                      <PowerOff className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                      <span>Disconnect</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
