"use client";

import React, { useMemo, useState } from "react";
import { Network, Eye, ClipboardList, AlertTriangle, Lock, Database, GitMerge, ShieldCheck, FolderOpen } from "lucide-react";
import IngestionConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, EventList, ProgressRow, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Health = "Streaming" | "Stale" | "Paused";
type Src = { code: string; name: string; category: string; health: Health; seen: string; rate: string; last30: string; lastMins: number };

const SOURCES: Src[] = [
  { code: "AZ", name: "Azure Monitor", category: "Cloud telemetry", health: "Streaming", seen: "42 sec", rate: "4.8K / min", last30: "101.3K", lastMins: 1 },
  { code: "AWS", name: "AWS CloudTrail", category: "Cloud audit", health: "Streaming", seen: "1 min", rate: "2.1K / min", last30: "63.5K", lastMins: 1 },
  { code: "GH", name: "GitHub Audit", category: "DevSecOps", health: "Streaming", seen: "54 sec", rate: "640 / min", last30: "18.1K", lastMins: 1 },
  { code: "OK", name: "Okta Identity", category: "Identity", health: "Streaming", seen: "38 sec", rate: "1.3K / min", last30: "36.7K", lastMins: 1 },
  { code: "ED", name: "Endpoint EDR", category: "Endpoint", health: "Streaming", seen: "46 sec", rate: "3.4K / min", last30: "92.2K", lastMins: 1 },
  { code: "FW", name: "Network Firewall", category: "Network", health: "Streaming", seen: "51 sec", rate: "2.6K / min", last30: "74.8K", lastMins: 1 },
  { code: "M", name: "Microsoft 365 Audit", category: "Productivity", health: "Stale", seen: "18 min", rate: "0 / min", last30: "0", lastMins: 18 },
  { code: "WH", name: "Generic Webhook", category: "Custom", health: "Paused", seen: "2 hr", rate: "0 / min", last30: "0", lastMins: 120 },
];
const HEALTH_TONE: Record<Health, Tone> = { Streaming: "emerald", Stale: "amber", Paused: "purple" };

// Hourly sample volumes (thousands). The last stretch is flagged delayed.
const ACTIVITY = [18, 22, 25, 21, 24, 27, 30, 29, 34, 33, 37, 35, 38, 41, 36, 39, 43, 40, 31, 28, 26, 30, 34, 38];
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
  const show = useTabFilter(tab, "overview");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? SOURCES.filter((s) => `${s.name} ${s.category} ${s.health}`.toLowerCase().includes(q)) : SOURCES;
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
          subtitle="Monitor connected telemetry, ingestion quality, and source freshness across your security environment"
          actions={
            <>
              <ActionButton onClick={() => setTab("normalization")}><Eye className="w-3.5 h-3.5" /> View data flow</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><ClipboardList className="w-3.5 h-3.5" /> Request connector setup</ActionButton>
            </>
          }
        />
      }
      banner={<NoticeBanner tone="amber" title="Demonstration workspace — synthetic source records and sample health metrics; not live production telemetry." tag="Example snapshot" />}
      kpis={
        <KpiGrid
          items={[
            { label: "Configured Sources", value: String(SOURCES.length), hint: "Across cloud, identity, endpoint & network", tone: "blue" },
            { label: "Currently Streaming", value: String(streaming), hint: "Receiving synthetic security events", tone: "emerald" },
            { label: "Stale Source", value: String(SOURCES.filter((s) => s.health === "Stale").length), hint: "Freshness objective exceeded", tone: "amber" },
            { label: "Paused Source", value: String(SOURCES.filter((s) => s.health === "Paused").length), hint: "No ingestion until resumed by admin", tone: "purple" },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<IngestionConsole />}
      consoleLabel="Live ingestion console"
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("inventory", "health") && (
          <Panel title="Connected Source Inventory" meta={`${SOURCES.length} sources`} className="xl:col-span-2">
            <div className="text-[11px] text-slate-500 -mt-1 mb-3">Monitor operational state · select a source to inspect</div>
            <div className="mb-3"><SearchInput value={query} onChange={setQuery} placeholder="Search sources" /></div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.name}
              selectedKey={sel.name}
              onSelect={(r) => setSelectedName(r.name)}
              columns={[
                { key: "s", header: "Source", render: (r) => <span className="flex items-center gap-2"><span className="w-7 h-7 rounded-md bg-[#13203a] text-[10px] font-bold text-sky-200 flex items-center justify-center">{r.code}</span><span className="font-semibold text-slate-100">{r.name}</span></span> },
                { key: "c", header: "Category", render: (r) => r.category },
                { key: "h", header: "Health", render: (r) => <Pill tone={HEALTH_TONE[r.health]}>● {r.health}</Pill> },
                { key: "l", header: "Last seen", render: (r) => r.seen },
                { key: "r", header: "Event rate", render: (r) => <span className="font-mono">{r.rate}</span> },
                { key: "t", header: "Last 30m", render: (r) => <span className="font-mono">{r.last30}</span> },
              ]}
            />
            <div className="text-[11px] text-slate-500 mt-3">Selected: {sel.name} · sample dataset</div>
          </Panel>
        )}
        {show("inventory", "health") && (
          <Panel title="Source Health & Diagnostics" meta="Selected source · read-only analyst view" metaTone="slate">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-lg bg-[#2a1f4a] text-sm font-bold text-purple-200 flex items-center justify-center">{sel.code}</span>
                <div><div className="text-base font-bold text-slate-100">{sel.name}</div><div className="text-[11px] text-slate-500">{sel.category} telemetry</div></div>
              </div>
              <Pill tone={HEALTH_TONE[sel.health]}>● {sel.health}</Pill>
            </div>
            {sel.health !== "Streaming" && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 mb-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-200"><AlertTriangle className="w-3.5 h-3.5" /> Telemetry freshness warning</div>
                <div className="text-[11px] text-slate-400 mt-1">No sample events in {sel.seen}; illustrative freshness target is 5 minutes. Investigate collector health before relying on this feed.</div>
              </div>
            )}
            <KeyValues
              items={[
                { k: "Last event received", v: `${sel.seen} ago`, tone: sel.health === "Streaming" ? undefined : "amber" },
                { k: "Ingestion status", v: sel.health === "Streaming" ? "Streaming" : sel.health === "Stale" ? "Lagging / partial" : "Paused by admin", tone: sel.health === "Streaming" ? "emerald" : "amber" },
                { k: "Normalization", v: "OCSF mapping configured" },
                { k: "Credential visibility", v: "Masked · secrets never shown" },
              ]}
            />
            <div className="mt-4">
              <ProgressRow label="Freshness objective · illustrative" value={Math.min(sel.lastMins, 30)} max={30} display={`Target < 5 min · Current: ${sel.seen}`} tone={sel.lastMins > 5 ? "amber" : "emerald"} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><Eye className="w-3.5 h-3.5" /> Inspect event samples</ActionButton>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}>Request admin repair</ActionButton>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-3"><Lock className="w-3 h-3" /> Configuration, tokens and secret rotation require authorized connector administrators.</div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("normalization") && (
          <Panel title="Telemetry Pipeline" meta="Illustrative flow" metaTone="slate">
            <div className="flex items-start justify-between gap-2">
              {[
                ["Collect", "Signed sources", <Database key="a" className="w-4 h-4" />],
                ["Normalize", "OCSF 1.1", <GitMerge key="b" className="w-4 h-4" />],
                ["Detect", "Rules & alerts", <ShieldCheck key="c" className="w-4 h-4" />],
                ["Investigate", "Cases & evidence", <FolderOpen key="d" className="w-4 h-4" />],
              ].map(([t, s, icon]) => (
                <div key={t as string} className="flex flex-col items-center text-center flex-1">
                  <span className="w-9 h-9 rounded-full border border-sky-500/40 bg-sky-950/40 text-sky-300 flex items-center justify-center">{icon}</span>
                  <span className="text-[11px] font-semibold text-slate-200 mt-1.5">{t}</span>
                  <span className="text-[10px] text-slate-500">{s}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-[11px] text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5" /> {SOURCES.filter((s) => s.health === "Stale").length} source has delayed telemetry — potential coverage gap
            </div>
          </Panel>
        )}
        {show("health") && (
          <Panel title="Ingestion Activity" meta="Sample · Last 12 hours" metaTone="slate">
            <div className="flex items-end gap-1 h-32" role="img" aria-label="Hourly ingestion volume, last 12 hours, final hours delayed">
              {ACTIVITY.map((v, i) => (
                <div key={i} className={`flex-1 rounded-t-sm ${i >= DELAYED_FROM && i < DELAYED_FROM + 3 ? "bg-amber-400/80" : "bg-sky-500/80"}`} style={{ height: `${(v / maxBar) * 100}%` }} title={`${v}K events`} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1"><span>00:00</span><span>03:00</span><span>06:00</span><span>09:00</span><span>12:00</span></div>
            <div className="flex gap-4 text-[10px] text-slate-400 mt-2"><span className="flex items-center gap-1"><span className="w-2 h-2 bg-sky-500" /> Received events</span><span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400" /> Delayed/partial feed</span></div>
          </Panel>
        )}
        {show("activity") && (
          <Panel title="Recent Connector Activity" meta="Sample audit trail" metaTone="slate">
            <EventList
              items={[
                { time: "12:24", title: "Microsoft 365 Audit · Stale threshold breached", tag: "Review", tone: "amber" },
                { time: "12:22", title: "Azure Monitor · Telemetry batch normalized", tag: "Received", tone: "emerald" },
                { time: "12:20", title: "Generic Webhook · Ingestion paused by policy", tag: "Paused", tone: "purple" },
                { time: "12:17", title: "Okta Identity · Sync checkpoint recorded", tag: "Recorded", tone: "emerald" },
              ]}
            />
            <div className="text-[10px] text-slate-500 mt-3">Tenant-scoped event audit</div>
          </Panel>
        )}
        {tab === "docs" && (
          <Panel title="Documentation" meta="Integration guides">
            <EventList
              items={[
                { title: "OCSF field mapping reference", sub: "How source fields map into normalized events", tone: "cyan" },
                { title: "Freshness objectives", sub: "Per-source targets and stale thresholds", tone: "cyan" },
                { title: "Credential rotation", sub: "Rotate connector secrets without downtime", tone: "cyan" },
              ]}
            />
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
