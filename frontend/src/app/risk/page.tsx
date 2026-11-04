"use client";

import React, { useMemo, useState } from "react";
import { Scale, Plus, Check, Circle, Download } from "lucide-react";
import RiskConsole from "./console";
import { downloadFromApi } from "@/lib/export-utils";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, EventList, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Level = "Critical" | "High" | "Medium" | "Low";
type Risk = { id: string; title: string; control: string; inherent: Level; residual: Level; owner: string; review: string; status: string; statusTone: Tone };

const RISKS: Risk[] = [
  { id: "RSK-026", title: "Privileged session exposure", control: "CTRL-IAM-04", inherent: "Critical", residual: "High", owner: "S. Chen", review: "15 Oct", status: "Open", statusTone: "rose" },
  { id: "RSK-021", title: "Cloud log coverage gap", control: "CTRL-LOG-02", inherent: "High", residual: "High", owner: "M. Tan", review: "16 Oct", status: "Action due", statusTone: "amber" },
  { id: "RSK-018", title: "Stale endpoint telemetry", control: "CTRL-EDR-01", inherent: "High", residual: "Medium", owner: "P. Nair", review: "17 Oct", status: "Mitigating", statusTone: "blue" },
  { id: "RSK-013", title: "Unreviewed service account", control: "CTRL-IAM-09", inherent: "High", residual: "Medium", owner: "D. Kim", review: "18 Oct", status: "In review", statusTone: "purple" },
  { id: "RSK-010", title: "Third-party token scope", control: "CTRL-API-06", inherent: "Medium", residual: "Low", owner: "A. Khan", review: "22 Oct", status: "Monitoring", statusTone: "slate" },
  { id: "RSK-008", title: "Retention policy deviation", control: "CTRL-DATA-01", inherent: "Medium", residual: "Low", owner: "M. Tan", review: "25 Oct", status: "Mitigating", statusTone: "blue" },
];
const LEVEL_TONE: Record<Level, Tone> = { Critical: "rose", High: "amber", Medium: "amber", Low: "emerald" };

type Exc = { id: string; title: string; meta: string; state: string; tone: Tone };
const EXCEPTIONS: Exc[] = [
  { id: "EXC-027", title: "Emergency privileged access", meta: "RSK-026 · Owner: Sarah Chen · Awaiting second signer", state: "Pending", tone: "amber" },
  { id: "EXC-023", title: "Temporary MFA bypass", meta: "CTRL-IAM-06 · Owner: A. Khan · 16 Oct 2026 · 2 days", state: "Expiring", tone: "amber" },
  { id: "EXC-020", title: "Log pipeline maintenance", meta: "CTRL-LOG-02 · Owner: M. Tan · Missing fresh evidence", state: "Review", tone: "blue" },
  { id: "EXC-018", title: "Legacy API credentials", meta: "CTRL-API-03 · Owner: D. Kim · 13 Oct 2026", state: "Expired", tone: "rose" },
];

// Likelihood (rows, 5→1) × impact (cols, 1→5). Demo ratings only.
const HEAT = [
  [0, 0, 1, 1, 0],
  [0, 1, 2, 1, 0],
  [1, 3, 2, 1, 0],
  [2, 3, 2, 0, 0],
  [4, 2, 0, 0, 0],
];
function heatTone(l: number, i: number) {
  const s = l * i;
  if (s >= 16) return "bg-rose-900/70 text-rose-100";
  if (s >= 10) return "bg-orange-900/60 text-orange-100";
  if (s >= 5) return "bg-amber-900/50 text-amber-100";
  return "bg-emerald-900/50 text-emerald-100";
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "register", label: "Risk register" },
  { id: "exceptions", label: "Exceptions" },
  { id: "mitigations", label: "Mitigations" },
  { id: "history", label: "Review history" },
];

export default function RiskExceptionsPage() {
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [selectedRisk, setSelectedRisk] = useState("RSK-026");
  const [isExporting, setIsExporting] = useState(false);
  const show = useTabFilter(tab, "overview");

  const handleExportRegister = async () => {
    setIsExporting(true);
    try {
      await downloadFromApi("/api/v1/exports/data/risk?format=csv", "risk-register.csv");
    } catch (err) {
      console.error("Failed to export risk register:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? RISKS.filter((r) => `${r.id} ${r.title} ${r.owner} ${r.control}`.toLowerCase().includes(q)) : RISKS;
  }, [query]);

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Scale className="w-5 h-5" />}
          title="Risk & Exceptions"
          subtitle="Prioritize exposures, track mitigation, request time-bound policy exceptions."
          actions={
            <>
              <ActionButton onClick={handleExportRegister}><Download className="w-3.5 h-3.5" /> {isExporting ? "Exporting..." : "Export register"}</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><Plus className="w-3.5 h-3.5" /> Request exception</ActionButton>
            </>
          }
        />
      }
      banner={<NoticeBanner tone="amber" title="Policy safeguard" body="An exception request does not suspend enforcement. Independent approval, scope, and expiry are mandatory." tag="Active Policy Safeguard" />}
      kpis={
        <KpiGrid
          items={[
            { label: "Open risks", value: "26", hint: "6 awaiting owner review", tone: "blue" },
            { label: "High / critical", value: "7", hint: "2 require action today", tone: "rose" },
            { label: "Pending exceptions", value: "5", hint: "No approval implied", tone: "purple" },
            { label: "Expiring ≤ 7 days", value: "3", hint: "Renew or revert access", tone: "amber" },
            { label: "Evidence gaps", value: "4", hint: "Verification outstanding", tone: "cyan" },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<RiskConsole />}
      consoleLabel="Live risk register"
    >
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {show("register", "mitigations") && (
          <Panel title="Risk Register" meta="View all →" className="xl:col-span-3">
            <div className="text-[11px] text-slate-500 -mt-1 mb-3">Risk ratings are tenant-scoped assessments, not certification claims</div>
            <div className="mb-3"><SearchInput value={query} onChange={setQuery} placeholder="Search risk ID, owner or control" /></div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              selectedKey={selectedRisk}
              onSelect={(r) => setSelectedRisk(r.id)}
              columns={[
                { key: "id", header: "ID", render: (r) => <span className="font-mono">{r.id}</span> },
                { key: "t", header: "Risk / linked control", render: (r) => <div><div className="font-semibold text-slate-100">{r.title}</div><div className="text-[10px] text-slate-500">{r.control}</div></div> },
                { key: "i", header: "Inherent", render: (r) => <Pill tone={LEVEL_TONE[r.inherent]}>{r.inherent}</Pill> },
                { key: "r", header: "Residual", render: (r) => <Pill tone={LEVEL_TONE[r.residual]}>{r.residual}</Pill> },
                { key: "o", header: "Owner", render: (r) => r.owner },
                { key: "n", header: "Next review", render: (r) => r.review },
                { key: "s", header: "Status", render: (r) => <Pill tone={r.statusTone}>{r.status}</Pill> },
              ]}
            />
          </Panel>
        )}
        {show("exceptions") && (
          <Panel title="Selected Exception" meta="PENDING APPROVAL" metaTone="amber" className="xl:col-span-2">
            <div className="text-[11px] text-slate-500 -mt-1">EXC-027 · Linked to RSK-026 / CTRL-IAM-04</div>
            <div className="text-lg font-bold text-slate-100 mt-2">Emergency privileged access</div>
            <div className="text-xs text-slate-400">Temporary elevation for incident recovery</div>
            <div className="mt-4"><KeyValues items={[{ k: "Requested scope", v: "1 tenant role · 2 hour maximum" }, { k: "Requested by", v: "Sarah Chen" }]} /></div>
            <div className="mt-4 text-[10px] font-mono uppercase tracking-wider text-slate-500">Compensating controls</div>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
              {["FIDO2 step-up required", "Session recording + audit receipt", "Automatic expiry / access reversion"].map((c) => (
                <li key={c} className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-400" />{c}</li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3">
              <div className="text-[11px] font-bold text-rose-200 uppercase">Enforcement remains active</div>
              <div className="text-[11px] text-slate-400">No exception takes effect before dual authorization.</div>
            </div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("exceptions") && (
          <Panel title="Exception Review Queue" meta="View all →">
            <div className="text-[11px] text-slate-500 -mt-1 mb-3">Review permissions, expiry, ownership and audit evidence</div>
            <ul className="space-y-3">
              {EXCEPTIONS.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-0">
                  <div className="min-w-0"><div className="text-xs"><span className="font-mono text-sky-300 mr-2">{e.id}</span><span className="font-semibold text-slate-100">{e.title}</span></div><div className="text-[11px] text-slate-500">{e.meta}</div></div>
                  <Pill tone={e.tone}>{e.state}</Pill>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {show("register", "mitigations") && (
          <Panel title="Risk Heatmap" meta="Likelihood × impact · composite posture">
            <div className="flex gap-2">
              <div className="flex flex-col justify-around text-[10px] text-slate-500 font-mono">{[5, 4, 3, 2, 1].map((l) => <span key={l}>{l}</span>)}</div>
              <div className="grid grid-cols-5 gap-1.5 flex-1" role="grid" aria-label="Risk heatmap">
                {HEAT.map((row, ri) =>
                  row.map((n, ci) => (
                    <div key={`${ri}-${ci}`} role="gridcell" className={`aspect-square max-w-full rounded-md flex items-center justify-center text-sm font-bold ${heatTone(5 - ri, ci + 1)}`}>{n}</div>
                  )),
                )}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5 ml-5 mt-1 text-[10px] text-slate-500 font-mono text-center">{[1, 2, 3, 4, 5].map((i) => <span key={i}>{i}</span>)}</div>
            <div className="text-center text-[10px] text-slate-500 mt-1">IMPACT →</div>
          </Panel>
        )}
        {show("history", "exceptions") && (
          <Panel title="Approval & Audit Trail" meta="Exceptions remain inactive until authorization is complete" metaTone="slate">
            <EventList
              items={[
                { title: "Request submitted", sub: "Sarah Chen · 14 Oct, 11:08 UTC", tag: "Done", tone: "emerald" },
                { title: "Security Lead review", sub: "Independent signer · awaiting decision", tag: "Pending", tone: "amber" },
                { title: "Second authorized signer", sub: "Separate principal required", tag: "Blocked", tone: "slate" },
              ]}
            />
            <div className="flex justify-between text-[11px] mt-3 pt-3 border-t border-line">
              <span className="text-slate-500">INTEGRITY</span><span className="text-emerald-400 font-semibold">Proof status: cryptographic hash signed</span>
            </div>
            <ActionButton disabled><Circle className="w-3 h-3" /> Approve / activate unavailable in analyst view</ActionButton>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
