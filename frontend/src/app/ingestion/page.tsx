"use client";

import React, { useMemo, useState } from "react";
import {
  Network,
  Eye,
  ClipboardList,
  AlertTriangle,
  Lock,
  Database,
  GitMerge,
  ShieldCheck,
  FolderOpen,
  RotateCcw,
  FileCheck2,
  X,
} from "lucide-react";
import IngestionConsole from "./console";
import {
  WorkspacePage,
  PageHeader,
  NoticeBanner,
  KpiGrid,
  Panel,
  Pill,
  DataTable,
  SearchInput,
  KeyValues,
  EventList,
  ProgressRow,
  ActionButton,
  CONSOLE_TAB,
  useTabFilter,
  type Tone,
} from "@/components/mockup/kit";

type Health = "Streaming" | "Stale" | "Paused";
type CertTrack =
  | "APPROVED_FOR_PRODUCTION"
  | "CUSTOMER_TESTED"
  | "IMPLEMENTED"
  | "CATALOG";

type Src = {
  code: string;
  name: string;
  category: string;
  health: Health;
  continuity: "COMPLETE" | "WATERMARK_GAP" | "PAUSED";
  certTrack: CertTrack;
  seen: string;
  rate: string;
  last30: string;
  lastMins: number;
  rawBytesGb: number;
  indexGb: number;
};

const SOURCES: Src[] = [
  {
    code: "AZ",
    name: "Azure Monitor",
    category: "Cloud telemetry",
    health: "Streaming",
    continuity: "COMPLETE",
    certTrack: "APPROVED_FOR_PRODUCTION",
    seen: "42 sec",
    rate: "4.8K / min",
    last30: "101.3K",
    lastMins: 1,
    rawBytesGb: 112.4,
    indexGb: 78.2,
  },
  {
    code: "AWS",
    name: "AWS CloudTrail",
    category: "Cloud audit",
    health: "Streaming",
    continuity: "COMPLETE",
    certTrack: "APPROVED_FOR_PRODUCTION",
    seen: "1 min",
    rate: "2.1K / min",
    last30: "63.5K",
    lastMins: 1,
    rawBytesGb: 94.1,
    indexGb: 64.0,
  },
  {
    code: "GH",
    name: "GitHub Audit",
    category: "DevSecOps",
    health: "Streaming",
    continuity: "COMPLETE",
    certTrack: "APPROVED_FOR_PRODUCTION",
    seen: "54 sec",
    rate: "640 / min",
    last30: "18.1K",
    lastMins: 1,
    rawBytesGb: 18.5,
    indexGb: 12.1,
  },
  {
    code: "OK",
    name: "Okta Identity",
    category: "Identity",
    health: "Streaming",
    continuity: "COMPLETE",
    certTrack: "APPROVED_FOR_PRODUCTION",
    seen: "38 sec",
    rate: "1.3K / min",
    last30: "36.7K",
    lastMins: 1,
    rawBytesGb: 42.0,
    indexGb: 29.8,
  },
  {
    code: "ED",
    name: "Endpoint EDR",
    category: "Endpoint",
    health: "Streaming",
    continuity: "COMPLETE",
    certTrack: "APPROVED_FOR_PRODUCTION",
    seen: "46 sec",
    rate: "3.4K / min",
    last30: "92.2K",
    lastMins: 1,
    rawBytesGb: 88.6,
    indexGb: 61.4,
  },
  {
    code: "FW",
    name: "Network Firewall",
    category: "Network",
    health: "Streaming",
    continuity: "COMPLETE",
    certTrack: "CUSTOMER_TESTED",
    seen: "51 sec",
    rate: "2.6K / min",
    last30: "74.8K",
    lastMins: 1,
    rawBytesGb: 51.2,
    indexGb: 35.0,
  },
  {
    code: "M",
    name: "Microsoft 365 Audit",
    category: "Productivity",
    health: "Stale",
    continuity: "WATERMARK_GAP",
    certTrack: "APPROVED_FOR_PRODUCTION",
    seen: "18 min",
    rate: "0 / min",
    last30: "0",
    lastMins: 18,
    rawBytesGb: 6.0,
    indexGb: 4.0,
  },
  {
    code: "WH",
    name: "Generic Webhook",
    category: "Custom",
    health: "Paused",
    continuity: "PAUSED",
    certTrack: "IMPLEMENTED",
    seen: "2 hr",
    rate: "0 / min",
    last30: "0",
    lastMins: 120,
    rawBytesGb: 0.0,
    indexGb: 0.0,
  },
];
const HEALTH_TONE: Record<Health, Tone> = {
  Streaming: "emerald",
  Stale: "amber",
  Paused: "purple",
};

const ACTIVITY = [
  18, 22, 25, 21, 24, 27, 30, 29, 34, 33, 37, 35, 38, 41, 36, 39, 43, 40, 31,
  28, 26, 30, 34, 38,
];
const DELAYED_FROM = 18;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "inventory", label: "Source Inventory" },
  { id: "health", label: "Ingestion & Health" },
  { id: "normalization", label: "Normalization" },
  { id: "activity", label: "Activity & Audit" },
  { id: "docs", label: "Documentation" },
];

export default function DataSourcesPage() {
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("Microsoft 365 Audit");
  const [replayDrawerOpen, setReplayDrawerOpen] = useState(false);
  const [receiptInspectorOpen, setReceiptInspectorOpen] = useState(false);
  const [suppressOutbound, setSuppressOutbound] = useState(true);
  const [replayStatus, setReplayStatus] = useState<string | null>(null);

  const show = useTabFilter(tab, "overview");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? SOURCES.filter((s) =>
          `${s.name} ${s.category} ${s.health}`.toLowerCase().includes(q)
        )
      : SOURCES;
  }, [query]);
  const sel = SOURCES.find((s) => s.name === selectedName) ?? SOURCES[0];
  const streaming = SOURCES.filter((s) => s.health === "Streaming").length;
  const maxBar = Math.max(...ACTIVITY);

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Network className="w-5 h-5" />}
          title="Data Sources & Integrations"
          subtitle="Monitor connected telemetry, WAL-durable ingestion accounting (G03), certification tiers (G09), and storage economics (G08)"
          actions={
            <>
              <ActionButton onClick={() => setReceiptInspectorOpen((v) => !v)}>
                <FileCheck2 className="w-3.5 h-3.5" /> Ingress Receipts
                (WF-G03-01)
              </ActionButton>
              <ActionButton onClick={() => setReplayDrawerOpen((v) => !v)}>
                <RotateCcw className="w-3.5 h-3.5" /> Quarantine &amp; Replay
                (WF-G03-03)
              </ActionButton>
              <ActionButton onClick={() => setTab("normalization")}>
                <Eye className="w-3.5 h-3.5" /> View data flow
              </ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>
                <ClipboardList className="w-3.5 h-3.5" /> Request connector setup
              </ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="cyan"
          title="Operational Telemetry Fabric — Multi-cloud OCSF 1.1 normalized ingestion pipeline with WAL-durable receipt accounting (G03)."
          tag="Live Ingest Stream"
        />
      }
      kpis={
        <KpiGrid
          items={[
            {
              label: "Durable Accepted (30m)",
              value: "386,600",
              hint: `Across ${SOURCES.length} configured sources (${streaming} streaming)`,
              tone: "emerald",
            },
            {
              label: "Evaluated (OCSF 1.1)",
              value: "386,588",
              hint: "Dispatched to G07 detection & case pipeline",
              tone: "blue",
            },
            {
              label: "Quarantined (DLQ)",
              value: "12",
              hint: "Schema mismatch · eligible for controlled replay",
              tone: "amber",
            },
            {
              label: "Unreconciled Drift",
              value: "0",
              hint: "Accepted = Evaluated + Quarantined (verified)",
              tone: "emerald",
            },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<IngestionConsole />}
      consoleLabel="Live ingestion console"
    >
      {/* WF-G03-01: IngressReceipt Lineage Inspector */}
      {receiptInspectorOpen && (
        <div className="mb-4 rounded-xl border border-cyan-500/40 bg-[#0b1628] p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="font-bold text-white">
              Durable IngressReceipt Lineage Inspector (WF-G03-01)
            </div>
            <button
              type="button"
              onClick={() => setReceiptInspectorOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="p-2.5 rounded bg-surface border border-line">
              <div className="text-slate-400">receipt_id</div>
              <div className="text-cyan-300">rcpt-wal-20261031-99412</div>
            </div>
            <div className="p-2.5 rounded bg-surface border border-line">
              <div className="text-slate-400">durable_stream_partition</div>
              <div className="text-emerald-300">
                kafka://ingest.eu-west-1/p04#offset:8841209
              </div>
            </div>
            <div className="p-2.5 rounded bg-surface border border-line">
              <div className="text-slate-400">batch_sha256</div>
              <div className="text-slate-200 truncate">
                e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
              </div>
            </div>
            <div className="p-2.5 rounded bg-surface border border-line">
              <div className="text-slate-400">disposition</div>
              <div className="text-emerald-400">
                EVALUATED_NO_ALERT (100% reconciled)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WF-G03-03: Quarantine & Controlled Replay Drawer */}
      {replayDrawerOpen && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-[#0b1628] p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-white">
                Quarantine &amp; Controlled Replay Drawer (WF-G03-03)
              </div>
              <div className="text-slate-400">
                12 quarantined events in{" "}
                <span className="font-mono text-amber-300">
                  dlq://eu-west-1/m365-schema-v2
                </span>{" "}
                · Idempotent dedupe key verified
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplayDrawerOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={suppressOutbound}
                onChange={(e) => setSuppressOutbound(e.target.checked)}
                className="accent-cyan-400"
              />
              <span>
                <b>Safe Replay Guard:</b> Suppress outbound SOAR actions &amp;
                external webhook dispatches during historical replay
              </span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setReplayStatus(
                    `PREVIEW READY: 12 events · Est. scan 48 KB · 0 duplicate alerts · Outbound suppressed=${suppressOutbound}`
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
              >
                Preview Blast Radius
              </button>
              <button
                type="button"
                onClick={() =>
                  setReplayStatus(
                    `REPLAY JOB #RPL-20261031-04 COMPLETED: 12/12 quarantined events re-normalized with idempotent dedupe guard.`
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold"
              >
                Execute Controlled Replay
              </button>
            </div>
          </div>
          {replayStatus && (
            <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-500/40 font-mono text-emerald-200">
              {replayStatus}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("inventory", "health") && (
          <Panel
            title="Connected Source Inventory (WF-G03-02 & WF-G09-01)"
            meta={`${SOURCES.length} sources`}
            className="xl:col-span-2"
          >
            <div className="text-[11px] text-slate-500 -mt-1 mb-3">
              Monitor operational state, cursor continuity &amp; certification
              track · select a source to inspect
            </div>
            <div className="mb-3">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search sources"
              />
            </div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.name}
              selectedKey={sel.name}
              onSelect={(r) => setSelectedName(r.name)}
              columns={[
                {
                  key: "s",
                  header: "Source",
                  render: (r) => (
                    <span className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-md bg-line text-[10px] font-bold text-sky-200 flex items-center justify-center">
                        {r.code}
                      </span>
                      <span className="font-semibold text-slate-100">
                        {r.name}
                      </span>
                    </span>
                  ),
                },
                { key: "c", header: "Category", render: (r) => r.category },
                {
                  key: "h",
                  header: "Health",
                  render: (r) => (
                    <Pill tone={HEALTH_TONE[r.health]}>● {r.health}</Pill>
                  ),
                },
                {
                  key: "cnt",
                  header: "Continuity (G03)",
                  render: (r) => (
                    <Pill
                      tone={
                        r.continuity === "COMPLETE"
                          ? "emerald"
                          : r.continuity === "WATERMARK_GAP"
                          ? "amber"
                          : "purple"
                      }
                    >
                      {r.continuity}
                    </Pill>
                  ),
                },
                {
                  key: "cert",
                  header: "Certification (G09)",
                  render: (r) => (
                    <span className="font-mono text-[10px] text-cyan-300">
                      {r.certTrack}
                    </span>
                  ),
                },
                { key: "l", header: "Last seen", render: (r) => r.seen },
                {
                  key: "r",
                  header: "Event rate",
                  render: (r) => <span className="font-mono">{r.rate}</span>,
                },
                {
                  key: "t",
                  header: "Last 30m",
                  render: (r) => <span className="font-mono">{r.last30}</span>,
                },
              ]}
            />
            <div className="text-[11px] text-slate-500 mt-3">
              Selected: {sel.name} · sample dataset
            </div>
          </Panel>
        )}
        {show("inventory", "health") && (
          <Panel
            title="Source Health & Diagnostics"
            meta="Selected source · read-only analyst view"
            metaTone="slate"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-lg bg-purple-900/40 text-sm font-bold text-purple-200 flex items-center justify-center">
                  {sel.code}
                </span>
                <div>
                  <div className="text-base font-bold text-slate-100">
                    {sel.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {sel.category} telemetry
                  </div>
                </div>
              </div>
              <Pill tone={HEALTH_TONE[sel.health]}>● {sel.health}</Pill>
            </div>
            {sel.health !== "Streaming" && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 mb-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5" /> Telemetry freshness
                  warning
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  No sample events in {sel.seen}; illustrative freshness target
                  is 5 minutes. Investigate collector health before relying on
                  this feed.
                </div>
              </div>
            )}
            <KeyValues
              items={[
                {
                  k: "Last event received",
                  v: `${sel.seen} ago`,
                  tone: sel.health === "Streaming" ? undefined : "amber",
                },
                {
                  k: "Ingestion status",
                  v:
                    sel.health === "Streaming"
                      ? "Streaming"
                      : sel.health === "Stale"
                      ? "Lagging / partial"
                      : "Paused by admin",
                  tone: sel.health === "Streaming" ? "emerald" : "amber",
                },
                { k: "Cursor continuity (G03)", v: sel.continuity },
                { k: "Certification track (G09)", v: sel.certTrack },
                { k: "Normalization", v: "OCSF mapping configured" },
                {
                  k: "Credential visibility",
                  v: "Masked · secrets never shown",
                },
              ]}
            />
            <div className="mt-4">
              <ProgressRow
                label="Freshness objective · illustrative"
                value={Math.min(sel.lastMins, 30)}
                max={30}
                display={`Target < 5 min · Current: ${sel.seen}`}
                tone={sel.lastMins > 5 ? "amber" : "emerald"}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>
                <Eye className="w-3.5 h-3.5" /> Inspect event samples
              </ActionButton>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}>
                Request admin repair
              </ActionButton>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-3">
              <Lock className="w-3 h-3" /> Configuration, tokens and secret
              rotation require authorized connector administrators.
            </div>
          </Panel>
        )}
      </div>

      {/* WF-G08-04: Per-Source Storage & Query Economics (Actual vs Forecast) */}
      {show("overview", "inventory", "health") && (
        <Panel
          title="Per-Source Storage & Query Economics — Measured Actual vs. Forecast (WF-G08-04)"
          meta="Raw inbound bytes · Hot index footprint · Archive GB-days"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-surface border border-line">
              <div className="text-slate-400">Raw Inbound Bytes (Actual)</div>
              <div className="text-lg font-bold text-white mt-0.5">
                412.8 GB
              </div>
              <div className="text-[11px] font-mono text-emerald-400">
                Forecast EoM: 440.0 GB (Within Tier)
              </div>
            </div>
            <div className="p-3 rounded-lg bg-surface border border-line">
              <div className="text-slate-400">Hot Index Footprint (Actual)</div>
              <div className="text-lg font-bold text-white mt-0.5">
                284.5 GB
              </div>
              <div className="text-[11px] font-mono text-cyan-300">
                Compression ratio: 1.45x OCSF
              </div>
            </div>
            <div className="p-3 rounded-lg bg-surface border border-line">
              <div className="text-slate-400">Cold Archive GB-Days (Actual)</div>
              <div className="text-lg font-bold text-white mt-0.5">
                14,436 GB-days
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                WORM Object Store · 365d retention
              </div>
            </div>
            <div className="p-3 rounded-lg bg-surface border border-line">
              <div className="text-slate-400">Query Scan Units (30d Actual)</div>
              <div className="text-lg font-bold text-white mt-0.5">
                1,840 SU
              </div>
              <div className="text-[11px] font-mono text-emerald-400">
                36.8% of 5,000 SU monthly quota
              </div>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("normalization") && (
          <Panel
            title="Telemetry Pipeline"
            meta="Illustrative flow"
            metaTone="slate"
          >
            <div className="flex items-start justify-between gap-2">
              {[
                [
                  "Collect",
                  "Signed sources",
                  <Database key="a" className="w-4 h-4" />,
                ],
                [
                  "Normalize",
                  "OCSF 1.1",
                  <GitMerge key="b" className="w-4 h-4" />,
                ],
                [
                  "Detect",
                  "Rules & alerts",
                  <ShieldCheck key="c" className="w-4 h-4" />,
                ],
                [
                  "Investigate",
                  "Cases & evidence",
                  <FolderOpen key="d" className="w-4 h-4" />,
                ],
              ].map(([t, s, icon]) => (
                <div
                  key={t as string}
                  className="flex flex-col items-center text-center flex-1"
                >
                  <span className="w-9 h-9 rounded-full border border-sky-500/40 bg-sky-950/40 text-sky-300 flex items-center justify-center">
                    {icon}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-200 mt-1.5">
                    {t}
                  </span>
                  <span className="text-[10px] text-slate-500">{s}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-[11px] text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5" />{" "}
              {SOURCES.filter((s) => s.health === "Stale").length} source has
              delayed telemetry — potential coverage gap
            </div>
          </Panel>
        )}
        {show("health") && (
          <Panel
            title="Ingestion Activity"
            meta="Sample · Last 12 hours"
            metaTone="slate"
          >
            <div
              className="flex items-end gap-1 h-32"
              role="img"
              aria-label="Hourly ingestion volume, last 12 hours, final hours delayed"
            >
              {ACTIVITY.map((v, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t-sm ${
                    i >= DELAYED_FROM && i < DELAYED_FROM + 3
                      ? "bg-amber-400/80"
                      : "bg-sky-500/80"
                  }`}
                  style={{ height: `${(v / maxBar) * 100}%` }}
                  title={`${v}K events`}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
              <span>00:00</span>
              <span>03:00</span>
              <span>06:00</span>
              <span>09:00</span>
              <span>12:00</span>
            </div>
            <div className="flex gap-4 text-[10px] text-slate-400 mt-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-sky-500" /> Received events
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-400" /> Delayed/partial feed
              </span>
            </div>
          </Panel>
        )}
        {show("activity") && (
          <Panel
            title="Recent Connector Activity"
            meta="Sample audit trail"
            metaTone="slate"
          >
            <EventList
              items={[
                {
                  time: "12:24",
                  title: "Microsoft 365 Audit · Stale threshold breached",
                  tag: "Review",
                  tone: "amber",
                },
                {
                  time: "12:22",
                  title: "Azure Monitor · Telemetry batch normalized",
                  tag: "Received",
                  tone: "emerald",
                },
                {
                  time: "12:20",
                  title: "Generic Webhook · Ingestion paused by policy",
                  tag: "Paused",
                  tone: "purple",
                },
                {
                  time: "12:17",
                  title: "Okta Identity · Sync checkpoint recorded",
                  tag: "Recorded",
                  tone: "emerald",
                },
              ]}
            />
            <div className="text-[10px] text-slate-500 mt-3">
              Tenant-scoped event audit
            </div>
          </Panel>
        )}
        {tab === "docs" && (
          <Panel title="Documentation" meta="Integration guides">
            <EventList
              items={[
                {
                  title: "OCSF field mapping reference",
                  sub: "How source fields map into normalized events",
                  tone: "cyan",
                },
                {
                  title: "Freshness objectives",
                  sub: "Per-source targets and stale thresholds",
                  tone: "cyan",
                },
                {
                  title: "Credential rotation",
                  sub: "Rotate connector secrets without downtime",
                  tone: "cyan",
                },
              ]}
            />
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
