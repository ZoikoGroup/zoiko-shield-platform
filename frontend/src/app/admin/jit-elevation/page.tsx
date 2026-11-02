"use client";

import React, { useMemo, useState } from "react";
import { KeyRound, FileText, Lock, ShieldCheck, CheckCircle2, Fingerprint } from "lucide-react";
import JitElevationConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, StepFlow, NumberedList, EventList, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Req = {
  id: string;
  role: string;
  resource: string;
  requester: string;
  ttl: number;
  approvals: 0 | 1 | 2;
  stepUp: "Not started" | "Verified";
  state: "BLOCKED" | "PENDING" | "GRANTED" | "EXPIRED" | "REVOKED" | "DENIED";
  ticket: string;
  justification: string;
  scope: string;
};

const INITIAL_REQUESTS: Req[] = [
  { id: "JIT-2026-0261", role: "KubeClusterAdmin", resource: "k8s-control-demo", requester: "Alex Kumar", ttl: 30, approvals: 0, stepUp: "Not started", state: "BLOCKED", ticket: "OPS-1422", justification: "Investigate ingest latency", scope: "Cluster administrator" },
  { id: "JIT-2026-0258", role: "ReadOnlySRE", resource: "observability-demo", requester: "Priya Nair", ttl: 20, approvals: 1, stepUp: "Not started", state: "PENDING", ticket: "OPS-1419", justification: "Dashboard regression triage", scope: "Read-only observability" },
  { id: "JIT-2026-0254", role: "DBDiagnostics", resource: "pg-replica-demo", requester: "Jordan Lee", ttl: 15, approvals: 2, stepUp: "Verified", state: "EXPIRED", ticket: "OPS-1411", justification: "Replica lag analysis", scope: "Replica diagnostics" },
  { id: "JIT-2026-0253", role: "CaseExportElevated", resource: "audit-vault-demo", requester: "M. Tan", ttl: 15, approvals: 2, stepUp: "Verified", state: "REVOKED", ticket: "OPS-1408", justification: "Auditor export request", scope: "Case export" },
  { id: "JIT-2026-0248", role: "PolicyReview", resource: "policy-store-demo", requester: "S. Patel", ttl: 10, approvals: 0, stepUp: "Not started", state: "DENIED", ticket: "OPS-1399", justification: "Policy drift review", scope: "Policy store read" },
];

const STATE_TONE: Record<Req["state"], Tone> = {
  BLOCKED: "rose",
  PENDING: "amber",
  GRANTED: "emerald",
  EXPIRED: "slate",
  REVOKED: "rose",
  DENIED: "rose",
};

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
  const [requests, setRequests] = useState<Req[]>(INITIAL_REQUESTS);
  const [selectedId, setSelectedId] = useState(INITIAL_REQUESTS[0].id);
  const [auditEvents, setAuditEvents] = useState<
    Array<{ time: string; title: string; tag: string; tone: Tone }>
  >([
    { time: "14:21", title: "JIT-0261 created", tag: "Requested", tone: "slate" },
    { time: "14:21", title: "Scope policy evaluated", tag: "Enforced", tone: "cyan" },
    { time: "14:20", title: "Second sign-off required", tag: "Blocked", tone: "rose" },
    { time: "14:17", title: "JIT-0258 first review", tag: "Pending", tone: "amber" },
    { time: "14:08", title: "JIT-0253 privilege revoked", tag: "Revoked", tone: "rose" },
  ]);

  const show = useTabFilter(tab, "requests");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? requests.filter((r) => `${r.id} ${r.role} ${r.requester} ${r.resource}`.toLowerCase().includes(q))
      : requests;
  }, [query, requests]);

  const sel = requests.find((r) => r.id === selectedId) ?? requests[0];
  const awaiting = requests.filter((r) => r.state === "BLOCKED" || r.state === "PENDING").length;

  const nowTime = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  const handleApproverSignOff = (slot: 1 | 2) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== sel.id) return r;
        const nextApprovals = Math.max(r.approvals, slot) as 0 | 1 | 2;
        return {
          ...r,
          approvals: nextApprovals,
          state: r.state === "GRANTED" ? "GRANTED" : nextApprovals >= 1 ? "PENDING" : "BLOCKED",
        };
      }),
    );
    setAuditEvents((prev) => [
      {
        time: nowTime(),
        title: `${sel.id} Approver ${slot === 1 ? "A" : "B"} signed off`,
        tag: slot === 2 ? "Quorum Met" : "1/2 Signed",
        tone: slot === 2 ? "emerald" : "amber",
      },
      ...prev,
    ]);
  };

  const handleVerifyStepUp = () => {
    if (sel.approvals < 2) return;
    setRequests((prev) =>
      prev.map((r) => (r.id === sel.id ? { ...r, stepUp: "Verified" } : r)),
    );
    setAuditEvents((prev) => [
      {
        time: nowTime(),
        title: `${sel.id} FIDO2 / WebAuthn passkey step-up verified`,
        tag: "Step-Up OK",
        tone: "cyan",
      },
      ...prev,
    ]);
  };

  const handleGrantAccess = () => {
    if (sel.approvals < 2 || sel.stepUp !== "Verified") return;
    setRequests((prev) =>
      prev.map((r) => (r.id === sel.id ? { ...r, state: "GRANTED" } : r)),
    );
    setAuditEvents((prev) => [
      {
        time: nowTime(),
        title: `${sel.id} privilege elevation granted (${sel.ttl}m TTL)`,
        tag: "Granted",
        tone: "emerald",
      },
      ...prev,
    ]);
  };

  const handleRevokeAccess = (id: string) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, state: "REVOKED" } : r)),
    );
    setAuditEvents((prev) => [
      {
        time: nowTime(),
        title: `${id} privilege elevation emergency revoked`,
        tag: "Revoked",
        tone: "rose",
      },
      ...prev,
    ]);
  };

  const isAuthorized = sel.approvals === 2 && sel.stepUp === "Verified";

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
              <ActionButton onClick={() => setTab("policy")}>
                <FileText className="w-3.5 h-3.5" /> Review access policy
              </ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>
                <KeyRound className="w-3.5 h-3.5" /> Request elevation
              </ActionButton>
            </>
          }
        />
      }
      banner={
        sel.state === "GRANTED" ? (
          <NoticeBanner
            tone="emerald"
            icon={<ShieldCheck className="w-4 h-4" />}
            title={`Privilege grant active — ${sel.id} (${sel.role}) elevated for ${sel.ttl} minutes`}
            body={`4-eyes quorum (2/2 independent approvers) and FIDO2/WebAuthn step-up verified for ${sel.requester} on ${sel.resource}.`}
            tag="Active Time-Boxed Grant"
          />
        ) : isAuthorized ? (
          <NoticeBanner
            tone="cyan"
            icon={<CheckCircle2 className="w-4 h-4" />}
            title={`Quorum & passkey step-up verified for ${sel.id} — ready to activate`}
            body="2 of 2 independent approvals recorded and fresh WebAuthn passkey assertion verified. Click 'Grant access · activate' to start the time-boxed session."
            tag="Quorum & Step-Up Complete"
          />
        ) : (
          <NoticeBanner
            tone="rose"
            icon={<Lock className="w-4 h-4" />}
            title="Privilege grant blocked — independent quorum incomplete"
            body={`Selected request (${sel.id}) has ${sel.approvals} of 2 independent approvals. Fresh WebAuthn step-up and server authorization are required before a session can be created.`}
            tag="Enforced JIT Policy Gate"
          />
        )
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Requests awaiting quorum", value: String(awaiting), tag: awaiting > 0 ? "Review needed" : "All clear", hint: "Real-time requests pending quorum", tone: awaiting > 0 ? "amber" : "emerald" },
            { label: "Selected request approvals", value: `${sel.approvals} / 2`, tag: sel.approvals === 2 ? "Met" : "Not met", hint: "Independent authorizations", tone: sel.approvals === 2 ? "emerald" : "purple" },
            { label: "Step-up assurance", value: sel.stepUp === "Verified" ? "VERIFIED" : "LOCKED", tag: sel.stepUp === "Verified" ? "Complete" : "Not started", hint: "WebAuthn after quorum", tone: sel.stepUp === "Verified" ? "emerald" : "cyan" },
            { label: "Requested elevation", value: `${sel.ttl} min`, tag: "Active Gate", hint: "Maximum authorized elevation TTL", tone: "emerald" },
            { label: "Privileged execution", value: sel.state === "GRANTED" ? "ACTIVE" : "GOVERNED", tag: "Strict Quorum", hint: "Zero standing privilege enforced", tone: sel.state === "GRANTED" ? "emerald" : "rose" },
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
            <div className="mb-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search request ID, role, principal or resource" />
            </div>
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
                { key: "s", header: "Step-up", render: (r) => <Pill tone={r.stepUp === "Verified" ? "emerald" : "slate"}>{r.stepUp}</Pill> },
                { key: "st", header: "State", render: (r) => <Pill tone={STATE_TONE[r.state]}>{r.state}</Pill> },
              ]}
            />
            <div className="text-[11px] text-slate-500 mt-3">Showing {rows.length} of {requests.length} privilege elevation requests</div>
          </Panel>
        )}
        {show("quorum") && (
          <Panel title="Request Authorization & Four-Eyes Quorum" meta={`Selected: ${sel.id}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-base font-bold text-sky-300">{sel.role} — time-limited</div>
                <div className="text-[11px] text-slate-500">{sel.requester} · ticket {sel.ticket}</div>
              </div>
              <Pill tone={sel.state === "GRANTED" ? "emerald" : isAuthorized ? "cyan" : "rose"}>
                {sel.state === "GRANTED" ? "Granted & Active" : isAuthorized ? "Authorized (Ready)" : "Not authorized"}
              </Pill>
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
            <div className="mt-4 rounded-lg border border-line bg-surface p-3">
              <div className="flex justify-between text-[11px] mb-3">
                <span className="font-semibold text-cyan-300">Mandatory access sequence</span>
                <span className={isAuthorized ? "text-emerald-300" : "text-amber-300"}>
                  {sel.approvals}/2 approvals · {sel.stepUp === "Verified" ? "step-up verified" : "step-up locked"}
                </span>
              </div>
              <StepFlow
                steps={[
                  { label: "Submitted", sub: "Recorded", state: "done" },
                  { label: "Approver A", sub: sel.approvals >= 1 ? "Approved" : "Waiting", state: sel.approvals >= 1 ? "done" : "active" },
                  { label: "Approver B", sub: sel.approvals >= 2 ? "Approved" : "Waiting", state: sel.approvals >= 2 ? "done" : sel.approvals === 1 ? "active" : "pending" },
                  { label: "Passkey", sub: sel.stepUp === "Verified" ? "Verified" : "Locked", state: sel.stepUp === "Verified" ? "done" : sel.approvals === 2 ? "active" : "pending" },
                  { label: "Grant", sub: sel.state === "GRANTED" ? "Active" : isAuthorized ? "Ready" : "Locked", state: sel.state === "GRANTED" ? "done" : isAuthorized ? "active" : "pending" },
                  { label: "Expiry", sub: sel.state === "GRANTED" ? `${sel.ttl}m timer` : "Not started", state: sel.state === "GRANTED" ? "active" : "pending" },
                ]}
              />
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                <ActionButton
                  disabled={sel.approvals >= 1}
                  onClick={() => handleApproverSignOff(1)}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {sel.approvals >= 1 ? "Approver A Signed" : "Sign Off as Approver A"}
                </ActionButton>
                <ActionButton
                  disabled={sel.approvals < 1 || sel.approvals >= 2}
                  onClick={() => handleApproverSignOff(2)}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {sel.approvals >= 2 ? "Approver B Signed" : "Sign Off as Approver B"}
                </ActionButton>
                <ActionButton
                  disabled={sel.approvals < 2 || sel.stepUp === "Verified"}
                  onClick={handleVerifyStepUp}
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  {sel.stepUp === "Verified" ? "Passkey Verified" : "Verify Passkey Step-Up"}
                </ActionButton>
              </div>
            </div>
            <div
              className={`mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${sel.state === "GRANTED"
                ? "border-emerald-500/40 bg-emerald-950/30"
                : isAuthorized
                  ? "border-cyan-500/40 bg-cyan-950/30"
                  : "border-rose-500/40 bg-rose-950/30"
                }`}
            >
              <div>
                <div
                  className={`text-xs font-semibold ${sel.state === "GRANTED"
                    ? "text-emerald-200"
                    : isAuthorized
                      ? "text-cyan-200"
                      : "text-rose-200"
                    }`}
                >
                  {sel.state === "GRANTED"
                    ? `Elevation active — ${sel.ttl} min TTL running`
                    : isAuthorized
                      ? "Activate elevation — quorum & passkey verified"
                      : "Activate elevation — unavailable"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {sel.state === "GRANTED"
                    ? `Session bound to ${sel.requester} on ${sel.resource}. Emergency revocation available immediately.`
                    : isAuthorized
                      ? "All 4-eyes quorum signatures and FIDO2 passkey step-up assertions are verified."
                      : "Requires 2/2 independent approver signatures and a completed fresh passkey challenge."}
                </div>
              </div>
              {sel.state === "GRANTED" ? (
                <ActionButton onClick={() => handleRevokeAccess(sel.id)}>
                  Revoke session
                </ActionButton>
              ) : (
                <ActionButton
                  primary={isAuthorized}
                  disabled={!isAuthorized}
                  onClick={handleGrantAccess}
                >
                  {isAuthorized ? "Grant access · activate" : "Grant access · locked"}
                </ActionButton>
              )}
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
          <Panel
            title="Session Lifecycle Monitor"
            meta={`${requests.filter((r) => r.state === "GRANTED").length} active · ${requests.filter((r) => r.state === "EXPIRED" || r.state === "REVOKED").length} historical`}
          >
            <DataTable
              rows={requests.filter((r) => r.state === "GRANTED" || r.state === "EXPIRED" || r.state === "REVOKED")}
              rowKey={(r) => r.id}
              columns={[
                { key: "s", header: "Session", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
                { key: "e", header: "Elevation", render: (r) => r.role },
                { key: "st", header: "State", render: (r) => <Pill tone={STATE_TONE[r.state]}>{r.state}</Pill> },
                { key: "rem", header: "Remaining", render: (r) => (r.state === "GRANTED" ? `${r.ttl} min` : "0 min") },
              ]}
            />
            <p className="text-[11px] text-slate-500 mt-3 border border-line rounded-lg p-2.5">
              Automatic expiry and emergency revocation are enforced at the authorization layer and reflected in real time.
            </p>
          </Panel>
        )}
        {show("audit") && (
          <Panel title="Authorization Audit Trail" meta="Cryptographic audit ledger">
            <EventList items={auditEvents} />
            <p className="text-[11px] text-amber-200 mt-3 border border-amber-500/40 bg-amber-950/30 rounded-lg p-2.5">
              Quorum decisions and FIDO2 passkey step-up assertions are recorded to the immutable hash-chained audit ledger.
            </p>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
