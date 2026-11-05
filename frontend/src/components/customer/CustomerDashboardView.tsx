"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Cpu,
  Crosshair,
  FileText,
  LayoutGrid,
  Lock,
  Network,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";
import { DataProvenanceBadge } from "@/components/states/mandatory-ui-states";
import {
  CustomerViewMode,
  DataProvenanceState,
  resolvePolicyPackForRegion,
  resolveRegionMetadata,
  resolveRetentionScheduleFromPolicyPack,
} from "@/lib/assurance-primitives";
import {
  Alert,
  Asset,
  AssuranceReport,
  Case,
  ComplianceSummary,
  DetectionDefinition,
  Finding,
  FindingSummary,
  PortalSummary,
  SecurityReport,
  ServiceHealthReport,
  Severity,
  Tenant,
  customerApi,
  percent,
  timeAgo,
} from "@/lib/customer-api";

/**
 * Customer dashboard: every figure on this page is read from shield-core.
 * A source that fails shows its own error; one with no rows shows an empty
 * state. Nothing is filled in on the client.
 */

type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

interface DashboardData {
  tenant: Loaded<Tenant>;
  alerts: Loaded<Alert[]>;
  cases: Loaded<Case[]>;
  findings: Loaded<Finding[]>;
  findingSummary: Loaded<FindingSummary>;
  security: Loaded<SecurityReport>;
  assurance: Loaded<AssuranceReport>;
  health: Loaded<ServiceHealthReport>;
  compliance: Loaded<ComplianceSummary>;
  assets: Loaded<Asset[]>;
  detections: Loaded<DetectionDefinition[]>;
  portal: Loaded<PortalSummary>;
}

async function settle<T>(p: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadDashboard(): Promise<DashboardData> {
  const [tenant, alerts, cases, findings, findingSummary, security, assurance, health, compliance, assets, detections, portal] =
    await Promise.all([
      settle(customerApi.tenant()),
      settle(customerApi.alerts(100)),
      settle(customerApi.cases(100)),
      settle(customerApi.findings({ limit: 200 })),
      settle(customerApi.findingSummary()),
      settle(customerApi.securityReport()),
      settle(customerApi.assuranceReport()),
      settle(customerApi.serviceHealth()),
      settle(customerApi.complianceSummary()),
      settle(customerApi.assets(500)),
      settle(customerApi.detectionDefinitions()),
      settle(customerApi.portalSummary()),
    ]);
  return { tenant, alerts, cases, findings, findingSummary, security, assurance, health, compliance, assets, detections, portal };
}

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const severityRank = (s: string) => {
  const i = SEVERITY_ORDER.indexOf(s as Severity);
  return i === -1 ? SEVERITY_ORDER.length : i;
};

const CLOSED_CASE_STATUSES = new Set(["RESOLVED", "CLOSED", "CANCELLED"]);
const CLOSED_ALERT_STATUSES = new Set(["CLOSED", "FALSE_POSITIVE", "DUPLICATE", "SUPPRESSED", "ESCALATED_TO_CASE", "RESOLVED"]);
const CLOSED_FINDING_STATUSES = new Set(["RESOLVED", "FALSE_POSITIVE", "ACCEPTED"]);

/** Mirrors ALLOWED_TRANSITIONS in shield-core's alert state machine; the backend enforces it. */
const ALERT_TRANSITIONS: Record<string, string[]> = {
  NEW: ["ACKNOWLEDGED", "SUPPRESSED", "FALSE_POSITIVE", "DUPLICATE"],
  ACKNOWLEDGED: ["TRIAGED", "SUPPRESSED", "FALSE_POSITIVE", "DUPLICATE"],
  TRIAGED: ["ESCALATED_TO_CASE", "FALSE_POSITIVE", "DUPLICATE", "CLOSED"],
  ESCALATED_TO_CASE: ["CLOSED"],
  FALSE_POSITIVE: ["CLOSED"],
  DUPLICATE: ["CLOSED"],
  SUPPRESSED: ["CLOSED"],
  CLOSED: [],
};

const FINDING_TYPE_LABEL: Record<string, string> = {
  VULNERABILITY: "Vulnerabilities",
  MISCONFIGURATION: "Misconfigurations",
  EXPOSURE: "Exposures",
  WEAKNESS: "Weaknesses",
};

const humanize = (s: string | null | undefined) =>
  (s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

function severityPill(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-950/80 border border-red-500/50 text-red-300";
    case "HIGH":
      return "bg-orange-950/80 border border-orange-500/50 text-orange-300";
    case "MEDIUM":
      return "bg-amber-950/80 border border-amber-500/50 text-amber-300";
    default:
      return "bg-sky-950/80 border border-sky-500/50 text-sky-300";
  }
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r) || "UNKNOWN";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ---------- small presentational pieces ----------

function Panel({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SourceError({ what, error }: { what: string; error: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
      Could not load {what}: {error}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-400 text-center">{children}</div>;
}

function KpiCard({
  label,
  value,
  detail,
  href,
  linkText,
  tone,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  href: string;
  linkText: string;
  tone: "red" | "sky" | "amber" | "emerald";
  icon: React.ReactNode;
}) {
  const toneCls = {
    red: "bg-red-950/70 border-red-500/40",
    sky: "bg-sky-950/70 border-sky-500/40",
    amber: "bg-amber-950/70 border-amber-500/40",
    emerald: "bg-emerald-950/70 border-emerald-500/40",
  }[tone];
  return (
    <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 shadow-xl flex flex-col justify-between">
      <div className="flex items-start gap-3.5">
        <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${toneCls}`}>{icon}</div>
        <div>
          <div className="text-xs font-semibold text-slate-300">{label}</div>
          <div className="text-3xl font-extrabold text-white mt-0.5">{value}</div>
          {detail && <div className="text-xs text-slate-400 mt-1">{detail}</div>}
        </div>
      </div>
      <div className="mt-3 pt-1">
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors">
          <span>{linkText}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Bar({ label, count, total, colorCls }: { label: string; count: number; total: number; colorCls: string }) {
  const pct = percent(count, total) ?? 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span className="text-slate-400">
          {count} <span className="text-slate-500">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${colorCls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-[#071120] border border-slate-800 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xl font-bold text-white mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

// ---------- page ----------

interface PriorityItem {
  key: string;
  title: string;
  severity: string;
  source: string;
  href: string;
  at: string;
}

export function CustomerDashboardView() {
  const [viewMode, setViewMode] = useState<CustomerViewMode>("EXECUTIVE_VIEW");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [alertActionError, setAlertActionError] = useState<string | null>(null);
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setData(await loadDashboard());
      setLoadedAt(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changeAlertStatus = async (alert: Alert, status: string) => {
    setAlertActionError(null);
    setPendingAlertId(alert.id);
    try {
      await customerApi.updateAlertStatus(alert.id, status);
      await refresh();
    } catch (err) {
      setAlertActionError(`${alert.title}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPendingAlertId(null);
    }
  };

  const derived = useMemo(() => {
    if (!data) return null;
    const alerts = data.alerts.ok ? data.alerts.value : [];
    const cases = data.cases.ok ? data.cases.value : [];
    const findings = data.findings.ok ? data.findings.value : [];
    const openCases = cases.filter((c) => !CLOSED_CASE_STATUSES.has(c.status));
    const openAlerts = alerts.filter((a) => !CLOSED_ALERT_STATUSES.has(a.status));
    const openFindings = findings.filter((f) => !CLOSED_FINDING_STATUSES.has(f.status));

    const priority: PriorityItem[] = [
      ...openCases
        .filter((c) => c.severity === "CRITICAL" || c.severity === "HIGH")
        .map((c) => ({ key: `case-${c.id}`, title: `Review case: ${c.title}`, severity: c.severity, source: "Case", href: "/customer/threats-incidents", at: c.created_at })),
      ...openAlerts
        .filter((a) => (a.severity === "CRITICAL" || a.severity === "HIGH") && a.status === "NEW")
        .map((a) => ({ key: `alert-${a.id}`, title: `Triage alert: ${a.title}`, severity: a.severity, source: "Alert", href: "/customer/threats-incidents", at: a.created_at })),
      ...openFindings
        .filter((f) => f.severity === "CRITICAL")
        .map((f) => ({
          key: `finding-${f.id}`,
          title: `Remediate: ${f.title}`,
          severity: f.severity,
          source: FINDING_TYPE_LABEL[f.finding_type] ? humanize(f.finding_type) : "Finding",
          href: f.finding_type === "VULNERABILITY" ? "/customer/vulnerabilities" : "/customer/exposure-management",
          at: f.first_detected_at,
        })),
    ]
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.at.localeCompare(a.at))
      .slice(0, 6);

    const recentAlerts = [...alerts]
      .filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8);

    return {
      alerts,
      cases,
      openCases,
      openAlerts,
      priority,
      recentAlerts,
      alertsByStatus: countBy(alerts, (a) => a.status),
      alertsByCoverage: countBy(openAlerts, (a) => a.coverage_state),
      criticalOpenCases: openCases.filter((c) => c.severity === "CRITICAL").length,
    };
  }, [data]);

  const tenant = data?.tenant.ok ? data.tenant.value : null;
  const residencyRegion = tenant?.dataResidencyRegion || tenant?.homeRegion || "";
  const regionMeta = residencyRegion ? resolveRegionMetadata(residencyRegion) : null;

  const failures = data ? Object.values(data).filter((r) => !r.ok).length : 0;
  const provenance: DataProvenanceState = !data ? "UNAVAILABLE" : failures === Object.keys(data).length ? "UNAVAILABLE" : "VERIFIED_BACKEND";

  const tabBtn = (mode: CustomerViewMode, label: string, sub: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={viewMode === mode}
      onClick={() => setViewMode(mode)}
      className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-left transition-all ${
        viewMode === mode
          ? "bg-gradient-to-r from-[#b91c1c] to-[#991b1b] text-white border border-red-400/50 shadow-[0_0_20px_rgba(220,38,38,0.35)]"
          : "text-slate-300 hover:text-white hover:bg-slate-800/50"
      }`}
    >
      {icon}
      <div className="leading-tight">
        <div className="text-xs font-bold">{label}</div>
        <div className={`text-[10px] ${viewMode === mode ? "text-red-100/90" : "text-slate-400"}`}>{sub}</div>
      </div>
    </button>
  );

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-white leading-tight">Executive Security Overview</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            {tenant ? `${tenant.name} · ` : ""}Your security posture, risks, and key insights at a glance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div role="tablist" aria-label="Customer Dashboard View Modes" className="inline-flex items-center rounded-xl bg-[#0a1628] border border-slate-800 p-1 gap-1 shadow-lg">
            {tabBtn("EXECUTIVE_VIEW", "Executive View", "CISO & Leadership", <UserCircle2 className="w-4 h-4 shrink-0" />)}
            {tabBtn("SOC_VIEW", "SOC View", "Security Operations", <Cpu className="w-4 h-4 shrink-0" />)}
            {tabBtn("ACCOUNT_VIEW", "Account View", "Services & Entitlements", <LayoutGrid className="w-4 h-4 shrink-0" />)}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isRefreshing}
              title="Reload from the backend"
              aria-label="Refresh dashboard"
              className="p-2 rounded-xl bg-[#0a1628] hover:bg-[#102036] border border-slate-800 text-slate-300 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
            </button>
            <DataProvenanceBadge
              provenance={provenance}
              asOf={loadedAt ? loadedAt.toUTCString().replace("GMT", "UTC") : "not loaded"}
              sourceService={`shield-core${regionMeta ? ` (${regionMeta.code})` : ""}`}
            />
          </div>
        </div>
      </div>

      {!data && <div className="text-sm text-slate-400">Loading dashboard…</div>}

      {data && failures > 0 && failures < Object.keys(data).length && (
        <div className="text-xs text-amber-300">Some panels could not be loaded; each shows its own error below.</div>
      )}

      {data && derived && viewMode === "EXECUTIVE_VIEW" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              label="Open Findings"
              tone="amber"
              icon={<ShieldAlert className="w-6 h-6 text-amber-400" />}
              value={data.findingSummary.ok ? data.findingSummary.value.metrics.open : "—"}
              detail={
                data.findingSummary.ok
                  ? `${data.findingSummary.value.openBySeverity.HIGH ?? 0} high · ${data.findingSummary.value.metrics.staleAssertions} not re-confirmed`
                  : `Unavailable: ${(data.findingSummary as { error: string }).error}`
              }
              href="/customer/exposure-management"
              linkText="View exposures"
            />
            <KpiCard
              label="Critical Exposures"
              tone="red"
              icon={<AlertTriangle className="w-6 h-6 text-red-400" />}
              value={data.findingSummary.ok ? data.findingSummary.value.openBySeverity.CRITICAL ?? 0 : "—"}
              detail="Open findings rated critical"
              href="/customer/exposure-management"
              linkText="View critical risks"
            />
            <KpiCard
              label="Active Incidents"
              tone="sky"
              icon={<Crosshair className="w-6 h-6 text-sky-400" />}
              value={data.cases.ok ? derived.openCases.length : "—"}
              detail={data.cases.ok ? `${derived.criticalOpenCases} critical` : `Unavailable: ${(data.cases as { error: string }).error}`}
              href="/customer/threats-incidents"
              linkText="Open incidents"
            />
            <KpiCard
              label="Open Alerts"
              tone="emerald"
              icon={<Bell className="w-6 h-6 text-emerald-400" />}
              value={data.security.ok ? data.security.value.metrics.openAlerts : "—"}
              detail={data.security.ok ? `${data.security.value.metrics.criticalAlerts} critical` : `Unavailable: ${(data.security as { error: string }).error}`}
              href="/customer/threats-incidents"
              linkText="Triage alerts"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2">
              <Panel title="Priority Actions" icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}>
                <p className="text-[11px] text-slate-500 mb-2">Open high-severity cases, untriaged critical/high alerts and critical findings, most severe first.</p>
                {!data.cases.ok && <SourceError what="cases" error={data.cases.error} />}
                {!data.alerts.ok && <SourceError what="alerts" error={data.alerts.error} />}
                {!data.findings.ok && <SourceError what="findings" error={data.findings.error} />}
                {derived.priority.length === 0 ? (
                  <Empty>Nothing needs attention right now.</Empty>
                ) : (
                  <ul className="divide-y divide-slate-800">
                    {derived.priority.map((p) => (
                      <li key={p.key} className="py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">{p.title}</div>
                          <div className="text-[11px] text-slate-400">
                            {p.source} · {timeAgo(p.at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${severityPill(p.severity)}`}>{humanize(p.severity)}</span>
                          <Link href={p.href} className="text-xs text-sky-400 hover:text-sky-300">
                            Open
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel title="Findings by Type" icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}>
              {!data.findingSummary.ok ? (
                <SourceError what="finding summary" error={data.findingSummary.error} />
              ) : data.findingSummary.value.metrics.open === 0 ? (
                <Empty>No open findings. Findings appear when a scanner or cloud connector reports them.</Empty>
              ) : (
                <div className="space-y-2.5">
                  {Object.entries(data.findingSummary.value.openByType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <Bar key={type} label={FINDING_TYPE_LABEL[type] ?? humanize(type)} count={count} total={data.findingSummary.ok ? data.findingSummary.value.metrics.open : 0} colorCls="bg-amber-400" />
                    ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2">
              <Panel title="Recent Critical Alerts" icon={<Bell className="w-4 h-4 text-red-400" />}>
                {alertActionError && <SourceError what="the status change" error={alertActionError} />}
                {!data.alerts.ok ? (
                  <SourceError what="alerts" error={data.alerts.error} />
                ) : derived.recentAlerts.length === 0 ? (
                  <Empty>No critical or high alerts.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-800">
                          <th className="py-2 pr-3 font-semibold">Alert</th>
                          <th className="py-2 pr-3 font-semibold">Severity</th>
                          <th className="py-2 pr-3 font-semibold">Raised</th>
                          <th className="py-2 pr-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {derived.recentAlerts.map((a) => {
                          const next = ALERT_TRANSITIONS[a.status] ?? [];
                          return (
                            <tr key={a.id} className="border-b border-slate-800/60">
                              <td className="py-2 pr-3 text-white">{a.title}</td>
                              <td className="py-2 pr-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${severityPill(a.severity)}`}>{humanize(a.severity)}</span>
                              </td>
                              <td className="py-2 pr-3 text-slate-400">{timeAgo(a.created_at)}</td>
                              <td className="py-2 pr-3">
                                {next.length === 0 ? (
                                  <span className="text-slate-300">{humanize(a.status)}</span>
                                ) : (
                                  <select
                                    aria-label={`Status for ${a.title}`}
                                    value=""
                                    disabled={pendingAlertId === a.id}
                                    onChange={(e) => e.target.value && void changeAlertStatus(a, e.target.value)}
                                    className="bg-[#071120] border border-slate-700 rounded-md px-2 py-1 text-slate-200"
                                  >
                                    <option value="">{humanize(a.status)}</option>
                                    {next.map((s) => (
                                      <option key={s} value={s}>
                                        → {humanize(s)}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="Assurance & Compliance" icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}>
              {!data.assurance.ok ? (
                <SourceError what="assurance report" error={data.assurance.error} />
              ) : (
                (() => {
                  const m = data.assurance.value.metrics;
                  const total = m.controlsEffective + m.controlsPartiallyEffective + m.controlsIneffective + m.controlsUnknown;
                  return total === 0 ? (
                    <Empty>No controls assessed yet.</Empty>
                  ) : (
                    <div className="space-y-2.5">
                      <Bar label="Effective" count={m.controlsEffective} total={total} colorCls="bg-emerald-400" />
                      <Bar label="Partially effective" count={m.controlsPartiallyEffective} total={total} colorCls="bg-amber-400" />
                      <Bar label="Ineffective" count={m.controlsIneffective} total={total} colorCls="bg-red-400" />
                      <Bar label="Not yet assessed" count={m.controlsUnknown} total={total} colorCls="bg-slate-500" />
                    </div>
                  );
                })()
              )}
              {data.assurance.ok && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Stat label="Evidence gaps" value={data.assurance.value.metrics.evidenceGapsOpen} />
                  <Stat label="Active exceptions" value={data.assurance.value.metrics.activeExceptions} />
                </div>
              )}
              <div className="mt-3 space-y-1.5">
                {!data.compliance.ok ? (
                  <SourceError what="compliance frameworks" error={data.compliance.error} />
                ) : (
                  Object.entries(data.compliance.value.frameworks).map(([name, fw]) => (
                    <div key={name} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{name}</span>
                      <span className="text-slate-400">
                        {fw.compliantCount}/{fw.totalArticles ?? fw.totalControls ?? "?"} compliant · {humanize(fw.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <Link href="/customer/compliance-risk" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300">
                Compliance & risk <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </Panel>
          </div>

          <Panel title="Asset Inventory" icon={<Server className="w-4 h-4 text-sky-400" />} action={<Link href="/customer/assets-inventory" className="text-xs text-sky-400 hover:text-sky-300">View assets</Link>}>
            {!data.assets.ok ? (
              <SourceError what="assets" error={data.assets.error} />
            ) : data.assets.value.length === 0 ? (
              <Empty>No assets known yet. Assets are added when connectors report them, or manually in Assets & Inventory.</Empty>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Total assets" value={data.assets.value.length} />
                {Object.entries(countBy(data.assets.value, (a) => a.asset_type))
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 2)
                  .map(([type, n]) => (
                    <Stat key={type} label={humanize(type)} value={n} />
                  ))}
                <Stat
                  label="Findings without an asset"
                  value={data.findingSummary.ok ? data.findingSummary.value.metrics.unresolvedAsset : "—"}
                  hint="Open findings not matched to an inventory asset"
                />
              </div>
            )}
          </Panel>
        </div>
      )}

      {data && derived && viewMode === "SOC_VIEW" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {["NEW", "ACKNOWLEDGED", "TRIAGED", "ESCALATED_TO_CASE"].map((s) => (
              <Stat key={s} label={`Alerts ${humanize(s)}`} value={data.alerts.ok ? derived.alertsByStatus[s] ?? 0 : "—"} />
            ))}
          </div>
          {!data.alerts.ok && <SourceError what="alerts" error={data.alerts.error} />}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2">
              <Panel title="Active Scoped Detection Rules & Entity Risk Posture" icon={<Crosshair className="w-4 h-4 text-sky-400" />}>
                {!data.detections.ok ? (
                  <SourceError what="detection rules" error={data.detections.error} />
                ) : data.detections.value.length === 0 ? (
                  <Empty>No detection rules defined.</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-800">
                          <th className="py-2 pr-3 font-semibold">Rule</th>
                          <th className="py-2 pr-3 font-semibold">Category</th>
                          <th className="py-2 pr-3 font-semibold">Status</th>
                          <th className="py-2 pr-3 font-semibold">Versions</th>
                          <th className="py-2 pr-3 font-semibold">Alerts raised</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.detections.value.map((d) => (
                          <tr key={d.id} className="border-b border-slate-800/60">
                            <td className="py-2 pr-3">
                              <div className="text-white">{d.name}</div>
                              <div className="text-[10px] text-slate-500">{d.key}</div>
                            </td>
                            <td className="py-2 pr-3 text-slate-300">{humanize(d.category)}</td>
                            <td className="py-2 pr-3 text-slate-300">{humanize(d.status)}</td>
                            <td className="py-2 pr-3 text-slate-300">{d.versions?.length ?? 0}</td>
                            <td className="py-2 pr-3 text-slate-300">{derived.alerts.filter((a) => a.detection_definition_id === d.id).length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="Pipeline & Service Health" icon={<Network className="w-4 h-4 text-emerald-400" />}>
              {!data.health.ok ? (
                <SourceError what="service health" error={data.health.error} />
              ) : (
                <div className="space-y-1.5 text-xs">
                  {(
                    [
                      ["Overall", data.health.value.overallHealth],
                      ["Connectors healthy", `${data.health.value.connectorHealth.healthy} / ${data.health.value.connectorHealth.total}`],
                      ["AI availability", data.health.value.aiAvailability],
                      ["Action simulation", data.health.value.actionSimulationHealth],
                      ["Evidence ledger", data.health.value.evidenceLedgerHealth],
                      ["Anchoring", data.health.value.anchorHealth],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-400">{k}</span>
                      <span className="text-slate-200">{humanize(String(v))}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-xs">
                <div className="text-slate-400 font-semibold">Open alerts by data coverage</div>
                {derived.openAlerts.length === 0 ? (
                  <div className="text-slate-500">No open alerts.</div>
                ) : (
                  Object.entries(derived.alertsByCoverage).map(([k, n]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-400">{humanize(k)}</span>
                      <span className="text-slate-200">{n}</span>
                    </div>
                  ))
                )}
              </div>
              {data.findingSummary.ok && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-xs">
                  <div className="text-slate-400 font-semibold">Finding freshness</div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Not re-confirmed in time (stale)</span>
                    <span className="text-slate-200">{data.findingSummary.value.metrics.staleAssertions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ageing</span>
                    <span className="text-slate-200">{data.findingSummary.value.metrics.ageingAssertions}</span>
                  </div>
                </div>
              )}
              <div className="mt-3 flex gap-3 text-xs">
                <Link href="/hunting" className="text-sky-400 hover:text-sky-300">
                  Threat hunting
                </Link>
                <Link href="/copilot" className="text-sky-400 hover:text-sky-300">
                  Copilot
                </Link>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {data && viewMode === "ACCOUNT_VIEW" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Panel title="Workspace & Residency" icon={<Lock className="w-4 h-4 text-sky-400" />}>
              {!data.tenant.ok ? (
                <SourceError what="workspace" error={data.tenant.error} />
              ) : (
                <div className="space-y-1.5 text-xs">
                  {(
                    [
                      ["Organization", data.tenant.value.name],
                      ["Workspace", data.tenant.value.slug],
                      ["Status", humanize(data.tenant.value.status)],
                      ["Home region", data.tenant.value.homeRegion],
                      ["Data residency", regionMeta ? `${regionMeta.shortLabel} (${residencyRegion})` : residencyRegion],
                      ["Timezone", data.tenant.value.timezone],
                      ["Data class", humanize(data.tenant.value.dataClass)],
                      ["Created", new Date(data.tenant.value.createdAt).toLocaleDateString()],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <span className="text-slate-400">{k}</span>
                      <span className="text-slate-200 text-right">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Entitlements" icon={<FileText className="w-4 h-4 text-amber-400" />}>
              {!data.portal.ok ? (
                <SourceError what="entitlements" error={data.portal.error} />
              ) : data.portal.value.entitlementsSummary.total === 0 ? (
                <Empty>No entitlements recorded for this workspace yet.</Empty>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {data.portal.value.entitlementsSummary.entitlements.map((e, i) => (
                    <li key={String(e.id ?? i)} className="flex justify-between">
                      <span className="text-slate-200">{String(e.name ?? e.capabilityKey ?? "Entitlement")}</span>
                      <span className="text-slate-400">{humanize(String(e.status ?? ""))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Service Account" icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}>
              {!data.portal.ok ? (
                <SourceError what="account summary" error={data.portal.error} />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Active entitlements" value={data.portal.value.entitlementsSummary.activeCount} />
                  <Stat label="Protected resource types" value={data.portal.value.protectedResourcesSummary.length} />
                  <Stat label="Service obligations" value={data.portal.value.serviceObligationsSummary.total} hint={`${data.portal.value.serviceObligationsSummary.pending} pending`} />
                  <Stat label="Invoices" value={data.portal.value.invoicesSummary.totalInvoices} />
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Contracted Data Class Retention & Legal Hold Schedule" icon={<Lock className="w-4 h-4 text-sky-400" />}>
            {!residencyRegion ? (
              <Empty>Retention schedule shows once the workspace region is known.</Empty>
            ) : (
              (() => {
                const pack = resolvePolicyPackForRegion(residencyRegion);
                const schedule = resolveRetentionScheduleFromPolicyPack(residencyRegion);
                return (
                  <>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Policy pack defaults for {residencyRegion}: {pack.name} (v{pack.version}). These are the configured retention limits, not measured storage.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-800">
                            <th className="py-2 pr-3 font-semibold">Data class</th>
                            <th className="py-2 pr-3 font-semibold">Hot (days)</th>
                            <th className="py-2 pr-3 font-semibold">Warm (days)</th>
                            <th className="py-2 pr-3 font-semibold">Archive (days)</th>
                            <th className="py-2 pr-3 font-semibold">Disposition</th>
                            <th className="py-2 pr-3 font-semibold">Legal hold</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.map((r) => (
                            <tr key={r.dataClass} className="border-b border-slate-800/60">
                              <td className="py-2 pr-3 text-white">{r.label}</td>
                              <td className="py-2 pr-3 text-slate-300">{r.hotDays}</td>
                              <td className="py-2 pr-3 text-slate-300">{r.warmDays}</td>
                              <td className="py-2 pr-3 text-slate-300">{r.coldArchiveDays}</td>
                              <td className="py-2 pr-3 text-slate-300">{humanize(r.deletionDisposition)}</td>
                              <td className="py-2 pr-3 text-slate-300">{r.legalHoldEligible ? "Eligible" : "No"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()
            )}
            <Link href="/audit" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300">
              Audit packages <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Panel>
        </div>
      )}
    </div>
  );
}

export default CustomerDashboardView;
