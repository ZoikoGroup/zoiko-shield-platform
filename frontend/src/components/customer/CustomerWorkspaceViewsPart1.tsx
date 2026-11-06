"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Search, X } from "lucide-react";
import { asList, backend } from "@/lib/backend";
import {
  customerApi,
  percent,
  timeAgo,
  type Alert,
  type Asset,
  type Case,
  type DetectionDefinition,
  type Finding,
  type IdentityEntity,
  type Severity,
} from "@/lib/customer-api";

/* ============================================================================
 * Shared plumbing
 *
 * Every number, row and action in these sections comes from shield-core. When
 * the backend has nothing, the section says so; when a call fails, the error
 * is shown in place of the data it would have produced.
 * ========================================================================== */

const PAGE =
  "w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5";
const BAR =
  "rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3";
const KPI = "rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl";
const CARD = "rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl";
const INNER = "p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800";
const PILL = "px-2.5 py-0.5 rounded-full text-[11px] font-semibold";
const BTN_SECONDARY =
  "px-3.5 py-1.5 rounded-xl bg-[#0c1829] hover:bg-[#12243d] border border-slate-700/80 text-xs font-semibold text-slate-100 transition-colors disabled:opacity-50";
const BTN_PRIMARY =
  "px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] hover:from-[#ef4444] hover:to-[#dc2626] text-xs font-semibold text-white shadow-[0_0_15px_rgba(220,38,38,0.35)] disabled:opacity-50";
const INPUT =
  "px-3 py-1.5 rounded-xl bg-[#07101e] border border-slate-700 text-xs text-white placeholder:text-slate-500";
const SELECT =
  "appearance-none bg-[#0c1829] border border-slate-700/80 rounded-xl pl-3.5 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer";
const TH = "py-2 px-3 font-medium";
const TD = "py-3 px-3";
const LINK = "text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1";

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const CLOSED_CASE = ["RESOLVED", "CLOSED"];
const CLOSED_ALERT = ["CLOSED", "RESOLVED", "FALSE_POSITIVE", "DUPLICATE", "SUPPRESSED"];
const CLOSED_FINDING = ["RESOLVED", "FALSE_POSITIVE", "ACCEPTED", "CLOSED"];
const STALE_ASSET_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Alert lifecycle, mirroring ALLOWED_TRANSITIONS in shield-core's
 * alert-state-machine.service.ts. ESCALATED_TO_CASE is left out: setting it by
 * hand would claim a case exists when none was created.
 */
const ALERT_NEXT_STATES: Record<string, string[]> = {
  NEW: ["ACKNOWLEDGED", "SUPPRESSED", "FALSE_POSITIVE", "DUPLICATE"],
  ACKNOWLEDGED: ["TRIAGED", "SUPPRESSED", "FALSE_POSITIVE", "DUPLICATE"],
  TRIAGED: ["FALSE_POSITIVE", "DUPLICATE", "CLOSED"],
  ESCALATED_TO_CASE: ["CLOSED"],
  FALSE_POSITIVE: ["CLOSED"],
  DUPLICATE: ["CLOSED"],
  SUPPRESSED: ["CLOSED"],
  CLOSED: [],
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** "MISCONFIGURATION" -> "Misconfiguration", "CLOUD_INFRA" -> "Cloud infra". */
function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "";
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function severityClass(severity: string | null | undefined): string {
  switch ((severity || "").toUpperCase()) {
    case "CRITICAL":
      return "bg-red-950/80 border border-red-500/40 text-red-300";
    case "HIGH":
      return "bg-amber-950/80 border border-amber-500/40 text-amber-300";
    case "MEDIUM":
      return "bg-sky-950/80 border border-sky-500/40 text-sky-300";
    default:
      return "bg-slate-800 border border-slate-700 text-slate-300";
  }
}

function statusClass(status: string | null | undefined): string {
  const s = (status || "").toUpperCase();
  if (["RESOLVED", "CLOSED", "ACTIVE", "COMPLETED", "APPROVED", "PUBLISHED", "SUCCEEDED"].includes(s)) {
    return "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300";
  }
  if (["NEW", "OPEN", "FAILED", "REJECTED"].includes(s)) {
    return "bg-red-950/80 border border-red-500/40 text-red-300";
  }
  return "bg-amber-950/80 border border-amber-500/40 text-amber-300";
}

function countBy<T>(rows: T[], key: (row: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row) || "UNKNOWN";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** "2 critical • 1 high", from the severities actually present. */
function severityBreakdown(rows: Array<{ severity: string }>): string {
  return severityCounts(countBy(rows, (r) => r.severity));
}

function severityCounts(counts: Partial<Record<string, number>>): string {
  return SEVERITIES.filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s.toLowerCase()}`)
    .join(" • ");
}

function exportCsvData(filename: string, rows: Record<string, unknown>[]) {
  if (typeof window === "undefined" || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h];
          const text = v !== null && typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  loadedAt: string | null;
  reload: () => void;
}

/** One backend read: its data, its failure, and a way to re-run it after a write. */
function useBackend<T>(load: () => Promise<T>, deps: unknown[] = []): Loaded<T> {
  const [state, setState] = useState<Omit<Loaded<T>, "reload">>({
    data: null,
    error: null,
    loading: true,
    loadedAt: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false, loadedAt: new Date().toISOString() });
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

function latest(...stamps: Array<string | null>): string | null {
  const valid = stamps.filter((s): s is string => Boolean(s)).sort();
  return valid.length ? valid[valid.length - 1] : null;
}

function SectionHeader({
  title,
  subtitle,
  updatedAt,
}: {
  title: string;
  subtitle: string;
  updatedAt: string | null;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">{title}</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      {updatedAt && <div className="text-xs text-slate-400">Loaded {formatDateTime(updatedAt)}</div>}
    </div>
  );
}

function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            active === tab
              ? "bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white shadow-[0_0_15px_rgba(220,38,38,0.35)]"
              : "text-slate-300 hover:text-white"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl bg-red-950/50 border border-red-500/40 px-4 py-2.5 text-xs text-red-200">
      {message}
    </div>
  );
}

function Banner({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="rounded-xl bg-emerald-950/50 border border-emerald-500/40 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between"
    >
      <span>{message}</span>
      <button type="button" aria-label="Dismiss" onClick={onClose} className="text-slate-400 hover:text-white">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Table body row for loading / failure / empty, so the table keeps its shape. */
function StateRow({
  colSpan,
  loading,
  error,
  empty,
}: {
  colSpan: number;
  loading: boolean;
  error: string | null;
  empty: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-xs text-slate-400">
        {error ? <span className="text-red-300">Could not load: {error}</span> : loading ? "Loading…" : empty}
      </td>
    </tr>
  );
}

function KpiCard({
  label,
  value,
  sub,
  subClass = "text-slate-400",
  footer,
  loading,
  error,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  subClass?: string;
  footer?: React.ReactNode;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className={KPI}>
      <div className="text-xs font-medium text-slate-300">{label}</div>
      <div className="text-3xl font-extrabold text-white">{error ? "—" : loading ? "…" : value}</div>
      <div className={`text-xs font-medium ${error ? "text-red-300" : subClass}`}>
        {error ? "Unavailable" : loading ? "Loading" : sub}
      </div>
      {footer && <div className="pt-1">{footer}</div>}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

const SEVERITY_FILTER_OPTIONS = [
  { value: "ALL", label: "Severity: All" },
  ...SEVERITIES.map((s) => ({ value: s, label: humanize(s) })),
];

function isOpenFinding(f: Finding) {
  return !CLOSED_FINDING.includes(f.status);
}
function isActiveCase(c: Case) {
  return !CLOSED_CASE.includes(c.status);
}
function isOpenAlert(a: Alert) {
  return !CLOSED_ALERT.includes(a.status);
}

/* ---------------------------------------------------------------------------
 * Response proposals (shared by Threats & Incidents and Detection & Response)
 * ------------------------------------------------------------------------- */

interface ResponseProposal {
  id: string;
  case_id: string | null;
  alert_id: string | null;
  target_type: string;
  target_id: string;
  action_type: string;
  reason: string;
  authority_level: string;
  requested_by: string;
  recommendation_source: string;
  reversible: boolean;
  status: string;
  expires_at: string;
  created_at: string;
}

async function loadProposalsForCases(caseIds: string[]): Promise<ResponseProposal[]> {
  const lists = await Promise.all(
    caseIds.map(async (id) => {
      const res = await backend.get<{ proposals?: ResponseProposal[] }>(
        `/api/v1/cases/${encodeURIComponent(id)}/response-proposals`,
      );
      return Array.isArray(res?.proposals) ? res.proposals : asList<ResponseProposal>(res);
    }),
  );
  return lists.flat();
}

/** Pending response actions across the tenant's active cases. */
async function loadPendingProposals(): Promise<{ proposals: ResponseProposal[]; cases: Case[] }> {
  const cases = await customerApi.cases(50);
  const active = cases.filter(isActiveCase);
  const proposals = await loadProposalsForCases(active.map((c) => c.id));
  return { proposals: proposals.filter((p) => p.status === "PROPOSED"), cases };
}

function ProposalCard({
  proposal,
  caseTitle,
  onDecided,
}: {
  proposal: ResponseProposal;
  caseTitle?: string;
  onDecided: (message: string) => void;
}) {
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const statement = text.trim();
    if (mode === "approve") {
      if (statement.length < 12) {
        setError("Authority statement must be at least 12 characters.");
        return;
      }
      if (!confirmed) {
        setError("Confirm that you are making this decision yourself.");
        return;
      }
    } else if (!statement) {
      setError("A reason is required to reject.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "approve") {
        await backend.post(
          `/api/v1/response-proposals/${encodeURIComponent(proposal.id)}/approve`,
          {
            reason: statement,
            humanAuthority: { decisionOrigin: "HUMAN", humanConfirmation: true, authorityStatement: statement },
          },
          { confirmed: true },
        );
        onDecided(`Approved: ${humanize(proposal.action_type)}.`);
      } else {
        await backend.post(
          `/api/v1/response-proposals/${encodeURIComponent(proposal.id)}/reject`,
          { reason: statement },
          { confirmed: true },
        );
        onDecided(`Rejected: ${humanize(proposal.action_type)}.`);
      }
      setMode(null);
      setText("");
      setConfirmed(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${INNER} space-y-2 text-xs`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-white">{humanize(proposal.action_type)}</span>
        <span className={`${PILL} ${statusClass(proposal.status)}`}>{humanize(proposal.status)}</span>
      </div>
      {caseTitle !== undefined && (
        <div className="flex justify-between gap-2">
          <span className="text-slate-400">Case</span>
          <span className="font-semibold text-white text-right">{caseTitle || shortId(proposal.case_id)}</span>
        </div>
      )}
      <div className="flex justify-between gap-2">
        <span className="text-slate-400">Target</span>
        <span className="font-semibold text-white text-right">
          {humanize(proposal.target_type)} {proposal.target_id}
        </span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-slate-400">Reason</span>
        <span className="font-semibold text-white text-right">{proposal.reason}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-slate-400">Requested</span>
        <span className="font-semibold text-white text-right">
          {humanize(proposal.recommendation_source)} • {timeAgo(proposal.created_at)}
        </span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-slate-400">Authority</span>
        <span className="font-semibold text-white">{proposal.authority_level}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-slate-400">Expires</span>
        <span className="font-semibold text-white">{formatDateTime(proposal.expires_at)}</span>
      </div>
      <div className="text-[11px] text-slate-400">Execution remains blocked until an authorized approval is recorded.</div>

      {mode ? (
        <form onSubmit={submit} className="space-y-2 pt-1">
          <textarea
            aria-label={mode === "approve" ? "Authority statement" : "Rejection reason"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === "approve"
                ? "State the authority under which you approve this action"
                : "Why this action should not run"
            }
            className={`${INPUT} w-full min-h-[60px]`}
          />
          {mode === "approve" && (
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I am making this decision myself.
            </label>
          )}
          <ErrorNote message={error} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={BTN_PRIMARY}>
              {busy ? "Submitting…" : mode === "approve" ? "Approve action" : "Reject action"}
            </button>
            <button type="button" onClick={() => setMode(null)} className={BTN_SECONDARY}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setMode("approve")} className={`${BTN_PRIMARY} flex-1`}>
            Review &amp; approve
          </button>
          <button type="button" onClick={() => setMode("reject")} className={`${BTN_SECONDARY} flex-1`}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 1. SECURITY OVERVIEW
 * ========================================================================== */
export function CustomerSecurityOverviewSection() {
  const summary = useBackend(() => customerApi.findingSummary());
  const findings = useBackend(() => customerApi.findings({ limit: 50 }));
  const assets = useBackend(() => customerApi.assets());
  const assurance = useBackend(() => customerApi.assuranceReport());
  const health = useBackend(() => customerApi.serviceHealth());
  const [assetScope, setAssetScope] = useState("ALL");
  const [banner, setBanner] = useState<string | null>(null);

  const assetRows = useMemo(() => assets.data ?? [], [assets.data]);
  const byType = useMemo(() => {
    const groups: Record<string, Asset[]> = {};
    for (const a of assetRows) (groups[a.asset_type] ??= []).push(a);
    return Object.entries(groups)
      .map(([type, rows]) => ({
        type,
        count: rows.length,
        criticalOrHigh: rows.filter((a) => a.criticality === "CRITICAL" || a.criticality === "HIGH").length,
        lastSeen: latest(...rows.map((a) => a.last_seen_at)),
      }))
      .sort((a, b) => b.count - a.count);
  }, [assetRows]);
  const visibleTypes = assetScope === "ALL" ? byType : byType.filter((t) => t.type === assetScope);

  const m = summary.data?.metrics;
  const openBySeverity = summary.data?.openBySeverity ?? {};
  const openByType = Object.entries(summary.data?.openByType ?? {}).sort((a, b) => b[1] - a[1]);
  const drivers = (findings.data ?? []).filter(isOpenFinding).slice(0, 3);

  const am = assurance.data?.metrics;
  const assessedControls = am
    ? am.controlsEffective + am.controlsPartiallyEffective + am.controlsIneffective + am.controlsUnknown
    : 0;
  const controlsPct = am ? percent(am.controlsEffective, assessedControls) : null;
  const criticalOrHighAssets = assetRows.filter((a) => a.criticality === "CRITICAL" || a.criticality === "HIGH").length;

  const findingPage = (type: string) =>
    type === "VULNERABILITY" ? "/customer/vulnerabilities" : "/customer/exposure-management";

  return (
    <div className={PAGE}>
      <SectionHeader
        title="Security Overview"
        subtitle="Understand your posture. Close protection gaps."
        updatedAt={latest(summary.loadedAt, assets.loadedAt, assurance.loadedAt, health.loadedAt)}
      />

      <div className={BAR}>
        <FilterSelect
          label="Asset scope filter"
          value={assetScope}
          onChange={setAssetScope}
          options={[
            { value: "ALL", label: "All asset types" },
            ...byType.map((t) => ({ value: t.type, label: humanize(t.type) })),
          ]}
        />
        <button
          type="button"
          disabled={!summary.data}
          onClick={() => {
            if (!summary.data) return;
            exportCsvData("security-overview-report.csv", [
              ...Object.entries(summary.data.metrics).map(([metric, value]) => ({ group: "findings", metric, value })),
              ...byType.map((t) => ({ group: "assets", metric: t.type, value: t.count })),
            ]);
            setBanner("Exported the Security Overview figures shown on this page.");
          }}
          className={BTN_SECONDARY}
        >
          Export report
        </button>
      </div>

      <Banner message={banner} onClose={() => setBanner(null)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Open findings"
          loading={summary.loading}
          error={summary.error}
          value={m?.open ?? 0}
          sub={severityCounts(openBySeverity) || "No open findings"}
          subClass="text-red-400"
          footer={
            <Link href="/customer/exposure-management" className={LINK}>
              <span>Review findings</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        <KpiCard
          label="Assets in inventory"
          loading={assets.loading}
          error={assets.error}
          value={assetRows.length.toLocaleString()}
          sub={assetRows.length ? `${criticalOrHighAssets} rated critical or high` : "No assets reported yet"}
          footer={
            <Link href="/customer/assets-inventory" className={LINK}>
              <span>View inventory</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        <KpiCard
          label="Critical findings"
          loading={summary.loading}
          error={summary.error}
          value={openBySeverity.CRITICAL ?? 0}
          sub="Open, across all finding types"
          footer={
            <Link href="/customer/exposure-management" className={LINK}>
              <span>Review exposures</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        <KpiCard
          label="Controls effective"
          loading={assurance.loading}
          error={assurance.error}
          value={controlsPct === null ? "—" : `${controlsPct}%`}
          sub={
            assessedControls
              ? `${am?.controlsEffective} of ${assessedControls} assessed controls`
              : "No controls assessed yet"
          }
          footer={
            <Link href="/customer/compliance-risk" className={LINK}>
              <span>View controls</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className={`lg:col-span-7 ${CARD} flex flex-col justify-between`}>
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-bold text-white">Inventory by asset type</h2>
                <p className="text-xs text-slate-400 mt-0.5">Assets reported by your connectors and manual entries.</p>
              </div>
              <Link href="/customer/assets-inventory" className={LINK}>
                <span>View inventory</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Asset type</th>
                    <th className={TH}>Assets</th>
                    <th className={TH}>Critical / high</th>
                    <th className="py-2.5 pl-3 font-medium text-right">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {visibleTypes.length === 0 ? (
                    <StateRow
                      colSpan={4}
                      loading={assets.loading}
                      error={assets.error}
                      empty="No assets yet. Assets appear when a connector reports them or you add one in Assets & Inventory."
                    />
                  ) : (
                    visibleTypes.map((row) => (
                      <tr key={row.type} className="hover:bg-slate-800/30">
                        <td className="py-3 pr-3 font-semibold text-white">{humanize(row.type)}</td>
                        <td className={`${TD} text-slate-300`}>{row.count}</td>
                        <td className={`${TD} font-semibold text-white`}>{row.criticalOrHigh}</td>
                        <td className="py-3 pl-3 text-right text-slate-400">{timeAgo(row.lastSeen)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {assetRows.length > 0 && (
            <div className="pt-3 mt-3 border-t border-slate-800/80 text-xs text-slate-400">
              Total: {assetRows.length} assets across {byType.length} types
            </div>
          )}
        </div>

        <div className={`lg:col-span-5 ${CARD} space-y-3`}>
          <div>
            <h2 className="text-base font-bold text-white">Posture drivers</h2>
            <p className="text-xs text-slate-400 mt-0.5">Highest-priority open findings</p>
          </div>
          <ErrorNote message={findings.error} />
          {!findings.error && drivers.length === 0 && (
            <p className="text-xs text-slate-400">
              {findings.loading
                ? "Loading…"
                : "No open findings. Findings appear when a scanner or cloud connector reports them — see Integrations."}
            </p>
          )}
          <div className="space-y-2.5">
            {drivers.map((f) => (
              <div key={f.id} className={`${INNER} flex items-center justify-between gap-3`}>
                <div className="flex items-start gap-3">
                  <span className={`${PILL} shrink-0 ${severityClass(f.severity)}`}>{humanize(f.severity)}</span>
                  <div>
                    <div className="text-xs font-bold text-white">{f.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {humanize(f.finding_type)} • {f.source_system} • {f.assertion?.reason}
                    </div>
                  </div>
                </div>
                <Link href={findingPage(f.finding_type)} className="text-xs font-semibold text-sky-400 hover:text-sky-300 shrink-0">
                  Review →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className={`lg:col-span-7 ${CARD}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">Open findings by type</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Finding type</th>
                  <th className={TH}>Open</th>
                  <th className="py-2 pl-3 font-medium text-right">Where</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {openByType.length === 0 ? (
                  <StateRow colSpan={3} loading={summary.loading} error={summary.error} empty="No open findings." />
                ) : (
                  openByType.map(([type, n]) => (
                    <tr key={type} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-3 font-semibold text-white">{humanize(type)}</td>
                      <td className={`${TD} text-slate-300`}>{n}</td>
                      <td className="py-3 pl-3 text-right">
                        <Link href={findingPage(type)} className="text-xs font-semibold text-sky-400 hover:text-sky-300">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`lg:col-span-5 ${CARD} flex flex-col justify-between space-y-3`}>
          <h2 className="text-base font-bold text-white">Assessment confidence</h2>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-slate-400">Telemetry</span>
              <span className="font-semibold text-white">
                {health.error
                  ? "Unavailable"
                  : health.loading
                    ? "Loading…"
                    : typeof health.data?.connectorHealth === "object" && health.data.connectorHealth && Number(health.data.connectorHealth.total) > 0
                      ? `${health.data.connectorHealth.healthy ?? 0} of ${health.data.connectorHealth.total} connectors healthy`
                      : "No connectors configured"}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-slate-400">Freshness</span>
              <span className={`font-semibold ${m && (m.staleAssertions || m.ageingAssertions) ? "text-amber-300" : "text-white"}`}>
                {summary.error
                  ? "Unavailable"
                  : !m
                    ? "Loading…"
                    : `${m.staleAssertions} stale • ${m.ageingAssertions} ageing finding assertions`}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400">Service health</span>
              <span className="font-semibold text-slate-200">
                {health.error ? "Unavailable" : health.data ? humanize(health.data.overallHealth) : "Loading…"}
              </span>
            </div>
          </div>
          <ErrorNote message={health.error} />
          <div className="pt-1">
            <Link href="/customer/integrations" className={LINK}>
              <span>Review data sources →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. THREATS & INCIDENTS
 * ========================================================================== */
interface TimelineEntry {
  id: string;
  title: string;
  summary: string | null;
  occurred_at: string;
}

function AlertStatusControl({ alert, onChanged }: { alert: Alert; onChanged: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = ALERT_NEXT_STATES[alert.status] ?? [];
  if (next.length === 0) return <span className="text-slate-500">—</span>;
  return (
    <div className="flex flex-col items-end gap-1">
      <select
        aria-label={`Change status of ${alert.title}`}
        value=""
        disabled={busy}
        onChange={async (e) => {
          const status = e.target.value;
          if (!status) return;
          setBusy(true);
          setError(null);
          try {
            await customerApi.updateAlertStatus(alert.id, status);
            onChanged(`Alert "${alert.title}" moved to ${humanize(status)}.`);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
        className="px-2 py-1 rounded-lg bg-[#0c1829] border border-slate-700/80 text-[11px] text-slate-200"
      >
        <option value="">{busy ? "Updating…" : "Move to…"}</option>
        {next.map((s) => (
          <option key={s} value={s}>
            {humanize(s)}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-[11px] text-red-300">
          {error}
        </span>
      )}
    </div>
  );
}

export function CustomerThreatsIncidentsSection() {
  const [activeTab, setActiveTab] = useState<"Incidents" | "Alerts">("Incidents");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"Active" | "Closed">("Active");
  const [alertFilter, setAlertFilter] = useState<"Open" | "All">("Open");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSeverity, setNewSeverity] = useState<Severity>("HIGH");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");

  const cases = useBackend(() => customerApi.cases(50));
  const alerts = useBackend(() => customerApi.alerts(100));
  const report = useBackend(() => customerApi.securityReport());
  const pending = useBackend(() => loadPendingProposals());

  const caseRows = useMemo(() => cases.data ?? [], [cases.data]);
  const alertRows = alerts.data ?? [];
  const activeCases = caseRows.filter(isActiveCase);
  const untriaged = alertRows.filter((a) => a.status === "NEW" || a.status === "ACKNOWLEDGED");
  const openAlerts = alertRows.filter(isOpenAlert);

  const filteredCases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return caseRows.filter((c) => {
      const lifecycle = isActiveCase(c) ? "Active" : "Closed";
      return (
        lifecycle === statusFilter &&
        (severityFilter === "ALL" || c.severity === severityFilter) &&
        (!q || c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      );
    });
  }, [caseRows, statusFilter, severityFilter, searchQuery]);

  const selectedCase =
    caseRows.find((c) => c.id === selectedId) ?? filteredCases[0] ?? null;
  const selectedCaseId = selectedCase?.id ?? "";

  const timeline = useBackend<TimelineEntry[]>(
    async () =>
      selectedCaseId
        ? asList<TimelineEntry>(await backend.get(`/api/v1/cases/${encodeURIComponent(selectedCaseId)}/timeline`))
        : [],
    [selectedCaseId],
  );
  const evidence = useBackend<unknown[]>(
    async () =>
      selectedCaseId
        ? asList<unknown>(await backend.get(`/api/v1/cases/${encodeURIComponent(selectedCaseId)}/evidence`))
        : [],
    [selectedCaseId],
  );
  const caseProposals = useBackend<ResponseProposal[]>(
    async () => (selectedCaseId ? loadProposalsForCases([selectedCaseId]) : []),
    [selectedCaseId],
  );
  const selectedPending = (caseProposals.data ?? []).filter((p) => p.status === "PROPOSED");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      setCreateError("A title is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await customerApi.createCase({
        title,
        description: newDescription.trim() || undefined,
        severity: newSeverity,
      });
      setBanner(`Incident "${created?.title ?? title}" created.`);
      setNewTitle("");
      setNewDescription("");
      setCreateOpen(false);
      setStatusFilter("Active");
      if (created?.id) setSelectedId(created.id);
      cases.reload();
      report.reload();
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const afterAlertChange = (message: string) => {
    setBanner(message);
    alerts.reload();
    report.reload();
  };

  const afterDecision = (message: string) => {
    setBanner(message);
    caseProposals.reload();
    pending.reload();
  };

  const visibleAlerts = alertFilter === "Open" ? openAlerts : alertRows;

  return (
    <div className={PAGE}>
      <SectionHeader
        title="Threats & Incidents"
        subtitle="Prioritize threats. Investigate with evidence."
        updatedAt={latest(cases.loadedAt, alerts.loadedAt)}
      />

      <div className={BAR}>
        <Tabs tabs={["Incidents", "Alerts"] as const} active={activeTab} onChange={setActiveTab} />
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={activeTab === "Incidents" ? caseRows.length === 0 : alertRows.length === 0}
            onClick={() =>
              activeTab === "Incidents"
                ? exportCsvData("incidents.csv", caseRows as unknown as Record<string, unknown>[])
                : exportCsvData("alerts.csv", alertRows as unknown as Record<string, unknown>[])
            }
            className={BTN_SECONDARY}
          >
            Export
          </button>
          <button type="button" onClick={() => setCreateOpen((v) => !v)} className={BTN_PRIMARY}>
            + Create incident
          </button>
        </div>
      </div>

      {createOpen && (
        <form
          onSubmit={handleCreate}
          aria-label="Create incident"
          className="rounded-2xl bg-[#0b1629] border border-red-500/40 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Incident title"
              aria-label="Incident title"
              className={`${INPUT} flex-1 min-w-[240px]`}
            />
            <select
              aria-label="New incident severity"
              value={newSeverity}
              onChange={(e) => setNewSeverity(e.target.value as Severity)}
              className={INPUT}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
            <button type="submit" disabled={creating} className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white disabled:opacity-50">
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="What was observed (optional)"
            aria-label="Incident description"
            className={`${INPUT} w-full min-h-[56px]`}
          />
          <ErrorNote message={createError} />
        </form>
      )}

      <Banner message={banner} onClose={() => setBanner(null)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Active incidents"
          loading={cases.loading}
          error={cases.error}
          value={activeCases.length}
          sub={severityBreakdown(activeCases) || "No active incidents"}
          subClass="text-red-400"
        />
        <KpiCard
          label="Untriaged alerts"
          loading={alerts.loading}
          error={alerts.error}
          value={untriaged.length}
          sub={`Of ${openAlerts.length} open alerts`}
        />
        <KpiCard
          label="Pending approvals"
          loading={pending.loading}
          error={pending.error}
          value={pending.data?.proposals.length ?? 0}
          sub={pending.data?.proposals.length ? "Response actions awaiting a decision" : "No response actions awaiting approval"}
          subClass="text-amber-400"
        />
        <KpiCard
          label="Awaiting your team"
          loading={report.loading}
          error={report.error}
          value={report.data?.metrics.casesAwaitingCustomer ?? 0}
          sub="Cases waiting on a customer response"
        />
      </div>

      {activeTab === "Alerts" ? (
        <div className={`${CARD} space-y-3`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Alerts</h2>
            <div className="inline-flex rounded-xl bg-[#07101e] p-0.5 border border-slate-800">
              {(["Open", "All"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setAlertFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    alertFilter === f ? "bg-red-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Alert</th>
                  <th className={TH}>Severity</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Detected</th>
                  <th className="py-2 pl-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {visibleAlerts.length === 0 ? (
                  <StateRow
                    colSpan={5}
                    loading={alerts.loading}
                    error={alerts.error}
                    empty="No alerts. Alerts appear when detection rules match telemetry from your connectors."
                  />
                ) : (
                  visibleAlerts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-3 font-semibold text-white">
                        {a.title}
                        {a.description && <div className="text-[11px] font-normal text-slate-400">{a.description}</div>}
                      </td>
                      <td className={TD}>
                        <span className={`${PILL} ${severityClass(a.severity)}`}>{humanize(a.severity)}</span>
                      </td>
                      <td className={TD}>
                        <span className={`${PILL} ${statusClass(a.status)}`}>{humanize(a.status)}</span>
                      </td>
                      <td className={`${TD} text-slate-400`}>{timeAgo(a.created_at)}</td>
                      <td className="py-3 pl-3 text-right">
                        <AlertStatusControl alert={a} onChanged={afterAlertChange} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-4">
            <div className={`${CARD} space-y-3`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">Incident queue</h2>
                <span className="text-xs text-slate-400">
                  {filteredCases.length} {statusFilter.toLowerCase()}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search incidents"
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-400"
                  />
                </div>
                <FilterSelect
                  label="Incident severity filter"
                  value={severityFilter}
                  onChange={setSeverityFilter}
                  options={SEVERITY_FILTER_OPTIONS}
                />
                <div className="inline-flex rounded-xl bg-[#07101e] p-0.5 border border-slate-800">
                  {(["Active", "Closed"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                        statusFilter === st ? "bg-red-600 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3 font-medium">Incident</th>
                      <th className={TH}>Severity</th>
                      <th className={TH}>Status</th>
                      <th className={TH}>Owner</th>
                      <th className="py-2 pl-3 font-medium text-right">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredCases.length === 0 ? (
                      <StateRow
                        colSpan={5}
                        loading={cases.loading}
                        error={cases.error}
                        empty={
                          caseRows.length === 0
                            ? "No incidents yet. Create one, or open one from an alert."
                            : "No incidents match these filters."
                        }
                      />
                    ) : (
                      filteredCases.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          className={`cursor-pointer transition-colors ${
                            selectedCase?.id === c.id ? "bg-red-950/25" : "hover:bg-slate-800/30"
                          }`}
                        >
                          <td className="py-3 pr-3 font-semibold text-white">{c.title}</td>
                          <td className={TD}>
                            <span className={`${PILL} ${severityClass(c.severity)}`}>{humanize(c.severity)}</span>
                          </td>
                          <td className={TD}>
                            <span className={`${PILL} ${statusClass(c.status)}`}>{humanize(c.status)}</span>
                          </td>
                          <td className={`${TD} text-slate-300`}>{c.owner_id ? shortId(c.owner_id) : "Unassigned"}</td>
                          <td className="py-3 pl-3 text-right text-slate-400">{timeAgo(c.updated_at ?? c.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {caseRows.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                  Showing {filteredCases.length} of {caseRows.length} incidents
                </div>
              )}
            </div>

            <div className={`${CARD} space-y-3`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">Alerts requiring triage</h2>
                {untriaged.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("Alerts")}
                    className="text-xs font-semibold text-sky-400 hover:text-sky-300"
                  >
                    View all {untriaged.length} →
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3 font-medium">Alert</th>
                      <th className={TH}>Severity</th>
                      <th className={TH}>Status</th>
                      <th className="py-2 pl-3 font-medium text-right">Detected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {untriaged.length === 0 ? (
                      <StateRow colSpan={4} loading={alerts.loading} error={alerts.error} empty="No alerts waiting for triage." />
                    ) : (
                      untriaged.slice(0, 5).map((a) => (
                        <tr key={a.id} className="hover:bg-slate-800/30">
                          <td className="py-3 pr-3 font-semibold text-white">{a.title}</td>
                          <td className={TD}>
                            <span className={`${PILL} ${severityClass(a.severity)}`}>{humanize(a.severity)}</span>
                          </td>
                          <td className={`${TD} text-slate-300`}>{humanize(a.status)}</td>
                          <td className="py-3 pl-3 text-right text-slate-400">{timeAgo(a.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className={`lg:col-span-5 ${CARD} space-y-4`}>
            {!selectedCase ? (
              <p className="text-xs text-slate-400">
                {cases.loading ? "Loading…" : "Select an incident to see its details."}
              </p>
            ) : (
              <>
                <div>
                  <div className="text-xs text-slate-400 font-mono">{selectedCase.id}</div>
                  <h2 className="text-lg font-bold text-white mt-0.5">{selectedCase.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`${PILL} ${severityClass(selectedCase.severity)}`}>{humanize(selectedCase.severity)}</span>
                  <span className={`${PILL} ${statusClass(selectedCase.status)}`}>{humanize(selectedCase.status)}</span>
                </div>
                <div className="space-y-2 text-xs border-y border-slate-800/80 py-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Owner</span>
                    <span className="font-semibold text-white">
                      {selectedCase.owner_id ? shortId(selectedCase.owner_id) : "Unassigned"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Priority</span>
                    <span className="font-semibold text-white">{selectedCase.priority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Queue</span>
                    <span className="font-semibold text-white">{selectedCase.queue_id ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Opened</span>
                    <span className="font-semibold text-white">{formatDateTime(selectedCase.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Evidence items</span>
                    <span className="font-semibold text-white">
                      {evidence.error ? "Unavailable" : evidence.loading ? "…" : (evidence.data ?? []).length}
                    </span>
                  </div>
                </div>

                <div className={`${INNER} space-y-2`}>
                  <div className="text-xs font-bold text-white">Investigation summary</div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {selectedCase.description || "No description recorded for this incident."}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Response approval</span>
                    <span className="text-[11px] text-slate-400">
                      {caseProposals.loading ? "Loading…" : `${selectedPending.length} pending`}
                    </span>
                  </div>
                  <ErrorNote message={caseProposals.error} />
                  {!caseProposals.loading && !caseProposals.error && selectedPending.length === 0 && (
                    <p className="text-[11px] text-slate-400">No response actions are awaiting approval for this incident.</p>
                  )}
                  {selectedPending.map((p) => (
                    <ProposalCard key={p.id} proposal={p} onDecided={afterDecision} />
                  ))}
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="font-bold text-white">Latest activity</div>
                  <ErrorNote message={timeline.error} />
                  {!timeline.error && (timeline.data ?? []).length === 0 && (
                    <div className="text-slate-400">{timeline.loading ? "Loading…" : "No activity recorded."}</div>
                  )}
                  {[...(timeline.data ?? [])]
                    .sort((a, b) => String(b.occurred_at || "").localeCompare(String(a.occurred_at || "")))
                    .slice(0, 4)
                    .map((t) => (
                      <div key={t.id} className="text-slate-300">
                        {formatDateTime(t.occurred_at)} • {t.title}
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 3. EXPOSURE MANAGEMENT
 * ========================================================================== */
function AcceptRiskForm({ finding, onAccepted }: { finding: Finding; onAccepted: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [rationale, setRationale] = useState("");
  const [authority, setAuthority] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${BTN_SECONDARY} w-full mt-2`}>
        Accept risk…
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!rationale.trim() || !authority.trim() || !expiresOn) {
      setError("Rationale, accepting authority and an expiry date are all required.");
      return;
    }
    const expires = new Date(`${expiresOn}T23:59:59`);
    if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
      setError("The expiry date must be in the future.");
      return;
    }
    setBusy(true);
    try {
      await backend.post(
        `/api/v1/findings/${encodeURIComponent(finding.id)}/accept`,
        { rationale: rationale.trim(), authority: authority.trim(), expiresAt: expires.toISOString() },
        { confirmed: true },
      );
      setOpen(false);
      onAccepted(`Risk accepted for "${finding.title}" until ${expires.toLocaleDateString()}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-label="Accept risk" className="space-y-2 pt-2">
      <textarea
        aria-label="Acceptance rationale"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="Why this exposure is accepted, and what compensates for it"
        className={`${INPUT} w-full min-h-[56px]`}
      />
      <input
        aria-label="Accepting authority"
        value={authority}
        onChange={(e) => setAuthority(e.target.value)}
        placeholder="Accepting authority (role or name)"
        className={`${INPUT} w-full`}
      />
      <input
        aria-label="Acceptance expires on"
        type="date"
        value={expiresOn}
        onChange={(e) => setExpiresOn(e.target.value)}
        className={`${INPUT} w-full`}
      />
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>
          {busy ? "Submitting…" : "Record acceptance"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={BTN_SECONDARY}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CustomerExposureManagementSection() {
  const [activeTab, setActiveTab] = useState<"Overview" | "Exposure register">("Overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  const exposures = useBackend(() => customerApi.findings({ type: "EXPOSURE,MISCONFIGURATION" }));
  const rows = exposures.data ?? [];
  const open = rows.filter(isOpenFinding);
  const scope = activeTab === "Overview" ? open : rows;

  const filtered = scope.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    return (
      (severityFilter === "ALL" || f.severity === severityFilter) &&
      (!q ||
        f.title.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        (f.asset_external_ref ?? "").toLowerCase().includes(q))
    );
  });
  const selected = rows.find((f) => f.id === selectedId) ?? filtered[0] ?? null;
  const linked = rows.filter((f) => f.asset_id).length;

  return (
    <div className={PAGE}>
      <SectionHeader
        title="Exposure Management"
        subtitle="Prioritize business risk. Verify every fix."
        updatedAt={exposures.loadedAt}
      />

      <div className={BAR}>
        <Tabs tabs={["Overview", "Exposure register"] as const} active={activeTab} onChange={setActiveTab} />
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => exportCsvData("exposures-report.csv", rows as unknown as Record<string, unknown>[])}
          className={BTN_SECONDARY}
        >
          Export report
        </button>
      </div>

      <Banner message={banner} onClose={() => setBanner(null)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Open exposures"
          loading={exposures.loading}
          error={exposures.error}
          value={open.length}
          sub={severityBreakdown(open) || "No open exposures"}
          subClass="text-red-400"
        />
        <KpiCard
          label="Critical exposures"
          loading={exposures.loading}
          error={exposures.error}
          value={open.filter((f) => f.severity === "CRITICAL").length}
          sub="Open and rated critical"
        />
        <KpiCard
          label="Stale assertions"
          loading={exposures.loading}
          error={exposures.error}
          value={open.filter((f) => f.assertion?.state === "STALE").length}
          sub="Not reconfirmed by their source in time"
          subClass="text-amber-400"
        />
        <KpiCard
          label="Accepted risk"
          loading={exposures.loading}
          error={exposures.error}
          value={rows.filter((f) => f.status === "ACCEPTED").length}
          sub="Excluded from open exposures"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className={`lg:col-span-7 ${CARD} space-y-3`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">
              {activeTab === "Overview" ? "Prioritized exposures" : "Exposure register"}
            </h2>
            {activeTab === "Overview" && rows.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("Exposure register")}
                className="text-xs font-semibold text-sky-400 hover:text-sky-300"
              >
                View all {rows.length} →
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search exposures"
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-400"
              />
            </div>
            <FilterSelect
              label="Exposure severity filter"
              value={severityFilter}
              onChange={setSeverityFilter}
              options={SEVERITY_FILTER_OPTIONS}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Exposure</th>
                  <th className={TH}>Type</th>
                  <th className={TH}>Asset</th>
                  <th className={TH}>Source</th>
                  <th className="py-2 pl-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.length === 0 ? (
                  <StateRow
                    colSpan={5}
                    loading={exposures.loading}
                    error={exposures.error}
                    empty={
                      rows.length === 0
                        ? "No exposure findings yet. Exposures and misconfigurations appear when a scanner or cloud connector reports them — see Integrations."
                        : "No exposures match these filters."
                    }
                  />
                ) : (
                  filtered.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => setSelectedId(f.id)}
                      className={`cursor-pointer transition-colors ${
                        selected?.id === f.id ? "bg-red-950/25" : "hover:bg-slate-800/30"
                      }`}
                    >
                      <td className="py-3 pr-3 font-semibold text-white">
                        <span className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${severityClass(f.severity)}`}>
                            {humanize(f.severity)}
                          </span>
                          <span>{f.title}</span>
                        </span>
                      </td>
                      <td className={`${TD} text-slate-300`}>{humanize(f.finding_type)}</td>
                      <td className={`${TD} text-slate-300`}>{f.asset_external_ref ?? "Not linked"}</td>
                      <td className={`${TD} text-slate-300`}>{f.source_system}</td>
                      <td className="py-3 pl-3 text-right">
                        <span className={`${PILL} ${statusClass(f.status)}`}>{humanize(f.status)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className={`${CARD} space-y-4`}>
            {!selected ? (
              <p className="text-xs text-slate-400">
                {exposures.loading ? "Loading…" : "Select an exposure to see why it ranks where it does."}
              </p>
            ) : (
              <>
                <div>
                  <div className="text-xs text-slate-400 font-mono">{selected.id}</div>
                  <h2 className="text-lg font-bold text-white">{selected.title}</h2>
                </div>
                <div className={`${INNER} space-y-1.5 text-xs`}>
                  <div className="font-bold text-white">Why it ranks here</div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Priority score</span>
                    <span className="font-semibold text-white">{selected.priority_score ?? "Not scored"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Severity</span>
                    <span className="font-semibold text-white">{humanize(selected.severity)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">First detected</span>
                    <span className="font-semibold text-white">{formatDateTime(selected.first_detected_at)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Assertion</span>
                    <span className="font-semibold text-white text-right">{selected.assertion?.reason}</span>
                  </div>
                </div>
                <div className={`${INNER} space-y-2 text-xs`}>
                  <div className="font-bold text-white">Details</div>
                  <p className="text-slate-300">{selected.description || "The source did not provide a description."}</p>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-400">Status</span>
                    <span className="font-semibold text-white">{humanize(selected.status)}</span>
                  </div>
                  {isOpenFinding(selected) && (
                    <AcceptRiskForm
                      key={selected.id}
                      finding={selected}
                      onAccepted={(message) => {
                        setBanner(message);
                        exposures.reload();
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>

          <div className={`${CARD} space-y-2`}>
            <h2 className="text-base font-bold text-white">Asset linkage</h2>
            <div className="text-2xl font-extrabold text-white">
              {exposures.error ? "—" : `${linked} / ${rows.length}`}
            </div>
            <div className="text-xs text-slate-400">Exposures linked to an inventory asset</div>
            {rows.length - linked > 0 && (
              <div className="text-xs text-amber-300 font-medium">
                {rows.length - linked} not matched to any known asset
              </div>
            )}
            <Link href="/customer/assets-inventory" className={`${LINK} pt-1`}>
              Review inventory →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. ASSETS & INVENTORY
 * ========================================================================== */
const ASSET_TYPE_OPTIONS = [
  "SERVER",
  "ENDPOINT",
  "CLOUD_RESOURCE",
  "VIRTUAL_MACHINE",
  "CONTAINER",
  "APPLICATION",
  "NETWORK_DEVICE",
] as const;
const CRITICALITY_OPTIONS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function assetSources(a: Asset): string[] {
  return Array.from(new Set((a.aliases ?? []).map((al) => al.source_system)));
}

export function CustomerAssetsInventorySection() {
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [criticalityFilter, setCriticalityFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [hostname, setHostname] = useState("");
  const [externalId, setExternalId] = useState("");
  const [assetType, setAssetType] = useState<string>("SERVER");
  const [criticality, setCriticality] = useState<(typeof CRITICALITY_OPTIONS)[number]>("MEDIUM");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const assets = useBackend(() => customerApi.assets());
  const rows = assets.data ?? [];
  const now = Date.now();
  const isStale = (a: Asset) => now - new Date(a.last_seen_at).getTime() > STALE_ASSET_MS;

  const typeCounts = countBy(rows, (a) => a.asset_type);
  const filtered = rows.filter((a) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesCriticality =
      criticalityFilter === "ALL" ||
      (criticalityFilter === "NONE" ? !a.criticality : a.criticality === criticalityFilter);
    return (
      (typeFilter === "ALL" || a.asset_type === typeFilter) &&
      matchesCriticality &&
      (!q ||
        (a.name ?? "").toLowerCase().includes(q) ||
        a.external_id.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q))
    );
  });

  const unclassified = rows.filter((a) => !a.criticality).length;
  const stale = rows.filter(isStale).length;
  const sources = Array.from(new Set(rows.flatMap(assetSources))).sort();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const host = hostname.trim();
    const ext = externalId.trim() || host;
    if (!host) {
      setSaveError("A hostname or asset name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await customerApi.addAsset({
        externalId: ext,
        assetType,
        hostname: host,
        criticality,
      });
      setBanner(
        result?.decision === "MATCHED"
          ? `"${host}" matched an asset already in your inventory.`
          : `Asset "${host}" added to your inventory.`,
      );
      setHostname("");
      setExternalId("");
      setFormOpen(false);
      assets.reload();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={PAGE}>
      <SectionHeader
        title="Assets & Inventory"
        subtitle="Know every asset. Close every ownership and protection gap."
        updatedAt={assets.loadedAt}
      />

      <div className={BAR}>
        <span className="text-xs text-slate-400 px-2">Inventory reported by connectors and manual entries</span>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() =>
              exportCsvData(
                "assets-inventory.csv",
                rows.map((a) => ({
                  id: a.id,
                  name: a.name,
                  external_id: a.external_id,
                  asset_type: a.asset_type,
                  criticality: a.criticality,
                  status: a.status,
                  sources: assetSources(a).join(" "),
                  first_seen_at: a.first_seen_at,
                  last_seen_at: a.last_seen_at,
                })),
              )
            }
            className={BTN_SECONDARY}
          >
            Export
          </button>
          <button type="button" onClick={() => setFormOpen((v) => !v)} className={BTN_PRIMARY}>
            + Add asset
          </button>
        </div>
      </div>

      {formOpen && (
        <form
          onSubmit={handleAdd}
          aria-label="Add asset"
          className="rounded-2xl bg-[#0b1629] border border-red-500/40 p-4 space-y-2"
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="Hostname or asset name"
              aria-label="Asset hostname"
              className={`${INPUT} flex-1 min-w-[200px]`}
            />
            <input
              type="text"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="External ID (defaults to hostname)"
              aria-label="Asset external ID"
              className={`${INPUT} flex-1 min-w-[180px]`}
            />
            <select aria-label="Asset type" value={assetType} onChange={(e) => setAssetType(e.target.value)} className={INPUT}>
              {ASSET_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
            <select
              aria-label="Asset criticality"
              value={criticality}
              onChange={(e) => setCriticality(e.target.value as (typeof CRITICALITY_OPTIONS)[number])}
              className={INPUT}
            >
              {CRITICALITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </select>
            <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save asset"}
            </button>
          </div>
          <ErrorNote message={saveError} />
        </form>
      )}

      <Banner message={banner} onClose={() => setBanner(null)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="In-scope assets"
          loading={assets.loading}
          error={assets.error}
          value={rows.length.toLocaleString()}
          sub="Deduplicated active inventory"
        />
        <KpiCard
          label="Critical or high"
          loading={assets.loading}
          error={assets.error}
          value={rows.filter((a) => a.criticality === "CRITICAL" || a.criticality === "HIGH").length}
          sub="Business-critical assets"
          subClass="text-red-400"
        />
        <KpiCard
          label="Unclassified"
          loading={assets.loading}
          error={assets.error}
          value={unclassified}
          sub="No criticality recorded"
          subClass="text-amber-400"
        />
        <KpiCard
          label="Not seen in 7 days"
          loading={assets.loading}
          error={assets.error}
          value={stale}
          sub="No source has reported them recently"
          subClass="text-amber-400"
        />
      </div>

      <div className={`${CARD} space-y-4`}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Asset inventory</h2>
          <span className="text-xs text-slate-400">{rows.length} assets</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[{ key: "ALL", label: `All ${rows.length}` }, ...Object.entries(typeCounts).map(([t, n]) => ({ key: t, label: `${humanize(t)} ${n}` }))].map(
            (pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => setTypeFilter(pill.key)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                  typeFilter === pill.key
                    ? "bg-red-600 text-white"
                    : "bg-[#0c1829] text-slate-300 border border-slate-800 hover:text-white"
                }`}
              >
                {pill.label}
              </button>
            ),
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by asset name or ID"
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-400"
            />
          </div>
          <FilterSelect
            label="Criticality filter"
            value={criticalityFilter}
            onChange={setCriticalityFilter}
            options={[
              { value: "ALL", label: "Criticality: All" },
              ...CRITICALITY_OPTIONS.map((c) => ({ value: c, label: humanize(c) })),
              { value: "NONE", label: "Not set" },
            ]}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Asset</th>
                <th className={TH}>Type</th>
                <th className={TH}>Criticality</th>
                <th className={TH}>Sources</th>
                <th className={TH}>Status</th>
                <th className="py-2 pl-3 font-medium text-right">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <StateRow
                  colSpan={6}
                  loading={assets.loading}
                  error={assets.error}
                  empty={
                    rows.length === 0
                      ? "No assets yet. Assets appear when a connector reports them — see Integrations — or add one manually."
                      : "No assets match these filters."
                  }
                />
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/30">
                    <td className="py-3 pr-3">
                      <div className="font-bold text-white">{a.name ?? a.external_id}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{a.external_id}</div>
                    </td>
                    <td className={`${TD} text-slate-200`}>{humanize(a.asset_type)}</td>
                    <td className={TD}>
                      {a.criticality ? (
                        <span className={`${PILL} ${severityClass(a.criticality)}`}>{humanize(a.criticality)}</span>
                      ) : (
                        <span className="text-amber-400 font-semibold">Not set</span>
                      )}
                    </td>
                    <td className={`${TD} text-slate-300`}>{assetSources(a).join(", ") || "—"}</td>
                    <td className={TD}>
                      <span className={`${PILL} ${statusClass(a.status)}`}>{humanize(a.status)}</span>
                    </td>
                    <td className={`py-3 pl-3 text-right ${isStale(a) ? "text-amber-300" : "text-slate-300"}`}>
                      {timeAgo(a.last_seen_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400">
            Showing {filtered.length} of {rows.length} assets
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className={`lg:col-span-7 ${CARD} space-y-2.5`}>
          <h2 className="text-base font-bold text-white">Inventory priorities</h2>
          {unclassified === 0 && stale === 0 && (
            <p className="text-xs text-slate-400">
              {assets.loading ? "Loading…" : assets.error ? "Unavailable." : "No inventory actions outstanding."}
            </p>
          )}
          {unclassified > 0 && (
            <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/70">
              <span className="text-slate-200">Set criticality on {unclassified} assets</span>
              <button type="button" onClick={() => setCriticalityFilter("NONE")} className="text-sky-400 font-semibold">
                Show →
              </button>
            </div>
          )}
          {stale > 0 && (
            <div className="flex items-center justify-between text-xs py-1.5">
              <span className="text-slate-200">Confirm {stale} assets not seen in the last 7 days</span>
              <Link href="/customer/integrations" className="text-sky-400 font-semibold">
                Check sources →
              </Link>
            </div>
          )}
        </div>

        <div className={`lg:col-span-5 ${CARD} space-y-2 text-xs`}>
          <h2 className="text-base font-bold text-white">Discovery &amp; data quality</h2>
          <div className="flex justify-between gap-2 py-1 border-b border-slate-800/70">
            <span className="text-slate-400">Inventory sources</span>
            <span className="font-semibold text-white text-right">{sources.length ? sources.join(", ") : "None reporting"}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-800/70">
            <span className="text-slate-400">Latest observation</span>
            <span className="font-semibold text-white">
              {formatDateTime(latest(...rows.map((a) => a.last_seen_at))) || "—"}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">Seen by several sources</span>
            <span className="font-semibold text-white">{rows.filter((a) => assetSources(a).length > 1).length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 5. VULNERABILITIES
 * ========================================================================== */
export function CustomerVulnerabilitiesSection() {
  const [activeTab, setActiveTab] = useState<"Overview" | "CVE Findings" | "Exceptions">("Overview");
  const vulns = useBackend(() => customerApi.findings({ type: "VULNERABILITY" }));
  const rows = vulns.data ?? [];
  const open = rows.filter(isOpenFinding);
  const shown =
    activeTab === "Overview" ? open : activeTab === "Exceptions" ? rows.filter((f) => f.status === "ACCEPTED") : rows;

  const emptyText =
    rows.length === 0
      ? "No vulnerability findings yet. Findings appear when a scanner or cloud connector reports them — see Integrations."
      : activeTab === "Exceptions"
        ? "No accepted vulnerabilities."
        : "No open vulnerability findings.";

  return (
    <div className={PAGE}>
      <SectionHeader
        title="Vulnerabilities"
        subtitle="Prioritize exploitable CVEs. Track remediation across all in-scope assets."
        updatedAt={vulns.loadedAt}
      />

      <div className={BAR}>
        <Tabs tabs={["Overview", "CVE Findings", "Exceptions"] as const} active={activeTab} onChange={setActiveTab} />
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => exportCsvData("vulnerabilities-report.csv", rows as unknown as Record<string, unknown>[])}
          className={BTN_SECONDARY}
        >
          Export report
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Critical CVEs"
          loading={vulns.loading}
          error={vulns.error}
          value={open.filter((f) => f.severity === "CRITICAL").length}
          sub="Open critical findings"
          subClass="text-red-400"
        />
        <KpiCard
          label="High severity CVEs"
          loading={vulns.loading}
          error={vulns.error}
          value={open.filter((f) => f.severity === "HIGH").length}
          sub="Open high findings"
          subClass="text-amber-400"
        />
        <KpiCard
          label="Resolved"
          loading={vulns.loading}
          error={vulns.error}
          value={rows.filter((f) => f.status === "RESOLVED").length}
          sub="Closed by remediation"
          subClass="text-emerald-400"
        />
        <KpiCard
          label="Stale assertions"
          loading={vulns.loading}
          error={vulns.error}
          value={open.filter((f) => f.assertion?.state === "STALE").length}
          sub="Open findings not reconfirmed by their scanner in time"
        />
      </div>

      <div className={`${CARD} space-y-3`}>
        <h2 className="text-base font-bold text-white">
          {activeTab === "Overview"
            ? "Prioritized vulnerability findings"
            : activeTab === "Exceptions"
              ? "Accepted vulnerabilities"
              : "All vulnerability findings"}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">CVE ID</th>
                <th className={TH}>Vulnerability</th>
                <th className={TH}>Severity</th>
                <th className={TH}>Priority score</th>
                <th className={TH}>Asset</th>
                <th className={TH}>First detected</th>
                <th className="py-2 pl-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {shown.length === 0 ? (
                <StateRow colSpan={7} loading={vulns.loading} error={vulns.error} empty={emptyText} />
              ) : (
                shown.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-800/30">
                    <td className="py-3 pr-3 font-mono font-bold text-sky-400">{f.vulnerability_ref ?? "—"}</td>
                    <td className={`${TD} font-semibold text-white`}>{f.title}</td>
                    <td className={TD}>
                      <span className={`${PILL} ${severityClass(f.severity)}`}>{humanize(f.severity)}</span>
                    </td>
                    <td className={`${TD} font-mono text-white`}>{f.priority_score ?? "—"}</td>
                    <td className={`${TD} text-slate-300`}>{f.asset_external_ref ?? "Not linked"}</td>
                    <td className={`${TD} text-slate-300`}>{timeAgo(f.first_detected_at)}</td>
                    <td className="py-3 pl-3 text-right">
                      <span className={`${PILL} ${statusClass(f.status)}`}>{humanize(f.status)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 6. DETECTION & RESPONSE
 * ========================================================================== */
interface PlaybookRun {
  id: string;
  caseId: string;
  playbookKey: string;
  playbookOwner: string;
  version: number;
  mode: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  terminationReason: string | null;
}

function publishedVersion(d: DetectionDefinition) {
  const versions = (d.versions ?? []) as Array<{ status?: string; version?: number | string; severity?: string }>;
  return versions.find((v) => v.status === "PUBLISHED") ?? null;
}

export function CustomerDetectionResponseSection() {
  type Tab = "Overview" | "Detection rules" | "Approvals" | "Execution history";
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [banner, setBanner] = useState<string | null>(null);

  const definitions = useBackend(() => customerApi.detectionDefinitions());
  const alerts = useBackend(() => customerApi.alerts(100));
  const runs = useBackend(async () => asList<PlaybookRun>(await backend.get("/api/v1/playbooks/runs")));
  const pending = useBackend(() => loadPendingProposals());

  const defs = definitions.data ?? [];
  const openAlerts = (alerts.data ?? []).filter(isOpenAlert);
  const alertsByRule = countBy(openAlerts, (a) => a.detection_definition_id);
  const runRows = [...(runs.data ?? [])].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  const proposals = pending.data?.proposals ?? [];
  const caseTitle = (id: string | null) => pending.data?.cases.find((c) => c.id === id)?.title ?? "";

  const show = (panel: Tab) => activeTab === "Overview" || activeTab === panel;

  return (
    <div className={PAGE}>
      <SectionHeader
        title="Detection & Response"
        subtitle="Keep detections healthy. Govern every response."
        updatedAt={latest(definitions.loadedAt, runs.loadedAt)}
      />

      <div className={BAR}>
        <Tabs
          tabs={["Overview", "Detection rules", "Approvals", "Execution history"] as const}
          active={activeTab}
          onChange={setActiveTab}
        />
        <button
          type="button"
          disabled={defs.length === 0}
          onClick={() =>
            exportCsvData(
              "detection-rules.csv",
              defs.map((d) => ({
                key: d.key,
                name: d.name,
                category: d.category,
                status: d.status,
                published_version: publishedVersion(d)?.version ?? "",
                open_alerts: alertsByRule[d.id] ?? 0,
              })),
            )
          }
          className={BTN_SECONDARY}
        >
          Export report
        </button>
      </div>

      <Banner message={banner} onClose={() => setBanner(null)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Enabled rules"
          loading={definitions.loading}
          error={definitions.error}
          value={defs.filter((d) => d.status === "ACTIVE").length}
          sub={`Of ${defs.length} defined rules`}
          subClass="text-emerald-400"
        />
        <KpiCard
          label="Open alerts"
          loading={alerts.loading}
          error={alerts.error}
          value={openAlerts.length}
          sub={openAlerts.length ? `Raised by ${Object.keys(alertsByRule).length} rules` : "No open alerts"}
        />
        <KpiCard
          label="Pending approvals"
          loading={pending.loading}
          error={pending.error}
          value={proposals.length}
          sub={proposals.length ? "Response actions awaiting a decision" : "No response actions awaiting approval"}
          subClass="text-amber-400"
        />
        <KpiCard
          label="Playbook runs"
          loading={runs.loading}
          error={runs.error}
          value={runRows.length}
          sub={
            runRows.length
              ? Object.entries(countBy(runRows, (r) => r.status))
                  .map(([s, n]) => `${n} ${humanize(s).toLowerCase()}`)
                  .join(" • ")
              : "No playbooks have run"
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {(show("Detection rules") || show("Execution history")) && (
          <div className={`${activeTab === "Overview" ? "lg:col-span-7" : "lg:col-span-12"} space-y-4`}>
            {show("Detection rules") && (
              <div className={`${CARD} space-y-3`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white">Detection rules</h2>
                    <p className="text-xs text-slate-400">Rules defined for your tenant and their published versions</p>
                  </div>
                  {activeTab === "Overview" && defs.length > 0 && (
                    <button type="button" onClick={() => setActiveTab("Detection rules")} className="text-xs font-semibold text-sky-400">
                      View all {defs.length} →
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 pr-3 font-medium">Rule</th>
                        <th className={TH}>Domain</th>
                        <th className={TH}>Status</th>
                        <th className={TH}>Published version</th>
                        <th className="py-2 pl-3 font-medium text-right">Open alerts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {defs.length === 0 ? (
                        <StateRow
                          colSpan={5}
                          loading={definitions.loading}
                          error={definitions.error}
                          empty="No detection rules defined for this tenant."
                        />
                      ) : (
                        (activeTab === "Overview" ? defs.slice(0, 6) : defs).map((d) => {
                          const v = publishedVersion(d);
                          return (
                            <tr key={d.id}>
                              <td className="py-3 pr-3">
                                <div className="font-semibold text-white">{d.name}</div>
                                <div className="text-[11px] text-slate-400 font-mono">{d.key}</div>
                              </td>
                              <td className={`${TD} text-slate-300`}>{humanize(d.category) || "—"}</td>
                              <td className={TD}>
                                <span className={`${PILL} ${statusClass(d.status)}`}>{humanize(d.status)}</span>
                              </td>
                              <td className={`${TD} text-slate-300`}>
                                {v ? `v${v.version}${v.severity ? ` • ${humanize(v.severity)}` : ""}` : "None published"}
                              </td>
                              <td className="py-3 pl-3 text-right text-slate-300">{alertsByRule[d.id] ?? 0}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {show("Execution history") && (
              <div className={`${CARD} space-y-3`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">Recent response executions</h2>
                  {activeTab === "Overview" && runRows.length > 0 && (
                    <button type="button" onClick={() => setActiveTab("Execution history")} className="text-xs font-semibold text-sky-400">
                      View history →
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 pr-3 font-medium">Playbook</th>
                        <th className={TH}>Case</th>
                        <th className={TH}>Mode</th>
                        <th className={TH}>Result</th>
                        <th className="py-2 pl-3 font-medium text-right">Started</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {runRows.length === 0 ? (
                        <StateRow
                          colSpan={5}
                          loading={runs.loading}
                          error={runs.error}
                          empty="No response playbooks have run for this tenant."
                        />
                      ) : (
                        (activeTab === "Overview" ? runRows.slice(0, 5) : runRows).map((r) => (
                          <tr key={r.id}>
                            <td className="py-3 pr-3 font-semibold text-white">
                              {r.playbookKey} <span className="text-slate-400 font-normal">v{r.version}</span>
                            </td>
                            <td className={`${TD} text-slate-300 font-mono`}>{shortId(r.caseId)}</td>
                            <td className={`${TD} text-slate-300`}>{humanize(r.mode)}</td>
                            <td className={TD}>
                              <span className={`${PILL} ${statusClass(r.status)}`}>{humanize(r.status)}</span>
                              {r.terminationReason && <div className="text-[11px] text-slate-400 mt-0.5">{r.terminationReason}</div>}
                            </td>
                            <td className="py-3 pl-3 text-right text-slate-300">{timeAgo(r.startedAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {show("Approvals") && (
          <div className={`${activeTab === "Overview" ? "lg:col-span-5" : "lg:col-span-12"} space-y-4`}>
            <div className={`${CARD} space-y-3`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">Approval required</h2>
                <span className={`${PILL} bg-amber-950/80 border border-amber-500/40 text-amber-300`}>
                  {pending.loading ? "…" : `${proposals.length} pending`}
                </span>
              </div>
              <ErrorNote message={pending.error} />
              {!pending.loading && !pending.error && proposals.length === 0 && (
                <p className="text-xs text-slate-400">No response actions are awaiting approval.</p>
              )}
              {proposals.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  caseTitle={caseTitle(p.case_id)}
                  onDecided={(message) => {
                    setBanner(message);
                    pending.reload();
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 7. IDENTITY & ACCESS
 * ========================================================================== */
interface JitElevation {
  id: string;
  superAdminPrincipalId: string;
  targetTenantId: string;
  statedPurpose: string;
  requestedDurationMinutes: number;
  roleCode: string;
  status: string;
  approvedByPrincipalId: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

async function loadJitAudit(): Promise<JitElevation[]> {
  const s = await customerApi.session();
  return asList<JitElevation>(await backend.get(`/api/v1/tenants/${encodeURIComponent(s.tenantId)}/jit-audit`));
}

function isLiveElevation(j: JitElevation, now: number) {
  return j.status === "APPROVED" && (!j.expiresAt || new Date(j.expiresAt).getTime() > now);
}

export function CustomerIdentityAccessSection() {
  type Tab = "Overview" | "Identities" | "Privileged access";
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const identities = useBackend(() => customerApi.identities());
  const definitions = useBackend(() => customerApi.detectionDefinitions());
  const alerts = useBackend(() => customerApi.alerts(100));
  const jit = useBackend(() => loadJitAudit());

  const people = identities.data ?? [];
  const human = people.filter((i) => i.identity_type === "HUMAN");
  const nonHuman = people.filter((i) => i.identity_type !== "HUMAN");
  const identityRuleIds = new Set(
    (definitions.data ?? []).filter((d) => d.category === "IDENTITY").map((d) => d.id),
  );
  const identityAlerts = (alerts.data ?? []).filter(
    (a) => isOpenAlert(a) && (identityRuleIds.has(a.detection_definition_id) || Boolean(a.primary_identity_id)),
  );
  const identityAlertsError = alerts.error ?? definitions.error;
  const now = Date.now();
  const elevations = jit.data ?? [];
  const live = elevations.filter((j) => isLiveElevation(j, now));
  const pendingElevations = elevations.filter((j) => j.status === "PENDING");

  const show = (panel: Tab) => activeTab === "Overview" || activeTab === panel;

  const identityTable = (rows: IdentityEntity[], empty: string) => (
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="border-b border-slate-800 text-slate-400">
          <th className="py-2 pr-3 font-medium">Identity</th>
          <th className={TH}>Type</th>
          <th className={TH}>Sources</th>
          <th className={TH}>Status</th>
          <th className="py-2 pl-3 font-medium text-right">Last seen</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800/60">
        {rows.length === 0 ? (
          <StateRow colSpan={5} loading={identities.loading} error={identities.error} empty={empty} />
        ) : (
          rows.map((i) => (
            <tr key={i.id}>
              <td className="py-3 pr-3">
                <div className="font-semibold text-white">{i.display_name ?? i.email ?? i.external_id}</div>
                <div className="text-[11px] text-slate-400">{i.email ?? i.external_id}</div>
              </td>
              <td className={`${TD} text-slate-300`}>{humanize(i.identity_type)}</td>
              <td className={`${TD} text-slate-300`}>
                {Array.from(new Set((i.aliases ?? []).map((a) => a.source_system))).join(", ") || "—"}
              </td>
              <td className={TD}>
                <span className={`${PILL} ${statusClass(i.status)}`}>{humanize(i.status)}</span>
              </td>
              <td className="py-3 pl-3 text-right text-slate-300">{timeAgo(i.last_seen_at)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <div className={PAGE}>
      <SectionHeader
        title="Identity & Access"
        subtitle="Reduce identity risk. Keep privileged access accountable."
        updatedAt={latest(identities.loadedAt, jit.loadedAt)}
      />

      <div className={BAR}>
        <Tabs tabs={["Overview", "Identities", "Privileged access"] as const} active={activeTab} onChange={setActiveTab} />
        <button
          type="button"
          disabled={people.length === 0}
          onClick={() =>
            exportCsvData(
              "identities.csv",
              people.map((i) => ({
                id: i.id,
                display_name: i.display_name,
                email: i.email,
                identity_type: i.identity_type,
                status: i.status,
                last_seen_at: i.last_seen_at,
              })),
            )
          }
          className={BTN_SECONDARY}
        >
          Export report
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Monitored identities"
          loading={identities.loading}
          error={identities.error}
          value={people.length.toLocaleString()}
          sub={`${human.length} human • ${nonHuman.length} non-human`}
        />
        <KpiCard
          label="Workload identities"
          loading={identities.loading}
          error={identities.error}
          value={nonHuman.length}
          sub="Service accounts, workloads and applications"
        />
        <KpiCard
          label="Identity alerts"
          loading={alerts.loading || definitions.loading}
          error={identityAlertsError}
          value={identityAlerts.length}
          sub="Open alerts from identity detections"
          subClass="text-amber-400"
        />
        <KpiCard
          label="Operator elevations"
          loading={jit.loading}
          error={jit.error}
          value={live.length}
          sub={`Active now • ${pendingElevations.length} pending`}
          subClass="text-amber-400"
        />
      </div>

      {activeTab === "Identities" ? (
        <div className={`${CARD} space-y-3`}>
          <h2 className="text-base font-bold text-white">Identities</h2>
          <div className="overflow-x-auto">
            {identityTable(
              people,
              "No identities yet. Identities appear when an identity provider connector reports them — see Integrations.",
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className={`${activeTab === "Overview" ? "lg:col-span-7" : "lg:col-span-12"} space-y-4`}>
            {activeTab === "Overview" && (
              <div className={`${CARD} space-y-3`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">Priority identity risks</h2>
                  <Link href="/customer/threats-incidents" className="text-xs font-semibold text-sky-400">
                    Open alerts →
                  </Link>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3 font-medium">Alert</th>
                      <th className={TH}>Severity</th>
                      <th className={TH}>Status</th>
                      <th className="py-2 pl-3 font-medium text-right">Detected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {identityAlerts.length === 0 ? (
                      <StateRow
                        colSpan={4}
                        loading={alerts.loading || definitions.loading}
                        error={identityAlertsError}
                        empty="No open identity alerts."
                      />
                    ) : (
                      identityAlerts.map((a) => (
                        <tr key={a.id}>
                          <td className="py-3 pr-3 font-semibold text-white">{a.title}</td>
                          <td className={TD}>
                            <span className={`${PILL} ${severityClass(a.severity)}`}>{humanize(a.severity)}</span>
                          </td>
                          <td className={TD}>
                            <span className={`${PILL} ${statusClass(a.status)}`}>{humanize(a.status)}</span>
                          </td>
                          <td className="py-3 pl-3 text-right text-slate-300">{timeAgo(a.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className={`${CARD} space-y-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">Time-limited access</h2>
                  <p className="text-xs text-slate-400">ZoikoShield operator elevations into your tenant</p>
                </div>
                <span className="text-xs text-slate-400">
                  {live.length} active • {pendingElevations.length} pending
                </span>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Operator</th>
                    <th className={TH}>Purpose</th>
                    <th className={TH}>Role</th>
                    <th className={TH}>Expires</th>
                    <th className="py-2 pl-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {elevations.length === 0 ? (
                    <StateRow
                      colSpan={5}
                      loading={jit.loading}
                      error={jit.error}
                      empty="No operator has requested elevated access to your tenant."
                    />
                  ) : (
                    elevations.map((j) => (
                      <tr key={j.id}>
                        <td className="py-3 pr-3 font-semibold text-white font-mono">{shortId(j.superAdminPrincipalId)}</td>
                        <td className={`${TD} text-slate-300`}>{j.statedPurpose}</td>
                        <td className={`${TD} text-slate-300`}>{humanize(j.roleCode)}</td>
                        <td className={`${TD} text-slate-300`}>
                          {j.expiresAt ? formatDateTime(j.expiresAt) : `${j.requestedDurationMinutes} min requested`}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <span className={`${PILL} ${statusClass(isLiveElevation(j, now) ? "ACTIVE" : j.status)}`}>
                            {isLiveElevation(j, now) ? "Active" : humanize(j.status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {activeTab === "Overview" && (
            <div className="lg:col-span-5 space-y-4">
              <div className={`${CARD} space-y-3`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">Privileged access requests</h2>
                  <span className={`${PILL} bg-amber-950/80 border border-amber-500/40 text-amber-300`}>
                    {jit.loading ? "…" : `${pendingElevations.length} pending`}
                  </span>
                </div>
                <ErrorNote message={jit.error} />
                {!jit.loading && !jit.error && pendingElevations.length === 0 && (
                  <p className="text-xs text-slate-400">No elevation requests are waiting.</p>
                )}
                {pendingElevations.map((j) => (
                  <div key={j.id} className={`${INNER} space-y-2 text-xs`}>
                    <div className="text-sm font-bold text-white">{humanize(j.roleCode)}</div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Operator</span>
                      <span className="font-semibold text-white font-mono">{shortId(j.superAdminPrincipalId)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Duration</span>
                      <span className="font-semibold text-white">{j.requestedDurationMinutes} minutes</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Reason</span>
                      <span className="font-semibold text-white text-right">{j.statedPurpose}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Requested</span>
                      <span className="font-semibold text-white">{formatDateTime(j.createdAt)}</span>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">
                  Elevation is approved by a second ZoikoShield administrator; this is your audit view of every request.
                </p>
              </div>

              <div className={`${CARD} space-y-2 text-xs`}>
                <h2 className="text-base font-bold text-white">Workload identity hygiene</h2>
                <div className="text-lg font-extrabold text-white">
                  {identities.error ? "—" : nonHuman.length}{" "}
                  <span className="text-xs font-normal text-slate-400">Workload identities</span>
                </div>
                {Object.entries(countBy(nonHuman, (i) => i.identity_type)).map(([type, n]) => (
                  <div key={type} className="text-slate-300">
                    {n} {humanize(type).toLowerCase()}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setActiveTab("Identities")}
                  className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-block pt-1"
                >
                  Inspect identities →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
