"use client";

import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, KeyRound, Lock, Mail } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type {
  EmailMailBindingResponse,
  EmailOAuthProviderType,
  EmailProviderCatalogueEntry,
  EmailProviderType,
} from "@/lib/types";
import { EMAIL_COPY } from "@/lib/email-copy";
import { Button } from "@/components/ui/Button";
import {
  EmailErrorNotice,
  EmailNotice,
  EmailWorkspaceHeader,
  classifyEmailError,
  providerLabel,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

/** Read-only Phase 0 scopes per provider. Write scopes are never offered here (T18). */
const READ_ONLY_SCOPES: Record<EmailOAuthProviderType, string[]> = {
  MICROSOFT_365: ["SecurityAlert.Read.All"],
  GOOGLE_WORKSPACE: ["https://www.googleapis.com/auth/apps.alerts"],
};

const PROVIDER_DETAILS: Record<
  EmailProviderType,
  { api: string; prerequisites: string; dataFields: string }
> = {
  MICROSOFT_365: {
    api: "Microsoft Graph v1.0 /security/alerts_v2 · SecurityAlert.Read.All",
    prerequisites:
      "Global or Security Administrator able to grant admin consent; Microsoft Defender licensing for the alert types you expect.",
    dataFields:
      "Alert ID, title, category, severity, provider verdict, detection time, pseudonymised user and mailbox references, indicator and attachment hashes.",
  },
  GOOGLE_WORKSPACE: {
    api: "Alert Center API v1beta1/alerts · auth/apps.alerts",
    prerequisites:
      "Super Administrator able to authorize Alert Center access; an edition that includes the alert types you expect.",
    dataFields:
      "Alert ID, type, source, severity, create time, pseudonymised user references and indicator hashes.",
  },
  ZOIKO_MAIL: {
    api: "Signed SecurityEventEnvelope v1 events from Zoiko Mail",
    prerequisites:
      "A Zoiko Mail tenant administrator who will enter the binding ID in Zoiko Mail security settings.",
    dataFields:
      "Inbound verdicts, outbound holds, quarantine changes, account-risk and coverage reports — metadata only, no message bodies.",
  },
};

const FALLBACK_CATALOGUE: EmailProviderCatalogueEntry[] = [
  {
    provider: "MICROSOFT_365",
    displayName: "Microsoft 365 Defender",
    enabled: true,
    connectMethod: "OAUTH",
  },
  {
    provider: "GOOGLE_WORKSPACE",
    displayName: "Google Workspace Alert Center",
    enabled: true,
    connectMethod: "OAUTH",
  },
  {
    provider: "ZOIKO_MAIL",
    displayName: "Zoiko Mail",
    enabled: false,
    connectMethod: "MAIL_BINDING",
    reasonDisabled: "Provider availability could not be confirmed with the backend.",
  },
];

const STEPS = ["Select", "Choose", "Consent", "Verify"] as const;
const INTENT_STORAGE_KEY = "zoiko_email_connection_intent";

export default function EmailConnectorSetupPage() {
  const [step, setStep] = useState(0);
  const [catalogue, setCatalogue] = useState<EmailProviderCatalogueEntry[]>(FALLBACK_CATALOGUE);
  const [catalogueError, setCatalogueError] = useState<ClassifiedEmailError | null>(null);
  const [provider, setProvider] = useState<EmailProviderType>("MICROSOFT_365");
  const [displayName, setDisplayName] = useState("Microsoft 365 Defender Email Telemetry");
  const [residencyCode, setResidencyCode] = useState("eu-west-1");
  const [reviewed, setReviewed] = useState(false);
  const [binding, setBinding] = useState<EmailMailBindingResponse | null>(null);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const stepHeadingId = useId();
  const nameId = useId();
  const residencyId = useId();
  const reviewedId = useId();

  useEffect(() => {
    let cancelled = false;
    ZoikoShieldApiClient.listEmailProviders()
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) setCatalogue(list);
      })
      .catch((err) => {
        if (!cancelled) setCatalogueError(classifyEmailError(err, "Provider catalogue unavailable."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const entry = catalogue.find((c) => c.provider === provider);
  const isBinding = entry?.connectMethod === "MAIL_BINDING" || provider === "ZOIKO_MAIL";
  const scopes = isBinding ? [] : READ_ONLY_SCOPES[provider as EmailOAuthProviderType];
  const details = PROVIDER_DETAILS[provider];

  const selectProvider = (next: EmailProviderCatalogueEntry) => {
    if (!next.enabled) return;
    setProvider(next.provider);
    setDisplayName(
      next.provider === "MICROSOFT_365"
        ? "Microsoft 365 Defender Email Telemetry"
        : next.provider === "GOOGLE_WORKSPACE"
          ? "Google Workspace Alert Center Telemetry"
          : "Zoiko Mail Security Events",
    );
    setReviewed(false);
    setBinding(null);
    setError(null);
  };

  const canContinue =
    step === 0 ? Boolean(entry?.enabled) : step === 1 ? true : step === 2 ? reviewed && displayName.trim().length > 0 : false;

  const startOAuth = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.createEmailConnectionIntent({
        provider: provider as EmailOAuthProviderType,
        displayName: displayName.trim(),
        requestedMode: "READ_ONLY_TELEMETRY",
        requestedScopes: scopes,
        residencyCode,
      });
      if (!res?.authorizationUrl) {
        throw new Error(
          "The backend did not return a provider consent URL; the connection was not started.",
        );
      }
      try {
        sessionStorage.setItem(INTENT_STORAGE_KEY, res.intentId);
      } catch {
        // Only used to show the intent id after the redirect; not required.
      }
      window.location.assign(res.authorizationUrl);
    } catch (err) {
      setError(classifyEmailError(err, "Failed to start provider consent."));
    } finally {
      setSubmitting(false);
    }
  };

  const linkZoikoMail = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.createEmailMailBinding({
        displayName: displayName.trim(),
      });
      setBinding(res);
    } catch (err) {
      setError(classifyEmailError(err, "Failed to create the Zoiko Mail binding."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Read-Only Email Connector Onboarding"
        subtitle="Connect Microsoft 365 Defender, Google Workspace Alert Center or an eligible Zoiko Mail tenant. Broad mailbox write scopes (Mail.ReadWrite / gmail.modify) are not requested in this setup."
        activeHref="/email/connectors"
      />

      <div className="p-4 rounded-xl bg-raised border border-cyan-500/30 text-xs text-slate-300 flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <strong className="text-slate-100">Least-privilege design (S01 / S02 / T18):</strong>{" "}
          {EMAIL_COPY.READ_ONLY_CONSENT}
        </div>
      </div>

      <ol aria-label="Setup progress" className="flex flex-wrap gap-2 text-xs font-mono">
        {STEPS.map((label, idx) => (
          <li
            key={label}
            aria-current={idx === step ? "step" : undefined}
            className={`px-3 py-1.5 rounded-lg border ${
              idx === step
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200 font-bold"
                : idx < step
                  ? "bg-surface border-emerald-500/40 text-emerald-300"
                  : "bg-surface border-line text-slate-400"
            }`}
          >
            {idx + 1}. {label}
            {idx < step ? " (done)" : ""}
          </li>
        ))}
        <li className="px-3 py-1.5 rounded-lg border bg-surface border-line text-slate-400">
          5. Test &amp; activate (after consent)
        </li>
      </ol>

      {catalogueError && (
        <EmailNotice tone="warning">
          Provider availability could not be confirmed ({catalogueError.message}). The backend
          will still refuse any provider that is not enabled for this tenant.
        </EmailNotice>
      )}
      <EmailErrorNotice error={error} />

      <section
        aria-labelledby={stepHeadingId}
        className="p-6 rounded-xl bg-raised border border-line space-y-5 text-xs"
      >
        <h2 id={stepHeadingId} className="text-sm font-bold text-slate-100">
          Step {step + 1}: {STEPS[step]}
        </h2>

        {step === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3" role="radiogroup" aria-label="Email provider">
            {catalogue.map((c) => {
              const selected = provider === c.provider;
              return (
                <button
                  key={c.provider}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={!c.enabled}
                  onClick={() => selectProvider(c)}
                  className={`p-4 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    !c.enabled
                      ? "bg-surface border-line text-slate-500 cursor-not-allowed"
                      : selected
                        ? "bg-cyan-500/15 border-cyan-400 text-slate-100"
                        : "bg-surface border-line text-slate-300"
                  }`}
                >
                  <div className="font-bold text-sm">
                    {c.displayName || providerLabel(c.provider)}
                    {selected ? " (selected)" : ""}
                  </div>
                  <div className="text-[11px] font-mono mt-1">
                    {PROVIDER_DETAILS[c.provider]?.api}
                  </div>
                  <div className="text-[11px] mt-2">
                    {c.enabled
                      ? `Prerequisites: ${PROVIDER_DETAILS[c.provider]?.prerequisites}`
                      : `Not available: ${c.reasonDisabled || "Not enabled for this tenant."}`}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && (
          <fieldset className="space-y-2">
            <legend className="font-mono text-slate-300 mb-2">Collection mode</legend>
            <label className="flex items-start gap-2 p-3 rounded-lg bg-surface border border-cyan-500/40">
              <input type="radio" name="mode" checked readOnly />
              <span>
                <span className="font-bold text-slate-100">Read-only alert telemetry (default)</span>
                <span className="block text-slate-400">{EMAIL_COPY.READ_ONLY_CONSENT}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 p-3 rounded-lg bg-surface border border-line text-slate-500">
              <input type="radio" name="mode" disabled />
              <span>
                Scoped message metadata (Phase 1) — disabled pending separate necessity, consent and
                risk approval.
              </span>
            </label>
            <label className="flex items-start gap-2 p-3 rounded-lg bg-surface border border-line text-slate-500">
              <input type="radio" name="mode" disabled />
              <span>Mailbox actions (Phase 2) — {EMAIL_COPY.RESPONSE_GATE}</span>
            </label>
          </fieldset>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor={nameId} className="font-mono text-slate-300 block">
                  Connection display name
                </label>
                <input
                  id={nameId}
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
                />
              </div>
              {!isBinding && (
                <div className="space-y-1">
                  <label htmlFor={residencyId} className="font-mono text-slate-300 block">
                    Data residency region
                  </label>
                  <select
                    id={residencyId}
                    value={residencyCode}
                    onChange={(e) => setResidencyCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
                  >
                    <option value="eu-west-1">eu-west-1 (EU/UK)</option>
                    <option value="us-east-1">us-east-1 (US)</option>
                    <option value="uk-london-1">uk-london-1 (UK South)</option>
                  </select>
                </div>
              )}
            </div>

            <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-lg bg-surface border border-line">
              <div>
                <dt className="font-mono text-slate-400">Requested permissions</dt>
                <dd className="text-slate-100 font-mono break-all">
                  {isBinding ? "None — Zoiko Mail pushes signed events to ZoikoShield." : scopes.join(", ")}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-slate-400">Data fields collected</dt>
                <dd className="text-slate-200">{details.dataFields}</dd>
              </div>
              <div>
                <dt className="font-mono text-slate-400">Region and retention</dt>
                <dd className="text-slate-200">
                  {isBinding ? "Zoiko Mail tenant region" : residencyCode} · 90-day default retention
                  unless a legal hold applies.
                </dd>
              </div>
              <div>
                <dt className="font-mono text-slate-400">Risks</dt>
                <dd className="text-slate-200">
                  Alert metadata can identify users. ZoikoShield stores pseudonymised references and
                  hashes, not message contents.
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-mono text-slate-400">How to revoke</dt>
                <dd className="text-slate-200">
                  Disconnect the source in Email Connections (collection stops immediately), and
                  remove the ZoikoShield application grant in your{" "}
                  {isBinding ? "Zoiko Mail security settings" : "provider admin console"}.
                </dd>
              </div>
            </dl>

            <p className="text-slate-200">{EMAIL_COPY.READ_ONLY_CONSENT}</p>

            <label htmlFor={reviewedId} className="flex items-center gap-2 cursor-pointer">
              <input
                id={reviewedId}
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              <span>I have reviewed the requested permissions, data fields, region and retention.</span>
            </label>
          </div>
        )}

        {step === 3 && !isBinding && (
          <div className="space-y-3">
            <p className="text-slate-300">
              You will be redirected to {providerLabel(provider)} to grant consent. ZoikoShield
              generates the request state and PKCE verifier on the server; after consent you return
              here to test the connection. The source is not active until a connection test passes.
            </p>
            <Button type="button" variant="cyan" disabled={submitting} onClick={startOAuth}>
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              <span>Continue to {providerLabel(provider)} consent</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}

        {step === 3 && isBinding && (
          <div className="space-y-3">
            {!binding ? (
              <>
                <p className="text-slate-300">
                  Create a tenant binding, then enter the binding ID in Zoiko Mail. The connection
                  stays in validation until the first valid signed event arrives.
                </p>
                <Button type="button" variant="cyan" disabled={submitting} onClick={linkZoikoMail}>
                  <Mail className="w-4 h-4" aria-hidden="true" />
                  <span>Link Zoiko Mail</span>
                </Button>
              </>
            ) : (
              <EmailNotice tone="info" title="Zoiko Mail binding created">
                <div className="space-y-1">
                  <div>
                    Binding ID: <code className="font-mono text-slate-100">{binding.bindingId}</code>
                  </div>
                  <div>
                    Connection {binding.connectionId} is {binding.status}
                    {binding.status_reason ? ` (${binding.status_reason})` : ""}. Enter the binding ID
                    in Zoiko Mail to start sending events.
                  </div>
                  <Link href="/email/connectors" className="text-cyan-300 hover:underline font-mono">
                    View connected sources →
                  </Link>
                </div>
              </EmailNotice>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-3 border-t border-line">
          {step > 0 && (
            <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back</span>
            </Button>
          )}
          {step < STEPS.length - 1 && (
            <Button
              type="button"
              variant="cyan"
              disabled={!canContinue}
              onClick={() => setStep(step + 1)}
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          )}
          {!canContinue && step < STEPS.length - 1 && (
            <span className="self-center text-[11px] text-amber-200">
              {step === 0
                ? "Select an available provider to continue."
                : "Review the permissions and confirm to continue."}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
