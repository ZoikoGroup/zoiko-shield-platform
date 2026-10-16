"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Bot, MessageSquare, FileText, Search, Crosshair, Lightbulb, ClipboardList, ShieldCheck, Lock, Quote } from "lucide-react";
import CopilotConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, Panel, Pill, CheckRow, KeyValues, ActionButton,
  CONSOLE_TAB, type Tone,
} from "@/components/mockup/kit";

const MODES = [
  { id: "ask", label: "Ask", icon: MessageSquare, hint: "Question answering over tenant evidence" },
  { id: "summarize", label: "Summarize", icon: FileText, hint: "Case and incident summaries" },
  { id: "investigate", label: "Investigate", icon: Search, hint: "Guided investigation with citations" },
  { id: "hunt", label: "Threat Hunt", icon: Crosshair, hint: "Hypothesis and query drafting" },
  { id: "explain", label: "Explain Detection", icon: Lightbulb, hint: "Why a rule fired" },
  { id: "propose", label: "Draft Proposal", icon: ClipboardList, hint: "Response proposal draft for human review" },
];

const CONVERSATION: { who: "analyst" | "copilot"; text: string; cites?: string[] }[] = [
  { who: "analyst", text: "Why did svc-backup-admin trigger ALT-2026-0112, and is this likely malicious?" },
  { who: "copilot", text: "The account authenticated from an ASN it has not used in the last 90 days, then enumerated 3 finance file shares outside its scheduled backup window. Confidence is medium: the source network matches a known VPN provider, but no credential-dumping telemetry was observed.", cites: ["E1", "E2", "E3"] },
  { who: "analyst", text: "What would you recommend as a first containment step?" },
  { who: "copilot", text: "Revoke active sessions for svc-backup-admin (R2) and rotate its credential. Endpoint isolation of FIN-WS-0412 (R3) is not supported by current evidence. I have drafted the R2 proposal below; it requires human approval and is not executed.", cites: ["E2", "E4"] },
];

const EVIDENCE: { id: string; title: string; source: string; tone: Tone }[] = [
  { id: "E1", title: "Sign-in from new ASN", source: "Identity provider · 11:38", tone: "blue" },
  { id: "E2", title: "Share enumeration burst", source: "File server audit · 11:40", tone: "blue" },
  { id: "E3", title: "Backup schedule baseline", source: "Asset context · 90 days", tone: "slate" },
  { id: "E4", title: "No LSASS access events", source: "EDR telemetry · 11:30–12:30", tone: "slate" },
];

export default function CopilotPage() {
  const [tab, setTab] = useState("workspace");
  const [mode, setMode] = useState("investigate");

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Bot className="w-5 h-5" />}
          title="AI Security Copilot"
          subtitle="Evidence-grounded assistance. Advice and citations only: every action needs a human decision"
          actions={<ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><MessageSquare className="w-3.5 h-3.5" /> Ask the live copilot</ActionButton>}
        />
      }
      banner={<NoticeBanner tone="amber" title="Sample conversation" body="The investigation below is an illustrative transcript. Real questions, model responses and feedback go through the live copilot tab." tag="Sample data" />}
      tabs={[{ id: "workspace", label: "Investigation workspace" }]}
      activeTab={tab}
      onTabChange={setTab}
      console={<CopilotConsole />}
      consoleLabel="Live copilot"
      footer={<div className="flex justify-between text-[10px] text-slate-500"><span>ZoikoShield · AI Security Copilot</span><span>AI output is advisory · no autonomous execution</span></div>}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = m.id === mode;
          return (
            <button key={m.id} type="button" aria-pressed={active} onClick={() => setMode(m.id)} className={`text-left rounded-lg border p-3 ${active ? "border-cyan-500 bg-cyan-950/30" : "border-[#162238] bg-[#0c111e] hover:border-slate-600"}`}>
              <div className={`flex items-center gap-1.5 text-xs font-bold ${active ? "text-cyan-200" : "text-slate-200"}`}><Icon className="w-3.5 h-3.5" /> {m.label}</div>
              <div className="text-[10px] text-slate-500 mt-1">{m.hint}</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Panel title="Investigation context" meta="Bound to case">
          <KeyValues cols={1} items={[
            { k: "Case", v: "CASE-2026-0047" },
            { k: "Alert", v: "ALT-2026-0112" },
            { k: "Entity", v: "svc-backup-admin" },
            { k: "Data scope", v: "This tenant only", tone: "emerald" },
            { k: "Time window", v: "11:30 – 12:30 UTC" },
          ]} />
          <div className="mt-3"><Link href="/cases" className="text-[11px] text-cyan-300 hover:underline">Open case workspace →</Link></div>
        </Panel>

        <Panel title="Investigation conversation" meta={`Mode · ${MODES.find((m) => m.id === mode)?.label}`} className="xl:col-span-2">
          <ul className="space-y-3">
            {CONVERSATION.map((c, i) => (
              <li key={i} className={`rounded-lg border p-3 text-xs ${c.who === "analyst" ? "border-[#1e2b44] bg-[#080c16] text-slate-300" : "border-cyan-900/60 bg-cyan-950/20 text-slate-200"}`}>
                <div className="text-[10px] font-bold uppercase mb-1 text-slate-500">{c.who === "analyst" ? "Analyst" : "Copilot"}</div>
                {c.text}
                {c.cites && <div className="flex gap-1 mt-2">{c.cites.map((e) => <Pill key={e} tone="blue">{e}</Pill>)}</div>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end"><ActionButton onClick={() => setTab(CONSOLE_TAB)}>Continue in live copilot →</ActionButton></div>
        </Panel>

        <Panel title="AI safety & governance" meta="Enforced">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-200 mb-3"><ShieldCheck className="w-4 h-4" /> Advisory only</div>
          <CheckRow label="Tenant data isolation" status="Enforced" tone="emerald" />
          <CheckRow label="Citations required" status="On" tone="emerald" />
          <CheckRow label="Autonomous actions" status="Disabled" tone="amber" />
          <CheckRow label="Prompt & response logging" status="Audited" tone="blue" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Suggested response" meta="Draft · not executed">
          <div className="flex flex-wrap items-center gap-2 mb-2"><span className="text-xs font-bold text-slate-100">Revoke sessions for svc-backup-admin</span><Pill tone="amber">R2</Pill></div>
          <p className="text-[11px] text-slate-400 mb-3">Rotate credential after revocation. Isolation of FIN-WS-0412 not recommended on current evidence.</p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3"><Lock className="w-3 h-3" /> Requires analyst approval with step-up authentication.</div>
          <Link href="/response-proposals" className="text-[11px] text-cyan-300 hover:underline">Open response proposals →</Link>
        </Panel>
        <Panel title="Cited evidence & provenance" meta={`${EVIDENCE.length} sources`}>
          <ul className="space-y-2">
            {EVIDENCE.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <Pill tone={e.tone}>{e.id}</Pill>
                <span><span className="block text-slate-200">{e.title}</span><span className="block text-[10px] text-slate-500">{e.source}</span></span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Decision review record" meta="Written to audit log">
          <KeyValues cols={1} items={[
            { k: "Model output", v: "Recommendation + 4 citations" },
            { k: "Analyst decision", v: "Pending", tone: "amber" },
            { k: "Reviewer", v: "Not yet assigned" },
            { k: "Record", v: "Created when the analyst decides" },
          ]} />
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-3"><Quote className="w-3 h-3" /> Accept / reject feedback is captured in the live copilot.</div>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
