"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Users, FileText, UserPlus, Lock, Mail, KeyRound, Clock, Eye, AlertTriangle } from "lucide-react";
import TeamConsole from "./console";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, EventList, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Member = {
  initials: string; name: string; email: string; role: string; status: "Active" | "Limited" | "Suspended";
  assurance: string; review: string; reviewTone: Tone; team: string; ref: string; privilege: string; lastAuth: string;
};

const TABS = [
  { id: "members", label: "Members" },
  { id: "invitations", label: "Invitations" },
  { id: "roles", label: "Roles & Permissions" },
  { id: "passkeys", label: "Passkeys & Authentication" },
  { id: "reviews", label: "Access Reviews" },
  { id: "audit", label: "Tenant Audit History" },
];

export default function TeamAccessPage() {
  const [demoState] = useDemoState();
  const [tab, setTab] = useState("members");
  const [query, setQuery] = useState("");
  const [dynamicMembers, setDynamicMembers] = useState<Member[]>([]);
  const [selectedRef, setSelectedRef] = useState<string>("");
  const show = useTabFilter(tab, "members");

  const orgName = demoState.tenant?.organizationName || "Sovereign Enterprise";
  const tenantSlug = demoState.tenant?.slug || "zoikoshield";
  const tenantDomain = `${tenantSlug}.com`;

  useEffect(() => {
    let cancelled = false;

    async function loadMembers() {
      try {
        const raw = await ZoikoShieldApiClient.listTenantMembers(demoState.tenant?.id || "demo-tenant");
        if (cancelled) return;

        if (Array.isArray(raw) && raw.length > 0) {
          const mapped: Member[] = raw.map((m: any, idx: number) => {
            const name = m.fullName || m.name || (m.email ? m.email.split("@")[0].replace(/[._]/g, " ") : `Operator ${idx + 1}`);
            const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "OP";
            const roleName = m.role || (m.roles && m.roles[0]?.name) || "SECURITY_ANALYST";
            const formattedRole = roleName.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
            return {
              initials,
              name,
              email: m.email || `${name.toLowerCase().replace(/\s+/g, ".")}@${tenantDomain}`,
              role: formattedRole,
              status: (m.status === "ACTIVE" || m.status === "Active" ? "Active" : m.status === "SUSPENDED" ? "Suspended" : "Limited") as "Active" | "Limited" | "Suspended",
              assurance: "Passkey (FIDO2)",
              review: "Current",
              reviewTone: "emerald" as Tone,
              team: formattedRole.includes("Owner") ? "Executive" : formattedRole.includes("Admin") ? "Platform" : "Security Operations",
              ref: m.id || `USR-${idx + 101}`,
              privilege: formattedRole,
              lastAuth: "Active session",
            };
          });

          // Ensure active session user is listed at top
          if (demoState.session?.email && !mapped.some((m) => m.email.toLowerCase() === demoState.session.email.toLowerCase())) {
            const sName = demoState.session.fullName || demoState.session.email.split("@")[0].replace(/[._]/g, " ");
            const sInitials = sName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "US";
            mapped.unshift({
              initials: sInitials,
              name: sName,
              email: demoState.session.email,
              role: demoState.session.role?.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Tenant Owner",
              status: "Active",
              assurance: "Passkey + Step-up",
              review: "Current",
              reviewTone: "emerald",
              team: "Executive",
              ref: demoState.session.userId || "USR-SESSION-001",
              privilege: demoState.session.role || "Tenant owner",
              lastAuth: "Current session",
            });
          }

          setDynamicMembers(mapped);
          if (mapped.length > 0 && !selectedRef) {
            setSelectedRef(mapped[0].ref);
          }
          return;
        }
      } catch {}

      // Fallback: build dynamically from current session and active tenant
      const sName = demoState.session?.fullName || "Security Administrator";
      const sEmail = demoState.session?.email || `admin@${tenantDomain}`;
      const sRole = demoState.session?.role || "TENANT_OWNER";
      const formattedRole = sRole.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      const sInitials = sName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "SA";

      const fallbackList: Member[] = [
        {
          initials: sInitials,
          name: sName,
          email: sEmail,
          role: formattedRole,
          status: "Active",
          assurance: "Passkey (FIDO2)",
          review: "Current",
          reviewTone: "emerald",
          team: "Executive",
          ref: demoState.session?.userId || "USR-001",
          privilege: sRole,
          lastAuth: "Active now",
        },
        {
          initials: "TA",
          name: "Tenant Admin Lead",
          email: `admin@${tenantDomain}`,
          role: "Tenant Admin",
          status: "Active",
          assurance: "Passkey",
          review: "Current",
          reviewTone: "emerald",
          team: "Platform",
          ref: "USR-002",
          privilege: "Tenant administration",
          lastAuth: "1 hour ago",
        },
        {
          initials: "SO",
          name: "Security Operations Analyst",
          email: `analyst@${tenantDomain}`,
          role: "Security Analyst",
          status: "Active",
          assurance: "Passkey",
          review: "Current",
          reviewTone: "emerald",
          team: "Security Operations",
          ref: "USR-003",
          privilege: "Case-scoped analyst",
          lastAuth: "2 hours ago",
        },
        {
          initials: "IR",
          name: "Incident Responder",
          email: `responder@${tenantDomain}`,
          role: "Incident Responder",
          status: "Active",
          assurance: "Passkey",
          review: "Current",
          reviewTone: "emerald",
          team: "Incident Response",
          ref: "USR-004",
          privilege: "Response proposals",
          lastAuth: "3 hours ago",
        },
        {
          initials: "CA",
          name: "Compliance Auditor",
          email: `auditor@${tenantDomain}`,
          role: "External Auditor",
          status: "Limited",
          assurance: "Passkey + expiry",
          review: "Current",
          reviewTone: "emerald",
          team: "External audit",
          ref: "USR-005",
          privilege: "Read-only audit scope",
          lastAuth: "Yesterday",
        },
      ];

      setDynamicMembers(fallbackList);
      if (!selectedRef) {
        setSelectedRef(fallbackList[0].ref);
      }
    }

    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [demoState.tenant?.id, demoState.tenant?.organizationName, demoState.tenant?.slug, demoState.session, tenantDomain, selectedRef]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? dynamicMembers.filter((m) => `${m.name} ${m.email} ${m.role}`.toLowerCase().includes(q))
      : dynamicMembers;
  }, [query, dynamicMembers]);

  const sel = dynamicMembers.find((m) => m.ref === selectedRef) ?? dynamicMembers[0] ?? {
    initials: "SO",
    name: "Security Operator",
    email: `operator@${tenantDomain}`,
    role: "Tenant Owner",
    status: "Active" as const,
    assurance: "Passkey",
    review: "Current",
    reviewTone: "emerald" as Tone,
    team: "Security",
    ref: "USR-001",
    privilege: "Tenant Owner",
    lastAuth: "Active now",
  };

  const activeMembersCount = dynamicMembers.filter((m) => m.status === "Active").length;
  const totalCount = dynamicMembers.length;
  const invitationsCount = demoState.invitations?.length || 0;

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
          title={`Tenant boundary: ${orgName}`}
          body="Only this tenant's users and membership grants are visible. Strict row-level isolation and zero-trust policies active."
          tag="Zero-Trust Boundary · Active RLS"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Active tenant members", value: String(activeMembersCount), hint: `${totalCount} total identities in roster`, tone: "cyan", icon: <Users className="w-3.5 h-3.5" /> },
            { label: "Passkeys registered", value: `${activeMembersCount} / ${totalCount}`, hint: "Phishing-resistant WebAuthn credentials", tone: "emerald", icon: <KeyRound className="w-3.5 h-3.5" /> },
            { label: "Pending invitations", value: String(invitationsCount), hint: "Dispatched role invites awaiting sign-in", tone: "amber", icon: <Mail className="w-3.5 h-3.5" /> },
            { label: "Access reviews due", value: "0", hint: "All identity authorizations current", tone: "purple", icon: <Clock className="w-3.5 h-3.5" /> },
            { label: "Support access grants", value: "0 ACTIVE", hint: "No standing support access · zero-trust", tone: "slate", icon: <Lock className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<TeamConsole />}
      consoleLabel="Live team console"
      footer={
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>ZoikoShield · Team &amp; Access · Cryptographic tenant isolation and WebAuthn governance</span>
          <span className="font-mono text-emerald-400 font-bold">SOVEREIGN CELL TELEMETRY · ACTIVE</span>
        </div>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("roles", "passkeys") && (
          <Panel title="Members & Role Assignments" meta={`${dynamicMembers.length} tenant identities · ${orgName}`} className="xl:col-span-2">
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
              <span>Showing {rows.length} of {dynamicMembers.length} tenant identities · Real-time identity governance</span>
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
                { k: "Tenant", v: orgName },
                { k: "Principal reference", v: sel.ref },
                { k: "Role", v: sel.role },
                { k: "Privilege level", v: sel.privilege },
                { k: "Passkey enrollment", v: "Registered (WebAuthn)", tone: "emerald" },
                { k: "Last authentication", v: sel.lastAuth },
                { k: "Platform administrator", v: sel.role.includes("Owner") ? "Tenant Scoped" : "Not authorized", tone: sel.role.includes("Owner") ? "blue" : "rose" },
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
          <Panel title="Invitations & Acceptance" meta={`${demoState.invitations?.length || 0} active invitations`}>
            {demoState.invitations && demoState.invitations.length > 0 ? (
              <EventList
                items={demoState.invitations.map((inv) => ({
                  title: inv.invitedEmail,
                  sub: `Assigned role: ${inv.assignedRole} · Created: ${new Date(inv.createdAt).toLocaleDateString()}`,
                  tag: inv.status,
                  tone: inv.status === "ACCEPTED" ? ("emerald" as Tone) : ("amber" as Tone),
                }))}
              />
            ) : (
              <EventList
                items={[
                  { title: `ops@${tenantDomain}`, sub: "Assigned role: Security Analyst · 7-day token", tag: "Pending", tone: "amber" },
                ]}
              />
            )}
            <p className="text-[10px] text-slate-500 mt-3">Invites are tenant-bound, single-use, email-matched and cryptographically signed.</p>
          </Panel>
        )}
        {show("reviews") && (
          <Panel title="Elevated Access & Reviews" meta="Owner authorization required">
            <EventList
              items={[
                { title: "AR-0062 · Temporary evidence export", sub: `Requester: ${sel.name} · stated purpose: compliance audit`, tag: "Approved", tone: "emerald" },
                { title: "AR-0064 · External auditor renewal", sub: `Scoped to: ${orgName} · read-only audit scope`, tag: "Active", tone: "cyan" },
              ]}
            />
            <p className="text-[10px] text-slate-500 mt-3">Sensitive role changes require server-side checks, a documented purpose, and an auditable decision.</p>
          </Panel>
        )}
        {show("audit", "passkeys") && (
          <Panel title="Identity & Audit Signals" meta="Tenant-only activity">
            <EventList
              items={[
                { time: "Current", title: "Passkey session verified", sub: `${demoState.session?.fullName || sel.name} · identity verified`, tone: "cyan" },
                { time: "Recent", title: "Role review verified", sub: `${orgName} · Zero-Trust policy gate operational`, tone: "emerald" },
                { time: "Recent", title: "Tenant boundary enforced", sub: `Scoped to: ${orgName}`, tone: "cyan" },
              ]}
            />
            <p className="text-[10px] text-slate-500 mt-3">Authentication, permissions and data visibility are cryptographically verified at the authorization layer.</p>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
