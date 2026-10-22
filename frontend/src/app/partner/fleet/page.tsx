"use client";

import React, { useMemo, useState } from "react";
import { KeyRound, FileText, Lock, CheckCircle2, Clock, Ban } from "lucide-react";
import MsspFleetConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, EventList, CheckRow, ActionButton, FooterStrip, CONSOLE_TAB, useTabFilter,
} from "@/components/mockup/kit";

type Tenant = { name: string; ref: string; residency: string; cell: string; pending: number };

const FLEET: Tenant[] = [
  { name: "Acme Corporation", ref: "ACME-001", residency: "US East", cell: "us-east-1", pending: 1 },
  { name: "Helios Laboratories", ref: "HLAB-021", residency: "EU West", cell: "eu-west-1", pending: 0 },
  { name: "Meridian Retail", ref: "MRET-032", residency: "UK South", cell: "uk-south-1", pending: 1 },
  { name: "Northstar Finance", ref: "NFIN-028", residency: "US West", cell: "us-west-2", pending: 0 },
  { name: "Arbor Logistics", ref: "ARBR-054", residency: "APAC", cell: "ap-southeast-1", pending: 1 },
  { name: "Bayridge Health", ref: "BRHG-036", residency: "EU Central", cell: "eu-central-1", pending: 0 },
];

const TABS = [
  { id: "fleet", label: "Fleet Overview" },
  { id: "requests", label: "JIT Access Requests (3)" },
  { id: "sessions", label: "Active Sessions (2)" },
  { id: "policies", label: "Approval Policies" },
  { id: "decisions", label: "Auditable Decisions" },
];

export default function MsspFleetPage() {
  const [tab, setTab] = useState("fleet");
  const [query, setQuery] = useState("");
  const [selectedRef, setSelectedRef] = useState("ACME-001");
  const show = useTabFilter(tab, "fleet");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? FLEET.filter((t) => `${t.name} ${t.ref} ${t.residency} ${t.cell}`.toLowerCase().includes(q)) : FLEET;
  }, [query]);
  const sel = FLEET.find((t) => t.ref === selectedRef) ?? FLEET[0];
  const pending = FLEET.reduce((a, t) => a + t.pending, 0);

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<KeyRound className="w-5 h-5" />}
          title="MSSP Fleet & 2-Party JIT"
          subtitle="Operate across authorized customer tenants without standing privileged access or uncontrolled data visibility"
          actions={
            <>
              <ActionButton onClick={() => setTab("policies")}><FileText className="w-3.5 h-3.5" /> Access policy</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><KeyRound className="w-3.5 h-3.5" /> Request time-bound access</ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="amber"
          icon={<Lock className="w-4 h-4" />}
          title="Deny by default · No standing customer-data access"
          body="Every privileged session requires explicit purpose, tenant scoping, step-up authentication and two independent authorizers."
          tag="Cross-tenant boundaries enforced by design · implementation to verify"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Managed tenants", value: "12", hint: "Authorized fleet metadata only", tone: "cyan" },
            { label: "Pending 2-party approvals", value: String(pending), hint: "Requests cannot start sessions", tone: "amber" },
            { label: "Active JIT sessions", value: "2", hint: "Bound to approved scope and TTL", tone: "emerald" },
            { label: "Expired / revoked", value: "7", hint: "Verified revocation on session expiry", tone: "purple" },
            { label: "Guardrail review required", value: "0", hint: "JIT quorum durability verified", tone: "emerald" },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<MsspFleetConsole />}
      consoleLabel="Live partner console"
      footer={<FooterStrip left="ZoikoShield Partner Fleet Management · Dual-custody authorization and tenant row-level security active." right="Cryptographic Fleet Isolation Active" />}
    >
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {show("fleet") && (
          <Panel title="Authorized Tenant Fleet" meta="Tenant names and operating metadata only · strict boundary isolation">
            <div className="mb-3"><SearchInput value={query} onChange={setQuery} placeholder="Search tenant / authorized reference" /></div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.ref}
              selectedKey={sel.ref}
              onSelect={(r) => setSelectedRef(r.ref)}
              columns={[
                { key: "t", header: "Contracted tenant", render: (r) => <div><div className="font-semibold text-slate-100">{r.name}</div><div className="text-[10px] text-slate-500">{r.ref}</div></div> },
                { key: "r", header: "Residency", render: (r) => r.residency },
                { key: "c", header: "Cell", render: (r) => <span className="font-mono">{r.cell}</span> },
                { key: "e", header: "Fleet entitlement", render: () => <Pill tone="emerald">Contracted</Pill> },
                { key: "j", header: "JIT requests", render: (r) => (r.pending ? <Pill tone="amber">{r.pending} pending</Pill> : <span className="text-slate-500">—</span>) },
              ]}
            />
            <div className="flex justify-between text-[11px] text-slate-500 mt-3">
              <span>Showing {rows.length} of 12 simulated tenant records</span>
              <span>Tenant selection alone never provides data access.</span>
            </div>
          </Panel>
        )}
        {show("requests") && (
          <Panel title="Selected Just-in-Time Access Request" meta="JIT-2026-0042 · example request">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-base font-bold text-slate-100">Read-only investigation support</div>
                <div className="text-[11px] text-slate-500">Temporary access to a restricted audit-log resource following a customer-requested investigation.</div>
              </div>
              <Pill tone="amber">Pending 2-party</Pill>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 my-3 text-xs">
              <span className="font-semibold text-amber-200">Privileged session not authorized</span>
              <span className="text-slate-400">1 of 2 independent approvals</span>
            </div>
            <KeyValues
              items={[
                { k: "Tenant / environment", v: `${sel.name} · DEMO` },
                { k: "Requested permission", v: "Read-only security events" },
                { k: "Resource scope", v: "Identity audit-log collection" },
                { k: "Time to live", v: "30 minutes after activation" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="flex items-center gap-2 rounded-lg border border-[#162238] p-2.5 text-xs"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><div><div className="font-semibold text-slate-200">MSSP security approver</div><div className="text-[10px] text-slate-500">Approved · recorded</div></div></div>
              <div className="flex items-center gap-2 rounded-lg border border-[#162238] p-2.5 text-xs"><Clock className="w-4 h-4 text-amber-400" /><div><div className="font-semibold text-slate-200">Customer Tenant Owner</div><div className="text-[10px] text-slate-500">Awaiting independent decision</div></div></div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[11px] text-slate-500">No connection or data access yet</span>
              <ActionButton disabled><Lock className="w-3.5 h-3.5" /> Open session · Disabled</ActionButton>
            </div>
            <div className="text-[10px] text-slate-500 mt-2">No delegated self-approval · passkey step-up and server-side authorization required</div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("sessions") && (
          <Panel title="Time-Bound Sessions" meta="View session ledger →">
            <DataTable
              rows={[
                { id: "JIT-0038", tenant: "Northstar Finance", scope: "Case triage · read", exp: "08:24", st: "Active" },
                { id: "JIT-0039", tenant: "Helios Labs", scope: "Audit log review", exp: "17:06", st: "Active" },
                { id: "JIT-0035", tenant: "Acme Corp", scope: "Evidence review", exp: "—", st: "Expired" },
              ]}
              rowKey={(r) => r.id}
              columns={[
                { key: "s", header: "Session", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
                { key: "t", header: "Tenant", render: (r) => r.tenant },
                { key: "sc", header: "Scope", render: (r) => r.scope },
                { key: "e", header: "Expires in", render: (r) => <span className="font-mono">{r.exp}</span> },
                { key: "st", header: "Status", render: (r) => <Pill tone={r.st === "Active" ? "emerald" : "slate"}>{r.st}</Pill> },
              ]}
            />
            <div className="flex items-center justify-between mt-3 rounded-lg border border-[#162238] p-2.5 text-[11px]">
              <span className="flex items-center gap-1.5 text-sky-300 font-semibold"><Ban className="w-3.5 h-3.5" /> Immediate revoke</span>
              <span className="text-slate-500">Break-glass removal requires authorized control</span>
            </div>
          </Panel>
        )}
        {show("policies") && (
          <Panel title="Privilege Boundary & Gate" meta="2 parties · short-lived grants">
            <CheckRow label="Request" sub="Scoped" status="Done" tone="emerald" />
            <CheckRow label="MSSP approval" sub="Approved" status="Done" tone="emerald" />
            <CheckRow label="Tenant approval" sub="Pending" status="Pending" tone="amber" />
            <CheckRow label="Session" sub="Blocked" status="Blocked" tone="slate" />
            <div className="mt-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between"><span className="text-slate-400">Default data boundary</span><span className="font-semibold text-slate-200">Tenant-scoped</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Identity assurance</span><span className="font-semibold text-slate-200">Passkey + step-up</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Auto-expiry &amp; revoke</span><span className="font-semibold text-slate-200">30 min max (demo)</span></div>
            </div>
          </Panel>
        )}
        {show("decisions") && (
          <Panel title="Authorization & Audit Events" meta="View audit trail →">
            <EventList
              items={[
                { time: "14:47", title: "Tenant Owner decision pending", sub: "JIT-0042 · no access granted", tone: "amber" },
                { time: "14:40", title: "MSSP approval recorded", sub: "JIT-0042 · independent signer A", tone: "emerald" },
                { time: "14:31", title: "Scoped access request created", sub: "Purpose, permission and TTL captured", tone: "cyan" },
                { time: "13:28", title: "Session expired automatically", sub: "JIT-0035 · access closed", tone: "emerald" },
              ]}
            />
            <div className="text-[10px] text-slate-500 mt-3">Tamper-evident evidence receipts require independent verification.</div>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
