"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { useDemoState } from "@/lib/demo-state";
import { useContractSources, sourceList } from "@/lib/contract-state";
import { ContractSurface, UnbackedField } from "@/components/contracts/ContractSurface";

/**
 * W37 — Developer surface.
 *
 * API/OAuth lifecycle, scopes, rotation, webhook signing/test/replay, usage,
 * rate limits and sandbox separation.
 *
 * The credential facts are the ones worth getting right. shield-core stores
 * only a hash and a fingerprint of a client secret — the raw value is
 * returned once at creation and never again — so this surface can show which
 * credential version is live, when it was issued and what it expires, without
 * ever being able to leak one. Rotation is shown as overlapping versions
 * rather than a single "rotate" button outcome, because the window where an
 * old secret is RETIRING and a new one is ACTIVE is exactly when an
 * integration breaks.
 *
 * Usage is the weak requirement here and is labelled as such: last_used_at is
 * the only usage fact recorded per client, so this surface can say whether a
 * credential is live but not how much it is used.
 */

/** Documented in ApiRateLimitGuard; compile-time constants, not served. */
const RATE_LIMIT = {
  maxRequestsPerClient: 120,
  windowSeconds: 60,
  limitation:
    "In-memory and single-process. A multi-instance deployment does not share these counters, so the effective limit is per instance.",
};

type Credential = {
  id: string;
  secret_version: number;
  fingerprint: string;
  status: string;
  issued_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
};

type ScopeGrant = {
  id: string;
  scope: string;
  environment_id?: string | null;
  granted_by: string;
  authorization_decision_id: string;
  effective_from: string;
  expires_at?: string | null;
  revoked_at?: string | null;
};

type ApiClient = {
  id: string;
  name: string;
  client_id: string;
  principal_id: string;
  status: string;
  environment_scope?: string | null;
  purpose: string;
  created_by: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  created_at: string;
  credentials?: Credential[];
  scopeGrants?: ScopeGrant[];
};

type WebhookSubscription = {
  id: string;
  endpoint_url: string;
  event_types: string;
  payload_version: string;
  data_minimization_profile: string;
  status: string;
  created_by: string;
  verified_at?: string | null;
  suspended_at?: string | null;
  created_at: string;
};

type WebhookDelivery = {
  id: string;
  event_id: string;
  event_type: string;
  payload_version: string;
  payload_hash: string;
  status: string;
  attempt_count: number;
  last_attempt_at?: string | null;
  delivered_at?: string | null;
  response_status?: number | null;
  replay_of_delivery_id?: string | null;
  correlation_id: string;
  created_at: string;
};

function parseJsonArray(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function clientStatusVariant(status: string) {
  if (status === "ACTIVE") return "healthy" as const;
  if (status === "SUSPENDED") return "medium" as const;
  if (status === "REVOKED" || status === "EXPIRED") return "critical" as const;
  return "pending" as const;
}

function Section({
  title,
  requirement,
  count,
  children,
}: {
  title: string;
  requirement: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card variant="cyber" className="p-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-slate-800 pb-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <p className="text-[11px] font-mono text-slate-500">{requirement}</p>
        </div>
        {count !== undefined && (
          <span className="font-mono text-lg text-slate-200">{count}</span>
        )}
      </div>
      {children}
    </Card>
  );
}

export default function DeveloperSurfacePage() {
  const specs = useMemo(
    () => [
      { key: "clients", label: "API clients", path: "/api/v1/api-clients" },
      { key: "webhooks", label: "Webhook subscriptions", path: "/api/v1/webhooks" },
    ],
    [],
  );
  const evidence = useContractSources(specs);

  const clients = sourceList<ApiClient>(evidence, "clients");
  const webhooks = sourceList<WebhookSubscription>(evidence, "webhooks");

  // Sandbox separation is only real if clients are actually scoped to an
  // environment; an unscoped client reaches production.
  const unscoped = clients.filter((c) => !c.environment_scope);

  return (
    <ContractSurface
      contractId="W37"
      title="Developer surface"
      purpose="API and OAuth client lifecycle, scopes, credential rotation, webhook signing, test and replay, usage, rate limits and sandbox separation."
      evidence={evidence}
    >
      <div className="space-y-4">
        <Section
          title="API clients"
          requirement="Lifecycle, purpose, environment scope and last use for every credential that can reach this tenant's data."
          count={clients.length}
        >
          {clients.length === 0 ? (
            <p className="text-xs font-mono text-slate-400">
              No API clients exist for this tenant. Nothing can currently authenticate
              against the public API on its behalf.
            </p>
          ) : (
            <div className="space-y-3">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="rounded border border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={clientStatusVariant(client.status)}>
                      {client.status}
                    </Badge>
                    <span className="text-xs font-semibold text-slate-100">
                      {client.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 break-all">
                      {client.client_id}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{client.purpose}</p>

                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div>
                      <p className="text-[11px] font-mono uppercase text-slate-500">
                        Environment
                      </p>
                      <p
                        className={`font-mono text-[11px] ${client.environment_scope ? "text-slate-300" : "text-amber-300"}`}
                      >
                        {client.environment_scope ?? "unscoped — reaches all environments"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase text-slate-500">
                        Last used
                      </p>
                      <p className="font-mono text-[11px] text-slate-300">
                        {client.last_used_at
                          ? formatTimestamp(client.last_used_at)
                          : "never"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase text-slate-500">
                        Expires
                      </p>
                      <p className="font-mono text-[11px] text-slate-300">
                        {client.expires_at
                          ? formatTimestamp(client.expires_at)
                          : "no expiry set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-mono uppercase text-slate-500">
                        Created by
                      </p>
                      <p className="font-mono text-[11px] text-slate-300">
                        {client.created_by}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2">
                    <p className="text-[11px] font-mono uppercase text-slate-500">
                      Credential versions (rotation)
                    </p>
                    {(client.credentials ?? []).length === 0 ? (
                      <p className="font-mono text-[11px] text-amber-300">
                        No credential has been issued, so this client cannot authenticate.
                      </p>
                    ) : (
                      <table className="mt-1 w-full text-[11px] font-mono">
                        <thead>
                          <tr className="border-b border-slate-800 text-left text-slate-500">
                            <th className="py-1">v</th>
                            <th className="py-1">Fingerprint</th>
                            <th className="py-1">Status</th>
                            <th className="py-1">Issued</th>
                            <th className="py-1">Expires</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(client.credentials ?? []).map((credential) => (
                            <tr
                              key={credential.id}
                              className="border-b border-slate-900 last:border-0"
                            >
                              <td className="py-1 text-slate-300">
                                {credential.secret_version}
                              </td>
                              <td className="py-1 break-all text-slate-400">
                                {truncateHash(credential.fingerprint, 10, 8)}
                              </td>
                              <td
                                className={`py-1 ${credential.status === "ACTIVE" ? "text-emerald-300" : credential.status === "RETIRING" ? "text-amber-300" : "text-slate-500"}`}
                              >
                                {credential.status}
                              </td>
                              <td className="py-1 text-slate-500">
                                {formatTimestamp(credential.issued_at)}
                              </td>
                              <td className="py-1 text-slate-500">
                                {credential.expires_at
                                  ? formatTimestamp(credential.expires_at)
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <p className="mt-1 font-mono text-[11px] text-slate-600">
                      Secrets are stored as a hash and a fingerprint only; the raw value is
                      returned once at issue and cannot be shown again here.
                    </p>
                  </div>

                  <div className="mt-2">
                    <p className="text-[11px] font-mono uppercase text-slate-500">
                      Scopes
                    </p>
                    {(client.scopeGrants ?? []).length === 0 ? (
                      <p className="font-mono text-[11px] text-slate-500">
                        No scope granted — this client can authenticate but reach nothing.
                      </p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {(client.scopeGrants ?? []).map((grant) => {
                          const revoked = Boolean(grant.revoked_at);
                          const expired =
                            grant.expires_at && new Date(grant.expires_at) < new Date();
                          return (
                            <div
                              key={grant.id}
                              className="flex flex-wrap items-center gap-2 font-mono text-[11px]"
                            >
                              <span
                                className={
                                  revoked || expired
                                    ? "text-slate-600 line-through"
                                    : "text-cyan-300"
                                }
                              >
                                {grant.scope}
                              </span>
                              <span className="text-slate-600">
                                {grant.environment_id ?? "all environments"} · granted by{" "}
                                {grant.granted_by} · decision{" "}
                                {truncateHash(grant.authorization_decision_id, 8, 6)}
                                {revoked
                                  ? ` · revoked ${formatTimestamp(grant.revoked_at!)}`
                                  : expired
                                    ? ` · expired ${formatTimestamp(grant.expires_at!)}`
                                    : grant.expires_at
                                      ? ` · until ${formatTimestamp(grant.expires_at)}`
                                      : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Sandbox separation"
          requirement="Whether a credential is confined to a non-production environment."
        >
          {clients.length === 0 ? (
            <p className="text-xs font-mono text-slate-500">No clients to assess.</p>
          ) : unscoped.length === 0 ? (
            <p className="text-xs font-mono text-slate-400">
              All {clients.length} clients are bound to an environment scope.
            </p>
          ) : (
            <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold text-amber-200">
                {unscoped.length} of {clients.length} clients carry no environment scope
              </p>
              <ul className="mt-1 space-y-0.5">
                {unscoped.map((client) => (
                  <li key={client.id} className="font-mono text-[11px] text-amber-300/80">
                    — {client.name} ({client.client_id})
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[11px] text-amber-300/70">
                An unscoped client is a production client. There is no sandbox separation
                for these.
              </p>
            </div>
          )}
        </Section>

        <Section
          title="Webhooks"
          requirement="Signing secret versions, delivery outcomes, test and replay."
          count={webhooks.length}
        >
          {webhooks.length === 0 ? (
            <p className="text-xs font-mono text-slate-400">
              No outbound webhook subscriptions exist for this tenant.
            </p>
          ) : (
            <div className="space-y-3">
              {webhooks.map((subscription) => (
                <WebhookPanel key={subscription.id} subscription={subscription} />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Rate limits"
          requirement="The throughput a client can expect before it is throttled."
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded border border-slate-800 p-2">
              <p className="text-[11px] font-mono uppercase text-slate-500">
                Requests per client
              </p>
              <p className="font-mono text-lg text-slate-200">
                {RATE_LIMIT.maxRequestsPerClient}
              </p>
            </div>
            <div className="rounded border border-slate-800 p-2">
              <p className="text-[11px] font-mono uppercase text-slate-500">Window</p>
              <p className="font-mono text-lg text-slate-200">
                {RATE_LIMIT.windowSeconds}s
              </p>
            </div>
            <div className="rounded border border-slate-800 p-2">
              <p className="text-[11px] font-mono uppercase text-slate-500">
                On exceed
              </p>
              <p className="font-mono text-sm text-slate-200">429 RATE_LIMITED</p>
            </div>
          </div>
          <p className="mt-2 font-mono text-[11px] text-amber-300/80">
            {RATE_LIMIT.limitation}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-600">
            These are compile-time constants in ApiRateLimitGuard, not values served by an
            endpoint — they are reproduced here and will drift if the guard changes.
          </p>
        </Section>

        <Section
          title="Usage"
          requirement="How much of the API each client actually consumes."
        >
          <div className="space-y-2">
            {clients.map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between rounded border border-slate-800 px-2 py-1.5"
              >
                <span className="text-xs text-slate-200">{client.name}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  last used{" "}
                  {client.last_used_at ? formatTimestamp(client.last_used_at) : "never"}
                </span>
              </div>
            ))}
            <UnbackedField
              label="Request volume and quota consumption"
              requirement="ApiClient records only last_used_at. No per-client request counter, quota or usage series is persisted, so this surface can say whether a client is live but not how heavily it is used."
            />
          </div>
        </Section>
      </div>
    </ContractSurface>
  );
}

/**
 * Deliveries are loaded when a subscription is opened rather than up front:
 * the list is per-subscription and up to a hundred rows each, and a developer
 * looking at one integration does not need the others.
 */
function WebhookPanel({ subscription }: { subscription: WebhookSubscription }) {
  const [state] = useDemoState();
  const tenantId = state.tenant?.id ?? "";
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  React.useEffect(() => {
    if (!open || deliveries || error) return;
    void (async () => {
      try {
        const response = await fetch(`/api/v1/webhooks/${subscription.id}/deliveries`, {
          headers: tenantId ? { "x-tenant-id": tenantId } : {},
        });
        if (!response.ok) throw new Error(`Deliveries unavailable (${response.status})`);
        const body = await response.json();
        const rows = Array.isArray(body) ? body : ((body as { data?: unknown })?.data ?? []);
        setDeliveries(Array.isArray(rows) ? (rows as WebhookDelivery[]) : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [open, subscription.id, tenantId, deliveries, error]);

  const eventTypes = parseJsonArray(subscription.event_types);
  const failed = (deliveries ?? []).filter(
    (d) => d.status === "FAILED" || d.status === "DEAD_LETTERED",
  );

  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            subscription.status === "ACTIVE"
              ? "healthy"
              : subscription.status === "DEGRADED"
                ? "medium"
                : subscription.status === "REVOKED"
                  ? "critical"
                  : "pending"
          }
        >
          {subscription.status}
        </Badge>
        <span className="font-mono text-xs text-slate-200 break-all">
          {subscription.endpoint_url}
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-slate-500">
        payload v{subscription.payload_version} · minimization{" "}
        {subscription.data_minimization_profile} ·{" "}
        {subscription.verified_at
          ? `verified ${formatTimestamp(subscription.verified_at)}`
          : "never verified"}
      </p>
      {eventTypes.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {eventTypes.map((type) => (
            <span
              key={type}
              className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-400"
            >
              {type}
            </span>
          ))}
        </div>
      )}

      <details
        className="mt-2 rounded border border-slate-800"
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer px-2 py-1 font-mono text-[11px] text-slate-400 hover:text-slate-200">
          deliveries, signing and replay
        </summary>
        <div className="space-y-2 px-2 pb-2">
          {error && <p className="font-mono text-[11px] text-rose-300">{error}</p>}
          {!error && !deliveries && (
            <p className="font-mono text-[11px] text-slate-500">reading…</p>
          )}
          {deliveries && deliveries.length === 0 && (
            <p className="font-mono text-[11px] text-slate-500">
              No delivery has been attempted to this endpoint — including no test
              delivery, so the signature has never been verified end to end.
            </p>
          )}
          {deliveries && deliveries.length > 0 && (
            <>
              {failed.length > 0 && (
                <p className="font-mono text-[11px] text-amber-300">
                  {failed.length} of {deliveries.length} recent deliveries failed or were
                  dead-lettered.
                </p>
              )}
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-slate-500">
                    <th className="py-1">Event</th>
                    <th className="py-1">Status</th>
                    <th className="py-1">Attempts</th>
                    <th className="py-1">Payload hash</th>
                    <th className="py-1">Last attempt</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.slice(0, 25).map((delivery) => (
                    <tr
                      key={delivery.id}
                      className="border-b border-slate-900 last:border-0"
                    >
                      <td className="py-1 text-slate-300">
                        {delivery.event_type}
                        {delivery.replay_of_delivery_id && (
                          <span className="text-cyan-400"> (replay)</span>
                        )}
                      </td>
                      <td
                        className={`py-1 ${delivery.status === "DELIVERED" ? "text-emerald-300" : delivery.status === "PENDING" || delivery.status === "DELIVERING" ? "text-slate-400" : "text-rose-300"}`}
                      >
                        {delivery.status}
                        {delivery.response_status ? ` ${delivery.response_status}` : ""}
                      </td>
                      <td className="py-1 text-slate-400">{delivery.attempt_count}</td>
                      <td className="py-1 break-all text-slate-500">
                        {truncateHash(delivery.payload_hash, 8, 6)}
                      </td>
                      <td className="py-1 text-slate-500">
                        {delivery.last_attempt_at
                          ? formatTimestamp(delivery.last_attempt_at)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="font-mono text-[11px] text-slate-600">
                Each delivery is signed with the subscription&apos;s current secret
                version and carries a payload hash, so a receiver can verify what it was
                sent. Replays reference the delivery they repeat rather than being
                indistinguishable from a first attempt.
              </p>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
