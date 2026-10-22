"use client";

import React, { useMemo, useState } from "react";
import { GitBranch, Shield, Clock, BookOpen, CheckCircle2, Activity, Users, AlertTriangle, Check, Lock, ShieldCheck, FileText } from "lucide-react";
import PlaybooksConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  EventList, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Status = "Approval required" | "Completed" | "In progress" | "Halted";
type Run = { id: string; playbook: string; risk: string; riskTone: Tone; status: Status; owner: string; updated: string };

const RUNS: Run[] = [
  { id: "PB-2026-0418", playbook: "Privileged account containment", risk: "R3 · High", riskTone: "amber", status: "Approval required", owner: "S. Chen", updated: "2 min ago" },
  { id: "PB-2026-0417", playbook: "IOC enrichment and correlation", risk: "R0 · Read-only", riskTone: "slate", status: "Completed", owner: "M. Tan", updated: "11 min ago" },
  { id: "PB-2026-0416", playbook: "Suspicious session investigation", risk: "R1 · Low", riskTone: "slate", status: "In progress", owner: "P. Nair", updated: "19 min ago" },
  { id: "PB-2026-0415", playbook: "Endpoint isolation proposal", risk: "R3 · High", riskTone: "amber", status: "Approval required", owner: "J. Diaz", updated: "28 min ago" },
  { id: "PB-2026-0414", playbook: "Evidence package creation", risk: "R0 · Read-only", riskTone: "slate", status: "Completed", owner: "S. Chen", updated: "42 min ago" },
  { id: "PB-2026-0413", playbook: "Connector failure recovery check", risk: "R1 · Low", riskTone: "slate", status: "Halted", owner: "System", updated: "1 hr ago" },
];
const STATUS_TONE: Record<Status, Tone> = { "Approval required": "amber", Completed: "emerald", "In progress": "blue", Halted: "rose" };

const STEPS = [
  { label: "Alert trigger validated", sub: "Source and tenant binding verified", time: "11:42:02", state: "done" },
  { label: "Evidence & identity context", sub: "Audit references collected and linked", time: "11:42:08", state: "done" },
  { label: "Impact simulation", sub: "Dry run completed; no live changes", time: "11:42:15", state: "done" },
  { label: "Dual-approval quorum", sub: "One of two distinct approvals received", time: "PENDING", state: "pending" },
  { label: "Containment execution", sub: "Blocked until quorum and passkey checks", time: "LOCKED", state: "locked" },
  { label: "Verification & ledger record", sub: "Not started · evidence preserved", time: "PENDING", state: "idle" },
];

const TABS = [
  { id: "queue", label: "Run Queue" },
  { id: "history", label: "Run History" },
  { id: "approvals", label: "Approval Queue (3)" },
  { id: "library", label: "Playbook Library" },
  { id: "policy", label: "Execution Policy" },
];

export default function PlaybookRunsPage() {
  const [tab, setTab] = useState("queue");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(RUNS[0].id);
  const show = useTabFilter(tab, "queue");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RUNS.filter((r) => (tab !== "approvals" || r.status === "Approval required") && (tab !== "history" || r.status === "Completed" || r.status === "Halted") && (!q || `${r.id} ${r.playbook} ${r.owner}`.toLowerCase().includes(q)));
  }, [query, tab]);
  const sel = RUNS.find((r) => r.id === selectedId) ?? RUNS[0];

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<GitBranch className="w-5 h-5" />}
          title="Playbook Runs"
          subtitle="Monitor response orchestration, review evidence and enforce approval gates"
          actions={
            <>
              <Pill tone="amber"><Shield className="w-3 h-3" /> High-risk actions guarded</Pill>
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1e2b44] text-xs text-slate-300"><Clock className="w-3.5 h-3.5" /> Last 7 days</span>
              <ActionButton primary onClick={() => setTab("library")}><BookOpen className="w-3.5 h-3.5" /> Playbook Library</ActionButton>
            </>
          }
        />
      }
      banner={<NoticeBanner tone="cyan" title="Autonomous SOAR Orchestration Engine" body="Production response playbooks with cryptographic dual-custody approval gates and automated containment." tag="Active SOAR Engine" />}
      kpis={
        <KpiGrid
          items={[
            { label: "All runs", value: "24", hint: "Rolling 7-day operational window", tone: "blue", icon: <GitBranch className="w-3.5 h-3.5" /> },
            { label: "Completed", value: "15", hint: "Verified step completion", tone: "emerald", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
            { label: "In progress", value: "4", hint: "Non-destructive stages only", tone: "blue", icon: <Activity className="w-3.5 h-3.5" /> },
            { label: "Awaiting approval", value: "3", hint: "Human authorization required", tone: "amber", icon: <Users className="w-3.5 h-3.5" /> },
            { label: "Failed / halted", value: "2", hint: "Review and recovery needed", tone: "rose", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<PlaybooksConsole />}
      consoleLabel="Live recorded runs"
      footer={<div className="flex justify-between text-[10px] text-slate-500"><span>ZoikoShield · Playbook Runs · Sovereign Orchestration v3.2</span><span className="text-emerald-400 font-semibold">Policy-enforced dual authorization &amp; continuous audit trail</span></div>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {show("history", "approvals") && (
          <Panel title={`Run Queue · ${rows.length} runs`} meta="Selected run highlighted · most recent first" metaTone="slate" className="xl:col-span-3">
            <div className="mb-3"><SearchInput value={query} onChange={setQuery} placeholder="Search run ID or playbook" /></div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              selectedKey={sel.id}
              onSelect={(r) => setSelectedId(r.id)}
              columns={[
                { key: "id", header: "Run ID", render: (r) => <span className="font-mono">{r.id}</span> },
                { key: "p", header: "Playbook / context", render: (r) => <span className="font-semibold text-slate-100">{r.playbook}</span> },
                { key: "r", header: "Risk", render: (r) => <span className={r.riskTone === "amber" ? "text-amber-300 font-semibold" : "text-slate-400"}>{r.risk}</span> },
                { key: "s", header: "Status", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill> },
                { key: "o", header: "Owner", render: (r) => r.owner },
                { key: "u", header: "Updated", render: (r) => r.updated },
              ]}
            />
            <div className="text-[11px] text-slate-500 mt-3">Showing {rows.length} active playbook execution runs</div>
          </Panel>
        )}
        {show("approvals", "policy") && (
          <Panel title={sel.playbook} meta={`SELECTED RUN · ${sel.id}`} className="xl:col-span-2">
            <div className="flex flex-wrap gap-1.5 -mt-1 mb-3"><Pill tone={sel.riskTone}>{sel.risk}{sel.riskTone === "amber" ? " · Dual custody" : ""}</Pill><Pill tone={STATUS_TONE[sel.status]}>{sel.status === "Approval required" ? "Blocked · awaiting approval" : sel.status}</Pill></div>
            <div className="text-[11px] text-slate-500 mb-3">Source: Alert ALT-2026-0112 · Case CASE-2026-0047</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <ul className="md:col-span-3 space-y-2.5">
                {STEPS.map((s) => (
                  <li key={s.label} className="flex items-start justify-between gap-2">
                    <span className="flex items-start gap-2">
                      {s.state === "done" ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : s.state === "pending" ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> : s.state === "locked" ? <Lock className="w-4 h-4 text-slate-500 shrink-0" /> : <span className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />}
                      <span><span className="block text-xs font-semibold text-slate-200">{s.label}</span><span className="block text-[10px] text-slate-500">{s.sub}</span></span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">{s.time}</span>
                  </li>
                ))}
              </ul>
              <div className="md:col-span-2 rounded-lg border border-amber-500/40 bg-amber-950/20 p-3">
                <div className="text-[10px] font-bold uppercase text-amber-300">Approval quorum</div>
                <div className="text-2xl font-bold text-slate-100 mt-1">1 <span className="text-sm text-slate-500">/ 2</span></div>
                <div className="text-[10px] text-slate-400">Four-eyes authorization required before any high-risk action.</div>
                <div className="text-[10px] text-slate-500 mt-2">Second signer: independent authorized approver</div>
                <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>View approval request →</ActionButton>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 text-[11px]"><span className="flex items-center gap-1.5 text-slate-400"><Lock className="w-3 h-3" /> High-risk execution is <b className="text-amber-300">blocked</b> pending independent approval and policy checks.</span></div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("approvals") && (
          <Panel title="Pending Human Decisions" meta="Open approval queue →">
            <EventList items={[
              { title: "Privileged account containment", sub: "PB-2026-0418 · R3 · quorum 1/2", tag: "Awaiting 2nd signer", tone: "amber" },
              { title: "Endpoint isolation proposal", sub: "PB-2026-0415 · R3 · simulation complete", tag: "Awaiting review", tone: "amber" },
              { title: "High-impact identity revocation", sub: "PB-2026-0411 · R4 · no execution", tag: "Awaiting quorum", tone: "amber" },
            ]} />
          </Panel>
        )}
        {show("history") && (
          <Panel title="Recent Execution Events" meta="Open event history →">
            <EventList items={[
              { title: "Impact simulation completed", sub: "PB-2026-0418 · no live mutation", tag: "2 min ago", tone: "blue" },
              { title: "Approval gate prevented execution", sub: "Second signer missing · R3", tag: "3 min ago", tone: "amber" },
              { title: "Evidence package sealed", sub: "PB-2026-0414 · demo audit record", tag: "42 min ago", tone: "emerald" },
            ]} />
          </Panel>
        )}
        {show("policy", "library") && (
          <Panel title="Response Safety & Controls" meta="Demonstration posture" metaTone="slate">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-200 mb-3"><ShieldCheck className="w-4 h-4" /> Human authorization enforced</div>
            <div className="space-y-1.5 text-[11px]">
              {[["Live action execution", "Disabled in demo", "text-amber-300"], ["R2–R4 step-up policy", "Required", "text-slate-200"], ["Independent approval", "Required", "text-slate-200"], ["Audit & evidence", "Record every decision", "text-slate-200"]].map(([k, v, c]) => (
                <div key={k} className="flex justify-between"><span className="text-slate-400">{k}</span><span className={`font-semibold ${c}`}>{v}</span></div>
              ))}
            </div>
          </Panel>
        )}
        {tab === "library" && (
          <Panel title="Playbook Library" meta="Certified playbooks">
            <EventList items={RUNS.map((r) => ({ title: r.playbook, sub: r.risk, tone: r.riskTone, tag: "Certified" }))} />
            <div className="mt-3"><ActionButton onClick={() => setTab(CONSOLE_TAB)}><FileText className="w-3.5 h-3.5" /> Open step plans</ActionButton></div>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
