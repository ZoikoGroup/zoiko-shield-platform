"use client";

import React, { useMemo, useState } from "react";
import { KeyRound, FileText, Lock } from "lucide-react";
import JitElevationConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, StepFlow, NumberedList, EventList, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Req = {
  id: string; role: string; resource: string; requester: string; ttl: number;
  approvals: 0 | 1 | 2; stepUp: "Not started" | "Verified"; state: "BLOCKED" | "PENDING" | "EXPIRED" | "REVOKED" | "DENIED";
  ticket: string; justification: string; scope: string;
};

const REQUESTS: Req[] = [
  { id: "JIT-2026-0261", role: "KubeClusterAdmin", resource: "k8s-control-demo", requester: "Alex Kumar", ttl: 30, approvals: 0, stepUp: "Not started", state: "BLOCKED", ticket: "OPS-1422", justification: "Investigate ingest latency", scope: "Cluster administrator" },
  { id: "JIT-2026-0258", role: "ReadOnlySRE", resource: "observability-demo", requester: "Priya Nair", ttl: 20, approvals: 1, stepUp: "Not started", state: "PENDING", ticket: "OPS-1419", justification: "Dashboard regression triage", scope: "Read-only observability" },
  { id: "JIT-2026-0254", role: "DBDiagnostics", resource: "pg-replica-demo", requester: "Jordan Lee", ttl: 15, approvals: 2, stepUp: "Verified", state: "EXPIRED", ticket: "OPS-1411", justification: "Replica lag analysis", scope: "Replica diagnostics" },
  { id: "JIT-2026-0253", role: "CaseExportElevated", resource: "audit-vault-demo", requester: "M. Tan", ttl: 15, approvals: 2, stepUp: "Verified", state: "REVOKED", ticket: "OPS-1408", justification: "Auditor export request", scope: "Case export" },
  { id: "JIT-2026-0248", role: "PolicyReview", resource: "policy-store-demo", requester: "S. Patel", ttl: 10, approvals: 0, stepUp: "Not started", state: "DENIED", ticket: "OPS-1399", justification: "Policy drift review", scope: "Policy store read" },
];

const STATE_TONE: Record<Req["state"], Tone> = { BLOCKED: "rose", PENDING: "amber", EXPIRED: "slate", REVOKED: "rose", DENIED: "rose" };

const TABS = [
  { id: "requests", label: "Elevation Requests" },
  { id: "quorum", label: "Approval Quorum" },
  { id: "sessions", label: "Session Monitor" },
  { id: "policy", label: "Policy & Safeguards" },
  { id: "audit", label: "Audit Events" },
];

export default function JitElevationQuorumPage() {
  const [tab, setTab] = useState("requests");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(REQUESTS[0].id);
  const show = useTabFilter(tab, "requests");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? REQUESTS.filter((r) => `${r.id} ${r.role} ${r.requester} ${r.resource}`.toLowerCase().includes(q)) : REQUESTS;
  }, [query]);
  const sel = REQUESTS.find((r) => r.id === selectedId) ?? REQUESTS[0];
  const awaiting = REQUESTS.filter((r) => r.state === "BLOCKED" || r.state === "PENDING").length;

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<KeyRound className="w-5 h-5" />}
          title="JIT Elevation Quorum"
          routeTag="/admin/jit-elevation"
          subtitle="Zero standing privilege · independent authorization · passkey step-up · time-boxed elevation"
          actions={
            <>
              <ActionButton onClick={() => setTab("policy")}><FileText className="w-3.5 h-3.5" /> Review access policy</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><KeyRound className="w-3.5 h-3.5" /> Request elevation</ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="rose"
          icon={<Lock className="w-4 h-4" />}
          title="Privilege grant blocked — independent quorum incomplete"
          body="Selected example has 0 of 2 independent approvals. Fresh WebAuthn step-up and server authorization are required before a session can be created."
          tag="Enforced JIT Policy Gate"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Requests awaiting quorum", value: String(awaiting), tag: "Review needed", hint: "Real-time requests pending quorum", tone: "amber" },
            { label: "Selected request approvals", value: `${sel.approvals} / 2`, tag: sel.approvals === 2 ? "Met" : "Not met", hint: "Independent authorizations", tone: "purple" },
            { label: "Step-up assurance", value: sel.stepUp === "Verified" ? "VERIFIED" : "LOCKED", tag: sel.stepUp === "Verified" ? "Complete" : "Not started", hint: "WebAuthn after quorum", tone: "cyan" },
            { label: "Requested elevation", value: `${sel.ttl} min`, tag: "Active Gate", hint: "Maximum authorized elevation TTL", tone: "emerald" },
            { label: "Privileged execution", value: "GOVERNED", tag: "Strict Quorum", hint: "Zero standing privilege enforced", tone: "rose" },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<JitElevationConsole />}
      consoleLabel="Live elevation console"
    >
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {show("requests") && (
          <Panel title="Privileged Elevation Requests" meta="Access decisions are tenant- and resource-scoped">
            <div className="mb-3"><SearchInput value={query} onChange={setQuery} placeholder="Search request ID, role, principal or resource" /></div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              selectedKey={sel.id}
              onSelect={(r) => setSelectedId(r.id)}
              columns={[
                { key: "id", header: "Request", render: (r) => <div><div className="font-mono font-semibold text-sky-300">{r.id}</div><div className="text-[10px] text-slate-500">Active request</div></div> },
                { key: "role", header: "Role / protected resource", render: (r) => <div><div className="font-semibold text-slate-100">{r.role}</div><div className="text-[10px] text-slate-500">{r.resource}</div></div> },
                { key: "req", header: "Requester", render: (r) => r.requester },
                { key: "ttl", header: "TTL", render: (r) => `${r.ttl} min` },
                { key: "q", header: "Quorum", render: (r) => <Pill tone={r.approvals === 2 ? "emerald" : "amber"}>{r.approvals} / 2</Pill> },
                { key: "s", header: "Step-up", render: (r) => r.stepUp },
                { key: "st", header: "State", render: (r) => <Pill tone={STATE_TONE[r.state]}>{r.state}</Pill> },
              ]}
            />
            <div className="text-[11px] text-slate-500 mt-3">Showing {rows.length} of {REQUESTS.length} privilege elevation requests</div>
          </Panel>
        )}
        {show("quorum") && (
          <Panel title="Request Authorization & Four-Eyes Quorum" meta={`Selected: ${sel.id}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-base font-bold text-sky-300">{sel.role} — time-limited</div>
                <div className="text-[11px] text-slate-500">{sel.requester} · ticket {sel.ticket}</div>
              </div>
              <Pill tone="rose">Not authorized</Pill>
            </div>
            <KeyValues
              cols={3}
              items={[
                { k: "Protected resource", v: sel.resource },
                { k: "Scope", v: sel.scope },
                { k: "Maximum duration", v: `${sel.ttl} minutes` },
                { k: "Environment", v: "Isolated DEMO lab" },
                { k: "Justification", v: sel.justification },
                { k: "Request binding", v: "Tenant + principal + role" },
              ]}
            />
            <div className="mt-4 rounded-lg border border-[#162238] bg-[#080c16] p-3">
              <div className="flex justify-between text-[11px] mb-3">
                <span className="font-semibold text-cyan-300">Mandatory access sequence</span>
                <span className="text-amber-300">{sel.approvals}/2 approvals · step-up locked</span>
              </div>
              <StepFlow
                steps={[
                  { label: "Submitted", sub: "Recorded", state: "done" },
                  { label: "Approver A", sub: sel.approvals >= 1 ? "Approved" : "Waiting", state: sel.approvals >= 1 ? "done" : "active" },
                  { label: "Approver B", sub: sel.approvals >= 2 ? "Approved" : "Waiting", state: sel.approvals >= 2 ? "done" : "pending" },
                  { label: "Passkey", sub: "Locked", state: "pending" },
                  { label: "Grant", sub: "Locked", state: "pending" },
                  { label: "Expiry", sub: "Not started", state: "pending" },
                ]}
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2.5">
              <div>
                <div className="text-xs font-semibold text-rose-200">Activate elevation — unavailable</div>
                <div className="text-[11px] text-slate-400">No signature quorum, no completed fresh passkey challenge, no server-side grant.</div>
              </div>
              <ActionButton disabled>Grant access · locked</ActionButton>
            </div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("policy") && (
          <Panel title="Policy Preconditions & Safety Controls" meta="Proposed target controls">
            <NumberedList
              items={[
                { title: "Independent approvers", sub: "Requester cannot approve their own elevation.", tag: "Required", tone: "cyan" },
                { title: "Short-lived access", sub: "Grant scoped to role, resource and maximum duration.", tag: "TTL", tone: "emerald" },
                { title: "FIDO2 / WebAuthn step-up", sub: "Fresh authentication after quorum, before grant.", tag: "Mandatory", tone: "blue" },
                { title: "Revocation and expiry", sub: "Privileges terminated automatically or by emergency revoke.", tag: "Enforced", tone: "amber" },
              ]}
            />
          </Panel>
        )}
        {show("sessions") && (
          <Panel title="Session Lifecycle Monitor" meta="DEMO examples · none active">
            <DataTable
              rows={REQUESTS.filter((r) => r.state === "EXPIRED" || r.state === "REVOKED")}
              rowKey={(r) => r.id}
              columns={[
                { key: "s", header: "Session", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
                { key: "e", header: "Elevation", render: (r) => r.role },
                { key: "st", header: "State", render: (r) => r.state.charAt(0) + r.state.slice(1).toLowerCase() },
                { key: "rem", header: "Remaining", render: () => "0 min" },
              ]}
            />
            <p className="text-[11px] text-slate-500 mt-3 border border-[#162238] rounded-lg p-2.5">
              Automatic expiry and emergency revocation must be enforced at the authorization layer, not only reflected in the interface.
            </p>
          </Panel>
        )}
        {show("audit") && (
          <Panel title="Authorization Audit Trail" meta="Cryptographic audit ledger">
            <EventList
              items={[
                { time: "14:21", title: "JIT-0261 created", tag: "Requested", tone: "slate" },
                { time: "14:21", title: "Scope policy evaluated", tag: "Enforced", tone: "cyan" },
                { time: "14:20", title: "Second sign-off required", tag: "Blocked", tone: "rose" },
                { time: "14:17", title: "JIT-0258 first review", tag: "Pending", tone: "amber" },
                { time: "14:08", title: "JIT-0253 privilege revoked", tag: "Revoked", tone: "rose" },
              ]}
            />
            <p className="text-[11px] text-amber-200 mt-3 border border-amber-500/40 bg-amber-950/30 rounded-lg p-2.5">
              Engineering verification required: persist quorum decisions durably; remove fallback signing secrets; verify expiry and revocation against the current backend.
            </p>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
