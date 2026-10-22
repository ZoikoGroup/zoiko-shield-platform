"use client";

import React, { useMemo, useState } from "react";
import { Info, Plus, Lock, AlertTriangle, Clock, CheckCircle2, Circle, LayoutGrid, Check } from "lucide-react";
import ConnectorsConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, SearchInput, StepFlow,
  ActionButton, CONSOLE_TAB,
} from "@/components/mockup/kit";

type Conn = { code: string; name: string; sub: string; kind: "Cloud" | "Identity" | "Dev tools"; auth: string; idLabel: string; appLabel: string };

const CATALOGUE: Conn[] = [
  { code: "Az", name: "Azure Monitor", sub: "Cloud telemetry · Polling", kind: "Cloud", auth: "Service principal", idLabel: "Azure tenant identifier", appLabel: "Application (client) identifier" },
  { code: "GH", name: "GitHub", sub: "Repository and security events", kind: "Dev tools", auth: "GitHub App", idLabel: "Organization", appLabel: "App ID" },
  { code: "WH", name: "Generic Webhook", sub: "HMAC-signed event delivery", kind: "Dev tools", auth: "HMAC shared secret", idLabel: "Source identifier", appLabel: "Signing key ID" },
  { code: "CL", name: "Cloud Logs", sub: "Structured log collection", kind: "Cloud", auth: "Workload identity", idLabel: "Project / account", appLabel: "Service identity" },
  { code: "OK", name: "Okta Identity", sub: "System log and auth events", kind: "Identity", auth: "OAuth 2.0 service app", idLabel: "Okta org URL", appLabel: "Client ID" },
];

const GATES = [
  { label: "Source selected", status: "Complete" },
  { label: "Credential test", status: "Pending" },
  { label: "Permission validation", status: "Pending" },
  { label: "Sample event inspection", status: "Pending" },
  { label: "OCSF mapping review", status: "Pending" },
  { label: "Authorized activation", status: "Blocked" },
];

function MaskedField({ id, label, hint }: { id: string; label: string; hint: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold text-slate-300 mb-1">{label}</label>
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#080c16] border border-[#1e2b44] text-xs">
        <input id={id} type="password" autoComplete="off" placeholder="•••• •••• ••••" className="bg-transparent outline-none text-slate-100 placeholder:text-slate-500 w-full" />
        <span className="text-[10px] text-slate-500 shrink-0 ml-2">{hint}</span>
      </div>
    </div>
  );
}

export default function ConnectorsWizardPage() {
  const [tab, setTab] = useState("wizard");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"All" | Conn["kind"]>("All");
  const [selectedName, setSelectedName] = useState("Azure Monitor");
  const [displayName, setDisplayName] = useState("Azure Monitor — Security Logs");
  const [collect, setCollect] = useState({ security: true, identity: true, resource: true, diagnostic: false });
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOGUE.filter((c) => (kind === "All" || c.kind === kind) && (!q || `${c.name} ${c.sub}`.toLowerCase().includes(q)));
  }, [query, kind]);
  const sel = CATALOGUE.find((c) => c.name === selectedName) ?? CATALOGUE[0];

  const choose = (c: Conn) => { setSelectedName(c.name); setDisplayName(`${c.name} — Security Logs`); setSavedAt(null); };

  return (
    <WorkspacePage
      header={
        <PageHeader
          title="Connectors Wizard"
          subtitle="Securely configure, test and activate ingestion sources · Test before activation"
          actions={
            <>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}><Info className="w-3.5 h-3.5" /> Setup guide</ActionButton>
              <ActionButton primary onClick={() => { setSelectedName(CATALOGUE[0].name); setTab("wizard"); }}><Plus className="w-3.5 h-3.5" /> New connector</ActionButton>
            </>
          }
        />
      }
      banner={<NoticeBanner tone="cyan" title="Sovereign Multi-Cloud Ingestion Fabric" body="Enterprise telemetry connectors with automated OCSF 1.1 mapping and zero-trust pre-activation validation." tag="Ingestion Pipeline Active" />}
      kpis={
        <>
          <div className="rounded-xl bg-[#0c111e] border border-[#162238] p-4">
            <StepFlow
              steps={[
                { label: "1. Select source", sub: `${sel.name} chosen`, state: "done" },
                { label: "2. Configure", sub: "Credentials & scopes", state: "active" },
                { label: "3. Test connection", sub: "Live probe verification", state: "pending" },
                { label: "4. Review & activate", sub: "Dual-custody authorization", state: "pending" },
              ]}
            />
          </div>
          <KpiGrid
            items={[
              { label: "Configured sources", value: "8", hint: "Enterprise sources configured", tone: "blue", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
              { label: "Active sources", value: "5", hint: "Telemetry stream healthy", tone: "emerald", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
              { label: "Degraded sources", value: "1", hint: "Queue lag monitored", tone: "amber", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
              { label: "Awaiting setup", value: "2", hint: "Ready for activation", tone: "rose", icon: <Clock className="w-3.5 h-3.5" /> },
            ]}
          />
        </>
      }
      tabs={[{ id: "wizard", label: "Setup wizard" }]}
      activeTab={tab}
      onTabChange={setTab}
      console={<ConnectorsConsole />}
      consoleLabel="Connector tiers & live tests"
    >
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel title="Connector catalogue" meta="Available examples" metaTone="slate" className="xl:col-span-3">
          <div className="mb-2"><SearchInput value={query} onChange={setQuery} placeholder="Search connectors" /></div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(["All", "Cloud", "Identity", "Dev tools"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`px-2.5 py-1 rounded-full border text-[11px] ${kind === k ? "bg-sky-600 border-sky-500 text-white" : "border-[#1e2b44] text-slate-300"}`}>{k}</button>
            ))}
          </div>
          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.name}>
                <button type="button" onClick={() => choose(c)} className={`w-full flex items-center gap-3 rounded-lg border p-2.5 text-left ${c.name === sel.name ? "border-sky-500 bg-sky-950/40" : "border-[#162238] hover:border-slate-600"}`}>
                  <span className="w-9 h-9 rounded-lg bg-[#13203a] text-sm font-bold text-sky-200 flex items-center justify-center">{c.code}</span>
                  <span className="flex-1 min-w-0"><span className="block text-xs font-semibold text-slate-100">{c.name}</span><span className="block text-[10px] text-slate-500 truncate">{c.sub}</span></span>
                  <Pill tone={c.name === sel.name ? "amber" : "emerald"}>{c.name === sel.name ? "Selected" : "Available"}</Pill>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg border border-[#162238] p-3">
            <div className="text-xs font-semibold text-slate-200 mb-1">Setup guidance</div>
            <p className="text-[11px] text-slate-400">Select a source, configure the minimum required permissions, test connectivity and verify mapped events before activation.</p>
          </div>
          <p className="text-[10px] text-slate-500 mt-3">Credential values are never displayed back to users after saving.</p>
        </Panel>

        <Panel title={`Configuration · ${sel.name}`} meta="DRAFT · NOT ACTIVATED" metaTone="amber" className="xl:col-span-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-12 h-12 rounded-lg bg-[#13203a] text-lg font-bold text-sky-200 flex items-center justify-center">{sel.code}</span>
            <div><div className="text-base font-bold text-slate-100">{sel.name}</div><div className="text-[11px] text-slate-500">{sel.sub} · Demo configuration</div></div>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">Connection details are tenant-scoped. Configure only authorized read permissions.</p>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 mb-3">Identity &amp; Authentication</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="conn-name" className="block text-[11px] font-semibold text-slate-300 mb-1">Connector display name</label>
              <input id="conn-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[#080c16] border border-[#1e2b44] text-xs text-slate-100 outline-none focus:border-sky-500" />
            </div>
            <div>
              <span className="block text-[11px] font-semibold text-slate-300 mb-1">Authentication method</span>
              <div className="px-3 py-2 rounded-lg bg-[#080c16] border border-[#1e2b44] text-xs text-slate-100">{sel.auth}</div>
            </div>
            <MaskedField id="conn-tenant" label={sel.idLabel} hint="masked" />
            <MaskedField id="conn-app" label={sel.appLabel} hint="masked" />
            <MaskedField id="conn-secret" label="Client secret" hint="write-only" />
            <div>
              <label htmlFor="conn-region" className="block text-[11px] font-semibold text-slate-300 mb-1">Source region</label>
              <select id="conn-region" className="w-full px-3 py-2 rounded-lg bg-[#080c16] border border-[#1e2b44] text-xs text-slate-100">
                <option>US East (example)</option><option>EU West (example)</option><option>UK South (example)</option>
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Secret is encrypted at rest; never returned to the UI.</p>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-[11px] text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Security review: verify scoped read-only API permissions and credential ownership before testing. Never paste secrets into support messages.
          </div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 mt-5 mb-2">Data Collection Settings</h3>
          {([
            ["security", "Security events & alerts"],
            ["identity", "Identity-related audit events"],
            ["resource", "Resource activity logs"],
            ["diagnostic", "Optional diagnostic telemetry"],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between py-2 border-b border-[#111a2b] text-xs text-slate-200">
              <span className="flex items-center gap-2"><input type="checkbox" checked={collect[k]} onChange={(e) => setCollect((c) => ({ ...c, [k]: e.target.checked }))} className="accent-sky-500" />{label}</span>
              <span className="text-[10px] text-slate-500">{collect[k] ? "Enabled" : "Off"}</span>
            </label>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <span className="text-[10px] text-slate-500">{savedAt ? `Draft saved ${savedAt} · changes will be audited` : "Changes will be audited. Saving a draft does not start collection."}</span>
            <div className="flex gap-2">
              <ActionButton onClick={() => setSavedAt(new Date().toLocaleTimeString())}>Save draft</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>Test connection →</ActionButton>
            </div>
          </div>
        </Panel>

        <Panel title="Test & activation readiness" meta={`Connector · ${sel.code} · DEMO`} metaTone="slate" className="xl:col-span-3">
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 mb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-200"><Clock className="w-3.5 h-3.5" /> CONNECTION NOT TESTED</div>
            <p className="text-[11px] text-slate-400 mt-1">Complete the configuration, then run a signed server-side test. No success or health status is assumed before verification.</p>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 mb-2">Pre-activation gates</div>
          <ul className="space-y-1.5">
            {GATES.map((g) => (
              <li key={g.label} className="flex items-center justify-between rounded-md border border-[#162238] px-2.5 py-1.5 text-xs">
                <span className="flex items-center gap-2 text-slate-200">{g.status === "Complete" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-slate-500" />}{g.label}</span>
                <span className="text-[10px] text-slate-500">{g.status}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mt-4 mb-2"><span className="text-cyan-300">Proposed OCSF mapping</span><span className="text-sky-300 normal-case">Preview only</span></div>
          <table className="w-full text-[11px]">
            <thead><tr className="text-left text-slate-500"><th className="py-1">Source field</th><th>Target</th><th>Check</th></tr></thead>
            <tbody>
              {[["TimeGenerated", "time"], ["ResourceId", "resource.uid"], ["Severity", "severity"]].map(([s, t]) => (
                <tr key={s} className="border-t border-[#111a2b]"><td className="py-1.5 text-slate-300">{s}</td><td className="text-slate-300">{t}</td><td className="text-amber-300">Not tested</td></tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 mt-4 mb-2">Activation control</div>
          <button type="button" disabled className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[#1e2b44] bg-[#080c16] text-xs text-slate-500 cursor-not-allowed"><Lock className="w-3.5 h-3.5" /> Activate connector · unavailable</button>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
