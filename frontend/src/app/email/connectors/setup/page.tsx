"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailProviderType } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { EmailWorkspaceHeader } from "@/components/email/EmailSecurityUi";

const DEFAULT_SCOPES: Record<EmailProviderType, string[]> = {
  MICROSOFT_365: ["SecurityAlert.Read.All"],
  GOOGLE_WORKSPACE: ["https://www.googleapis.com/auth/apps.alerts"],
};

export default function EmailConnectorSetupPage() {
  const [provider, setProvider] = useState<EmailProviderType>("MICROSOFT_365");
  const [displayName, setDisplayName] = useState("Microsoft 365 Defender Email Telemetry");
  const [residencyCode, setResidencyCode] = useState("eu-west-1");
  const [scopesText, setScopesText] = useState(DEFAULT_SCOPES.MICROSOFT_365.join(", "));
  const [defenderLicenceVerified, setDefenderLicenceVerified] = useState(true);
  const [exchangeAppRbacVerified, setExchangeAppRbacVerified] = useState(true);
  const [intent, setIntent] = useState<any>(null);
  const [verifiedConnection, setVerifiedConnection] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectProvider = (next: EmailProviderType) => {
    setProvider(next);
    setDisplayName(
      next === "MICROSOFT_365"
        ? "Microsoft 365 Defender Email Telemetry"
        : "Google Workspace Alert Center Telemetry",
    );
    setScopesText(DEFAULT_SCOPES[next].join(", "));
    setIntent(null);
    setVerifiedConnection(null);
    setError(null);
  };

  const parsedScopes = scopesText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const handleCreateIntent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.createEmailConnectionIntent({
        provider,
        displayName,
        requestedMode: "READ_ONLY_TELEMETRY",
        requestedScopes: parsedScopes,
        residencyCode,
      });
      setIntent(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize onboarding intent.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyConsent = async (consentGranted: boolean) => {
    if (!intent?.intentId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.verifyEmailConnectionIntent(
        intent.intentId,
        {
          oauthState: intent.oauthState,
          consentGranted,
          grantedScopes: parsedScopes,
          defenderLicenceVerified,
          exchangeAppRbacVerified,
        },
      );
      setVerifiedConnection(res?.connection || null);
      if (!consentGranted) {
        setError("Consent declined; connection remains unconfigured (fail-closed).");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consent verification failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Read-Only Email Connector Onboarding"
        subtitle="Connect Microsoft 365 Defender (/security/alerts_v2) or Google Workspace Alert Center. Broad mailbox write scopes (Mail.ReadWrite / gmail.modify) are blocked fail-closed in Phase 0/1."
        activeHref="/email/connectors"
      />

      <div className="p-4 rounded-xl bg-raised border border-cyan-500/30 text-xs text-slate-300 flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-100">Least-Privilege Guarantee (S01 / S02 / T18):</strong>{" "}
          ZoikoShield ingests normalized provider verdicts and hashed IOC metadata without requesting raw mailbox read/write permissions.
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {verifiedConnection ? (
        <div className="p-6 rounded-xl bg-emerald-950/25 border border-emerald-500/40 space-y-3 text-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
            <CheckCircle2 className="w-5 h-5" />
            <span>Email Telemetry Source Verified ({verifiedConnection.status})</span>
          </div>
          <div className="font-mono text-slate-300">
            Source ID: {verifiedConnection.id} · Provider: {verifiedConnection.provider}
          </div>
          <Link
            href="/email/connectors"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold"
          >
            View Connected Sources →
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleCreateIntent}
          className="p-6 rounded-xl bg-raised border border-line space-y-5 text-xs"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => selectProvider("MICROSOFT_365")}
              className={`p-4 rounded-xl border text-left transition-all ${
                provider === "MICROSOFT_365"
                  ? "bg-cyan-500/15 border-cyan-400 text-slate-100"
                  : "bg-surface border-line text-slate-400"
              }`}
            >
              <div className="font-bold text-sm">Microsoft 365 Defender</div>
              <div className="text-[11px] font-mono mt-1">
                Graph v1.0 /security/alerts_v2 · SecurityAlert.Read.All
              </div>
            </button>
            <button
              type="button"
              onClick={() => selectProvider("GOOGLE_WORKSPACE")}
              className={`p-4 rounded-xl border text-left transition-all ${
                provider === "GOOGLE_WORKSPACE"
                  ? "bg-cyan-500/15 border-cyan-400 text-slate-100"
                  : "bg-surface border-line text-slate-400"
              }`}
            >
              <div className="font-bold text-sm">Google Workspace Alert Center</div>
              <div className="text-[11px] font-mono mt-1">
                Alert Center v1beta1/alerts · auth/apps.alerts
              </div>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 block">
              <span className="font-mono text-slate-300">Connection Display Name</span>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
              />
            </label>
            <label className="space-y-1 block">
              <span className="font-mono text-slate-300">Data Residency Boundary</span>
              <select
                value={residencyCode}
                onChange={(e) => setResidencyCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
              >
                <option value="eu-west-1">eu-west-1 (EU/UK Sovereign)</option>
                <option value="us-east-1">us-east-1 (US Commercial)</option>
                <option value="uk-london-1">uk-london-1 (UK South)</option>
              </select>
            </label>
          </div>

          <label className="space-y-1 block">
            <span className="font-mono text-slate-300">
              Requested Read-Only OAuth Scopes (comma-separated)
            </span>
            <input
              type="text"
              required
              value={scopesText}
              onChange={(e) => setScopesText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono"
            />
          </label>

          {provider === "MICROSOFT_365" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-surface border border-line">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={defenderLicenceVerified}
                  onChange={(e) => setDefenderLicenceVerified(e.target.checked)}
                />
                <span>Microsoft Defender Plan P1/P2 active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exchangeAppRbacVerified}
                  onChange={(e) => setExchangeAppRbacVerified(e.target.checked)}
                />
                <span>Exchange Application RBAC scoping verified</span>
              </label>
            </div>
          )}

          {!intent ? (
            <Button type="submit" variant="cyan" disabled={submitting}>
              <ShieldCheck className="w-4 h-4" />
              <span>Generate Anti-CSRF Consent Intent</span>
            </Button>
          ) : (
            <div className="p-4 rounded-xl bg-surface border border-cyan-500/40 space-y-3">
              <div className="font-mono text-cyan-300">
                OAuth Intent Ready · State Token: {intent.oauthState}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="cyan"
                  disabled={submitting}
                  onClick={() => handleVerifyConsent(true)}
                >
                  Verify &amp; Activate Read-Only Connector
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => handleVerifyConsent(false)}
                >
                  Decline Consent
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
