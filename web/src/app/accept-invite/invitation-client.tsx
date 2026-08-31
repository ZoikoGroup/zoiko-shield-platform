"use client";

import { ArrowRight, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  InvitationShell,
  styles,
} from "@/components/invitation/invitation-shell";
import {
  responseMessage,
  shieldApiUrl,
} from "@/components/invitation/shield-api";

type Invitation = {
  tenant: { id: string; name: string; slug: string; status: "PROVISIONING" };
  environment: { id: string; name: string; type: string; region: string };
  owner: { email: string; authentication: "ZOIKOID" };
  accessDisclosure: { version: string; contentHash: string; content: string };
  identityProviders: Array<{
    id: string;
    name: "ZoikoID";
    protocol: "OIDC";
  }>;
  expiresAt: string;
};

export function InvitationClient({ token }: { token: string | null }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [starting, setStarting] = useState(false);
  const visibleError =
    error ?? (token ? null : "This invitation link does not include a token.");

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void fetch(
      `${shieldApiUrl}/api/v1/auth/owner-invitations/${encodeURIComponent(token)}`,
      { credentials: "include", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        return response.json() as Promise<Invitation>;
      })
      .then(setInvitation)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Invitation could not be loaded.",
        );
      });
    return () => controller.abort();
  }, [token]);

  async function continueWithZoikoId() {
    if (!token || !invitation || !accepted || starting) return;
    setStarting(true);
    setError(null);
    try {
      const provider = invitation.identityProviders[0];
      const response = await fetch(
        `${shieldApiUrl}/api/v1/auth/owner-invitations/${encodeURIComponent(token)}/start`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identityProviderId: provider.id,
            accessDisclosureVersion: invitation.accessDisclosure.version,
            accessDisclosureAccepted: true,
            returnTo: "/invitation-complete",
          }),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = (await response.json()) as { authorizationUrl: string };
      window.location.assign(result.authorizationUrl);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "ZoikoID sign-in could not be started.",
      );
      setStarting(false);
    }
  }

  return (
    <InvitationShell
      title="Activate your tenant securely"
      subtitle="Review the tenant and access disclosure, then confirm your identity through ZoikoID. No ZoikoShield password is created."
    >
      <div className={styles.body}>
        <main className={styles.main}>
          {!invitation && !visibleError ? (
            <div className={styles.loading}>
              <div>
                <div className={styles.spinner} />
                Verifying your single-use invitation…
              </div>
            </div>
          ) : null}

          {visibleError ? (
            <div className={styles.error} role="alert">
              <h2>We could not continue</h2>
              <p>{visibleError}</p>
            </div>
          ) : null}

          {invitation ? (
            <>
              <h2 className={styles.sectionTitle}>Invitation details</h2>
              <div className={styles.details}>
                <Detail label="Tenant" value={invitation.tenant.name} />
                <Detail label="Invited owner" value={invitation.owner.email} />
                <Detail
                  label="Environment"
                  value={`${invitation.environment.name} · ${invitation.environment.region}`}
                />
                <Detail
                  label="Identity provider"
                  value={`${invitation.identityProviders[0].name} · ${invitation.identityProviders[0].protocol}`}
                />
              </div>

              <div className={styles.disclosure}>
                <div className={styles.disclosureHeader}>
                  <strong>Access disclosure</strong>
                  <span className={styles.version}>
                    Version {invitation.accessDisclosure.version}
                  </span>
                </div>
                <p className={styles.disclosureText}>
                  {invitation.accessDisclosure.content}
                </p>
                <code className={styles.hash}>
                  SHA-256: {invitation.accessDisclosure.contentHash}
                </code>
              </div>

              <label className={styles.consent}>
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                <span>
                  I have read and accept this exact access disclosure for{" "}
                  {invitation.tenant.name}.
                </span>
              </label>

              <button
                type="button"
                className={styles.button}
                disabled={!accepted || starting}
                onClick={continueWithZoikoId}
              >
                {starting ? "Opening ZoikoID…" : "Continue with ZoikoID"}
                {!starting ? <ArrowRight size={17} /> : null}
              </button>
            </>
          ) : null}
        </main>

        <aside className={styles.aside}>
          <h2 className={styles.sectionTitle}>What happens next</h2>
          <div className={styles.steps}>
            <Step
              number="01"
              title="Review invitation"
              text="Confirm the tenant, owner destination, and pinned disclosure."
            />
            <Step
              number="02"
              title="Authenticate"
              text="ZoikoID verifies your identity, email, and required MFA."
            />
            <Step
              number="03"
              title="Activate tenant"
              text="Shield links your ZoikoID subject, activates membership, and records evidence."
            />
          </div>
          <div
            className={styles.disclosure}
            style={{ marginTop: 30, marginBottom: 0 }}
          >
            <div className={styles.eyebrow}>
              <Building2 size={14} /> Bound context
            </div>
            <p className={styles.disclosureText}>
              The token fixes the tenant, principal, owner role, and policy
              version. None can be selected during sign-in.
            </p>
          </div>
        </aside>
      </div>
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

function Step({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className={styles.step}>
      <span className={styles.stepNumber}>{number}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
