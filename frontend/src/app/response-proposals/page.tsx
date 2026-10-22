"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Plus, Clock, CheckCircle2, XCircle, Download, MessageSquare, PencilLine, Monitor, ShieldCheck } from "lucide-react";
import ResponseProposalsConsole from "./console";
import {
  WorkspacePage, PageHeader, KpiGrid, Panel, Pill, DataTable, SearchInput, EventList,
  ActionButton, CONSOLE_TAB, type Tone,
} from "@/components/mockup/kit";

type Risk = "High" | "Medium" | "Low";
type Status = "Pending" | "Approved" | "Executed" | "In Review";
type Proposal = { id: string; title: string; trigger: string; risk: Risk; status: Status; owner: string; initials: string; created: string };

const PROPOSALS: Proposal[] = [
  { id: "RSP-2026-0047", title: "Isolate compromised endpoint", trigger: "INC-2026-00473", risk: "High", status: "Pending", owner: "James Diaz", initials: "JD", created: "14 Oct 14:03" },
  { id: "RSP-2026-0046", title: "Revoke user sessions", trigger: "ALT-2026-00128", risk: "Medium", status: "Approved", owner: "Aisha Khan", initials: "AK", created: "14 Oct 13:41" },
  { id: "RSP-2026-0045", title: "Block malicious IP range", trigger: "INC-2026-00470", risk: "High", status: "Pending", owner: "Michael Tan", initials: "MT", created: "14 Oct 11:27" },
  { id: "RSP-2026-0044", title: "Reset compromised accounts", trigger: "CASE-2026-0123", risk: "Medium", status: "Approved", owner: "Priya Nair", initials: "PN", created: "14 Oct 09:52" },
  { id: "RSP-2026-0043", title: "Collect forensic evidence", trigger: "ALT-2026-00121", risk: "Low", status: "Executed", owner: "James Diaz", initials: "JD", created: "14 Oct 08:33" },
  { id: "RSP-2026-0042", title: "Contain ransomware spread", trigger: "INC-2026-00468", risk: "High", status: "In Review", owner: "Sarah Chen", initials: "SC", created: "13 Oct 22:16" },
  { id: "RSP-2026-0041", title: "Disable malicious OAuth app", trigger: "CASE-2026-0121", risk: "Medium", status: "Approved", owner: "Aisha Khan", initials: "AK", created: "13 Oct 18:44" },
  { id: "RSP-2026-0040", title: "Quarantine suspicious file", trigger: "ALT-2026-00110", risk: "Low", status: "Executed", owner: "Michael Tan", initials: "MT", created: "13 Oct 16:02" },
];
const RISK_TONE: Record<Risk, Tone> = { High: "rose", Medium: "amber", Low: "blue" };
const STATUS_TONE: Record<Status, Tone> = { Pending: "amber", Approved: "emerald", Executed: "emerald", "In Review": "blue" };

const STEPS = [
  { action: "Verify endpoint context and user", type: "Validation", risk: "Low" as Risk, auto: "Automated", status: "Completed" },
  { action: "Notify user and IT team", type: "Notification", risk: "Low" as Risk, auto: "Automated", status: "Pending" },
  { action: "Isolate endpoint from network", type: "Containment", risk: "High" as Risk, auto: "Semi-automated", status: "Pending" },
  { action: "Collect memory and system logs", type: "Evidence", risk: "Low" as Risk, auto: "Automated", status: "Pending" },
  { action: "Create case and update status", type: "Case Mgmt", risk: "Low" as Risk, auto: "Automated", status: "Pending" },
];

const DETAIL_TABS = ["Overview", "Actions (5)", "Evidence (3)", "Risk & Impact", "Approvals (2)"];

export default function ResponseProposalsPage() {
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [risk, setRisk] = useState("All");
  const [detailTab, setDetailTab] = useState(DETAIL_TABS[0]);
  const [selectedId, setSelectedId] = useState(PROPOSALS[0].id);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROPOSALS.filter((p) => (status === "All" || p.status === status) && (risk === "All" || p.risk === risk) && (!q || `${p.id} ${p.title} ${p.trigger} ${p.owner}`.toLowerCase().includes(q)));
  }, [query, status, risk]);
  const sel = PROPOSALS.find((p) => p.id === selectedId) ?? PROPOSALS[0];
  const pending = PROPOSALS.filter((p) => p.status === "Pending").length;
  const approved = PROPOSALS.filter((p) => p.status === "Approved" || p.status === "Executed").length;
  const decidable = sel.status === "Pending" || sel.status === "In Review";

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<FileText className="w-5 h-5" />}
          title="Response Proposals"
          subtitle="Review, refine and approve security response actions with governance and audit"
          actions={
            <>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}><Download className="w-3.5 h-3.5" /> Export</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><Plus className="w-3.5 h-3.5" /> New Proposal</ActionButton>
            </>
          }
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Total Proposals", value: "18", hint: "Last 7 days · operational queue", tone: "purple", icon: <FileText className="w-3.5 h-3.5" /> },
            { label: "Pending Approval", value: String(pending + 3), tag: "2 high risk", hint: "Awaiting human decision", tone: "rose", icon: <Clock className="w-3.5 h-3.5" /> },
            { label: "Approved", value: "11", tag: "61% approval rate", hint: `${approved} shown below`, tone: "emerald", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
            { label: "Rejected", value: "2", tag: "11% rejection rate", hint: "Reasons recorded", tone: "amber", icon: <XCircle className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={[{ id: "overview", label: "All proposals" }]}
      activeTab={tab}
      onTabChange={setTab}
      console={<ResponseProposalsConsole />}
      consoleLabel="Live decision queue"
      footer={<div className="text-[10px] text-slate-500">Response proposals queue. Approvals and rejections are cryptographically recorded in the live decision queue against policy gates.</div>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Panel title="All Response Proposals" meta={`Showing ${rows.length} of 18 proposals`} metaTone="slate" className="xl:col-span-3">
          <div className="flex flex-wrap gap-2 mb-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search proposals..." />
            <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-lg bg-[#080c16] border border-[#162238] text-xs text-slate-300">
              {["All", "Pending", "Approved", "Executed", "In Review"].map((s) => <option key={s} value={s}>Status: {s}</option>)}
            </select>
            <select aria-label="Risk filter" value={risk} onChange={(e) => setRisk(e.target.value)} className="px-3 py-2 rounded-lg bg-[#080c16] border border-[#162238] text-xs text-slate-300">
              {["All", "High", "Medium", "Low"].map((s) => <option key={s} value={s}>Risk: {s}</option>)}
            </select>
          </div>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            selectedKey={sel.id}
            onSelect={(r) => setSelectedId(r.id)}
            columns={[
              { key: "id", header: "ID", render: (r) => <span className="font-mono">{r.id}</span> },
              { key: "t", header: "Title", render: (r) => <span className="font-semibold text-slate-100">{r.title}</span> },
              { key: "tr", header: "Trigger / Case", render: (r) => <span className="font-mono text-slate-400">{r.trigger}</span> },
              { key: "r", header: "Risk", render: (r) => <Pill tone={RISK_TONE[r.risk]}>{r.risk}</Pill> },
              { key: "s", header: "Status", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill> },
              { key: "o", header: "Owner", render: (r) => <span className="flex items-center gap-1.5"><span className="w-6 h-6 rounded-full bg-sky-700 text-[9px] font-bold text-white flex items-center justify-center">{r.initials}</span>{r.owner}</span> },
              { key: "c", header: "Created ↓", render: (r) => <span className="font-mono">{r.created}</span> },
            ]}
          />
        </Panel>

        <Panel title={sel.id} meta={`${sel.status.toUpperCase()} · ${sel.risk.toUpperCase()} RISK`} metaTone={RISK_TONE[sel.risk]} className="xl:col-span-2">
          <div className="text-base font-bold text-slate-100">{sel.title}</div>
          <p className="text-[11px] text-slate-400 mb-3">Proposed response for {sel.trigger}. Requires human approval before any execution.</p>
          <div className="flex flex-wrap gap-1 mb-3" role="tablist">
            {DETAIL_TABS.map((d) => (
              <button key={d} type="button" role="tab" aria-selected={detailTab === d} onClick={() => setDetailTab(d)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${detailTab === d ? "bg-sky-600 text-white" : "text-slate-300 hover:text-white"}`}>{d}</button>
            ))}
          </div>
          {detailTab === "Overview" && (
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div className="space-y-2">
                <div><div className="text-slate-500">Trigger</div><div className="font-semibold text-slate-200">Multiple failed login attempts</div><div className="text-slate-500 font-mono">{sel.trigger}</div></div>
                <div><div className="text-slate-500">Proposed by</div><div className="font-semibold text-slate-200">{sel.owner}</div><div className="text-slate-500">{sel.created} (UTC)</div></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2"><Monitor className="w-4 h-4 text-slate-400" /><div><div className="text-slate-500">Target asset</div><div className="font-semibold text-slate-200">WIN-WS-0142</div><div className="text-slate-500">10.20.5.42 · Windows 11 Pro</div></div></div>
                <div className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /><div><div className="text-slate-500">Recommended action</div><div className="font-semibold text-slate-200">{sel.title}</div><div className="text-slate-500">Apply containment playbook</div></div></div>
              </div>
            </div>
          )}
          {detailTab === "Actions (5)" && (
            <ol className="space-y-1.5 text-[11px]">{STEPS.map((s, i) => <li key={s.action} className="flex justify-between"><span className="text-slate-200">{i + 1}. {s.action}</span><Pill tone={s.status === "Completed" ? "emerald" : "amber"}>{s.status}</Pill></li>)}</ol>
          )}
          {detailTab === "Evidence (3)" && (
            <EventList items={[
              { title: "Alert evidence", sub: "Failed login attempts (47 events) · ALT-2026-00128", tone: "purple" },
              { title: "Endpoint data", sub: "System logs and processes · WIN-WS-0142", tone: "blue" },
              { title: "Network telemetry", sub: "Suspicious connections · PCAP-2026-7712", tone: "purple" },
            ]} />
          )}
          {detailTab === "Risk & Impact" && <p className="text-[11px] text-slate-300">Single endpoint scope. Low business impact; user notification required. No immediate regulatory notification.</p>}
          {detailTab === "Approvals (2)" && <p className="text-[11px] text-slate-300">Security Manager approval and, for high-impact actions, CISO approval are required before release execution.</p>}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Panel title="Proposed Actions" className="xl:col-span-3">
          <DataTable
            rows={STEPS}
            rowKey={(r) => r.action}
            columns={[
              { key: "n", header: "#", render: (r) => STEPS.indexOf(r) + 1 },
              { key: "a", header: "Action", render: (r) => <span className="text-slate-100">{r.action}</span> },
              { key: "t", header: "Type", render: (r) => r.type },
              { key: "r", header: "Risk", render: (r) => <Pill tone={RISK_TONE[r.risk]}>{r.risk}</Pill> },
              { key: "au", header: "Automation", render: (r) => r.auto },
              { key: "s", header: "Status", render: (r) => <Pill tone={r.status === "Completed" ? "emerald" : "amber"}>{r.status}</Pill> },
            ]}
          />
        </Panel>
        <Panel title="Approval Workflow" meta="View History" className="xl:col-span-1">
          <EventList items={[
            { title: "Proposed", sub: `By ${sel.owner} · ${sel.created}`, tone: "emerald" },
            { title: "Security Analyst Review", sub: "By Sarah Chen", tag: "In Progress", tone: "blue" },
            { title: "Security Manager Approval", sub: "Required for High Risk actions", tag: "Pending", tone: "slate" },
            { title: "CISO Approval (if required)", sub: "For critical or high impact", tag: "Pending", tone: "slate" },
            { title: "Ready for Execution", sub: "Execute automatically after approvals", tag: "Not Ready", tone: "slate" },
          ]} />
        </Panel>
        <Panel title="Approval Actions" className="xl:col-span-1">
          <div className="space-y-2">
            <button type="button" disabled={!decidable} onClick={() => setTab(CONSOLE_TAB)} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white"><CheckCircle2 className="w-4 h-4" /> Approve</button>
            <button type="button" disabled={!decidable} onClick={() => setTab(CONSOLE_TAB)} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white"><XCircle className="w-4 h-4" /> Reject</button>
            <ActionButton disabled={!decidable} onClick={() => setTab(CONSOLE_TAB)}><PencilLine className="w-3.5 h-3.5" /> Request Changes</ActionButton>
            <ActionButton onClick={() => setTab(CONSOLE_TAB)}><MessageSquare className="w-3.5 h-3.5" /> Add Comment</ActionButton>
          </div>
          <p className="text-[10px] text-slate-500 mt-3">{decidable ? "Decisions open the live queue, where they are signed and recorded." : `${sel.id} is already ${sel.status.toLowerCase()}.`}</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Evidence" meta="View All (3)">
          <EventList items={[
            { time: "14:01", title: "Alert evidence", sub: "Failed login attempts (47 events) · ALT-2026-00128", tone: "purple" },
            { time: "14:02", title: "Endpoint data", sub: "System logs and processes · WIN-WS-0142", tone: "blue" },
            { time: "13:59", title: "Network telemetry", sub: "Suspicious connections · PCAP-2026-7712", tone: "purple" },
          ]} />
        </Panel>
        <Panel title="Risk & Impact Assessment">
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div><div className="text-slate-500">Risk Level</div><Pill tone={RISK_TONE[sel.risk]}>{sel.risk}</Pill></div>
            <div><div className="text-slate-500">Impact Scope</div><div className="font-semibold text-slate-200">Single endpoint</div><div className="text-slate-500">Potential lateral movement</div></div>
            <div className="space-y-2"><div><div className="text-slate-500">Business Impact</div><div className="font-semibold text-emerald-300">Low</div></div><div><div className="text-slate-500">Regulatory Impact</div><div className="font-semibold text-emerald-300">Low</div></div></div>
          </div>
        </Panel>
        <Panel title="Related Items" meta="View All">
          <ul className="space-y-2 text-[11px]">
            {[
              ["INC-2026-00473", "Suspicious lateral movement", "Investigating", "amber", "/cases/incidents/command"],
              ["ALT-2026-00128", "Multiple failed login attempts", "Critical", "rose", "/alerts"],
              ["WIN-WS-0142", "Target endpoint", "At Risk", "amber", "/assets"],
              ["CASE-2026-0123", "User account compromise", "Open", "rose", "/cases"],
            ].map(([id, sub, st, t, href]) => (
              <li key={id} className="flex items-center justify-between gap-2">
                <Link href={href} className="hover:underline"><span className="font-mono text-slate-200 mr-2">{id}</span><span className="text-slate-500">{sub}</span></Link>
                <Pill tone={t as Tone}>{st}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
