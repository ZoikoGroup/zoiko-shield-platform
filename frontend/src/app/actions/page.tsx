"use client";

import React, { useMemo, useState } from "react";
import { Square, Lock, AlertTriangle, ListChecks, Hourglass, Check } from "lucide-react";
import ActionsConsole from "./console";
import {
  WorkspacePage, PageHeader, KpiGrid, Panel, Pill, DataTable, ActionButton, KeyValues,
  CONSOLE_TAB, type Tone,
} from "@/components/mockup/kit";

type Tier = "R0 · Read-only" | "R1 · Low" | "R2 · Elevated" | "R3 · High" | "R4 · Critical";
type Act = { id: string; source: string; action: string; tier: Tier; status: string; statusTone: Tone; target: string };

const ACTIONS: Act[] = [
  { id: "ACT-2026-0187", source: "Incident command", action: "Isolate compromised endpoint", tier: "R3 · High", status: "Approval required", statusTone: "rose", target: "WIN-WS-0142" },
  { id: "ACT-2026-0186", source: "Response proposal", action: "Revoke privileged sessions", tier: "R3 · High", status: "Awaiting signer 2", statusTone: "amber", target: "3 privileged identities" },
  { id: "ACT-2026-0185", source: "Detection rule", action: "Block malicious IP range", tier: "R2 · Elevated", status: "Frozen by policy", statusTone: "amber", target: "203.0.113.0/24" },
  { id: "ACT-2026-0184", source: "Hunt workbench", action: "Enrich suspicious domain", tier: "R0 · Read-only", status: "Complete", statusTone: "emerald", target: "login-acme.example" },
  { id: "ACT-2026-0183", source: "Case workspace", action: "Collect process metadata", tier: "R1 · Low", status: "Safe to simulate", statusTone: "blue", target: "ep-win-042" },
  { id: "ACT-2026-0182", source: "Manual request", action: "Change firewall policy", tier: "R4 · Critical", status: "Rejected", statusTone: "rose", target: "edge-fw-01" },
];
const TIER_TONE: Record<Tier, Tone> = { "R0 · Read-only": "emerald", "R1 · Low": "blue", "R2 · Elevated": "amber", "R3 · High": "rose", "R4 · Critical": "rose" };
const HIGH = (t: Tier) => t === "R3 · High" || t === "R4 · Critical";

const FILTERS = [
  { id: "all", label: "All requests" },
  { id: "high", label: "R3–R4 high risk" },
  { id: "pending", label: "Pending authorization" },
  { id: "frozen", label: "Frozen" },
];
const DETAIL_TABS = ["Action overview", "Policy & risk", "Approval evidence", "Rollback plan"];

export default function SoarActionsFreezePage() {
  const [tab, setTab] = useState("overview");
  const [filter, setFilter] = useState("all");
  const [detailTab, setDetailTab] = useState(DETAIL_TABS[0]);
  const [selectedId, setSelectedId] = useState(ACTIONS[0].id);
  // Global freeze is read here as the demo posture; lifting it is a privileged,
  // audited workflow that lives in the live console, not a toggle on this view.
  const freezeActive = true;

  const rows = useMemo(
    () =>
      ACTIONS.filter((a) =>
        filter === "all" ? true : filter === "high" ? HIGH(a.tier) : filter === "pending" ? /approval|signer/i.test(a.status) : /frozen/i.test(a.status),
      ),
    [filter],
  );
  const sel = ACTIONS.find((a) => a.id === selectedId) ?? ACTIONS[0];
  const blocked = freezeActive && HIGH(sel.tier);

  return (
    <WorkspacePage
      header={
        <PageHeader
          eyebrow="Workspace 10 · Secure response control"
          title="SOAR Actions & Freeze"
          subtitle="Monitor response execution, enforce risk-tier controls, and verify dual-custody authorization."
          actions={
            <>
              {freezeActive && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 max-w-md">
                  <Square className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <div><div className="text-[11px] font-bold text-amber-200 uppercase">Global execution freeze · active status</div><div className="text-[10px] text-slate-400">High-risk changes are blocked; dual-custody authorization enforced.</div></div>
                </div>
              )}
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}>View Policy</ActionButton>
            </>
          }
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Action requests", value: "42", hint: "within active operational window", tone: "blue", icon: <ListChecks className="w-3.5 h-3.5" /> },
            { label: "Pending authorization", value: "3", hint: "2 require independent signers", tone: "amber", icon: <Hourglass className="w-3.5 h-3.5" /> },
            { label: "Frozen / blocked", value: "2", hint: "execution not permitted", tone: "rose", icon: <Square className="w-3.5 h-3.5" /> },
            { label: "Completed actions", value: "21", hint: "verified automated containment", tone: "emerald", icon: <Check className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={[{ id: "overview", label: "Overview" }]}
      activeTab={tab}
      onTabChange={setTab}
      console={<ActionsConsole />}
      consoleLabel="Live SOAR console"
      footer={<div className="flex justify-between text-[10px] text-slate-500"><span>ZOIKOSHIELD · SOAR ACTIONS &amp; FREEZE</span><span className="text-emerald-400 font-semibold">Cryptographic dual-custody authorization active · Immutable audit ledger</span></div>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Governed action queue" meta="View audit history →">
          <div className="text-[11px] text-slate-500 -mt-1 mb-3">Risk tier, initiator, authorization and execution status</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold ${filter === f.id ? "bg-sky-600 border-sky-500 text-white" : "border-line-strong text-slate-300"}`}>{f.label}{f.id === "all" ? " · 42" : ""}</button>
            ))}
          </div>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            selectedKey={sel.id}
            onSelect={(r) => setSelectedId(r.id)}
            columns={[
              { key: "id", header: "Action ID / source", render: (r) => <div><div className="font-mono font-semibold text-slate-100">{r.id}</div><div className="text-[10px] text-slate-500">{r.source}</div></div> },
              { key: "a", header: "Requested action", render: (r) => r.action },
              { key: "t", header: "Risk tier", render: (r) => <Pill tone={TIER_TONE[r.tier]}>{r.tier}</Pill> },
              { key: "s", header: "Execution status", render: (r) => <Pill tone={r.statusTone}>{r.status}</Pill> },
            ]}
          />
          <div className="text-[11px] text-slate-500 mt-3">Selected: {sel.id} · Filter: {filter} · All actions are synthetic examples, not live operations.</div>
        </Panel>

        <Panel title={sel.action} meta={`${sel.tier.split(" ·")[0]} · ${sel.tier.split("· ")[1].toUpperCase()} RISK${blocked ? " · BLOCKED" : ""}`} metaTone={TIER_TONE[sel.tier]}>
          <div className="text-[11px] text-slate-500 -mt-1 mb-3">{sel.id} · Linked to CASE-2026-1043</div>
          <div className="flex flex-wrap gap-1.5 mb-3" role="tablist">
            {DETAIL_TABS.map((d) => (
              <button key={d} type="button" role="tab" aria-selected={detailTab === d} onClick={() => setDetailTab(d)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold ${detailTab === d ? "bg-sky-600 text-white" : "text-slate-300 hover:text-white"}`}>{d}</button>
            ))}
          </div>
          {detailTab === "Action overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-line p-3">
                <div className="text-xs font-bold text-slate-200 mb-2">Request context</div>
                <KeyValues cols={1} items={[
                  { k: "Origin", v: sel.source },
                  { k: "Tenant", v: "Acme Corporation (DEMO)" },
                  { k: "Target", v: sel.target },
                  { k: "Current state", v: sel.status === "Complete" ? "Executed (simulation)" : "Not executed", tone: sel.status === "Complete" ? "emerald" : "rose" },
                ]} />
              </div>
              <div className="rounded-lg border border-line p-3">
                <div className="text-xs font-bold text-slate-200 mb-2">Scope &amp; reversibility</div>
                <ul className="space-y-1.5 text-[11px] text-slate-300">
                  {["One target; restricted scope", "Preserve forensic evidence", "Pre-execution impact simulation", "Single-use rollback authorization"].map((s) => <li key={s} className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" />{s}</li>)}
                </ul>
              </div>
            </div>
          )}
          {detailTab === "Policy & risk" && (
            <KeyValues items={[{ k: "Risk tier", v: sel.tier }, { k: "Policy", v: HIGH(sel.tier) ? "Two independent signers + passkey" : "Single analyst approval" }, { k: "Freeze applies", v: HIGH(sel.tier) ? "Yes" : "No", tone: HIGH(sel.tier) ? "amber" : "emerald" }, { k: "Blast radius", v: "Single target (simulated)" }]} />
          )}
          {detailTab === "Approval evidence" && <p className="text-xs text-slate-400">No approval signatures are recorded for {sel.id}. Approval evidence is read from the live authorization chain.</p>}
          {detailTab === "Rollback plan" && <p className="text-xs text-slate-400">A rollback plan is required before execution: restore network policy, re-enable sessions, and record a reversal receipt bound to the original action.</p>}
          {blocked && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-[11px] text-rose-200">
              <Lock className="w-4 h-4 shrink-0" /> <span><b>Execution denied.</b> Global freeze is active and independent, time-limited R3 approvals have not been completed. Copilot recommendations cannot execute changes.</span>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Execution preview & safeguards" meta="Simulated steps only · No system changes">
          <ul className="space-y-2">
            {[
              ["Validate scope and asset identity", "Preview complete", "emerald"],
              ["Calculate impact and blast radius", "Preview complete", "emerald"],
              ["Verify independent WebAuthn signatures", "Blocked · quorum missing", "amber"],
              ["Release global execution freeze", "Blocked · elevated access", "amber"],
              [`${sel.action.split(" ")[0]} target, record result & receipt`, "Not executed", "amber"],
              ["Verify outcome and issue rollback receipt", "Not executed", "amber"],
            ].map(([l, s, t]) => (
              <li key={l} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-xs">
                <span className="flex items-center gap-2 text-slate-200">{t === "emerald" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}{l}</span>
                <span className={`text-[11px] ${t === "emerald" ? "text-emerald-300" : "text-amber-300"}`}>{s}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Independent approval & freeze controls" meta="Fail-closed · Auditable">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs font-bold text-slate-200 mb-3">Authorization chain</div>
              <ol className="space-y-3 text-[11px]">
                <li><div className="font-semibold text-emerald-300">✓ Action proposed</div><div className="text-slate-500">Request recorded · 14 Oct, 13:42</div></li>
                <li><div className="font-semibold text-amber-300">1 · Signer 1 · Pending</div><div className="text-slate-500">Authorized incident responder · passkey verification required</div></li>
                <li><div className="font-semibold text-amber-300">2 · Signer 2 · Pending</div><div className="text-slate-500">Independent authorized reviewer · cannot be the initiator or signer 1</div></li>
                <li><div className="font-semibold text-sky-300">Execution gate · Locked</div><div className="text-slate-500">Freeze + quorum policies enforced</div></li>
              </ol>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs font-bold text-slate-200 mb-3">Emergency freeze</div>
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 mb-3">
                <div className="text-[11px] font-bold text-amber-200">● GLOBAL FREEZE IS ACTIVE</div>
                <div className="text-[10px] text-slate-400">All prohibited execution requests remain blocked. Authorized unfreeze requires a privileged, audited workflow.</div>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between"><span className="text-slate-400">Action signing</span><span className="text-amber-300 font-semibold">Unavailable</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Proof &amp; audit</span><span className="text-slate-200">Log preview only</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Rollback</span><span className="text-slate-200">Plan required</span></div>
              </div>
              <button type="button" disabled className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-line-strong bg-surface text-xs text-slate-500 cursor-not-allowed"><Lock className="w-3.5 h-3.5" /> Execute action — DISABLED</button>
            </div>
          </div>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
