"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  InvitationShell,
  styles,
} from "@/components/invitation/invitation-shell";
import {
  responseMessage,
  shieldApiUrl,
} from "@/components/invitation/shield-api";

type Session = {
  email: string;
  assurance: string;
  tenantId: string;
  environmentId: string | null;
  region: string;
  sessionState: string;
};

export function CompletionClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${shieldApiUrl}/api/v1/auth/me`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        return response.json() as Promise<Session>;
      })
      .then(setSession)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The new session could not be verified.",
        );
      });
    return () => controller.abort();
  }, []);

  return (
    <InvitationShell
      title="Owner activation complete"
      subtitle="ZoikoID authentication returned successfully. We are confirming the tenant-bound Shield session issued by the callback."
    >
      <main className={styles.main}>
        {!session && !error ? (
          <div className={styles.loading}>
            <div>
              <div className={styles.spinner} />
              Confirming your Shield session…
            </div>
          </div>
        ) : null}
        {error ? (
          <div className={styles.error} role="alert">
            <h2>Session confirmation failed</h2>
            <p>{error}</p>
          </div>
        ) : null}
        {session ? (
          <div className={styles.success}>
            <span className={styles.successIcon}>
              <CheckCircle2 size={38} />
            </span>
            <h2>Your tenant is active</h2>
            <p>
              The owner membership, policy acceptance, external ZoikoID binding,
              and tenant lifecycle state were committed before this session was
              issued.
            </p>
            <div className={styles.sessionGrid}>
              <Detail label="Verified owner" value={session.email} />
              <Detail label="Assurance" value={session.assurance} />
              <Detail label="Region" value={session.region} />
              <Detail label="Session state" value={session.sessionState} />
            </div>
          </div>
        ) : null}
      </main>
    </InvitationShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detail}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}
