"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Play, Zap } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type {
  EmailConnectionCallbackResponse,
  EmailConnectorTestResult,
} from "@/lib/types";
import { EMAIL_STATE_COPY } from "@/lib/email-copy";
import { Button } from "@/components/ui/Button";
import {
  CapabilityReportView,
  ConnectorStatusBadge,
  EmailErrorNotice,
  EmailLoadingNotice,
  EmailNotice,
  EmailTime,
  EmailWorkspaceHeader,
  classifyEmailError,
  effectiveConnectorStatus,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

/**
 * WF-03 step 4/5. The provider redirects the browser here with `code` and
 * `state` (or `error`). This page only relays them to the backend, which
 * checks the state, performs the PKCE token exchange and binds the token to
 * the tenant. A completed handshake is not shown as success: the source stays
 * VALIDATING until a connection test passes and the admin activates it.
 */
function ConnectorCallbackInner() {
  const params = useSearchParams();
  const relayed = useRef(false);
  const [result, setResult] = useState<EmailConnectionCallbackResponse | null>(null);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const [test, setTest] = useState<EmailConnectorTestResult | null>(null);
  const [activated, setActivated] = useState<{ status: string; reason: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const state = params?.get("state") || "";
  const code = params?.get("code") || undefined;
  const providerError = params?.get("error") || undefined;
  const providerErrorDescription = params?.get("error_description") || undefined;

  const relay = useCallback(async () => {
    if (!state) {
      setError({
        kind: "ERROR",
        status: null,
        message:
          "The provider response did not include a state value, so it cannot be matched to a setup request. Start the setup again.",
      });
      return;
    }
    try {
      const res = await ZoikoShieldApiClient.completeEmailConnectionCallback({
        state,
        code,
        error: providerError,
        errorDescription: providerErrorDescription,
      });
      setResult(res);
    } catch (err) {
      setError(classifyEmailError(err, "The consent response could not be verified."));
    }
  }, [state, code, providerError, providerErrorDescription]);

  useEffect(() => {
    if (relayed.current) return;
    relayed.current = true;
    void relay();
  }, [relay]);

  const connectionId = result?.connection?.id;

  const runTest = async () => {
    if (!connectionId) return;
    setBusy(true);
    setError(null);
    try {
      setTest(await ZoikoShieldApiClient.testEmailConnector(connectionId));
    } catch (err) {
      setError(classifyEmailError(err, "Connection test failed."));
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!connectionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.activateEmailConnector(connectionId);
      setActivated(effectiveConnectorStatus(res?.status, res?.status_reason, res?.consent_expires_at));
    } catch (err) {
      setError(classifyEmailError(err, "Activation failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Provider Consent Result"
        subtitle="ZoikoShield verifies the consent response on the server. A source is not active until its connection test passes."
        activeHref="/email/connectors"
      />

      <EmailErrorNotice error={error} />

      {!result && !error && <EmailLoadingNotice label="Verifying the provider consent response…" />}

      {result?.status === "DENIED" && (
        <EmailNotice tone="warning" title="Consent not granted">
          Consent was not granted, so nothing was connected and no data will be collected.
          {providerErrorDescription ? ` Provider message: ${providerErrorDescription}` : ""}
        </EmailNotice>
      )}

      {result?.status === "EXPIRED" && (
        <EmailNotice tone="warning" title="Setup request expired">
          This setup request expired before consent completed. Start the setup again.
        </EmailNotice>
      )}

      {result?.status === "VERIFIED" && result.connection && (
        <section className="p-5 rounded-xl bg-raised border border-line space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-100">{result.connection.display_name}</h2>
            <ConnectorStatusBadge
              status={activated?.status || result.connection.status}
              statusReason={activated?.reason}
            />
          </div>

          {!activated && <EmailNotice tone="info">{EMAIL_STATE_COPY.HANDSHAKE_NOT_SUCCESS}</EmailNotice>}

          {test && (
            <div className="p-3 rounded-lg bg-surface border border-line space-y-2">
              <div className="font-mono font-bold text-slate-200">
                Test result: {test.passed ? "Passed" : "Not passed"} ({test.status}) ·{" "}
                <EmailTime iso={test.testedAt} />
              </div>
              <CapabilityReportView report={test.capabilityReport || {}} />
              {!test.passed && (
                <p className="text-amber-200">
                  The connection test did not pass, so the source cannot be activated. Fix the
                  provider permission or licence issue and test again.
                </p>
              )}
            </div>
          )}

          {activated && (
            <EmailNotice tone={activated.status === "ACTIVE" ? "success" : "warning"}>
              Source status is now {activated.status}
              {activated.reason ? ` (${activated.reason})` : ""}.
            </EmailNotice>
          )}

          <div className="flex flex-wrap gap-2">
            {!activated && (
              <Button variant="secondary" onClick={runTest} disabled={busy}>
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Test Connection</span>
              </Button>
            )}
            {!activated && test?.passed && (
              <Button variant="cyan" onClick={activate} disabled={busy}>
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Activate Source</span>
              </Button>
            )}
            <Link
              href="/email/connectors"
              className="min-h-[36px] inline-flex items-center px-3 py-1.5 rounded-lg bg-surface border border-line text-slate-200 hover:border-cyan-500/40 font-mono text-xs"
            >
              Back to Email Connections
            </Link>
          </div>
        </section>
      )}

      {(error || result?.status === "DENIED" || result?.status === "EXPIRED") && (
        <Link
          href="/email/connectors/setup"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold"
        >
          Start setup again
        </Link>
      )}
    </div>
  );
}

export default function EmailConnectorCallbackPage() {
  return (
    <Suspense fallback={<EmailLoadingNotice label="Loading consent response…" />}>
      <ConnectorCallbackInner />
    </Suspense>
  );
}
