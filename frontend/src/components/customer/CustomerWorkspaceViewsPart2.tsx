"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { asList, backend } from "@/lib/backend";
import {
  customerApi,
  timeAgo,
  percent,
  type Alert,
  type Asset,
  type DetectionDefinition,
  type Finding,
  type Tenant,
} from "@/lib/customer-api";
import { CANONICAL_POLICY_PACKS, CANONICAL_REGIONS } from "@/lib/assurance-primitives";

/* ============================================================================
 * Shared plumbing
 *
 * Every number and row on these pages comes from a shield-core endpoint.
 * Loading, failure and "nothing yet" are shown as such; nothing is filled in.
 * ========================================================================== */

interface Source<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  loadedAt: Date | null;
  reload: () => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Loads once on mount and again whenever reload() is called. */
function useSource<T>(load: () => Promise<T>): Source<T> {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<Source<T>, "reload">>({
    data: null,
    error: null,
    loading: true,
    loadedAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false, loadedAt: new Date() });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, error: errorMessage(err), loading: false, loadedAt: null });
      });
    return () => {
      cancelled = true;
    };
    // The loader is a stable module-level call; only reload() re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

const getList = <T,>(path: string) => async () => asList<T>(await backend.get(path));

function exportCsvData(filename: string, rows: Record<string, unknown>[]) {
  if (typeof window === "undefined" || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  saveBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
}

function downloadJson(filename: string, data: unknown) {
  saveBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}

function saveBlob(filename: string, blob: Blob) {
  if (typeof window === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** "NOT_CONNECTED" -> "Not connected" */
function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replace(/[_-]+/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const bySeverity = <T extends { severity: string }>(a: T, b: T) =>
  (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);

const CLOSED_FINDING_STATUSES = ["RESOLVED", "CLOSED", "ACCEPTED", "FALSE_POSITIVE"];
const isOpenFinding = (f: Finding) => !CLOSED_FINDING_STATUSES.includes(String(f.status).toUpperCase());
const isOpenAlert = (a: Alert) => !["RESOLVED", "CLOSED"].includes(String(a.status).toUpperCase());

function countBySeverity<T extends { severity: string }>(rows: T[]) {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.severity] = (out[r.severity] ?? 0) + 1;
  return out;
}

function severityLine(rows: { severity: string }[]): string {
  const c = countBySeverity(rows);
  return `${c.CRITICAL ?? 0} critical • ${c.HIGH ?? 0} high • ${c.MEDIUM ?? 0} medium`;
}

function severityBadgeClass(severity: string): string {
  switch (String(severity).toUpperCase()) {
    case "CRITICAL":
      return "bg-red-950/80 border border-red-500/40 text-red-300";
    case "HIGH":
      return "bg-orange-950/80 border border-orange-500/40 text-orange-300";
    case "MEDIUM":
      return "bg-amber-950/80 border border-amber-500/40 text-amber-300";
    default:
      return "bg-slate-800/80 border border-slate-600/40 text-slate-300";
  }
}

const PAGE_CLASS =
  "w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5";
const CARD_CLASS = "rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3";
const BADGE_CLASS = "px-2.5 py-0.5 rounded-full text-[11px] font-semibold";
const NEUTRAL_BADGE = "bg-slate-800/80 border border-slate-600/40 text-slate-300";
const GOOD_BADGE = "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300";
const WARN_BADGE = "bg-amber-950/80 border border-amber-500/40 text-amber-300";
const BAD_BADGE = "bg-red-950/80 border border-red-500/40 text-red-300";
const INPUT_CLASS = "px-3 py-1.5 rounded-xl bg-[#07101e] border border-slate-700 text-xs text-white";
const PRIMARY_BUTTON =
  "px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white disabled:opacity-50";
const SECONDARY_BUTTON =
  "px-3.5 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs font-semibold text-slate-100 disabled:opacity-50";

function PageHeader({ title, subtitle, loadedAt }: { title: string; subtitle: string; loadedAt: Date | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">{title}</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="text-xs text-slate-400">
        {loadedAt ? `Loaded ${loadedAt.toLocaleTimeString()}` : "Loading…"}
      </div>
    </div>
  );
}

function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  activeClass = "bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white",
}: {
  tabs: readonly T[];
  active: T;
  onChange: (t: T) => void;
  activeClass?: string;
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
            active === tab ? activeClass : "text-slate-300 hover:text-white"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  subClass = "text-slate-400",
  source,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  subClass?: string;
  source: { loading: boolean; error: string | null };
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
      <div className="text-xs font-medium text-slate-300">{label}</div>
      <div className={`${mono ? "text-xl font-mono" : "text-3xl"} font-extrabold text-white`}>
        {source.loading ? "…" : source.error ? "—" : value}
      </div>
      <div className={`text-xs font-medium ${source.error ? "text-red-400" : subClass}`}>
        {source.loading ? "Loading…" : source.error ? "Unavailable" : sub}
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl bg-red-950/50 border border-red-500/40 px-4 py-2.5 text-xs text-red-200">
      {message}
    </div>
  );
}

function SuccessNote({ message }: { message: string }) {
  return (
    <div role="status" className="rounded-xl bg-emerald-950/50 border border-emerald-500/40 px-4 py-2.5 text-xs text-emerald-200">
      {message}
    </div>
  );
}

/** Placeholder row for a table that is loading, failed, or has nothing to show. */
function TableFallback({
  source,
  count,
  colSpan,
  empty,
}: {
  source: { loading: boolean; error: string | null };
  count: number;
  colSpan: number;
  empty: string;
}) {
  let content: React.ReactNode = null;
  if (source.loading) content = "Loading…";
  else if (source.error) content = <span className="text-red-300">Could not load: {source.error}</span>;
  else if (count === 0) content = empty;
  if (content === null) return null;
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-slate-400">
        {content}
      </td>
    </tr>
  );
}

/** Combines several sources: loading while any loads, failed if any failed. */
function combine(...sources: Array<{ loading: boolean; error: string | null }>) {
  return {
    loading: sources.some((s) => s.loading),
    error: sources.find((s) => s.error)?.error ?? null,
  };
}

function regionLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return CANONICAL_REGIONS[code.toLowerCase()]?.shortLabel ?? code;
}

/* ============================================================================
 * 8. DATA SECURITY
 * Findings of the data-exposure types, data-store assets from the inventory,
 * and alerts — all from shield-core.
 * ========================================================================== */

const DATA_RISK_TYPES = ["EXPOSURE", "WEAKNESS"];
/** Asset types the inventory uses for places data is stored. */
const DATA_STORE_ASSET_TYPES = [
  "DATABASE",
  "DATA_WAREHOUSE",
  "S3_BUCKET",
  "GCS_BUCKET",
  "OBJECT_STORAGE",
  "STORAGE_ACCOUNT",
  "BLOB_CONTAINER",
  "FILE_SHARE",
];

function findingAssetLabel(f: Finding): string {
  return f.asset_external_ref ?? (f.asset_id ? f.asset_id.slice(0, 8) : "Not resolved");
}

export function CustomerDataSecuritySection() {
  const tabs = ["Overview", "Data inventory", "Exposure findings", "Alerts"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const findings = useSource(() => customerApi.findings({ limit: 200 }));
  const alerts = useSource(() => customerApi.alerts(100));
  const definitions = useSource(() => customerApi.detectionDefinitions());
  const assets = useSource(() => customerApi.assets(200));

  const dataRisks = useMemo(
    () =>
      (findings.data ?? [])
        .filter((f) => DATA_RISK_TYPES.includes(String(f.finding_type).toUpperCase()) && isOpenFinding(f))
        .sort(bySeverity),
    [findings.data],
  );
  const exposures = dataRisks.filter((f) => f.finding_type === "EXPOSURE");
  const weaknesses = dataRisks.filter((f) => f.finding_type === "WEAKNESS");
  const openAlerts = useMemo(() => (alerts.data ?? []).filter(isOpenAlert).sort(bySeverity), [alerts.data]);
  const dataStores = useMemo(
    () => (assets.data ?? []).filter((a: Asset) => DATA_STORE_ASSET_TYPES.includes(String(a.asset_type).toUpperCase())),
    [assets.data],
  );
  const categoryByDefinition = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of definitions.data ?? ([] as DetectionDefinition[])) map.set(d.id, d.category ?? "—");
    return map;
  }, [definitions.data]);

  const selected = dataRisks.find((f) => f.id === selectedId) ?? dataRisks[0] ?? null;
  const currentAssertions = dataRisks.filter((f) => f.assertion?.state === "CURRENT").length;
  const unresolvedAssets = dataRisks.filter((f) => !f.asset_id).length;

  const showFindings = activeTab === "Overview" || activeTab === "Exposure findings";
  const showAlerts = activeTab === "Overview" || activeTab === "Alerts";
  const findingRows = activeTab === "Overview" ? dataRisks.slice(0, 5) : dataRisks;
  const alertRows = activeTab === "Overview" ? openAlerts.slice(0, 5) : openAlerts;

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Data Security"
        subtitle="Locate sensitive data. Reduce exposure. Verify protection."
        loadedAt={findings.loadedAt}
      />

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        <button
          type="button"
          disabled={dataRisks.length === 0}
          onClick={() =>
            exportCsvData(
              "data-security-findings.csv",
              dataRisks.map((f) => ({
                title: f.title,
                type: f.finding_type,
                severity: f.severity,
                status: f.status,
                source: f.source_system,
                asset: findingAssetLabel(f),
                firstDetected: f.first_detected_at,
                lastConfirmed: f.last_confirmed_at,
              })),
            )
          }
          className={SECONDARY_BUTTON}
        >
          Export findings (CSV)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          label="Data stores in inventory"
          source={assets}
          value={dataStores.length}
          sub={`of ${(assets.data ?? []).length} assets in the inventory`}
        />
        <Kpi
          label="Open exposure findings"
          source={findings}
          value={exposures.length}
          sub={severityLine(exposures)}
          subClass="text-red-400"
        />
        <Kpi
          label="Open weakness findings"
          source={findings}
          value={weaknesses.length}
          sub={severityLine(weaknesses)}
          subClass="text-amber-400"
        />
        <Kpi
          label="Open alerts"
          source={alerts}
          value={openAlerts.length}
          sub={severityLine(openAlerts)}
          subClass="text-amber-400"
        />
      </div>

      {activeTab === "Data inventory" && (
        <div className={CARD_CLASS}>
          <h2 className="text-base font-bold text-white">Data stores</h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 px-3 font-medium">Type</th>
                <th className="py-2 px-3 font-medium">Criticality</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 pl-3 font-medium text-right">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <TableFallback
                source={assets}
                count={dataStores.length}
                colSpan={5}
                empty="No data stores in the asset inventory yet. Connect a cloud or data source in Integrations."
              />
              {dataStores.map((a) => (
                <tr key={a.id}>
                  <td className="py-3 pr-3 font-semibold text-white">{a.name ?? a.external_id}</td>
                  <td className="py-3 px-3 text-slate-300">{humanize(a.asset_type)}</td>
                  <td className="py-3 px-3 text-slate-300">{humanize(a.criticality)}</td>
                  <td className="py-3 px-3 text-slate-300">{humanize(a.status)}</td>
                  <td className="py-3 pl-3 text-right text-slate-300">{timeAgo(a.last_seen_at) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showFindings || showAlerts) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className={`${showFindings ? "lg:col-span-7" : "lg:col-span-12"} space-y-4`}>
            {showFindings && (
              <div className={CARD_CLASS}>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">Priority data risks</h2>
                  {activeTab === "Overview" && dataRisks.length > findingRows.length && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("Exposure findings")}
                      className="text-xs font-semibold text-sky-400"
                    >
                      View all {dataRisks.length} →
                    </button>
                  )}
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3 font-medium">Finding</th>
                      <th className="py-2 px-3 font-medium">Source</th>
                      <th className="py-2 px-3 font-medium">Severity</th>
                      <th className="py-2 px-3 font-medium">Asset</th>
                      <th className="py-2 pl-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <TableFallback
                      source={findings}
                      count={dataRisks.length}
                      colSpan={5}
                      empty="No open exposure or weakness findings."
                    />
                    {findingRows.map((f) => (
                      <tr
                        key={f.id}
                        onClick={() => setSelectedId(f.id)}
                        className={`cursor-pointer ${selected?.id === f.id ? "bg-red-950/25" : "hover:bg-slate-800/30"}`}
                      >
                        <td className="py-3 pr-3 font-semibold text-white">{f.title}</td>
                        <td className="py-3 px-3 text-slate-300">{f.source_system}</td>
                        <td className="py-3 px-3">
                          <span className={`${BADGE_CLASS} ${severityBadgeClass(f.severity)}`}>{humanize(f.severity)}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-300">{findingAssetLabel(f)}</td>
                        <td className="py-3 pl-3 text-right">
                          <span className={`${BADGE_CLASS} ${NEUTRAL_BADGE}`}>{humanize(f.status)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showAlerts && (
              <div className={CARD_CLASS}>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">Recent alerts</h2>
                  {activeTab === "Overview" && openAlerts.length > alertRows.length && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("Alerts")}
                      className="text-xs font-semibold text-sky-400"
                    >
                      View all {openAlerts.length} →
                    </button>
                  )}
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3 font-medium">Alert</th>
                      <th className="py-2 px-3 font-medium">Category</th>
                      <th className="py-2 px-3 font-medium">Severity</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 pl-3 font-medium text-right">Raised</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <TableFallback source={alerts} count={openAlerts.length} colSpan={5} empty="No open alerts." />
                    {alertRows.map((a) => (
                      <tr key={a.id}>
                        <td className="py-3 pr-3 font-semibold text-white">{a.title}</td>
                        <td className="py-3 px-3 text-slate-300">
                          {humanize(categoryByDefinition.get(a.detection_definition_id) ?? null)}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`${BADGE_CLASS} ${severityBadgeClass(a.severity)}`}>{humanize(a.severity)}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-300">{humanize(a.status)}</td>
                        <td className="py-3 pl-3 text-right text-slate-300">{timeAgo(a.created_at) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {showFindings && (
            <div className="lg:col-span-5 space-y-4">
              <div className={CARD_CLASS}>
                <h2 className="text-base font-bold text-white">Selected risk</h2>
                {!selected ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    {findings.loading ? "Loading…" : findings.error ? "Findings unavailable." : "No open data risks to inspect."}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-2 text-xs">
                    <div className="text-sm font-bold text-white">{selected.title}</div>
                    {selected.description && <p className="text-slate-300">{selected.description}</p>}
                    <div className="flex justify-between">
                      <span className="text-slate-400">Type</span>
                      <span className="font-semibold text-white">{humanize(selected.finding_type)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Source</span>
                      <span className="font-semibold text-white">{selected.source_system}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Asset</span>
                      <span className="font-semibold text-white">{findingAssetLabel(selected)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">First detected</span>
                      <span className="font-semibold text-white">{fmtDateTime(selected.first_detected_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Priority score</span>
                      <span className="font-semibold text-white">{selected.priority_score ?? "Not scored"}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 pt-1">{selected.assertion?.reason}</p>
                    <Link
                      href="/customer/exposure-management"
                      className="w-full mt-2 py-2 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white inline-flex items-center justify-center"
                    >
                      Open in Exposure Management →
                    </Link>
                  </div>
                )}
              </div>

              <div className={`${CARD_CLASS} text-xs`}>
                <h2 className="text-base font-bold text-white">Assessment confidence</h2>
                {findings.loading ? (
                  <div className="text-slate-400">Loading…</div>
                ) : findings.error ? (
                  <div className="text-red-300">Could not load: {findings.error}</div>
                ) : dataRisks.length === 0 ? (
                  <div className="text-slate-400">No open data risks to assess.</div>
                ) : (
                  <>
                    <div className="text-lg font-extrabold text-white">
                      {currentAssertions} of {dataRisks.length}
                    </div>
                    <div className="text-slate-400">
                      open data risks reconfirmed within their source&apos;s reassertion interval
                    </div>
                    <div className="text-slate-300">Not linked to an inventory asset: {unresolvedAssets}</div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab("Data inventory")}
                  className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-block pt-1"
                >
                  Review data inventory →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 9. CLOUD SECURITY
 * Posture findings from cloud sources and the cloud connectors configured.
 * ========================================================================== */

const CLOUD_FINDING_TYPES = ["MISCONFIGURATION", "EXPOSURE"];
/** source_system prefixes that identify a cloud provider. */
const CLOUD_SOURCE_PREFIXES = ["aws", "azure", "gcp", "google"];
/** Catalogue category the ingest service gives cloud-provider connectors. */
const CLOUD_CONNECTOR_CATEGORY = "Cloud Infrastructure";

const isCloudSource = (source: string) =>
  CLOUD_SOURCE_PREFIXES.some((p) => String(source).toLowerCase().startsWith(p));

interface ConnectorRow {
  id: string;
  name: string;
  state: string;
  authentication_type?: string;
  source_region?: string | null;
  createdAt?: string;
  definition?: { provider: string };
}

interface ConnectorType {
  id: string;
  name: string;
  category: string;
  description: string;
  supportedAuthTypes: string[];
}

interface ConnectorHealth {
  state: string;
  lastMessage: string | null;
  permissionStatus: string;
  credentialStatus: string;
  consecutiveFailures: number;
  lastSuccessfulConnectionAt: string | null;
  lastSuccessfulSyncAt: string | null;
}

const CONNECTED_STATES = ["CONNECTED", "HEALTHY", "SYNCING"];
const ATTENTION_STATES = [
  "DEGRADED",
  "RATE_LIMITED",
  "PERMISSION_REVOKED",
  "AUTHENTICATION_FAILED",
  "CHECKPOINT_INVALID",
];

function connectorStateBadge(state: string): string {
  if (CONNECTED_STATES.includes(state)) return GOOD_BADGE;
  if (ATTENTION_STATES.includes(state)) return BAD_BADGE;
  return WARN_BADGE;
}

const loadConnectors = async () => (await customerApi.connectors()) as unknown as ConnectorRow[];
const loadConnectorTypes = getList<ConnectorType>("/api/v1/connector-types");

export function CustomerCloudSecuritySection() {
  const tabs = ["Overview", "Cloud inventory", "Posture findings"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview");

  const findings = useSource(() => customerApi.findings({ limit: 200 }));
  const connectors = useSource(loadConnectors);
  const types = useSource(loadConnectorTypes);
  const health = useSource(() => customerApi.serviceHealth());

  const cloudFindings = useMemo(
    () =>
      (findings.data ?? [])
        .filter(
          (f) =>
            CLOUD_FINDING_TYPES.includes(String(f.finding_type).toUpperCase()) &&
            isCloudSource(f.source_system) &&
            isOpenFinding(f),
        )
        .sort(bySeverity),
    [findings.data],
  );
  const typeById = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t])), [types.data]);
  const cloudConnectors = useMemo(
    () =>
      (connectors.data ?? []).filter(
        (c) => typeById.get(c.definition?.provider ?? "")?.category === CLOUD_CONNECTOR_CATEGORY,
      ),
    [connectors.data, typeById],
  );
  const connectedCloud = cloudConnectors.filter((c) => CONNECTED_STATES.includes(c.state)).length;
  const staleFindings = cloudFindings.filter((f) => f.assertion && f.assertion.state !== "CURRENT");
  const inventorySource = combine(connectors, types);

  const findingRows = activeTab === "Overview" ? cloudFindings.slice(0, 5) : cloudFindings;

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Cloud Security"
        subtitle="See cloud risk. Strengthen every workload."
        loadedAt={findings.loadedAt}
      />

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        <button
          type="button"
          disabled={cloudFindings.length === 0}
          onClick={() =>
            exportCsvData(
              "cloud-posture-findings.csv",
              cloudFindings.map((f) => ({
                title: f.title,
                provider: f.source_system,
                type: f.finding_type,
                severity: f.severity,
                status: f.status,
                lastConfirmed: f.last_confirmed_at,
              })),
            )
          }
          className={SECONDARY_BUTTON}
        >
          Export findings (CSV)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          label="Cloud connectors"
          source={inventorySource}
          value={cloudConnectors.length}
          sub={`${connectedCloud} connected`}
        />
        <Kpi
          label="Open posture findings"
          source={findings}
          value={cloudFindings.length}
          sub={severityLine(cloudFindings)}
          subClass="text-red-400"
        />
        <Kpi
          label="Stale posture results"
          source={findings}
          value={staleFindings.length}
          sub="Not reconfirmed within the source's interval"
          subClass="text-amber-400"
        />
        <Kpi
          label="Connector health (all sources)"
          source={health}
          value={health.data ? `${health.data.connectorHealth.healthy} / ${health.data.connectorHealth.total}` : "—"}
          sub={`Overall: ${humanize(health.data?.overallHealth)}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          {activeTab !== "Cloud inventory" && (
            <div className={CARD_CLASS}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">Priority cloud findings</h2>
                {activeTab === "Overview" && cloudFindings.length > findingRows.length && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("Posture findings")}
                    className="text-xs font-semibold text-sky-400"
                  >
                    View all {cloudFindings.length} →
                  </button>
                )}
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Finding</th>
                    <th className="py-2 px-3 font-medium">Provider</th>
                    <th className="py-2 px-3 font-medium">Type</th>
                    <th className="py-2 px-3 font-medium">Severity</th>
                    <th className="py-2 pl-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <TableFallback
                    source={findings}
                    count={cloudFindings.length}
                    colSpan={5}
                    empty="No open cloud posture findings."
                  />
                  {findingRows.map((f) => (
                    <tr key={f.id}>
                      <td className="py-3 pr-3 font-semibold text-white">{f.title}</td>
                      <td className="py-3 px-3 text-slate-300">{f.source_system}</td>
                      <td className="py-3 px-3 text-slate-300">{humanize(f.finding_type)}</td>
                      <td className="py-3 px-3">
                        <span className={`${BADGE_CLASS} ${severityBadgeClass(f.severity)}`}>{humanize(f.severity)}</span>
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <span className={`${BADGE_CLASS} ${NEUTRAL_BADGE}`}>{humanize(f.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab !== "Posture findings" && (
            <div className={CARD_CLASS}>
              <h2 className="text-base font-bold text-white">Cloud connectors</h2>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Connector</th>
                    <th className="py-2 px-3 font-medium">Type</th>
                    <th className="py-2 px-3 font-medium">Region</th>
                    <th className="py-2 px-3 font-medium">Added</th>
                    <th className="py-2 pl-3 font-medium text-right">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <TableFallback
                    source={inventorySource}
                    count={cloudConnectors.length}
                    colSpan={5}
                    empty="No cloud connectors configured. Add one from the Integrations catalog."
                  />
                  {cloudConnectors.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 pr-3 font-semibold text-white">{c.name}</td>
                      <td className="py-3 px-3 text-slate-300">
                        {typeById.get(c.definition?.provider ?? "")?.name ?? c.definition?.provider ?? "—"}
                      </td>
                      <td className="py-3 px-3 text-slate-300">{c.source_region ?? "—"}</td>
                      <td className="py-3 px-3 text-slate-300">{fmtDate(c.createdAt)}</td>
                      <td className="py-3 pl-3 text-right">
                        <span className={`${BADGE_CLASS} ${connectorStateBadge(c.state)}`}>{humanize(c.state)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <div className={CARD_CLASS}>
            <h2 className="text-base font-bold text-white">Assessment attention</h2>
            {findings.loading ? (
              <div className="py-6 text-center text-xs text-slate-400">Loading…</div>
            ) : findings.error ? (
              <div className="py-6 text-center text-xs text-red-300">Could not load: {findings.error}</div>
            ) : cloudFindings.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No cloud posture findings reported.</div>
            ) : staleFindings.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 text-xs text-slate-300">
                Every open cloud posture finding was reconfirmed within its source&apos;s interval.
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-2 text-xs">
                {staleFindings.map((f) => (
                  <div key={f.id}>
                    <div className="text-sm font-bold text-white">{f.title}</div>
                    <div className="text-slate-300">{f.assertion.reason}</div>
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/customer/integrations"
              className="w-full mt-2 py-2 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white inline-flex items-center justify-center"
            >
              Manage cloud connectors →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 10. COMPLIANCE & RISK
 * Sector framework readiness, assurance counts, control implementations
 * and exceptions.
 * ========================================================================== */

interface FrameworkSummary {
  score: number | null;
  status: string;
  totalArticles?: number;
  totalControls?: number;
  compliantCount: number;
  gapCount: number;
  merkleRoot?: string;
}

interface SectorSummary {
  frameworks: Record<string, FrameworkSummary>;
  assessedAt: string;
}

interface ControlImplementation {
  id: string;
  title: string;
  implementation_type: string;
  status: string;
  effective_from: string;
  reviewed_at: string | null;
}

interface ExceptionRecord {
  id: string;
  reason: string;
  status: string;
  starts_at: string;
  expires_at: string;
}

function frameworkBadge(status: string): string {
  if (status === "COMPLIANT") return GOOD_BADGE;
  if (status === "NON_COMPLIANT") return BAD_BADGE;
  return WARN_BADGE;
}

export function CustomerComplianceRiskSection() {
  const tabs = ["Overview", "Frameworks", "Controls", "Exceptions"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview");

  const sector = useSource(() => backend.get<SectorSummary>("/api/v1/compliance/sector-summary"));
  const assurance = useSource(() => customerApi.assuranceReport());
  const tenant = useSource(() => customerApi.tenant());
  const controls = useSource(getList<{ id: string }>("/api/v1/controls"));
  const implementations = useSource(getList<ControlImplementation>("/api/v1/control-implementations"));
  const exceptions = useSource(getList<ExceptionRecord>("/api/v1/exceptions"));

  const frameworks = useMemo(
    () =>
      Object.entries(sector.data?.frameworks ?? {}).map(([name, f]) => ({
        name,
        requirements: f.totalArticles ?? f.totalControls ?? 0,
        compliant: f.compliantCount,
        gaps: f.gapCount,
        score: f.score,
        status: f.status,
        merkleRoot: f.merkleRoot ?? "",
      })),
    [sector.data],
  );

  const m = assurance.data?.metrics;
  const assessedControls = m
    ? m.controlsEffective + m.controlsPartiallyEffective + m.controlsIneffective + m.controlsUnknown
    : 0;
  const effectiveness = m ? percent(m.controlsEffective, assessedControls) : null;
  const residency = (tenant.data as Tenant | null)?.dataResidencyRegion ?? "";
  const policyPack = residency ? CANONICAL_POLICY_PACKS[residency.toLowerCase()] : undefined;

  const show = (tab: (typeof tabs)[number]) => activeTab === "Overview" || activeTab === tab;

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Compliance & Risk"
        subtitle="Track continuous control effectiveness, regulatory frameworks, and governed risk exceptions."
        loadedAt={assurance.loadedAt}
      />

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        <button
          type="button"
          disabled={frameworks.length === 0}
          onClick={() => exportCsvData("framework-readiness.csv", frameworks)}
          className={SECONDARY_BUTTON}
        >
          Export frameworks (CSV)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          label="Control effectiveness"
          source={assurance}
          value={effectiveness === null ? "—" : `${effectiveness}%`}
          sub={
            m && assessedControls > 0
              ? `${m.controlsEffective} effective • ${m.controlsPartiallyEffective} partial • ${m.controlsIneffective} ineffective • ${m.controlsUnknown} unknown`
              : "No control assessments recorded yet"
          }
          subClass="text-emerald-400"
        />
        <Kpi
          label="Open evidence gaps"
          source={assurance}
          value={m?.evidenceGapsOpen ?? "—"}
          sub={`Assurance health: ${humanize(assurance.data?.healthState)}`}
        />
        <Kpi
          label="Active exceptions"
          source={assurance}
          value={m?.activeExceptions ?? "—"}
          sub={`${m?.expiredExceptions ?? 0} expired • ${m?.activeRisks ?? 0} active risks`}
          subClass="text-amber-400"
        />
        <Kpi
          label="Active policy pack"
          source={tenant}
          mono
          value={regionLabel(residency)}
          sub={policyPack ? policyPack.policy_key : `No policy pack is mapped to ${residency || "this region"}`}
        />
      </div>

      {show("Frameworks") && (
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Monitored compliance frameworks</h2>
            {sector.data?.assessedAt && (
              <span className="text-xs text-slate-400">Assessed {timeAgo(sector.data.assessedAt)}</span>
            )}
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Framework</th>
                <th className="py-2 px-3 font-medium">Compliant / Requirements</th>
                <th className="py-2 px-3 font-medium">Gaps</th>
                <th className="py-2 px-3 font-medium">Score</th>
                <th className="py-2 px-3 font-medium">Evidence root</th>
                <th className="py-2 pl-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <TableFallback
                source={sector}
                count={frameworks.length}
                colSpan={6}
                empty="No frameworks are being evaluated for this workspace."
              />
              {frameworks.map((f) => (
                <tr key={f.name} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-3 font-semibold text-white">{f.name}</td>
                  <td className="py-3 px-3 text-slate-300">
                    {f.compliant} / {f.requirements}
                  </td>
                  <td className="py-3 px-3 text-slate-300">{f.gaps}</td>
                  <td className="py-3 px-3 font-semibold text-white">{f.score === null ? "Not scored" : `${f.score}%`}</td>
                  <td className="py-3 px-3 font-mono text-slate-400" title={f.merkleRoot}>
                    {f.merkleRoot ? `${f.merkleRoot.slice(0, 12)}…` : "—"}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <span className={`${BADGE_CLASS} ${frameworkBadge(f.status)}`}>{humanize(f.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {show("Controls") && (
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Control implementations</h2>
            {controls.data && (
              <span className="text-xs text-slate-400">
                {controls.data.length} control objectives in the catalogue
              </span>
            )}
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Control</th>
                <th className="py-2 px-3 font-medium">Type</th>
                <th className="py-2 px-3 font-medium">Effective from</th>
                <th className="py-2 px-3 font-medium">Last reviewed</th>
                <th className="py-2 pl-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <TableFallback
                source={implementations}
                count={(implementations.data ?? []).length}
                colSpan={5}
                empty="No control implementations recorded for this workspace."
              />
              {(implementations.data ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="py-3 pr-3 font-semibold text-white">{c.title}</td>
                  <td className="py-3 px-3 text-slate-300">{humanize(c.implementation_type)}</td>
                  <td className="py-3 px-3 text-slate-300">{fmtDate(c.effective_from)}</td>
                  <td className="py-3 px-3 text-slate-300">{fmtDate(c.reviewed_at)}</td>
                  <td className="py-3 pl-3 text-right">
                    <span className={`${BADGE_CLASS} ${NEUTRAL_BADGE}`}>{humanize(c.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {show("Exceptions") && (
        <div className={CARD_CLASS}>
          <h2 className="text-base font-bold text-white">Exceptions</h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Reason</th>
                <th className="py-2 px-3 font-medium">Starts</th>
                <th className="py-2 px-3 font-medium">Expires</th>
                <th className="py-2 pl-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <TableFallback
                source={exceptions}
                count={(exceptions.data ?? []).length}
                colSpan={4}
                empty="No exceptions have been requested."
              />
              {(exceptions.data ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="py-3 pr-3 font-semibold text-white">{e.reason}</td>
                  <td className="py-3 px-3 text-slate-300">{fmtDate(e.starts_at)}</td>
                  <td className="py-3 px-3 text-slate-300">{fmtDate(e.expires_at)}</td>
                  <td className="py-3 pl-3 text-right">
                    <span className={`${BADGE_CLASS} ${NEUTRAL_BADGE}`}>{humanize(e.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 11. REPORTS & ANALYTICS
 * Report snapshots, export jobs and audit packages, with real downloads.
 * ========================================================================== */

interface ReportSnapshot {
  id: string;
  report_definition_id: string;
  period_start: string;
  period_end: string;
  status: string;
  completeness_state: string;
  generated_at: string;
}

interface ReportDefinition {
  id: string;
  name: string;
  report_type: string;
}

interface ExportJob {
  id: string;
  purpose: string;
  export_type: string;
  status: string;
  progress: number;
  created_at: string;
  completed_at: string | null;
}

interface AuditPackage {
  id: string;
  purpose: string;
  period_start: string;
  period_end: string;
  status: string;
  completeness_state: string;
  created_at: string;
}

/** Scopes the export builder in shield-core knows how to produce. */
const EXPORT_SCOPES: Array<{ key: string; label: string }> = [
  { key: "alerts", label: "Alerts" },
  { key: "cases", label: "Cases" },
  { key: "controls", label: "Control implementations" },
  { key: "assessments", label: "Assessments" },
  { key: "risks", label: "Risks" },
  { key: "exceptions", label: "Exceptions" },
  { key: "evidence_metadata", label: "Evidence metadata" },
  { key: "audit_packages", label: "Audit packages" },
];
const EXPORT_TYPE = "CUSTOMER_DATA_EXPORT";
const DOWNLOADABLE_EXPORT_STATES = ["READY", "PARTIAL"];
const TERMINAL_EXPORT_STATES = ["READY", "PARTIAL", "FAILED", "EXPIRED", "CANCELLED"];

function exportBadge(status: string): string {
  if (status === "READY") return GOOD_BADGE;
  if (["FAILED", "EXPIRED", "CANCELLED"].includes(status)) return BAD_BADGE;
  return WARN_BADGE;
}

export function CustomerReportsAnalyticsSection() {
  const tabs = ["Overview", "Report snapshots", "Exports", "Audit packages"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview");

  const snapshots = useSource(getList<ReportSnapshot>("/api/v1/reporting/snapshots"));
  const definitions = useSource(getList<ReportDefinition>("/api/v1/reporting/definitions"));
  const exportsSrc = useSource(getList<ExportJob>("/api/v1/exports"));
  const packages = useSource(getList<AuditPackage>("/api/v1/audit-packages"));

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [exportFormOpen, setExportFormOpen] = useState(false);
  const [exportPurpose, setExportPurpose] = useState("");
  const [exportScopes, setExportScopes] = useState<string[]>([]);

  const [snapshotDefinition, setSnapshotDefinition] = useState("");
  const [snapshotStart, setSnapshotStart] = useState("");
  const [snapshotEnd, setSnapshotEnd] = useState("");

  const definitionName = useMemo(
    () => new Map((definitions.data ?? []).map((d) => [d.id, d.name])),
    [definitions.data],
  );

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setNotice(null);
    setActionError(null);
    try {
      setNotice(await action());
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const requestExport = (e: React.FormEvent) => {
    e.preventDefault();
    void run("export", async () => {
      const session = await customerApi.session();
      const job = await backend.post<ExportJob>(
        "/api/v1/exports",
        {
          purpose: exportPurpose.trim(),
          exportType: EXPORT_TYPE,
          requestedScope: exportScopes,
          formats: ["JSON"],
          environmentId: session.environmentId,
        },
        { confirmed: true },
      );
      setExportFormOpen(false);
      setExportPurpose("");
      setExportScopes([]);
      exportsSrc.reload();
      return `Export requested (status: ${humanize(job?.status)}).`;
    });
  };

  const generateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    void run("snapshot", async () => {
      const session = await customerApi.session();
      const snap = await backend.post<ReportSnapshot>(
        "/api/v1/reporting/snapshots",
        {
          reportDefinitionId: snapshotDefinition,
          periodStart: new Date(snapshotStart).toISOString(),
          periodEnd: new Date(snapshotEnd).toISOString(),
          environmentId: session.environmentId,
        },
        { confirmed: true },
      );
      snapshots.reload();
      return `Snapshot generated (status: ${humanize(snap?.status)}).`;
    });
  };

  const download = (key: string, path: string, filename: string) =>
    void run(key, async () => {
      downloadJson(filename, await backend.get<unknown>(path, { live: true }));
      return `Downloaded ${filename}.`;
    });

  const cancelExport = (id: string) =>
    void run(`cancel-${id}`, async () => {
      await backend.post(`/api/v1/exports/${encodeURIComponent(id)}/cancel`, undefined, { confirmed: true });
      exportsSrc.reload();
      return "Export cancelled.";
    });

  const show = (tab: (typeof tabs)[number]) => activeTab === "Overview" || activeTab === tab;
  const canGenerate =
    snapshotDefinition !== "" && snapshotStart !== "" && snapshotEnd !== "" && busy !== "snapshot";

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Generate executive posture summaries, operational metrics, and verifiable audit reports."
        loadedAt={exportsSrc.loadedAt}
      />

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        <button type="button" onClick={() => setExportFormOpen((v) => !v)} className={PRIMARY_BUTTON}>
          Request export
        </button>
      </div>

      {notice && <SuccessNote message={notice} />}
      {actionError && <ErrorNote message={actionError} />}

      {exportFormOpen && (
        <form
          onSubmit={requestExport}
          aria-label="Request export"
          className="rounded-2xl bg-[#0b1629] border border-red-500/40 p-4 space-y-3 text-xs"
        >
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Purpose</span>
            <input
              type="text"
              value={exportPurpose}
              onChange={(e) => setExportPurpose(e.target.value)}
              placeholder="Why this export is needed"
              className={INPUT_CLASS}
            />
          </label>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="text-slate-300 mb-1">Include</legend>
            {EXPORT_SCOPES.map((s) => (
              <label key={s.key} className="inline-flex items-center gap-1.5 text-slate-200">
                <input
                  type="checkbox"
                  checked={exportScopes.includes(s.key)}
                  onChange={(e) =>
                    setExportScopes((prev) =>
                      e.target.checked ? [...prev, s.key] : prev.filter((k) => k !== s.key),
                    )
                  }
                />
                {s.label}
              </label>
            ))}
          </fieldset>
          <button
            type="submit"
            disabled={!exportPurpose.trim() || exportScopes.length === 0 || busy === "export"}
            className={PRIMARY_BUTTON}
          >
            {busy === "export" ? "Requesting…" : "Submit export request"}
          </button>
        </form>
      )}

      {show("Report snapshots") && (
        <div className={CARD_CLASS}>
          <h2 className="text-base font-bold text-white">Report snapshots</h2>
          {definitions.error ? (
            <p className="text-xs text-red-300">Report definitions could not be loaded: {definitions.error}</p>
          ) : definitions.data && definitions.data.length === 0 ? (
            <p className="text-xs text-slate-400">
              No report definitions are published yet, so snapshots cannot be generated.
            </p>
          ) : definitions.data ? (
            <form onSubmit={generateSnapshot} aria-label="Generate snapshot" className="flex flex-wrap items-end gap-2 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-slate-300">Report</span>
                <select
                  value={snapshotDefinition}
                  onChange={(e) => setSnapshotDefinition(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Select a report</option>
                  {definitions.data.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-300">From</span>
                <input type="date" value={snapshotStart} onChange={(e) => setSnapshotStart(e.target.value)} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-300">To</span>
                <input type="date" value={snapshotEnd} onChange={(e) => setSnapshotEnd(e.target.value)} className={INPUT_CLASS} />
              </label>
              <button type="submit" disabled={!canGenerate} className={PRIMARY_BUTTON}>
                {busy === "snapshot" ? "Generating…" : "Generate snapshot"}
              </button>
            </form>
          ) : null}
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Report</th>
                <th className="py-2 px-3 font-medium">Period</th>
                <th className="py-2 px-3 font-medium">Completeness</th>
                <th className="py-2 px-3 font-medium">Generated</th>
                <th className="py-2 pl-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <TableFallback
                source={snapshots}
                count={(snapshots.data ?? []).length}
                colSpan={5}
                empty="No report snapshots generated yet."
              />
              {(snapshots.data ?? []).map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-3 font-semibold text-white">
                    {definitionName.get(s.report_definition_id) ?? s.report_definition_id}
                  </td>
                  <td className="py-3 px-3 text-slate-300">
                    {fmtDate(s.period_start)} – {fmtDate(s.period_end)}
                  </td>
                  <td className="py-3 px-3 text-slate-300">{humanize(s.completeness_state)}</td>
                  <td className="py-3 px-3 text-slate-300">{fmtDateTime(s.generated_at)}</td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        download(`snap-${s.id}`, `/api/v1/reporting/snapshots/${encodeURIComponent(s.id)}`, `report-snapshot-${s.id}.json`)
                      }
                      className="text-xs font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50"
                    >
                      Download →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {show("Exports") && (
        <div className={CARD_CLASS}>
          <h2 className="text-base font-bold text-white">Exports</h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Purpose</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Requested</th>
                <th className="py-2 px-3 font-medium">Completed</th>
                <th className="py-2 pl-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <TableFallback
                source={exportsSrc}
                count={(exportsSrc.data ?? []).length}
                colSpan={5}
                empty="No exports requested yet."
              />
              {(exportsSrc.data ?? []).map((job) => (
                <tr key={job.id} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-3 font-semibold text-white">{job.purpose}</td>
                  <td className="py-3 px-3">
                    <span className={`${BADGE_CLASS} ${exportBadge(job.status)}`}>{humanize(job.status)}</span>
                  </td>
                  <td className="py-3 px-3 text-slate-300">{fmtDateTime(job.created_at)}</td>
                  <td className="py-3 px-3 text-slate-300">{fmtDateTime(job.completed_at)}</td>
                  <td className="py-3 pl-3 text-right space-x-3">
                    {DOWNLOADABLE_EXPORT_STATES.includes(job.status) && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          download(
                            `exp-${job.id}`,
                            `/api/v1/exports/${encodeURIComponent(job.id)}/download/file`,
                            `zoikoshield-export-${job.id}.json`,
                          )
                        }
                        className="text-xs font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50"
                      >
                        Download →
                      </button>
                    )}
                    {!TERMINAL_EXPORT_STATES.includes(job.status) && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => cancelExport(job.id)}
                        className="text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {show("Audit packages") && (
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Audit packages</h2>
            <span className="text-xs text-slate-400">
              Creating a package requires an MFA-verified session and a continuous-assurance profile.
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Purpose</th>
                <th className="py-2 px-3 font-medium">Period</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Completeness</th>
                <th className="py-2 pl-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <TableFallback
                source={packages}
                count={(packages.data ?? []).length}
                colSpan={5}
                empty="No audit packages yet."
              />
              {(packages.data ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-3 font-semibold text-white">{p.purpose}</td>
                  <td className="py-3 px-3 text-slate-300">
                    {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
                  </td>
                  <td className="py-3 px-3 text-slate-300">{humanize(p.status)}</td>
                  <td className="py-3 px-3 text-slate-300">{humanize(p.completeness_state)}</td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        download(
                          `pkg-${p.id}`,
                          `/api/v1/audit-packages/${encodeURIComponent(p.id)}/manifest`,
                          `audit-package-${p.id}-manifest.json`,
                        )
                      }
                      className="text-xs font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50"
                    >
                      Download manifest →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 12. INTEGRATIONS
 * The tenant's connectors (shield-ingest via shield-core), the catalogue of
 * connector types the ingest service supports, and per-connector actions.
 * ========================================================================== */

export function CustomerIntegrationsSection() {
  const tabs = ["Connected", "Catalog"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Connected");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const connectors = useSource(loadConnectors);
  const types = useSource(loadConnectorTypes);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("");
  const [newAuth, setNewAuth] = useState("");
  const [newCredentialRef, setNewCredentialRef] = useState("");

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [health, setHealth] = useState<{ loading: boolean; error: string | null; data: ConnectorHealth | null }>({
    loading: false,
    error: null,
    data: null,
  });
  const [healthTick, setHealthTick] = useState(0);

  const typeById = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t])), [types.data]);
  const all = connectors.data ?? [];
  const categoryOf = (c: ConnectorRow) => typeById.get(c.definition?.provider ?? "")?.category ?? "";
  const typeNameOf = (c: ConnectorRow) =>
    typeById.get(c.definition?.provider ?? "")?.name ?? c.definition?.provider ?? "—";

  const q = searchQuery.trim().toLowerCase();
  const filtered = all.filter(
    (c) =>
      (!q || c.name.toLowerCase().includes(q) || typeNameOf(c).toLowerCase().includes(q)) &&
      (!categoryFilter || categoryOf(c) === categoryFilter) &&
      (!stateFilter || c.state === stateFilter),
  );
  const categories = Array.from(new Set((types.data ?? []).map((t) => t.category))).sort();
  const statesPresent = Array.from(new Set(all.map((c) => c.state))).sort();
  const selected = all.find((c) => c.id === selectedId) ?? all[0] ?? null;

  const connectedCount = all.filter((c) => CONNECTED_STATES.includes(c.state)).length;
  const attention = all.filter((c) => ATTENTION_STATES.includes(c.state));
  const notConnected = all.filter((c) => !CONNECTED_STATES.includes(c.state) && !ATTENTION_STATES.includes(c.state));
  const providerType = typeById.get(newProvider);

  useEffect(() => {
    setConfirmRemove(false);
    if (!selected) {
      setHealth({ loading: false, error: null, data: null });
      return;
    }
    let cancelled = false;
    setHealth({ loading: true, error: null, data: null });
    backend
      .get<ConnectorHealth | null>(`/api/v1/connectors/${encodeURIComponent(selected.id)}/health`)
      .then((data) => !cancelled && setHealth({ loading: false, error: null, data: data ?? null }))
      .catch((err) => !cancelled && setHealth({ loading: false, error: errorMessage(err), data: null }));
    return () => {
      cancelled = true;
    };
  }, [selected?.id, healthTick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setNotice(null);
    setActionError(null);
    try {
      setNotice(await action());
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const openAddForm = (providerId = "") => {
    setNewProvider(providerId);
    setNewAuth(typeById.get(providerId)?.supportedAuthTypes[0] ?? "");
    setAddOpen(true);
    setActiveTab("Connected");
  };

  const handleAddIntegration = (e: React.FormEvent) => {
    e.preventDefault();
    void run("add", async () => {
      const [session, tenant] = await Promise.all([customerApi.session(), customerApi.tenant()]);
      const body: Record<string, string> = {
        name: newName.trim(),
        provider: newProvider,
        environmentId: session.environmentId,
        sourceRegion: tenant.dataResidencyRegion,
      };
      if (newAuth) body.authenticationType = newAuth;
      if (newCredentialRef.trim()) body.credentialReference = newCredentialRef.trim();
      const created = await backend.post<ConnectorRow>("/api/v1/connectors", body, { confirmed: true });
      setAddOpen(false);
      setNewName("");
      setNewProvider("");
      setNewAuth("");
      setNewCredentialRef("");
      if (created?.id) setSelectedId(created.id);
      connectors.reload();
      return `Connector "${created?.name ?? body.name}" created (state: ${humanize(created?.state)}).`;
    });
  };

  const testConnection = (c: ConnectorRow) =>
    void run("test", async () => {
      const res = await backend.post<{ status?: string; latencyMs?: number }>(
        `/api/v1/connectors/${encodeURIComponent(c.id)}/test`,
        undefined,
        { confirmed: true },
      );
      setHealthTick((t) => t + 1);
      connectors.reload();
      return `Connection test for "${c.name}": ${humanize(res?.status)}.`;
    });

  const syncNow = (c: ConnectorRow) =>
    void run("sync", async () => {
      await backend.post(`/api/v1/connectors/${encodeURIComponent(c.id)}/sync`, undefined, { confirmed: true });
      setHealthTick((t) => t + 1);
      connectors.reload();
      return `Sync completed for "${c.name}".`;
    });

  const removeConnector = (c: ConnectorRow) =>
    void run("remove", async () => {
      await backend.delete(`/api/v1/connectors/${encodeURIComponent(c.id)}`);
      setSelectedId(null);
      connectors.reload();
      return `Connector "${c.name}" removed.`;
    });

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Integrations"
        subtitle="Connect securely. Verify data flow and response readiness."
        loadedAt={connectors.loadedAt}
      />

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        <button type="button" onClick={() => (addOpen ? setAddOpen(false) : openAddForm())} className={PRIMARY_BUTTON}>
          + Add integration
        </button>
      </div>

      {notice && <SuccessNote message={notice} />}
      {actionError && <ErrorNote message={actionError} />}

      {addOpen && (
        <form
          onSubmit={handleAddIntegration}
          aria-label="Add integration"
          className="rounded-2xl bg-[#0b1629] border border-red-500/40 p-4 flex flex-wrap items-end gap-3 text-xs"
        >
          <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-slate-300">Name</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Integration name"
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Connector type</span>
            <select
              value={newProvider}
              onChange={(e) => {
                setNewProvider(e.target.value);
                setNewAuth(typeById.get(e.target.value)?.supportedAuthTypes[0] ?? "");
              }}
              className={INPUT_CLASS}
            >
              <option value="">{types.loading ? "Loading types…" : "Select a type"}</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Authentication</span>
            <select
              value={newAuth}
              onChange={(e) => setNewAuth(e.target.value)}
              disabled={!providerType}
              className={INPUT_CLASS}
            >
              {(providerType?.supportedAuthTypes ?? []).map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Credential vault reference (optional)</span>
            <input
              type="text"
              value={newCredentialRef}
              onChange={(e) => setNewCredentialRef(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <button
            type="submit"
            disabled={!newName.trim() || !newProvider || busy === "add"}
            className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === "add" ? "Connecting…" : "Connect"}
          </button>
          {types.error && <p className="w-full text-red-300">Connector types could not be loaded: {types.error}</p>}
          <p className="w-full text-slate-400">
            Data is collected only in your workspace&apos;s data-residency region.
          </p>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          label="Configured integrations"
          source={connectors}
          value={all.length}
          sub={types.data ? `${types.data.length} connector types available` : "Connector catalogue unavailable"}
        />
        <Kpi label="Connected" source={connectors} value={`${connectedCount} / ${all.length}`} sub="Connected, syncing or healthy" />
        <Kpi
          label="Needs attention"
          source={connectors}
          value={attention.length}
          sub="Degraded, rate-limited or failing authentication"
          subClass="text-amber-400"
        />
        <Kpi
          label="Not connected"
          source={connectors}
          value={notConnected.length}
          sub="Awaiting credentials, consent or reconnection"
        />
      </div>

      {activeTab === "Catalog" ? (
        <div className={CARD_CLASS}>
          <h2 className="text-base font-bold text-white">Connector catalog</h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Connector</th>
                <th className="py-2 px-3 font-medium">Category</th>
                <th className="py-2 px-3 font-medium">Authentication</th>
                <th className="py-2 pl-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <TableFallback
                source={types}
                count={(types.data ?? []).length}
                colSpan={4}
                empty="No connector types are available."
              />
              {(types.data ?? []).map((t) => (
                <tr key={t.id}>
                  <td className="py-3 pr-3">
                    <div className="font-bold text-white">{t.name}</div>
                    <div className="text-[11px] text-slate-400">{t.description}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-200">{t.category}</td>
                  <td className="py-3 px-3 text-slate-300">{t.supportedAuthTypes.map(humanize).join(", ")}</td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() => openAddForm(t.id)}
                      className="text-sky-400 font-semibold"
                      aria-label={`Add ${t.name}`}
                    >
                      Add →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className={`${CARD_CLASS} space-y-4`}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Connected integrations</h2>
              {connectors.data && (
                <span className="text-xs text-slate-400">
                  {all.length} {all.length === 1 ? "integration" : "integrations"}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search integrations"
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-400"
                />
              </div>
              <select
                aria-label="Category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200"
              >
                <option value="">Category: All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                aria-label="State"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200"
              >
                <option value="">State: All</option>
                {statesPresent.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Integration</th>
                    <th className="py-2 px-3 font-medium">Category</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium">Region</th>
                    <th className="py-2 px-3 font-medium">Authentication</th>
                    <th className="py-2 pl-3 font-medium text-right">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <TableFallback
                    source={connectors}
                    count={all.length === 0 ? 0 : filtered.length}
                    colSpan={6}
                    empty={
                      all.length === 0
                        ? "No integrations connected yet. Add one from the catalog."
                        : "No integrations match these filters."
                    }
                  />
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`cursor-pointer transition-colors ${
                        selected?.id === c.id ? "bg-red-950/25" : "hover:bg-slate-800/30"
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <div className="font-bold text-white">{c.name}</div>
                        <div className="text-[11px] text-slate-400">{typeNameOf(c)}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-200">{categoryOf(c) || "—"}</td>
                      <td className="py-3 px-3">
                        <span className={`${BADGE_CLASS} ${connectorStateBadge(c.state)}`}>{humanize(c.state)}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-200">{c.source_region ?? "—"}</td>
                      <td className="py-3 px-3 text-slate-200">{humanize(c.authentication_type)}</td>
                      <td className="py-3 pl-3 text-right text-slate-300">{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-2.5 text-xs">
              <h2 className="text-base font-bold text-white">Issues requiring attention</h2>
              {connectors.loading ? (
                <div className="text-slate-400">Loading…</div>
              ) : connectors.error ? (
                <div className="text-red-300">Could not load: {connectors.error}</div>
              ) : attention.length + notConnected.length === 0 ? (
                <div className="text-slate-400">No connector issues reported.</div>
              ) : (
                [...attention, ...notConnected].map((c) => (
                  <div key={c.id} className="flex justify-between py-1.5 border-b border-slate-800/70 last:border-0">
                    <span className="font-semibold text-white">{c.name}</span>
                    <span className="text-slate-300">{humanize(c.state)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3 text-xs">
              {!selected ? (
                <>
                  <h2 className="text-base font-bold text-white">Selected integration</h2>
                  <div className="text-slate-400">Select an integration to see its health.</div>
                </>
              ) : (
                <>
                  <h2 className="text-base font-bold text-white">Selected integration • {selected.name}</h2>
                  {health.loading ? (
                    <div className="text-slate-400">Loading health…</div>
                  ) : health.error ? (
                    <div className="text-red-300">Health unavailable: {health.error}</div>
                  ) : !health.data ? (
                    <div className="text-slate-400">No health has been reported for this connector yet.</div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Connection</span>
                        <span className="font-semibold text-white">{humanize(health.data.state)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Credentials</span>
                        <span className="font-semibold text-white">{humanize(health.data.credentialStatus)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Permissions</span>
                        <span className="font-semibold text-white">{humanize(health.data.permissionStatus)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Last successful connection</span>
                        <span className="font-semibold text-white">{fmtDateTime(health.data.lastSuccessfulConnectionAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Last successful sync</span>
                        <span className="font-semibold text-white">{fmtDateTime(health.data.lastSuccessfulSyncAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Consecutive failures</span>
                        <span className="font-semibold text-white">{health.data.consecutiveFailures}</span>
                      </div>
                      {health.data.lastMessage && <p className="text-slate-400">{health.data.lastMessage}</p>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => testConnection(selected)} className={PRIMARY_BUTTON}>
                      {busy === "test" ? "Testing…" : "Test connection"}
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => syncNow(selected)} className={SECONDARY_BUTTON}>
                      {busy === "sync" ? "Syncing…" : "Sync now"}
                    </button>
                    {confirmRemove ? (
                      <button type="button" disabled={busy !== null} onClick={() => removeConnector(selected)} className={SECONDARY_BUTTON}>
                        {busy === "remove" ? "Removing…" : "Confirm removal"}
                      </button>
                    ) : (
                      <button type="button" disabled={busy !== null} onClick={() => setConfirmRemove(true)} className={SECONDARY_BUTTON}>
                        Remove
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================================
 * 13. SETTINGS
 * Tenant profile, sign-in controls, members and invitations, notification
 * policies and the recorded retention policy.
 * ========================================================================== */

interface Member {
  id: string;
  principalId: string;
  status: string;
  source: string;
  joinedAt: string;
  roles: Array<{ code: string; name: string }>;
}

interface Invitation {
  id: string;
  invitedEmail: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface Role {
  id: string;
  code: string;
  name: string;
  roleLevel: string;
}

interface IdentityProvider {
  id: string;
  name: string;
  protocol: string;
  status: string;
  requireMfa: boolean;
}

interface Passkey {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface RetentionPolicy {
  id: string;
  basis: string;
  authority: string;
  period_days: number;
  effective_from: string;
  effective_to: string | null;
}

interface NotificationPolicy {
  id: string;
  key: string;
  event_type: string;
  severity: string | null;
  mandatory: boolean;
}

interface NotificationPreference {
  id: string;
  notification_policy_id: string;
  channel: string;
  enabled: boolean;
}

const tenantPath = async (suffix: string) => {
  const s = await customerApi.session();
  return `/api/v1/tenants/${encodeURIComponent(s.tenantId)}${suffix}`;
};
const tenantList = <T,>(suffix: string) => async () => asList<T>(await backend.get(await tenantPath(suffix)));

export function CustomerSettingsSection() {
  const tabs = ["Overview", "Workspace", "Security", "Members", "Notifications"] as const;
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview");

  const tenant = useSource(() => customerApi.tenant());
  const session = useSource(() => customerApi.session());
  const members = useSource(tenantList<Member>("/members"));
  const invitations = useSource(tenantList<Invitation>("/invitations"));
  const roles = useSource(getList<Role>("/api/v1/roles"));
  const idps = useSource(tenantList<IdentityProvider>("/identity-providers"));
  const passkeys = useSource(getList<Passkey>("/api/v1/auth/passkeys"));
  const retention = useSource(tenantList<RetentionPolicy>("/offboarding/retention-policy"));
  const notificationPolicies = useSource(getList<NotificationPolicy>("/api/v1/notification-policies"));
  const notificationPrefs = useSource(getList<NotificationPreference>("/api/v1/notification-preferences"));

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const t = tenant.data;
  const activeMembers = (members.data ?? []).filter((m) => m.status === "ACTIVE");
  const pendingInvites = (invitations.data ?? []).filter((i) => i.status === "PENDING");
  const activeIdps = (idps.data ?? []).filter((p) => p.status === "ACTIVE");
  const tenantRoles = (roles.data ?? []).filter((r) => r.roleLevel === "TENANT");

  const show = (tab: (typeof tabs)[number]) => activeTab === "Overview" || activeTab === tab;

  const sendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    setActionError(null);
    (async () => {
      const res = await backend.post<{ invitationId: string; expiresAt: string; token: string }>(
        await tenantPath("/invitations"),
        { invitedEmail: inviteEmail.trim(), roleId: inviteRole },
        { confirmed: true },
      );
      setNotice(
        `Invitation created for ${inviteEmail.trim()} (expires ${fmtDateTime(res?.expiresAt)}). ` +
          `The platform does not email it; share this one-time token with the invitee: ${res?.token ?? "—"}`,
      );
      setInviteEmail("");
      setInviteRole("");
      invitations.reload();
    })()
      .catch((err) => setActionError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  const profileRows: Array<[string, React.ReactNode, boolean?]> = t
    ? [
        ["Organization", t.name],
        ["Workspace ID", t.slug, true],
        ["Primary data region", `${regionLabel(t.dataResidencyRegion)} (${t.dataResidencyRegion})`],
        ["Home region", t.homeRegion],
        ["Time zone", t.timezone],
        ["Data class", humanize(t.dataClass)],
        ["Retention policy reference", t.retentionPolicyRef, true],
        ["Created", fmtDateTime(t.createdAt)],
      ]
    : [];

  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">Settings</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Configure your workspace securely. Review controls, owners, and access.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          {t ? `Last updated ${fmtDateTime(t.updatedAt)}` : tenant.loading ? "Loading…" : ""}
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={tabs}
          active={activeTab}
          onChange={setActiveTab}
          activeClass="bg-cyan-950/60 border border-cyan-500/50 text-white"
        />
      </div>

      {tenant.error && <ErrorNote message={`Workspace details could not be loaded: ${tenant.error}`} />}
      {notice && <SuccessNote message={notice} />}
      {actionError && <ErrorNote message={actionError} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          label="Workspace status"
          source={tenant}
          value={humanize(t?.status)}
          sub={`Created ${fmtDate(t?.createdAt)}`}
          subClass="text-emerald-400"
        />
        <Kpi
          label="Single sign-on"
          source={idps}
          value={`${activeIdps.length} active`}
          sub={`${(idps.data ?? []).length} identity provider(s) configured`}
        />
        <Kpi
          label="Data residency"
          source={tenant}
          value={regionLabel(t?.dataResidencyRegion)}
          sub={`Home region ${t?.homeRegion ?? "—"}`}
        />
        <Kpi
          label="Members"
          source={members}
          value={activeMembers.length}
          sub={invitations.error ? "Invitations unavailable" : `${pendingInvites.length} pending invitation(s)`}
          subClass="text-amber-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {show("Workspace") && (
          <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div>
              <h2 className="text-base font-bold text-white">Workspace profile</h2>
              <p className="text-xs text-slate-400">
                Core tenant details and regional residency controls, set when the workspace was provisioned.
              </p>
            </div>
            <div className="divide-y divide-slate-800/70 text-xs">
              {tenant.loading && <div className="py-2.5 text-slate-400">Loading…</div>}
              {profileRows.map(([label, value, mono]) => (
                <div key={label} className="py-2.5 flex justify-between gap-3">
                  <span className="text-slate-400">{label}</span>
                  <span className={`${mono ? "font-mono " : ""}font-semibold text-white text-right`}>{value}</span>
                </div>
              ))}
            </div>
            {activeTab === "Workspace" && (
              <div className="pt-2 space-y-2 text-xs">
                <h3 className="text-sm font-bold text-white">Recorded retention policy</h3>
                {retention.loading ? (
                  <div className="text-slate-400">Loading…</div>
                ) : retention.error ? (
                  <div className="text-red-300">Could not load: {retention.error}</div>
                ) : (retention.data ?? []).length === 0 ? (
                  <div className="text-slate-400">No retention policy has been recorded for this workspace.</div>
                ) : (
                  (retention.data ?? []).map((p) => (
                    <div key={p.id} className="flex justify-between">
                      <span className="text-slate-300">
                        {humanize(p.basis)} — {p.authority}
                      </span>
                      <span className="font-semibold text-white">
                        {p.period_days} days from {fmtDate(p.effective_from)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {show("Security") && (
          <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div>
              <h2 className="text-base font-bold text-white">Authentication &amp; sessions</h2>
              <p className="text-xs text-slate-400">Identity providers and your own sign-in methods.</p>
            </div>
            <div className="divide-y divide-slate-800/70 text-xs">
              {idps.loading ? (
                <div className="py-2.5 text-slate-400">Loading identity providers…</div>
              ) : idps.error ? (
                <div className="py-2.5 text-red-300">Identity providers unavailable: {idps.error}</div>
              ) : (idps.data ?? []).length === 0 ? (
                <div className="py-2.5 text-slate-400">
                  No identity provider configured; members sign in with ZoikoShield credentials.
                </div>
              ) : (
                (idps.data ?? []).map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {p.protocol.toUpperCase()} • MFA {p.requireMfa ? "required by provider" : "not required by provider"}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        p.status === "ACTIVE" ? GOOD_BADGE : WARN_BADGE
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                ))
              )}
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-400">Your passkeys</span>
                <span className="font-semibold text-white">
                  {passkeys.loading ? "…" : passkeys.error ? "Unavailable" : (passkeys.data ?? []).length}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-400">Current session assurance</span>
                <span className="font-semibold text-white">
                  {session.loading ? "…" : session.error ? "Unavailable" : humanize(session.data?.assurance)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {show("Members") && (
          <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3 text-xs">
            <h2 className="text-base font-bold text-white">Members &amp; invitations</h2>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 px-3 font-medium">Roles</th>
                  <th className="py-2 px-3 font-medium">Joined</th>
                  <th className="py-2 pl-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <TableFallback source={members} count={(members.data ?? []).length} colSpan={4} empty="No members." />
                {(members.data ?? []).map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 pr-3 font-mono text-white">
                      {m.principalId === session.data?.id ? "You" : `${m.principalId.slice(0, 8)}…`}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{m.roles.map((r) => r.name).join(", ") || "—"}</td>
                    <td className="py-2.5 px-3 text-slate-300">{fmtDate(m.joinedAt)}</td>
                    <td className="py-2.5 pl-3 text-right text-slate-300">{humanize(m.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pendingInvites.length > 0 && (
              <div className="space-y-1">
                <div className="font-semibold text-white">Pending invitations</div>
                {pendingInvites.map((i) => (
                  <div key={i.id} className="flex justify-between text-slate-300">
                    <span>{i.invitedEmail}</span>
                    <span>expires {fmtDateTime(i.expiresAt)}</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={sendInvite} aria-label="Invite member" className="flex flex-wrap items-end gap-2 pt-1">
              <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
                <span className="text-slate-300">Email</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-300">Role</span>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className={INPUT_CLASS}>
                  <option value="">{roles.loading ? "Loading roles…" : "Select a role"}</option>
                  {tenantRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy || !inviteEmail.trim() || !inviteRole}
                className={PRIMARY_BUTTON}
              >
                {busy ? "Inviting…" : "Invite member"}
              </button>
              {roles.error && <p className="w-full text-red-300">Roles could not be loaded: {roles.error}</p>}
            </form>
          </div>
        )}

        {show("Notifications") && (
          <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <h2 className="text-base font-bold text-white">Notifications &amp; escalation</h2>
            <div className="divide-y divide-slate-800/70 text-xs">
              {notificationPolicies.loading ? (
                <div className="py-2.5 text-slate-400">Loading…</div>
              ) : notificationPolicies.error ? (
                <div className="py-2.5 text-red-300">Could not load: {notificationPolicies.error}</div>
              ) : (notificationPolicies.data ?? []).length === 0 ? (
                <div className="py-2.5 text-slate-400">No notification policies are published yet.</div>
              ) : (
                (notificationPolicies.data ?? []).map((p) => {
                  const prefs = (notificationPrefs.data ?? []).filter((n) => n.notification_policy_id === p.id);
                  return (
                    <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-white">{humanize(p.event_type)}</div>
                        <div className="text-[11px] text-slate-400">
                          {prefs.length === 0
                            ? "No personal preference set"
                            : prefs.map((n) => `${humanize(n.channel)}: ${n.enabled ? "on" : "off"}`).join(" • ")}
                        </div>
                      </div>
                      {p.mandatory && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${NEUTRAL_BADGE}`}>MANDATORY</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
