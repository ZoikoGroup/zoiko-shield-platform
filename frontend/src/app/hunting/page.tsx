"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Crosshair, Search, Link2, Gauge, Play, ArrowRight, Check, AlertTriangle } from "lucide-react";
import HuntingConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, EventList,
  NumberedList, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

const PATH = [
  { label: "Phishing link click", sub: "user j.wong · T1566", tone: "blue" as Tone },
  { label: "OAuth consent granted", sub: "app 'DocSync' · T1528", tone: "amber" as Tone },
  { label: "Mailbox rule created", sub: "forward to external · T1114", tone: "amber" as Tone },
  { label: "Bulk mail export", sub: "2,140 items · T1048", tone: "rose" as Tone },
];

type Finding = { id: string; title: string; confidence: "High" | "Medium" | "Low"; status: "Unreviewed" | "Confirmed" | "Dismissed" };
const FINDINGS: Finding[] = [
  { id: "F-118", title: "External forwarding rule on 2 mailboxes", confidence: "High", status: "Unreviewed" },
  { id: "F-117", title: "OAuth app with Mail.ReadWrite from new publisher", confidence: "Medium", status: "Unreviewed" },
  { id: "F-116", title: "Sign-in from residential proxy ASN", confidence: "Medium", status: "Unreviewed" },
  { id: "F-115", title: "Token replay pattern (same token, 2 countries)", confidence: "Low", status: "Unreviewed" },
  { id: "F-114", title: "Consent grant outside change window", confidence: "Medium", status: "Unreviewed" },
  { id: "F-113", title: "Unusual Graph API volume", confidence: "Low", status: "Unreviewed" },
];
const CONF_TONE: Record<Finding["confidence"], Tone> = { High: "rose", Medium: "amber", Low: "slate" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "findings", label: "Findings" },
  { id: "workbench", label: "Hunt workbench" },
  { id: "history", label: "Recent hunts" },
];

export default function ThreatHuntingPage() {
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState('mail_rule.action = "forward" AND recipient.domain NOT IN tenant.domains');
  const show = useTabFilter(tab, "overview");

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Crosshair className="w-5 h-5" />}
          title="Threat Hunting"
          subtitle="Hypothesis-driven hunts over normalized telemetry, with evidence-linked findings"
          actions={<ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><Play className="w-3.5 h-3.5" /> Start a hunt</ActionButton>}
        />
      }
      banner={<NoticeBanner tone="amber" title="Illustrative hunt" body="The OAuth mailbox-exfiltration hunt below is sample data. Real hunts and query execution run in the live hunting tab." tag="Sample data" />}
      kpis={
        <KpiGrid
          items={[
            { label: "Active hunts", value: "02", hint: "1 analyst-led · 1 scheduled", tone: "cyan", icon: <Search className="w-3.5 h-3.5" /> },
            { label: "Unreviewed findings", value: "06", hint: "Human review before escalation", tone: "amber", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
            { label: "Cases linked", value: "03", hint: "Findings promoted to cases", tone: "blue", icon: <Link2 className="w-3.5 h-3.5" /> },
            { label: "Telemetry quality", value: "Partial", hint: "EDR source missing 2 hosts", tone: "amber", icon: <Gauge className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<HuntingConsole />}
      consoleLabel="Live hunting"
      footer={<div className="flex justify-between text-[10px] text-slate-500"><span>ZoikoShield · Threat Hunting</span><span>Illustrative findings · AI suggestions require analyst review</span></div>}
    >
      {show() && (
        <Panel title="Active investigation · OAuth mailbox exfiltration" meta="HUNT-2026-019 · evidence-linked attack path">
          <ol className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {PATH.map((p, i) => (
              <li key={p.label} className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-[#1e2b44] bg-[#080c16] p-3">
                  <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-100">{p.label}</span><Pill tone={p.tone}>{i + 1}</Pill></div>
                  <div className="text-[10px] text-slate-500 mt-1">{p.sub}</div>
                </div>
                {i < PATH.length - 1 && <ArrowRight className="hidden md:block w-4 h-4 text-slate-600 shrink-0" />}
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("findings") && (
          <Panel title="AI-assisted findings" meta={`${FINDINGS.length} unreviewed`} className="xl:col-span-2">
            <DataTable
              rows={FINDINGS}
              rowKey={(f) => f.id}
              columns={[
                { key: "id", header: "ID", render: (f) => <span className="font-mono">{f.id}</span> },
                { key: "t", header: "Finding", render: (f) => <span className="text-slate-100">{f.title}</span> },
                { key: "c", header: "Confidence", render: (f) => <Pill tone={CONF_TONE[f.confidence]}>{f.confidence}</Pill> },
                { key: "s", header: "Status", render: (f) => <Pill tone="amber">{f.status}</Pill> },
              ]}
            />
            <div className="mt-3 flex justify-end"><ActionButton onClick={() => setTab(CONSOLE_TAB)}>Review findings →</ActionButton></div>
          </Panel>
        )}
        {show() && (
          <Panel title="Analyst next steps" meta="Suggested">
            <NumberedList items={[
              { title: "Confirm forwarding rules with mailbox owners", sub: "F-118 · 2 mailboxes" },
              { title: "Revoke the DocSync OAuth grant", tag: "R2", tone: "amber" },
              { title: "Promote F-118 to CASE-2026-0047", sub: "Links findings and evidence" },
              { title: "Backfill EDR telemetry for 2 missing hosts", sub: "Raises telemetry quality" },
            ]} />
            <div className="mt-3"><Link href="/response-proposals" className="text-[11px] text-cyan-300 hover:underline">Open response proposals →</Link></div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("workbench") && (
          <Panel title="Hunt workbench" meta="Query draft" className="xl:col-span-2">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1" htmlFor="hunt-query">Hunt query</label>
            <textarea id="hunt-query" value={query} onChange={(e) => setQuery(e.target.value)} rows={3} className="w-full rounded-lg border border-[#1e2b44] bg-[#080c16] p-2.5 font-mono text-xs text-slate-200 focus:border-cyan-500 outline-none" />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-slate-500">Scope: this tenant · last 7 days</span>
              <ActionButton primary disabled={!query.trim()} onClick={() => setTab(CONSOLE_TAB)}><Play className="w-3.5 h-3.5" /> Run in live hunting</ActionButton>
            </div>
          </Panel>
        )}
        {show("history") && (
          <Panel title="Recent hunts" meta="Last 14 days">
            <EventList items={[
              { title: "OAuth mailbox exfiltration", sub: "HUNT-2026-019 · 6 findings", tag: "Active", tone: "cyan" },
              { title: "Kerberoasting sweep", sub: "HUNT-2026-018 · scheduled", tag: "Active", tone: "cyan" },
              { title: "Living-off-the-land binaries", sub: "HUNT-2026-017 · 1 case", tag: "Closed", tone: "emerald" },
              { title: "Dormant admin reactivation", sub: "HUNT-2026-016 · no findings", tag: "Closed", tone: "slate" },
            ]} />
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-3"><Check className="w-3 h-3" /> Closed hunts keep their queries for re-run.</div>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
