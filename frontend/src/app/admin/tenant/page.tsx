"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  Database,
  KeyRound,
  Lock,
  RefreshCw,
  Scale,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { DataProvenanceBadge } from "@/components/states/mandatory-ui-states";
import { resolvePolicyPackForRegion, resolveRegionMetadata } from "@/lib/assurance-primitives";
import { asList, backend } from "@/lib/backend";
import { customerApi, ServiceHealthReport, Tenant, timeAgo } from "@/lib/customer-api";

/**
 * Tenant administrator dashboard. Every figure is read from shield-core; the
 * only fixed content is the region → policy-pack mapping, which is
 * configuration, and is labelled as such.
 */

type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };
async function settle<T>(p: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface Member {
  id: string;
  principalId: string;
  status: string;
  joinedAt: string;
  roles?: Array<{ code: string; name: string }>;
}
interface Invitation {
  id: string;
  invitedEmail?: string;
  status?: string;
  expiresAt?: string;
}
interface LegalHold {
  id: string;
  reason?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
}
interface FreezeStatus {
  frozen: boolean;
  status: string;
  freeze: { reason?: string; frozen_at?: string; frozenAt?: string } | null;
}

interface AdminData {
  tenant: Loaded<Tenant>;
  members: Loaded<Member[]>;
  invitations: Loaded<Invitation[]>;
  identityProviders: Loaded<unknown[]>;
  jitAudit: Loaded<unknown[]>;
  legalHolds: Loaded<LegalHold[]>;
  health: Loaded<ServiceHealthReport>;
  freeze: Loaded<FreezeStatus>;
}

async function loadAdmin(): Promise<AdminData> {
  const me = await customerApi.session();
  const t = encodeURIComponent(me.tenantId);
  const [tenant, members, invitations, identityProviders, jitAudit, legalHolds, health, freeze] = await Promise.all([
    settle(customerApi.tenant()),
    settle(backend.get<unknown>(`/api/v1/tenants/${t}/members`).then((v) => asList<Member>(v))),
    settle(backend.get<unknown>(`/api/v1/tenants/${t}/invitations`).then((v) => asList<Invitation>(v))),
    settle(backend.get<unknown>(`/api/v1/tenants/${t}/identity-providers`).then((v) => asList<unknown>(v))),
    settle(backend.get<unknown>(`/api/v1/tenants/${t}/jit-audit`).then((v) => asList<unknown>(v))),
    settle(backend.get<unknown>(`/api/v1/tenants/${t}/offboarding/legal-holds`).then((v) => asList<LegalHold>(v))),
    settle(customerApi.serviceHealth()),
    settle(backend.get<FreezeStatus>("/api/v1/response/freeze-status")),
  ]);
  return { tenant, members, invitations, identityProviders, jitAudit, legalHolds, health, freeze };
}

function Card({ title, icon, children, href, linkText }: { title: string; icon: React.ReactNode; children: React.ReactNode; href?: string; linkText?: string }) {
  return (
    <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{title}</span>
        {icon}
      </div>
      {children}
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 pt-1">
          <span>{linkText}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

function Err({ what, error }: { what: string; error: string }) {
  return (
    <div role="alert" className="text-[11px] text-red-300">
      Could not load {what}: {error}
    </div>
  );
}

const humanize = (s: string | null | undefined) =>
  (s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export default function TenantAdministratorDashboardPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [freezeReason, setFreezeReason] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setData(await loadAdmin());
      setLoadError(null);
      setLoadedAt(new Date());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleFreeze = async (frozen: boolean) => {
    setNotice(null);
    setBusy(true);
    try {
      if (frozen) {
        await backend.post("/api/v1/response/unfreeze", {});
        setNotice({ kind: "ok", text: "Automated response resumed." });
      } else {
        if (freezeReason.trim().length < 3) {
          setNotice({ kind: "error", text: "Give a reason for freezing automated response." });
          return;
        }
        await backend.post("/api/v1/response/freeze", { reason: freezeReason.trim() });
        setFreezeReason("");
        setNotice({ kind: "ok", text: "Automated response frozen for this workspace." });
      }
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const tenant = data?.tenant.ok ? data.tenant.value : null;
  const region = tenant?.dataResidencyRegion || tenant?.homeRegion || "";
  const regionMeta = region ? resolveRegionMetadata(region) : null;
  const pack = region ? resolvePolicyPackForRegion(region) : null;

  return (
    <div className="p-6 space-y-6 bg-[#060e1a] min-h-full text-slate-100">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-[11px] font-mono text-cyan-300 mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>TENANT ADMINISTRATOR DASHBOARD</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Tenant Administration &amp; Governance Control Plane</h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {tenant ? (
              <>
                Workspace <span className="font-mono text-slate-200">{tenant.name}</span>
                {regionMeta && (
                  <>
                    {" "}• Data residency <span className="font-mono text-cyan-300">{regionMeta.displayName}</span>
                  </>
                )}
              </>
            ) : (
              "Loading workspace…"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/customer/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950/50 hover:bg-red-950/80 border border-red-500/40 text-xs font-semibold text-red-200 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-red-400" />
            <span>Switch to Customer Dashboard</span>
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            aria-label="Refresh"
            className="p-2 rounded-xl bg-[#0a1628] hover:bg-[#102036] border border-slate-800 text-slate-300 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
          <DataProvenanceBadge
            provenance={loadError ? "UNAVAILABLE" : "VERIFIED_BACKEND"}
            asOf={loadedAt ? loadedAt.toUTCString().replace("GMT", "UTC") : "not loaded"}
            sourceService="shield-core"
          />
        </div>
      </div>

      {loadError && <Err what="this workspace" error={loadError} />}
      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`rounded-xl px-4 py-3 text-xs border ${
            notice.kind === "ok" ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200" : "bg-red-950/40 border-red-500/40 text-red-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card title="Members & Access" icon={<Users className="w-4 h-4 text-emerald-400" />} href="/customer/settings" linkText="Manage members">
              {data.members.ok ? (
                <div className="text-xl font-bold text-white">{data.members.value.filter((m) => m.status === "ACTIVE").length} active members</div>
              ) : (
                <Err what="members" error={data.members.error} />
              )}
              <div className="text-[11px] text-slate-300">
                {data.invitations.ok ? `${data.invitations.value.filter((i) => !i.status || i.status === "PENDING").length} pending invitations` : ""}
                {data.identityProviders.ok ? ` • ${data.identityProviders.value.length} SSO providers` : ""}
              </div>
            </Card>

            <Card title="Connectors" icon={<KeyRound className="w-4 h-4 text-sky-400" />} href="/customer/integrations" linkText="Manage integrations">
              {data.health.ok ? (
                <>
                  <div className="text-xl font-bold text-white">
                    {data.health.value.connectorHealth.healthy} / {data.health.value.connectorHealth.total} healthy
                  </div>
                  <div className="text-[11px] text-slate-300">Overall: {humanize(data.health.value.overallHealth)}</div>
                </>
              ) : (
                <Err what="connector health" error={data.health.error} />
              )}
            </Card>

            <Card title="Automated Response (SOAR)" icon={<ShieldCheck className="w-4 h-4 text-amber-400" />}>
              {data.freeze.ok ? (
                <>
                  <div className="text-xl font-bold text-white">{data.freeze.value.frozen ? "FROZEN" : "ACTIVE"}</div>
                  {data.freeze.value.frozen && data.freeze.value.freeze?.reason && (
                    <div className="text-[11px] text-slate-300">Reason: {data.freeze.value.freeze.reason}</div>
                  )}
                  {!data.freeze.value.frozen && (
                    <input
                      aria-label="Freeze reason"
                      value={freezeReason}
                      onChange={(e) => setFreezeReason(e.target.value)}
                      placeholder="Reason for freezing"
                      className="w-full rounded-lg bg-[#071020] border border-slate-700 px-2 py-1 text-xs text-slate-200"
                    />
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleFreeze(data.freeze.ok && data.freeze.value.frozen)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold border disabled:opacity-50 ${
                      data.freeze.value.frozen
                        ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300"
                        : "bg-rose-600/20 border-rose-500/40 text-rose-300"
                    }`}
                  >
                    {data.freeze.value.frozen ? "Resume automated response" : "Freeze automated response"}
                  </button>
                </>
              ) : (
                <Err what="freeze status" error={data.freeze.error} />
              )}
            </Card>

            <Card title="Legal Holds" icon={<Scale className="w-4 h-4 text-violet-400" />} href="/evidence-operations" linkText="Evidence operations">
              {data.legalHolds.ok ? (
                <div className="text-xl font-bold text-white">
                  {data.legalHolds.value.filter((h) => !h.status || h.status === "ACTIVE").length} active legal holds
                </div>
              ) : (
                <Err what="legal holds" error={data.legalHolds.error} />
              )}
            </Card>
          </div>

          <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-5 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" /> Tenant Residency Configuration
            </h2>
            {!tenant ? (
              data.tenant.ok ? null : <Err what="workspace" error={data.tenant.error} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  {(
                    [
                      ["Home region", tenant.homeRegion],
                      ["Data residency region", region],
                      ["Jurisdiction", regionMeta?.countryName ?? "—"],
                      ["Data class", humanize(tenant.dataClass)],
                      ["Retention policy", tenant.retentionPolicyRef],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <span className="text-slate-400">{k}</span>
                      <span className="text-slate-200 text-right font-mono">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-[#071020] border border-slate-800 p-3 space-y-1">
                  <div className="text-slate-300 font-semibold">Policy pack for {region}</div>
                  {pack ? (
                    <>
                      <div className="text-slate-200">
                        {pack.name} (v{pack.version})
                      </div>
                      <div className="text-slate-400">
                        Retention {pack.retention_limits.min_statutory_days}–{pack.retention_limits.max_retention_days} days • {pack.authority_reference}
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-400">No policy pack is defined for this region.</div>
                  )}
                  <p className="text-[11px] text-slate-500 pt-1">
                    This is the configured residency commitment. Per-subsystem residency evidence is produced internally and is not
                    yet available on this page.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Members</span>
              </div>
              {!data.members.ok ? (
                <Err what="members" error={data.members.error} />
              ) : data.members.value.length === 0 ? (
                <div className="text-xs text-slate-400">No members.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-800">
                      <th className="py-1.5 pr-2">Principal</th>
                      <th className="py-1.5 pr-2">Roles</th>
                      <th className="py-1.5 pr-2">Status</th>
                      <th className="py-1.5">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.value.map((m) => (
                      <tr key={m.id} className="border-b border-slate-800/60">
                        <td className="py-1.5 pr-2 font-mono text-slate-300">{m.principalId.slice(0, 8)}…</td>
                        <td className="py-1.5 pr-2 text-slate-200">{(m.roles ?? []).map((r) => r.name).join(", ") || "—"}</td>
                        <td className="py-1.5 pr-2 text-slate-300">{humanize(m.status)}</td>
                        <td className="py-1.5 text-slate-400">{timeAgo(m.joinedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>Privileged Access (JIT) Audit</span>
              </div>
              {!data.jitAudit.ok ? (
                <Err what="JIT audit" error={data.jitAudit.error} />
              ) : (
                <div className="text-xs text-slate-300">
                  {data.jitAudit.value.length === 0
                    ? "No operator elevations recorded for this workspace."
                    : `${data.jitAudit.value.length} operator elevation records. See Identity & Access for details.`}
                </div>
              )}
              <Link href="/customer/identity-access" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300">
                <span>Identity &amp; Access</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <div className="pt-2 border-t border-slate-800 flex items-center gap-2 text-sm font-bold text-white">
                <Database className="w-4 h-4 text-sky-400" />
                <span>Ingestion &amp; Replay</span>
              </div>
              <Link href="/ingestion" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300">
                <span>Open Ingestion Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
