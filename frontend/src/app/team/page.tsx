"use client";

import React, { useMemo, useState } from "react";
import { Users, FileText, UserPlus, Lock, Mail, KeyRound, Clock, Eye, AlertTriangle } from "lucide-react";
import TeamConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, EventList, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Member = {
  initials: string; name: string; email: string; role: string; status: "Active" | "Limited" | "Suspended";
  assurance: string; review: string; reviewTone: Tone; team: string; ref: string; privilege: string; lastAuth: string;
};

const MEMBERS: Member[] = [
  { initials: "OR", name: "Olivia Reed", email: "olivia.reed@acme.example", role: "Tenant Owner", status: "Active", assurance: "Passkey + step-up", review: "Current", reviewTone: "emerald", team: "Executive", ref: "USR-DEMO-001", privilege: "Tenant owner", lastAuth: "14 Oct · 09:02 UTC" },
  { initials: "DR", name: "Daniel Ross", email: "daniel.ross@acme.example", role: "Tenant Admin", status: "Active", assurance: "Passkey", review: "Due 18 Oct", reviewTone: "amber", team: "Platform", ref: "USR-DEMO-004", privilege: "Tenant administration", lastAuth: "14 Oct · 10:15 UTC" },
  { initials: "SC", name: "Sarah Chen", email: "sarah.chen@acme.example", role: "Security Analyst", status: "Active", assurance: "Passkey", review: "Current", reviewTone: "emerald", team: "Security Operations", ref: "USR-DEMO-014", privilege: "Case-scoped analyst", lastAuth: "14 Oct · 11:32 UTC" },
  { initials: "PN", name: "Priya Nair", email: "priya.nair@acme.example", role: "Incident Responder", status: "Active", assurance: "Passkey", review: "Current", reviewTone: "emerald", team: "Incident Response", ref: "USR-DEMO-019", privilege: "Response proposals", lastAuth: "14 Oct · 08:47 UTC" },
  { initials: "JK", name: "James Kim", email: "james.kim@audit.example", role: "External Auditor", status: "Limited", assurance: "Passkey + expiry", review: "Expires 20 Oct", reviewTone: "amber", team: "External audit", ref: "USR-DEMO-022", privilege: "Read-only audit scope", lastAuth: "13 Oct · 16:20 UTC" },
];

const TABS = [
  { id: "members", label: "Members" },
  { id: "invitations", label: "Invitations (2)" },
  { id: "roles", label: "Roles & Permissions" },
  { id: "passkeys", label: "Passkeys & Authentication" },
  { id: "reviews", label: "Access Reviews" },
  { id: "audit", label: "Tenant Audit History" },
];

export default function TeamAccessPage() {
  const [tab, setTab] = useState("members");
  const [query, setQuery] = useState("");
  const [selectedRef, setSelectedRef] = useState("USR-DEMO-014");
  const show = useTabFilter(tab, "members");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? MEMBERS.filter((m) => `${m.name} ${m.email} ${m.role}`.toLowerCase().includes(q)) : MEMBERS;
  }, [query]);
  const sel = MEMBERS.find((m) => m.ref === selectedRef) ?? MEMBERS[0];

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Users className="w-5 h-5" />}
          title="Team & Access"
          subtitle="Manage tenant membership, invitations, roles, passkeys and evidence-backed access reviews"
          actions={
            <>
              <ActionButton onClick={() => setTab("audit")}><FileText className="w-3.5 h-3.5" /> Export access report</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><UserPlus className="w-3.5 h-3.5" /> Invite member</ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="cyan"
          icon={<Lock className="w-4 h-4" />}
          title="Tenant boundary: Acme Corporation"
          body="Only this tenant's users and membership grants are visible. Platform roles cannot be assigned here."
          tag="Permission model · to be verified"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Active tenant members", value: "21", hint: "24 total · 1 suspended · 2 invited", tone: "cyan", icon: <Users className="w-3.5 h-3.5" /> },
            { label: "Passkeys registered", value: "21 / 24", hint: "Phishing-resistant credentials", tone: "emerald", icon: <KeyRound className="w-3.5 h-3.5" /> },
            { label: "Pending invitations", value: "2", hint: "Acceptance not confirmed", tone: "amber", icon: <Mail className="w-3.5 h-3.5" /> },
            { label: "Access reviews due", value: "2", hint: "Includes one elevated grant", tone: "purple", icon: <Clock className="w-3.5 h-3.5" /> },
            { label: "Support access grants", value: "0 ACTIVE", hint: "No standing support access · proposed", tone: "slate", icon: <Lock className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<TeamConsole />}
      consoleLabel="Live team console"
      footer={<div className="flex justify-between text-[10px] text-slate-500"><span>ZoikoShield · Team &amp; Access · All names, metrics and events are illustrative</span><span className="font-mono font-bold">DESIGN REVIEW ONLY · NOT VERIFIED PRODUCTION BEHAVIOR</span></div>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("roles", "passkeys") && (
          <Panel title="Members & Role Assignments" meta="24 tenant identities · Acme only" className="xl:col-span-2">
            <div className="mb-3"><SearchInput value={query} onChange={setQuery} placeholder="Search name, email or role" /></div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.ref}
              selectedKey={sel.ref}
              onSelect={(r) => setSelectedRef(r.ref)}
              columns={[
                { key: "m", header: "Member", render: (r) => <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-full bg-sky-700 text-[10px] font-bold text-white flex items-center justify-center">{r.initials}</span><div><div className="font-semibold text-slate-100">{r.name}</div><div className="text-[10px] text-slate-500">{r.email}</div></div></div> },
                { key: "r", header: "Tenant role", render: (r) => r.role },
                { key: "s", header: "Status", render: (r) => <Pill tone={r.status === "Active" ? "emerald" : "blue"}>{r.status}</Pill> },
                { key: "a", header: "Identity assurance", render: (r) => <span className="text-slate-300">{r.assurance}</span> },
                { key: "n", header: "Next review", render: (r) => <Pill tone={r.reviewTone}>{r.review}</Pill> },
              ]}
            />
            <div className="flex justify-between text-[11px] text-slate-500 mt-3">
              <span>Showing {rows.length} of 24 demo identities · Invitation and provisioning results are not verified</span>
            </div>
          </Panel>
        )}
        {show("roles") && (
          <Panel title="Selected Member" meta="Read-only details">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-sky-600 text-sm font-bold text-white flex items-center justify-center">{sel.initials}</span>
                <div><div className="text-base font-bold text-slate-100">{sel.name}</div><div className="text-[11px] text-slate-500">{sel.role} · {sel.team}</div></div>
              </div>
              <Pill tone={sel.status === "Active" ? "emerald" : "blue"}>{sel.status}</Pill>
            </div>
            <KeyValues
              items={[
                { k: "Tenant", v: "Acme Corporation" },
                { k: "Principal reference", v: sel.ref },
                { k: "Role", v: sel.role },
                { k: "Privilege level", v: sel.privilege },
                { k: "Passkey enrollment", v: "Registered (demo)", tone: "emerald" },
                { k: "Last authentication", v: sel.lastAuth },
                { k: "Platform administrator", v: "Not authorized", tone: "rose" },
                { k: "Next entitlement review", v: sel.review },
              ]}
            />
            <div className="grid grid-cols-2 gap-2 mt-4">
              <ActionButton onClick={() => setTab("roles")}><Eye className="w-3.5 h-3.5" /> View permissions</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>Request role change</ActionButton>
            </div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("invitations") && (
          <Panel title="Invitations & Acceptance" meta="2 awaiting resolution">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-[11px] text-amber-200 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span><b>Delivery not verified.</b> Invite workflow must show actual API and email results; do not imply that activation email was sent.</span>
            </div>
            <EventList
              items={[
                { title: "morgan.lee@acme.example", sub: "Proposed role: Security Analyst · expires 20 Oct", tag: "Pending", tone: "amber" },
                { title: "natalie.fox@acme.example", sub: "Proposed role: Compliance Reviewer · expires 21 Oct", tag: "Not accepted", tone: "rose" },
              ]}
            />
            <p className="text-[10px] text-slate-500 mt-3">Invites are tenant-bound, one-time, email-matched and time-limited. Never display an invitation as delivered solely because its record was created.</p>
          </Panel>
        )}
        {show("reviews") && (
          <Panel title="Elevated Access & Reviews" meta="Owner authorization required">
            <EventList
              items={[
                { title: "AR-0062 · Temporary evidence export", sub: "Requester: Daniel Ross · stated purpose: external audit", tag: "Step-up & review", tone: "amber" },
                { title: "AR-0064 · External auditor renewal", sub: "James Kim · access expiry: 20 Oct 2026 · read-only scope", tag: "Expires soon", tone: "amber" },
              ]}
            />
            <p className="text-[10px] text-slate-500 mt-3">Sensitive role changes require server-side checks, a documented purpose, and an auditable decision. Tenant invitations must not grant platform-wide roles.</p>
          </Panel>
        )}
        {show("audit", "passkeys") && (
          <Panel title="Identity & Audit Signals" meta="Tenant-only activity">
            <EventList
              items={[
                { time: "11:32", title: "Passkey registered", sub: "Sarah Chen · identity event", tone: "cyan" },
                { time: "11:05", title: "Role review requested", sub: "Daniel Ross · awaiting owner action", tone: "amber" },
                { time: "10:42", title: "Audit-only membership examined", sub: "Olivia Reed · scope: Acme Corporation", tone: "cyan" },
                { time: "09:58", title: "Invitation awaiting acceptance", sub: "No email delivery confirmation", tone: "amber" },
              ]}
            />
            <p className="text-[10px] text-slate-500 mt-3">Authentication, permissions and data visibility must be verified on the backend—not inferred from these UI badges.</p>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
