"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Server, Activity, ShieldAlert, User, Network, AlertTriangle, Clock } from "lucide-react";
import AssetsConsole from "./console";
import {
  WorkspacePage, PageHeader, KpiGrid, Panel, Pill, DataTable, SearchInput, KeyValues,
  ProgressRow, EventList, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Exposure = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Telemetry = "DELAYED" | "COVERED" | "STALE" | "UNKNOWN";
type Asset = { id: string; type: string; owner: string; exposure: Exposure; telemetry: Telemetry; seen: string; findings: number; source: string; cases: number; evidence: number; confidence: string };

const ASSETS: Asset[] = [
  { id: "srv-api-014", type: "Server", owner: "Cloud Ops", exposure: "CRITICAL", telemetry: "DELAYED", seen: "19m ago", findings: 4, source: "Azure Monitor", cases: 2, evidence: 5, confidence: "Partial · delayed feed" },
  { id: "ep-win-042", type: "Endpoint", owner: "SOC / IT", exposure: "HIGH", telemetry: "COVERED", seen: "2m ago", findings: 3, source: "Endpoint EDR", cases: 1, evidence: 4, confidence: "High" },
  { id: "id-admin-07", type: "Identity", owner: "IAM Team", exposure: "HIGH", telemetry: "COVERED", seen: "5m ago", findings: 2, source: "Okta Identity", cases: 1, evidence: 3, confidence: "High" },
  { id: "cloud-vpc-03", type: "Cloud", owner: "Cloud Ops", exposure: "MEDIUM", telemetry: "COVERED", seen: "3m ago", findings: 1, source: "AWS CloudTrail", cases: 0, evidence: 2, confidence: "High" },
  { id: "db-ledger-02", type: "Database", owner: "Data Team", exposure: "MEDIUM", telemetry: "STALE", seen: "42m ago", findings: 1, source: "Cloud logs", cases: 0, evidence: 1, confidence: "Low · stale feed" },
  { id: "edge-fw-01", type: "Network", owner: "Network Ops", exposure: "LOW", telemetry: "COVERED", seen: "1m ago", findings: 0, source: "Network Firewall", cases: 0, evidence: 1, confidence: "High" },
  { id: "app-portal-09", type: "App", owner: "UNASSIGNED", exposure: "HIGH", telemetry: "UNKNOWN", seen: "Never", findings: 2, source: "Not mapped", cases: 0, evidence: 0, confidence: "Unknown" },
  { id: "srv-build-07", type: "Server", owner: "Platform", exposure: "LOW", telemetry: "COVERED", seen: "6m ago", findings: 0, source: "Azure Monitor", cases: 0, evidence: 1, confidence: "High" },
];
const EXP_TONE: Record<Exposure, Tone> = { CRITICAL: "rose", HIGH: "amber", MEDIUM: "amber", LOW: "emerald" };
const TEL_TONE: Record<Telemetry, Tone> = { DELAYED: "amber", COVERED: "emerald", STALE: "amber", UNKNOWN: "rose" };

const TABS = [
  { id: "all", label: "All Assets" },
  { id: "exposure", label: "Exposure" },
  { id: "coverage", label: "Discovery Coverage" },
  { id: "relationships", label: "Asset Relationships" },
  { id: "history", label: "Change History" },
];

export default function AssetsInventoryPage() {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [risk, setRisk] = useState("All");
  const [selectedId, setSelectedId] = useState("srv-api-014");
  const show = useTabFilter(tab, "all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ASSETS.filter((a) => (type === "All" || a.type === type) && (risk === "All" || a.exposure === risk) && (!q || `${a.id} ${a.owner} ${a.type}`.toLowerCase().includes(q)));
  }, [query, type, risk]);
  const sel = ASSETS.find((a) => a.id === selectedId) ?? ASSETS[0];

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Server className="w-5 h-5" />}
          title="Assets & Inventory"
          subtitle="Identify assets, prioritize exposure and verify telemetry coverage across your tenant"
          actions={<Pill tone="amber">Simulated tenant</Pill>}
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Discovered assets", value: "1,284", tag: "From 7 source feeds", hint: "No inventory guarantee", tone: "blue", icon: <Server className="w-3.5 h-3.5" /> },
            { label: "Telemetry monitored", value: "1,056", tag: "82.2% of discovered", hint: "228 need verification", tone: "cyan", icon: <Activity className="w-3.5 h-3.5" /> },
            { label: "Priority exposures", value: "37", tag: "9 critical · 28 high", hint: "Requires analyst triage", tone: "rose", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
            { label: "Ownership gaps", value: "18", tag: "No verified owner", hint: "Needs classification", tone: "amber", icon: <User className="w-3.5 h-3.5" /> },
            { label: "Source blind spots", value: "3", tag: "Connectors stale or delayed", hint: "Last full refresh: 2m", tone: "amber", icon: <Network className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<AssetsConsole />}
      consoleLabel="Live asset & identity resolution"
      footer={<div className="text-[10px] font-mono text-slate-500">ZOIKOSHIELD · UI CONCEPT · ASSETS &amp; INVENTORY · DEMO RECORDS ONLY</div>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("exposure", "relationships") && (
          <Panel title="Asset inventory" meta="VIEW ALL →" className="xl:col-span-2">
            <div className="flex flex-wrap gap-2 mb-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search hostname, identity or IP..." />
              <select aria-label="Type filter" value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 rounded-lg bg-[#080c16] border border-[#162238] text-xs text-slate-300">
                {["All", "Server", "Endpoint", "Identity", "Cloud", "Database", "Network", "App"].map((t) => <option key={t} value={t}>Type: {t}</option>)}
              </select>
              <select aria-label="Risk filter" value={risk} onChange={(e) => setRisk(e.target.value)} className="px-3 py-2 rounded-lg bg-[#080c16] border border-[#162238] text-xs text-slate-300">
                {["All", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((t) => <option key={t} value={t}>Risk: {t}</option>)}
              </select>
            </div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              selectedKey={sel.id}
              onSelect={(r) => setSelectedId(r.id)}
              columns={[
                { key: "id", header: "Asset / ID", render: (r) => <span className="font-mono font-semibold text-slate-100">{r.id}</span> },
                { key: "t", header: "Type", render: (r) => r.type },
                { key: "o", header: "Owner", render: (r) => <span className={r.owner === "UNASSIGNED" ? "text-amber-300 font-semibold" : ""}>{r.owner}</span> },
                { key: "e", header: "Exposure", render: (r) => <Pill tone={EXP_TONE[r.exposure]}>{r.exposure}</Pill> },
                { key: "tel", header: "Telemetry", render: (r) => <Pill tone={TEL_TONE[r.telemetry]}>{r.telemetry}</Pill> },
                { key: "s", header: "Last seen", render: (r) => <span className={r.seen === "Never" ? "text-amber-300" : ""}>{r.seen}</span> },
                { key: "f", header: "Findings", render: (r) => <span className="font-mono">{r.findings}</span> },
              ]}
            />
          </Panel>
        )}
        {show("exposure", "relationships") && (
          <Panel title="Selected asset" meta={sel.exposure === "CRITICAL" ? "CRITICAL RISK" : `${sel.exposure} RISK`} metaTone={EXP_TONE[sel.exposure]}>
            <div className="text-[11px] text-slate-500 -mt-1 mb-3">Evidence-linked asset profile · read-only view</div>
            <div className="rounded-lg border border-[#162238] bg-[#080c16] p-3 mb-4">
              <div className="text-lg font-bold font-mono text-slate-100">{sel.id}</div>
              <div className="text-[11px] text-slate-500 mb-2">{sel.type} · Tenant inventory ID: AST-{sel.id.split("-").pop()}</div>
              <Pill tone={TEL_TONE[sel.telemetry]}>Telemetry {sel.telemetry.toLowerCase()}</Pill>
            </div>
            <KeyValues
              items={[
                { k: "Owner", v: sel.owner },
                { k: "Source", v: sel.source },
                { k: "Last observed", v: sel.seen },
                { k: "Linked cases", v: `${sel.cases} open` },
                { k: "Evidence records", v: `${sel.evidence} referenced` },
                { k: "Confidence", v: sel.confidence, tone: sel.confidence.startsWith("High") ? "emerald" : "amber" },
              ]}
            />
            {sel.findings > 0 && (
              <>
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-4 mb-2">Priority findings</div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 text-[11px]"><AlertTriangle className="w-3.5 h-3.5 text-rose-300 shrink-0 mt-0.5" /><div><div className="font-semibold text-slate-100">Exposed service requires validation</div><div className="text-slate-500">Finding F-204 · Evidence linked</div></div></div>
                  {sel.telemetry !== "COVERED" && <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-[11px]"><Clock className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" /><div><div className="font-semibold text-slate-100">Incomplete monitoring coverage</div><div className="text-slate-500">Last known ingestion {sel.seen}</div></div></div>}
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Link href="/cases" className="py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-center text-xs font-semibold text-white">Open related case →</Link>
              <Link href="/ledger" className="py-2 rounded-lg border border-[#1e2b44] text-center text-xs font-semibold text-slate-200 hover:bg-[#101828]">Review evidence →</Link>
            </div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("coverage") && (
          <Panel title="Discovery & telemetry coverage" meta="Coverage values are illustrative, not contractual">
            <div className="space-y-4">
              <ProgressRow label="Monitored assets" value={82} display="82%" tone="cyan" />
              <ProgressRow label="Verified owners" value={93} display="93%" tone="emerald" />
              <ProgressRow label="Fresh telemetry" value={79} display="79%" tone="amber" />
            </div>
          </Panel>
        )}
        {show("exposure") && (
          <Panel title="Exposure priorities" meta="Ranked by impact and validated evidence">
            <EventList
              items={[
                { title: "9 critical assets", sub: "Potentially exposed infrastructure", tone: "rose" },
                { title: "18 without confirmed owner", sub: "Accountability verification required", tone: "amber" },
                { title: "3 sources delayed", sub: "Ingestion freshness below target", tone: "blue" },
              ]}
            />
          </Panel>
        )}
        {show("history") && (
          <Panel title="Recent inventory changes" meta="All events are synthetic examples">
            <EventList
              items={[
                { time: "13:46", title: "srv-api-014", sub: "telemetry delayed", tone: "amber" },
                { time: "13:33", title: "ep-win-042", sub: "new exposure finding", tone: "rose" },
                { time: "13:17", title: "cloud-vpc-03", sub: "owner verified", tone: "emerald" },
                { time: "12:58", title: "app-portal-09", sub: "coverage unconfirmed", tone: "amber" },
              ]}
            />
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
