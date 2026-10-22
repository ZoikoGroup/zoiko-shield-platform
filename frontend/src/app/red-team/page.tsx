"use client";

import React, { useState } from "react";
import { Crosshair, Clock, History, Play, Lock, Check, AlertTriangle, Circle } from "lucide-react";
import RedTeamConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, ProgressRow, CheckRow,
  ActionButton, CONSOLE_TAB, type Tone,
} from "@/components/mockup/kit";

type Scenario = { id: string; title: string; sub: string; steps: number; mins: number; state: "SELECTED" | "READY" | "REVIEW" };
const SCENARIOS: Scenario[] = [
  { id: "ERB-01", title: "Credential stuffing → privileged access", sub: "Identity · Failed logins → anomaly → case → proposed containment", steps: 6, mins: 8, state: "SELECTED" },
  { id: "SIM-02", title: "Suspicious PowerShell execution", sub: "Endpoint · T1059 · Process chain and detection correlation", steps: 5, mins: 6, state: "READY" },
  { id: "SIM-03", title: "Lateral movement simulation", sub: "Identity + network · T1021 · Evidence correlation", steps: 7, mins: 12, state: "READY" },
  { id: "SIM-04", title: "Cloud data exfiltration", sub: "Cloud · T1041 · Detection, triage and evidence seal", steps: 8, mins: 14, state: "REVIEW" },
];
const STATE_TONE: Record<Scenario["state"], Tone> = { SELECTED: "blue", READY: "emerald", REVIEW: "amber" };

type ReplayStep = { label: string; result: string; state: "pass" | "partial" | "blocked" | "pending" };
const REPLAY: ReplayStep[] = [
  { label: "Validate simulation boundary", result: "Passed", state: "pass" },
  { label: "Inject signed synthetic telemetry", result: "Passed", state: "pass" },
  { label: "Evaluate detection rules", result: "4 / 5 assertions", state: "pass" },
  { label: "Review simulated case and findings", result: "Awaiting analyst", state: "partial" },
  { label: "Propose controlled response", result: "Execution blocked", state: "blocked" },
  { label: "Package evidence and run report", result: "Not started", state: "pending" },
];

const TIMELINE = [
  { t: "00:00", label: "Telemetry injected", ok: true },
  { t: "00:41", label: "Rule matched", ok: true },
  { t: "01:12", label: "Alert created", ok: true },
  { t: "03:04", label: "Case correlated", ok: true },
  { t: "05:26", label: "Gap flagged", ok: false },
];

export default function SimulationTrainingPage() {
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState("ERB-01");
  const sel = SCENARIOS.find((s) => s.id === selected) ?? SCENARIOS[0];

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Crosshair className="w-5 h-5" />}
          title="Simulation & Training"
          subtitle="Replay synthetic attacks, validate detections and rehearse governed response workflows"
          actions={
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line-strong text-xs text-slate-300"><Clock className="w-3.5 h-3.5" /> Last 7 days</span>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}><History className="w-3.5 h-3.5" /> Replay history</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><Play className="w-3.5 h-3.5" /> Create isolated replay</ActionButton>
            </>
          }
        />
      }
      banner={<NoticeBanner tone="cyan" title="Adversary Emulation & Zero-Downtime Validation" body="Flagged attack replay telemetry strictly partitioned via cryptographic tenant tags. Approval gates and multi-party quorum remain active." tag="Emulation Engine Active" />}
      kpis={
        <KpiGrid
          items={[
            { label: "Replay runs", value: <>18 <span className="text-base text-slate-500">/7 days</span></>, hint: "14 completed · 4 awaiting review", tone: "blue" },
            { label: "Detection assertions passed", value: <>42 <span className="text-base text-slate-500">/ 48</span></>, hint: "Scenario-defined validations only", tone: "cyan" },
            { label: "Coverage gaps identified", value: <>6 <span className="text-base text-slate-500">open</span></>, hint: "Investigate failed assertions", tone: "amber" },
            { label: "Awaiting analyst review", value: <>3 <span className="text-base text-slate-500">replays</span></>, hint: "No automatic production changes", tone: "purple" },
          ]}
        />
      }
      tabs={[{ id: "overview", label: "Overview" }]}
      activeTab={tab}
      onTabChange={setTab}
      console={<RedTeamConsole />}
      consoleLabel="Live simulation & replay engine"
      footer={<div className="flex justify-between text-[10px] text-slate-500"><span>ZoikoShield · Simulation &amp; Adversary Emulation Fabric</span><span>Sovereign Cell Telemetry · Zero Production Impact Verified</span></div>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Scenario library & replay queue" meta="View all scenarios →">
          <ul className="space-y-2">
            {SCENARIOS.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setSelected(s.id)} className={`w-full text-left rounded-lg border p-3 ${s.id === sel.id ? "border-sky-500 bg-sky-950/40" : "border-line hover:border-slate-600"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-bold text-slate-100">{s.id} · {s.title}</div>
                    <Pill tone={s.id === sel.id ? "blue" : STATE_TONE[s.state]}>{s.id === sel.id ? "SELECTED" : s.state === "SELECTED" ? "READY" : s.state}</Pill>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>{s.sub}</span><span className="shrink-0 ml-2">{s.steps} steps · {s.mins} min</span></div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={`Selected replay · ${sel.id}`} meta="Run ID SIM-DEMO-1042">
          <div className="flex items-center gap-2 mb-1"><span className="text-sm font-bold text-slate-100">{sel.title}</span><Pill tone="blue">Dry-run</Pill></div>
          <p className="text-[11px] text-slate-400 mb-3">Follow an auditable attack narrative without changing customer endpoints, accounts, or policies.</p>
          <ul className="space-y-2">
            {REPLAY.map((r, i) => (
              <li key={r.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 text-slate-200">
                  {r.state === "pass" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : r.state === "partial" ? <span className="w-4 h-4 rounded-full border border-amber-400 text-[9px] text-amber-300 flex items-center justify-center">{i + 1}</span> : r.state === "blocked" ? <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> : <Circle className="w-3.5 h-3.5 text-slate-500" />}
                  {r.label}
                </span>
                <span className="text-[11px] text-slate-400">{r.result}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Safety & approvals" meta="Policy enforced">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-200 mb-3"><Lock className="w-3.5 h-3.5" /> Production execution blocked</div>
          <CheckRow label="Replay environment" sub="Isolated synthetic tenant" status="Verified" tone="emerald" />
          <CheckRow label="Action risk" sub="Proposed endpoint isolation" status="R3" tone="amber" />
          <CheckRow label="Human sign-off" sub="Independent 2-party quorum" status="Not granted" tone="amber" />
          <CheckRow label="AI output" sub="Advice and citations only" status="Read-only" tone="blue" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Replay event timeline" meta="6 synthetic events · 8-minute window">
          <ol className="flex items-start justify-between">
            {TIMELINE.map((e) => (
              <li key={e.t} className="flex flex-col items-center text-center flex-1">
                <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${e.ok ? "border-sky-400 text-sky-300" : "border-amber-400 text-amber-300"}`}>{e.ok ? <Check className="w-3.5 h-3.5" /> : "!"}</span>
                <span className="text-[11px] font-bold text-slate-200 mt-1">{e.t}</span>
                <span className="text-[10px] text-slate-500">{e.label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 space-y-1.5 text-[11px]">
            <div className="flex justify-between rounded-md bg-surface px-2.5 py-1.5"><span className="text-slate-200"><span className="text-emerald-400">●</span> OCSF event normalized · synthetic=true</span><span className="font-mono text-slate-500">00:00</span></div>
            <div className="flex justify-between rounded-md bg-surface px-2.5 py-1.5"><span className="text-slate-200"><span className="text-amber-400">●</span> One rule assertion missed · analyst review required</span><span className="font-mono text-slate-500">05:26</span></div>
          </div>
        </Panel>
        <Panel title="Detection validation" meta="MITRE ATT&CK mapped">
          <p className="text-[11px] text-slate-500 -mt-1 mb-3">Pass rate by expected detection assertion in this scenario</p>
          <div className="space-y-3">
            <ProgressRow label="Initial Access" value={2} max={2} tone="blue" />
            <ProgressRow label="Credential Access" value={1} max={1} tone="blue" />
            <ProgressRow label="Lateral Movement" value={0} max={1} tone="rose" />
            <ProgressRow label="Discovery" value={1} max={1} tone="blue" />
          </div>
          <div className="flex justify-between text-[11px] mt-4 pt-3 border-t border-line"><span className="text-slate-500">Expected: 5 · Passed: 4</span><span className="text-amber-300 font-semibold">1 coverage gap →</span></div>
        </Panel>
        <Panel title="Evidence & outcomes" meta="Review package →">
          <CheckRow label="Synthetic event receipt" status="Captured" tone="emerald" />
          <CheckRow label="Detection comparison" status="1 gap" tone="amber" />
          <CheckRow label="Case-link audit trail" status="Recorded" tone="emerald" />
          <CheckRow label="Merkle proof package" status="Not generated" tone="blue" />
          <CheckRow label="Analyst sign-off" status="Pending" tone="amber" />
        </Panel>
      </div>
    </WorkspacePage>
  );
}
