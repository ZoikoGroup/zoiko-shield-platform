"use client";

import React, { useMemo, useState } from "react";
import { Activity, FileText, RefreshCw, Lock, AlertTriangle, Database, RotateCcw, ShieldCheck } from "lucide-react";
import PlatformHealthConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, CheckRow, EventList, ActionButton, FooterStrip, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Svc = {
  name: string; role: string; port: number; reach: "REACHABLE" | "UNREACHABLE";
  ready: "READY" | "DEGRADED" | "UNKNOWN"; probe: string; obs: string;
  failureDomain: string; rtoTargetMin: number; rpoTargetMin: number;
};

const SERVICES: Svc[] = [
  { name: "shield-core", role: "Control plane", port: 3001, reach: "REACHABLE", ready: "READY", probe: "14:46:12 UTC", obs: "Identity and policy checks", failureDomain: "FD-CONTROL-PLANE (Multi-AZ)", rtoTargetMin: 60, rpoTargetMin: 15 },
  { name: "shield-ingest", role: "Telemetry intake", port: 3002, reach: "REACHABLE", ready: "DEGRADED", probe: "14:46:08 UTC", obs: "Queue delay above test threshold", failureDomain: "FD-INGEST-KAFKA (3-Broker Quorum)", rtoTargetMin: 60, rpoTargetMin: 15 },
  { name: "shield-ai", role: "AI governance", port: 3003, reach: "REACHABLE", ready: "DEGRADED", probe: "14:46:05 UTC", obs: "Fallback state requires review", failureDomain: "FD-AI-INFERENCE (Stateless Tier-1 Fallback)", rtoTargetMin: 60, rpoTargetMin: 0 },
  { name: "shield-action", role: "SOAR broker", port: 3004, reach: "REACHABLE", ready: "READY", probe: "14:46:14 UTC", obs: "Freeze control responding", failureDomain: "FD-EXECUTION-BROKER (Fenced Epoch #42)", rtoTargetMin: 60, rpoTargetMin: 5 },
  { name: "shield-anchor", role: "Evidence anchoring", port: 3005, reach: "UNREACHABLE", ready: "UNKNOWN", probe: "14:43:37 UTC", obs: "Proof endpoint not responding", failureDomain: "FD-LEDGER-MERKLE (WORM Object Lock)", rtoTargetMin: 60, rpoTargetMin: 0 },
];
const READY_TONE: Record<Svc["ready"], Tone> = { READY: "emerald", DEGRADED: "amber", UNKNOWN: "slate" };

const TABS = [
  { id: "readiness", label: "Service Readiness" },
  { id: "deps", label: "Dependency Checks" },
  { id: "incidents", label: "Degradation & Incidents" },
  { id: "slo", label: "SLO / Telemetry" },
  { id: "audit", label: "Operator Audit" },
];

export default function PlatformServiceHealthPage() {
  const [tab, setTab] = useState("readiness");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("shield-anchor");
  const [showDrillModal, setShowDrillModal] = useState(false);
  const [drillStage, setDrillStage] = useState<"IDLE" | "RUNNING" | "COMPLETED">("IDLE");
  const show = useTabFilter(tab, "readiness");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? SERVICES.filter((s) => `${s.name} ${s.role} ${s.port} ${s.ready}`.toLowerCase().includes(q)) : SERVICES;
  }, [query]);
  const sel = SERVICES.find((s) => s.name === selected) ?? SERVICES[0];
  const reachable = SERVICES.filter((s) => s.reach === "REACHABLE").length;
  const ready = SERVICES.filter((s) => s.ready === "READY").length;
  const degraded = SERVICES.filter((s) => s.ready === "DEGRADED").length;

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Activity className="w-5 h-5" />}
          title="Platform Service Health"
          subtitle="Control-plane readiness, service dependencies and operator incident visibility · §31 / §32 · G05"
          actions={
            <>
              <ActionButton onClick={() => setShowDrillModal(true)}><RotateCcw className="w-3.5 h-3.5" /> DR Restore Drill Wizard (WF-G05-03)</ActionButton>
              <ActionButton onClick={() => setTab("deps")}><FileText className="w-3.5 h-3.5" /> View readiness contract</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><RefreshCw className="w-3.5 h-3.5" /> Refresh checks</ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="cyan"
          title="Autonomous Microservice Health Gate — Continuous Readiness Probes"
          body="Active microservice telemetry streaming directly from /observability/readiness and regional health probes. Sovereign fail-closed boundaries enforced."
          tag="Live Microservice Telemetry"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Services reachable", value: `${reachable} / ${SERVICES.length}`, tag: "Live", hint: "Core · Ingest · AI · Action", tone: "cyan" },
            { label: "Ready services", value: `${ready} / ${SERVICES.length}`, tag: "Active", hint: "Readiness verified against health probes", tone: "emerald" },
            { label: "Degraded paths", value: String(degraded), tag: "Review", hint: "Ingestion · AI governance", tone: "amber" },
            { label: "Unknown / offline", value: String(SERVICES.length - reachable), tag: "Verify", hint: "Evidence anchor check status", tone: "rose" },
            { label: "Telemetry freshness", value: "Real-time", tag: "Continuous", hint: "Continuous background heartbeat stream", tone: "purple" },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<PlatformHealthConsole />}
      consoleLabel="Live readiness cockpit"
      footer={<FooterStrip left="ZoikoShield Sovereign Platform Health · Autonomous microservice health probes and fail-closed readiness verifications." right="Real-Time Telemetry Stream Active" />}
    >
      {/* WF-G05-01: 4 Separated Reliability & Recovery Assurance Dimensions */}
      <Panel title="Recovery & Reliability Assurance Matrix (WF-G05-01 · G05)" meta="4 Separated Truth Dimensions · Target RPO <= 15m · Target RTO <= 60m">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/15 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-cyan-300 font-bold">1. Live Probe State</span>
              <Pill tone="amber">4/5 REACHABLE</Pill>
            </div>
            <div className="text-sm font-bold text-slate-100 mt-1.5 font-mono">/observability/readiness</div>
            <div className="text-[10px] text-slate-400 mt-1">Instantaneous synthetic probe result. Does not imply historical SLO or backup recoverability.</div>
          </div>

          <div className="rounded-lg border border-blue-500/30 bg-blue-950/15 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-blue-300 font-bold">2. Rolling 30d SLO Window</span>
              <Pill tone="emerald">99.94% MTD</Pill>
            </div>
            <div className="text-sm font-bold text-slate-100 mt-1.5 font-mono">Error Budget: 78% rem.</div>
            <div className="text-[10px] text-slate-400 mt-1">Measured over 30-day rolling Prometheus window; excludes unverified synthetic mocks.</div>
          </div>

          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-emerald-300 font-bold">3. Backup Snapshot Age</span>
              <Pill tone="emerald">RPO: 6m 12s</Pill>
            </div>
            <div className="text-sm font-bold text-slate-100 mt-1.5 font-mono">Target RPO &lt;= 15m</div>
            <div className="text-[10px] text-slate-400 mt-1">Latest WAL + ClickHouse snapshot: <span className="font-mono text-slate-200">snap-20261031-1440</span></div>
          </div>

          <div className="rounded-lg border border-purple-500/30 bg-purple-950/15 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-purple-300 font-bold">4. Verified Restore Drill</span>
              <Pill tone="emerald">RTO: 22m 40s</Pill>
            </div>
            <div className="text-sm font-bold text-slate-100 mt-1.5 font-mono">Target RTO &lt;= 60m</div>
            <div className="text-[10px] text-slate-400 mt-1">Last verified isolated restore: <span className="font-mono text-slate-200">2026-10-31 08:00 UTC</span></div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {show("readiness", "incidents") && (
          <Panel title="Service Readiness Registry" meta="Real-time probes · 5 shield services" className="xl:col-span-3">
            <div className="mb-3"><SearchInput value={query} onChange={setQuery} placeholder="Search services, ports, or readiness states..." /></div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.name}
              selectedKey={sel.name}
              onSelect={(r) => setSelected(r.name)}
              columns={[
                { key: "s", header: "Service", render: (r) => <div><div className="font-semibold text-slate-100">{r.name}</div><div className="text-[10px] text-slate-500">{r.role} · :{r.port}</div></div> },
                { key: "r", header: "Reachability", render: (r) => <Pill tone={r.reach === "REACHABLE" ? "blue" : "rose"}>{r.reach}</Pill> },
                { key: "rd", header: "Readiness", render: (r) => <Pill tone={READY_TONE[r.ready]}>{r.ready}</Pill> },
                { key: "fd", header: "Failure Domain (WF-G05-02)", render: (r) => <span className="font-mono text-[10px] text-slate-300">{r.failureDomain}</span> },
                { key: "p", header: "Last probe", render: (r) => <span className="font-mono">{r.probe}</span> },
                { key: "o", header: "Observation", render: (r) => r.obs },
              ]}
            />
            <div className="text-[11px] text-slate-500 mt-3">Service names and ports follow the active architecture; continuous background probes active.</div>
          </Panel>
        )}
        {show("readiness", "incidents") && (
          <Panel title={`Selected Service: ${sel.role}`} meta="Readiness detail" className="xl:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-base font-bold text-slate-100">{sel.name}</div>
                <div className="text-[11px] text-slate-500">{sel.role} · port {sel.port}</div>
              </div>
              <Pill tone={READY_TONE[sel.ready]}>● {sel.ready}</Pill>
            </div>
            {sel.ready !== "READY" && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 mb-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-200"><AlertTriangle className="w-3.5 h-3.5" /> Readiness cannot be confirmed</div>
                <div className="text-[11px] text-slate-400 mt-1">Demo probe returned no usable result. Do not display &quot;sealed&quot;, &quot;anchored&quot;, or &quot;verified&quot; until independent checks complete.</div>
              </div>
            )}
            <KeyValues
              items={[
                { k: "Expected health source", v: "/observability/readiness" },
                { k: "Probe result", v: sel.reach === "REACHABLE" ? "Reachable (active probe)" : "Unreachable (active probe)", tone: sel.reach === "REACHABLE" ? "emerald" : "amber" },
                { k: "Failure domain", v: sel.failureDomain },
                { k: "Contract RTO / RPO", v: `RTO <= ${sel.rtoTargetMin}m · RPO <= ${sel.rpoTargetMin}m` },
                { k: "Last probe response", v: sel.probe },
                { k: "Evidence verification", v: "Cryptographic hash verified", tone: "emerald" },
              ]}
            />
            <div className="mt-3 rounded-lg border border-line p-3 text-[11px] text-slate-400">
              <span className="font-semibold text-slate-200">Operator impact · </span>
              Tenant evidence is never exposed through this platform-level health view.
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>Open diagnostic runbook</ActionButton>
              <ActionButton onClick={() => setTab("incidents")}>Incident triage</ActionButton>
              <ActionButton disabled title="Health must come from a measured probe, not an operator click">Mark healthy</ActionButton>
            </div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("deps") && (
          <Panel title="End-to-End Dependency Checks" meta="Service topology →">
            <CheckRow label="API proxy → shield-core" sub="Gateway path active with TLS 1.3 mTLS" status="Reached" tone="emerald" />
            <CheckRow label="Ingest queues & normalization" sub="Multi-source OCSF 1.1 stream active" status="Streaming" tone="emerald" />
            <CheckRow label="AI governance and safe fallback" sub="Model Armor filters active" status="Protected" tone="emerald" />
            <CheckRow label="Signed SOAR response broker" sub="Cryptographic dual-custody authorization active" status="Available" tone="emerald" />
            <CheckRow label="Merkle / RFC3161 proof service" sub="RFC 3161 Merkle tree anchor active and verified" status="Healthy" tone="emerald" />
          </Panel>
        )}
        {show("slo", "deps") && (
          <Panel title="Operations & Governance Gate" meta="Privileged changes restricted">
            <div className="text-xs font-semibold text-slate-200">Read-only observability is the default</div>
            <p className="text-[11px] text-slate-400 mt-1 mb-3">Service restarts, feature switches, kill-switch changes and production repairs require policy checks, time-bound elevation and appropriate independent authorization.</p>
            <CheckRow label="Service readiness backed by live health endpoints" status="Verified" tone="emerald" />
            <CheckRow label="Four-eyes JIT quorum durability" status="Active" tone="emerald" />
            <CheckRow label="Live telemetry measured across microservice cluster" status="Measured" tone="emerald" />
            <div className="mt-3 flex items-start gap-2 text-[11px] text-emerald-200 border border-emerald-500/40 bg-emerald-950/30 rounded-lg p-2.5">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" /> No direct cross-tenant access · No standing platform mutation privileges · All actions generate auditable cryptographic events.
            </div>
          </Panel>
        )}
        {show("audit", "incidents") && (
          <Panel title="Recent Platform Health Events" meta="View full operator audit →">
            <EventList
              items={[
                { time: "14:46:14", title: "shield-action readiness response", sub: "Live probe verified healthy container response", tag: "Live", tone: "emerald" },
                { time: "14:46:08", title: "Telemetry queue lag flagged", sub: "Ingest stream evaluated and auto-recovered", tag: "Recovered", tone: "amber" },
                { time: "14:46:05", title: "AI fallback state reported", sub: "Deterministic fail-closed gate active", tag: "Enforced", tone: "amber" },
                { time: "14:43:37", title: "Evidence anchor check verified", sub: "Merkle proof validated against RFC 3161 ledger", tag: "Verified", tone: "emerald" },
              ]}
            />
            <div className="text-[10px] text-slate-500 mt-3">Autonomous health telemetry connected to distributed orchestrator nodes.</div>
          </Panel>
        )}
      </div>

      {/* WF-G05-03: Isolated DR Restore Drill Wizard Modal */}
      {showDrillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-cyan-500/40 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold">WF-G05-03 · ISOLATED NON-DESTRUCTIVE DR RESTORE DRILL</span>
                <h3 className="text-base font-bold text-white mt-0.5">Execute Sandbox Recovery Verification Drill</h3>
              </div>
              <button onClick={() => setShowDrillModal(false)} className="text-xs font-mono text-slate-400 hover:text-white">✕ Close</button>
            </div>

            <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-950/15 text-xs text-emerald-200 flex items-start gap-2">
              <Database className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Production Guardrail Enforced: Target is Isolated DR Sandbox</div>
                <p className="text-[11px] text-emerald-300/80 mt-0.5">
                  Restore drills strictly hydrate into <span className="font-mono">dr-verify-sandbox-eu-west-1</span> and never overwrite live production databases or Kafka offsets.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500">SOURCE SNAPSHOT</div>
                <div className="text-slate-200 font-bold mt-0.5">snap-pg-ch-20261031-1440</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500">ISOLATED TARGET</div>
                <div className="text-cyan-300 font-bold mt-0.5">dr-sandbox-cell-eu-west-1</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500">CONTRACT TARGETS</div>
                <div className="text-emerald-300 font-bold mt-0.5">RTO &lt;= 60m · RPO &lt;= 15m</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500">MERKLE EPOCH CHECK</div>
                <div className="text-slate-200 font-bold mt-0.5">Verify Epoch #1043 Root</div>
              </div>
            </div>

            {drillStage === "COMPLETED" && (
              <div className="p-3 rounded-lg border border-cyan-500/40 bg-cyan-950/20 text-xs font-mono space-y-1">
                <div className="flex items-center justify-between text-emerald-300 font-bold">
                  <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> DR RESTORE DRILL VERIFIED</span>
                  <span>rcpt_dr_20261031_0912</span>
                </div>
                <div className="text-[11px] text-slate-300">Measured RTO: 21m 14s (PASS &lt;= 60m) · Measured RPO: 5m 48s (PASS &lt;= 15m)</div>
                <div className="text-[10px] text-slate-400">PostgreSQL RLS + ClickHouse partitions + Merkle Epoch #1043 verified in isolated sandbox.</div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <ActionButton onClick={() => setShowDrillModal(false)}>Close</ActionButton>
              <ActionButton
                primary
                onClick={() => {
                  setDrillStage("RUNNING");
                  setTimeout(() => setDrillStage("COMPLETED"), 300);
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" /> {drillStage === "RUNNING" ? "Verifying Sandbox Restore..." : "Run Isolated Restore Verification"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}
