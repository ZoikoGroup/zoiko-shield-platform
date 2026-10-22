"use client";

import React, { useMemo, useState } from "react";
import { Plus, AlertTriangle, ClipboardList, Clock, AlertOctagon, Check } from "lucide-react";
import IrRetainerConsole from "./console";
import {
  WorkspacePage, PageHeader, KpiGrid, Panel, Pill, DataTable, KeyValues, EventList, ProgressRow,
  StepFlow, ActionButton, CONSOLE_TAB, type Tone,
} from "@/components/mockup/kit";

type Priority = "P1 · Critical" | "P2 · High" | "P3 · Medium";
type Req = { id: string; when: string; title: string; caseRef: string; kind: string; priority: Priority; state: string; stateTone: Tone; sla: string };

const REQUESTS: Req[] = [
  { id: "IR-2026-0047", when: "14 Oct · 12:42", title: "Suspected identity compromise", caseRef: "CASE-2026-1043", kind: "Identity", priority: "P1 · Critical", state: "Awaiting accept", stateTone: "amber", sla: "18 min left" },
  { id: "IR-2026-0046", when: "14 Oct · 11:26", title: "Cloud account exfiltration", caseRef: "CASE-2026-1041", kind: "Cloud", priority: "P2 · High", state: "Scoping", stateTone: "blue", sla: "Met" },
  { id: "IR-2026-0045", when: "13 Oct · 16:10", title: "Forensic evidence review", caseRef: "CASE-2026-1039", kind: "Advisory", priority: "P3 · Medium", state: "Engaged", stateTone: "purple", sla: "Met" },
  { id: "IR-2026-0044", when: "12 Oct · 09:35", title: "Endpoint recovery guidance", caseRef: "CASE-2026-1035", kind: "Endpoint", priority: "P2 · High", state: "Resolved", stateTone: "emerald", sla: "Complete" },
  { id: "IR-2026-0043", when: "11 Oct · 14:04", title: "Ransomware tabletop assistance", caseRef: "SIM-2026-0072", kind: "Exercise", priority: "P3 · Medium", state: "Resolved", stateTone: "emerald", sla: "Complete" },
  { id: "IR-2026-0042", when: "10 Oct · 18:15", title: "Threat intelligence consultation", caseRef: "CASE-2026-1029", kind: "Advisory", priority: "P3 · Medium", state: "Resolved", stateTone: "emerald", sla: "Complete" },
];
const PRIO_TONE: Record<Priority, Tone> = { "P1 · Critical": "rose", "P2 · High": "amber", "P3 · Medium": "blue" };

const FILTERS = [
  { id: "all", label: "All requests" },
  { id: "awaiting", label: "Awaiting provider" },
  { id: "engaged", label: "Engaged" },
  { id: "resolved", label: "Resolved" },
];

export default function IrRetainerSlaPage() {
  const [tab, setTab] = useState("overview");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(REQUESTS[0].id);
  const rows = useMemo(
    () =>
      REQUESTS.filter((r) =>
        filter === "all" ? true : filter === "awaiting" ? r.state === "Awaiting accept" : filter === "engaged" ? ["Engaged", "Scoping"].includes(r.state) : r.state === "Resolved",
      ),
    [filter],
  );
  const sel = REQUESTS.find((r) => r.id === selectedId) ?? REQUESTS[0];
  const counts = {
    all: REQUESTS.length,
    awaiting: REQUESTS.filter((r) => r.state === "Awaiting accept").length,
    engaged: REQUESTS.filter((r) => ["Engaged", "Scoping"].includes(r.state)).length,
    resolved: REQUESTS.filter((r) => r.state === "Resolved").length,
  } as Record<string, number>;

  return (
    <WorkspacePage
      header={
        <PageHeader
          eyebrow="Workspace 11 · Incident response services"
          title="IR Retainer & SLA"
          subtitle="Confirm response coverage, request specialist assistance, and track engagement deadlines."
          actions={
            <>
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 max-w-sm">
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <div><div className="text-[11px] font-bold text-amber-200 uppercase">Entitlements not yet verified</div><div className="text-[10px] text-slate-400">Actual coverage, availability and SLA targets are governed by the signed agreement.</div></div>
              </div>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><Plus className="w-3.5 h-3.5" /> Request IR support</ActionButton>
            </>
          }
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Contract validation", value: "Active", hint: "Governed SLA parameters active", tone: "emerald", icon: <ClipboardList className="w-3.5 h-3.5" /> },
            { label: "Retainer capacity", value: "18 / 50 h", hint: "Allocated monthly SLA block", tone: "blue", icon: <Clock className="w-3.5 h-3.5" /> },
            { label: "Open IR requests", value: String(counts.awaiting + counts.engaged), hint: `${counts.awaiting} awaiting provider acknowledgement`, tone: "purple" },
            { label: "Awaiting SLA response", value: String(counts.awaiting), hint: "Active P1 triage clock", tone: "rose", icon: <AlertOctagon className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={[{ id: "overview", label: "Overview" }]}
      activeTab={tab}
      onTabChange={setTab}
      console={<IrRetainerConsole />}
      consoleLabel="Live work orders & hour ledger"
      footer={<div className="flex justify-between text-[10px] text-slate-500"><span>ZOIKOSHIELD · IR RETAINER &amp; SLA</span><span className="text-emerald-400 font-semibold">Cryptographic SLA tracking &amp; dual-signed engagement ledger active</span></div>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="IR service requests & engagements" meta="View engagement history →">
          <div className="text-[11px] text-slate-500 -mt-1 mb-3">Customer requests, response acknowledgment, ownership and linked incidents</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold ${filter === f.id ? "bg-sky-600 border-sky-500 text-white" : "border-line-strong text-slate-300"}`}>{f.label} · {counts[f.id]}</button>
            ))}
          </div>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            selectedKey={sel.id}
            onSelect={(r) => setSelectedId(r.id)}
            columns={[
              { key: "id", header: "Request", render: (r) => <div><div className="font-mono font-semibold text-slate-100">{r.id}</div><div className="text-[10px] text-slate-500">{r.when}</div></div> },
              { key: "t", header: "Incident / service", render: (r) => <div><div className="font-semibold text-slate-100">{r.title}</div><div className="text-[10px] text-slate-500">{r.caseRef} · {r.kind}</div></div> },
              { key: "p", header: "Priority", render: (r) => <Pill tone={PRIO_TONE[r.priority]}>{r.priority}</Pill> },
              { key: "s", header: "State", render: (r) => <Pill tone={r.stateTone}>{r.state}</Pill> },
              { key: "sla", header: "SLA clock *", render: (r) => <span className={r.sla.includes("left") ? "font-semibold text-rose-300" : r.sla === "Met" ? "text-emerald-300" : "text-slate-400"}>{r.sla}</span> },
            ]}
          />
        </Panel>

        <Panel title={sel.state === "Awaiting accept" ? "Provider acknowledgment pending" : sel.title} meta={`${sel.priority.toUpperCase()}${sel.state === "Awaiting accept" ? " · NOT ACCEPTED" : ""}`} metaTone={PRIO_TONE[sel.priority]}>
          <div className="text-[11px] text-slate-500 -mt-1 mb-3">{sel.id} · Linked to {sel.caseRef}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs font-bold text-slate-200 mb-2">Request context</div>
              <KeyValues cols={1} items={[
                { k: "Requestor", v: "Sarah Chen · Analyst" },
                { k: "Requested assistance", v: sel.title },
                { k: "Submitted", v: sel.when },
                { k: "Provider acknowledgement", v: sel.state === "Awaiting accept" ? "Not received" : "Received", tone: sel.state === "Awaiting accept" ? "rose" : "emerald" },
              ]} />
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs font-bold text-slate-200 mb-2">Scope and service boundary</div>
              <KeyValues cols={1} items={[
                { k: "Response coverage", v: "Unverified", tone: "amber" },
                { k: "Assigned responder", v: sel.state === "Awaiting accept" ? "Not assigned" : "Provider engineer" },
                { k: "Case status", v: sel.state === "Resolved" ? "Closed" : "Internal triage ongoing" },
                { k: "Authority", v: "Provider decides acceptance" },
              ]} />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-line p-3">
            <div className="text-xs font-bold text-slate-200 mb-3">Engagement lifecycle · Provider confirmation required</div>
            <StepFlow steps={[
              { label: "Submitted", sub: "Customer request", state: "done" },
              { label: "Acknowledge", sub: sel.state === "Awaiting accept" ? "Provider pending" : "Received", state: sel.state === "Awaiting accept" ? "active" : "done" },
              { label: "Accept & scope", sub: ["Engaged", "Resolved"].includes(sel.state) ? "Scoped" : "Not commenced", state: ["Engaged", "Resolved"].includes(sel.state) ? "done" : "pending" },
              { label: "IR engagement", sub: sel.state === "Resolved" ? "Complete" : sel.state === "Engaged" ? "In progress" : "Not commenced", state: sel.state === "Resolved" ? "done" : sel.state === "Engaged" ? "active" : "pending" },
            ]} />
          </div>
          <p className="mt-3 text-[11px] text-amber-200 border border-amber-500/40 bg-amber-950/30 rounded-lg p-2.5"><b>Action required:</b> Verify the contracted duty channel, then follow the customer escalation protocol. Submitting this request does not confirm provider acceptance or guarantee dispatch.</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Response targets & escalation" meta="View policy details →">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs font-bold text-slate-200 mb-3">Illustrative SLA matrix</div>
              <div className="space-y-3">
                <ProgressRow label="P1 · Critical — 30 min target" value={75} display="Provider ack" tone="rose" />
                <ProgressRow label="P2 · High — 1 hour target" value={30} display="Provider ack" tone="amber" />
                <ProgressRow label="P3 · Medium — 4 hours target" value={12} display="Provider ack" tone="blue" />
              </div>
              <p className="text-[10px] text-slate-500 mt-3">Targets are demo assumptions, not confirmed contractual commitments.</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs font-bold text-slate-200 mb-3">Escalation and communication record</div>
              <EventList items={[
                { title: "Internal priority confirmed", sub: "12:42 · Case priority and supporting evidence checked", tone: "emerald" },
                { title: "IR support request created", sub: "12:44 · Demonstration request reference issued", tone: "emerald" },
                { title: "Provider acknowledgment outstanding", sub: "Acceptance not evidenced · escalation review required", tone: "amber" },
                { title: "Specialist mobilization", sub: "Not scheduled until coverage and acceptance confirmed", tone: "slate" },
              ]} />
            </div>
          </div>
        </Panel>
        <Panel title="Retainer & authorized contacts" meta="Contract source →">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs font-bold text-slate-200 mb-3">Illustrative entitlement record</div>
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between"><span className="text-slate-400">Contract verification</span><span className="font-semibold text-amber-300">Pending validation</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Proposed coverage</span><span className="font-semibold text-slate-200">24/7 · Subject to signed terms</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Sample retainer balance</span><span className="font-semibold text-slate-200">32 of 50 h remaining</span></div>
              </div>
              <div className="mt-3"><ProgressRow label="" value={18} max={50} display="" tone="blue" /></div>
              <p className="text-[10px] text-slate-500 mt-2">No coverage guarantee or billing authorization implied.</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs font-bold text-slate-200 mb-3">Escalation contact directory</div>
              <EventList items={[
                { title: "Contracted duty desk", sub: "Contact method · Verify agreement", tag: "Unverified", tone: "amber" },
                { title: "IR engagement lead", sub: "Assigned on provider acceptance", tag: "Not assigned", tone: "blue" },
                { title: "Sarah Chen", sub: "Tenant requester · Security Analyst", tag: "Requester", tone: "emerald" },
              ]} />
              <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-2"><Check className="w-3 h-3" /> Contacts are tenant-scoped</div>
            </div>
          </div>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
