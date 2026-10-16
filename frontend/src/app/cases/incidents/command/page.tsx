"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Siren, Clock, Users, ShieldCheck, FileCheck2, Lock, Check, AlertTriangle, Radio } from "lucide-react";
import IncidentCommandConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, EventList, CheckRow, KeyValues,
  StepFlow, ActionButton, CONSOLE_TAB, useTabFilter,
} from "@/components/mockup/kit";

const TABS = [
  { id: "overview", label: "Command overview" },
  { id: "timeline", label: "Timeline" },
  { id: "response", label: "Response & authorization" },
  { id: "evidence", label: "Evidence & custody" },
  { id: "comms", label: "Communications" },
];

const ENTITIES = [
  { name: "svc-backup-admin", kind: "Identity", state: "Session revoke proposed", tone: "amber" as const },
  { name: "FIN-WS-0412", kind: "Endpoint", state: "Isolation awaiting quorum", tone: "amber" as const },
  { name: "FIN-WS-0419", kind: "Endpoint", state: "Monitoring", tone: "blue" as const },
  { name: "fs-finance-02", kind: "File server", state: "Read-only snapshot taken", tone: "emerald" as const },
  { name: "vpn-gw-eu-1", kind: "Network", state: "Under review", tone: "blue" as const },
  { name: "m365-tenant", kind: "SaaS", state: "Audit log export queued", tone: "slate" as const },
];

export default function IncidentCommandPage() {
  const [tab, setTab] = useState("overview");
  const show = useTabFilter(tab, "overview");

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Siren className="w-5 h-5" />}
          eyebrow="Cases · Incidents"
          title="Incident Command"
          subtitle="Coordinate a major incident: roles, timeline, governed response and evidence custody"
          routeTag="/cases/incidents/command"
          actions={
            <>
              <Link href="/cases" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1e2b44] text-xs text-slate-300 hover:border-slate-500">Back to cases</Link>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><Radio className="w-3.5 h-3.5" /> Open live command</ActionButton>
            </>
          }
        />
      }
      banner={<NoticeBanner tone="amber" title="Illustrative incident" body="INC-2026-0031 and its entities are sample data. Live incidents and the declare / hand-off workflow are in the live command tab." tag="Sample data" />}
      kpis={
        <KpiGrid
          items={[
            { label: "Severity", value: "P1 · Critical", hint: "Declared by incident commander", tone: "rose", icon: <Siren className="w-3.5 h-3.5" /> },
            { label: "Elapsed", value: "02h 37m", hint: "Since declaration", tone: "amber", icon: <Clock className="w-3.5 h-3.5" /> },
            { label: "Affected entities", value: "06", hint: "2 with proposed containment", tone: "blue", icon: <Users className="w-3.5 h-3.5" /> },
            { label: "Response status", value: "Awaiting review", hint: "R3 action pending 2nd approver", tone: "amber", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
            { label: "Evidence", value: <>18 <span className="text-base text-slate-500">/ 20</span></>, hint: "Items sealed in custody chain", tone: "emerald", icon: <FileCheck2 className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<IncidentCommandConsole />}
      consoleLabel="Live incident command"
      footer={<div className="flex justify-between text-[10px] text-slate-500"><span>ZoikoShield · Incident Command</span><span>Illustrative incident · no live containment actions</span></div>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show() && (
          <Panel title="Active major incident" meta="INC-2026-0031" className="xl:col-span-2">
            <div className="flex flex-wrap items-center gap-2 mb-2"><span className="text-sm font-bold text-slate-100">Privileged credential misuse — finance segment</span><Pill tone="rose">P1</Pill><Pill tone="amber">Containment phase</Pill></div>
            <p className="text-[11px] text-slate-400 mb-3">A backup service account authenticated from an unusual network and accessed finance file shares outside its normal schedule.</p>
            <StepFlow steps={[
              { label: "Detect", sub: "ALT-2026-0112", state: "done" },
              { label: "Triage", sub: "Case linked", state: "done" },
              { label: "Contain", sub: "Awaiting quorum", state: "active" },
              { label: "Eradicate", state: "pending" },
              { label: "Recover", state: "pending" },
              { label: "Review", state: "pending" },
            ]} />
          </Panel>
        )}
        {show("response") && (
          <Panel title="Operational control gates" meta="Policy enforced">
            <CheckRow label="Tenant scope bound" sub="All actions limited to tenant" status="Enforced" tone="emerald" />
            <CheckRow label="Step-up authentication" sub="Passkey for R2+ actions" status="Required" tone="blue" />
            <CheckRow label="Dual approval (R3)" sub="1 of 2 approvals received" status="Pending" tone="amber" />
            <CheckRow label="Kill switch" sub="Global response halt" status="Armed" tone="emerald" />
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("timeline") && (
          <Panel title="Incident timeline" meta="Most recent first" className="xl:col-span-2">
            <EventList items={[
              { time: "13:19", title: "Endpoint isolation proposed for FIN-WS-0412", sub: "Proposal RP-0442 · R3 · first approval recorded", tag: "Awaiting 2nd", tone: "amber" },
              { time: "12:58", title: "Read-only snapshot of fs-finance-02", sub: "Evidence item EV-0018 sealed", tag: "Sealed", tone: "emerald" },
              { time: "12:31", title: "Session revoke proposed for svc-backup-admin", sub: "Proposal RP-0441 · R2 · step-up required", tag: "Review", tone: "amber" },
              { time: "11:47", title: "Incident declared P1 by commander", sub: "Bridge opened · roles assigned", tag: "Declared", tone: "rose" },
              { time: "11:42", title: "Alert ALT-2026-0112 correlated to case", sub: "CASE-2026-0047", tag: "Linked", tone: "blue" },
            ]} />
          </Panel>
        )}
        {show() && (
          <Panel title="Command roles & accountability" meta="Named owners">
            <KeyValues cols={1} items={[
              { k: "Incident commander", v: "S. Chen" },
              { k: "Technical lead", v: "P. Nair" },
              { k: "Response approver (1)", v: "J. Diaz · approved", tone: "emerald" },
              { k: "Response approver (2)", v: "Unassigned", tone: "amber" },
              { k: "Communications lead", v: "M. Tan" },
              { k: "Scribe", v: "Auto-recorded to ledger" },
            ]} />
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("response") && (
          <Panel title="Response authorization" meta="R3 · dual custody">
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 mb-3">
              <div className="text-[10px] font-bold uppercase text-amber-300">Approval quorum</div>
              <div className="text-2xl font-bold text-slate-100 mt-1">1 <span className="text-sm text-slate-500">/ 2</span></div>
              <div className="text-[10px] text-slate-400">Isolation of FIN-WS-0412 stays blocked until an independent second approver signs with a passkey.</div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3"><Lock className="w-3 h-3" /> The requester cannot approve their own proposal.</div>
            <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>Review in live command →</ActionButton>
          </Panel>
        )}
        {show() && (
          <Panel title="Affected entities" meta={`${ENTITIES.length} entities`}>
            <ul className="space-y-2">
              {ENTITIES.map((e) => (
                <li key={e.name} className="flex items-center justify-between gap-2 text-xs">
                  <span><span className="font-mono text-slate-200">{e.name}</span> <span className="text-[10px] text-slate-500">{e.kind}</span></span>
                  <Pill tone={e.tone}>{e.state}</Pill>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {show("evidence") && (
          <Panel title="Evidence integrity & custody" meta="Hash-chained">
            <CheckRow label="Items sealed" sub="18 of 20 items" status="In progress" tone="amber" />
            <CheckRow label="Chain of custody" sub="Every transfer recorded" status="Intact" tone="emerald" />
            <CheckRow label="Ledger anchoring" sub="Merkle root per batch" status="Pending batch" tone="blue" />
            <div className="mt-3"><Link href="/ledger" className="text-[11px] text-cyan-300 hover:underline">Open evidence ledger →</Link></div>
          </Panel>
        )}
      </div>

      {show("comms") && (
        <Panel title="Communications & next shift" meta="Hand-off at 18:00">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EventList items={[
              { time: "13:00", title: "Executive update #2 sent", sub: "CISO, CFO · status and next decision point", tone: "emerald", tag: "Sent" },
              { time: "12:00", title: "Executive update #1 sent", sub: "Incident declared, scope under assessment", tone: "emerald", tag: "Sent" },
              { time: "Pending", title: "Regulatory notification assessment", sub: "Legal review of reportability window", tone: "amber", tag: "Open" },
            ]} />
            <ul className="space-y-2 text-xs">
              {[
                { done: true, text: "Open items documented in case" },
                { done: true, text: "Evidence custody list current" },
                { done: false, text: "Second approver assigned for RP-0442" },
                { done: false, text: "Incoming commander briefed" },
              ].map((i) => (
                <li key={i.text} className="flex items-center gap-2 text-slate-300">
                  {i.done ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  {i.text}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}
    </WorkspacePage>
  );
}
