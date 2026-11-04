"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  FileText,
  KeyRound,
  ShieldCheck,
  Users,
  Globe,
  Clock,
  Lock,
  Eye,
  FileCheck2,
  X,
  CheckCircle2,
} from "lucide-react";
import { useDemoState } from "@/lib/demo-state";
import { downloadFromApi } from "@/lib/export-utils";
import {
  WorkspacePage,
  PageHeader,
  NoticeBanner,
  KpiGrid,
  Panel,
  Pill,
  DataTable,
  SearchInput,
  KeyValues,
  EventList,
  CheckRow,
  ActionButton,
  useTabFilter,
  type Tone,
} from "@/components/mockup/kit";
import {
  CANONICAL_REGIONS,
  resolveRegionMetadata,
  G08_RETENTION_SCHEDULE,
} from "@/lib/assurance-primitives";

type Row = {
  name: string;
  role: string;
  auth: string;
  boundary: string;
  review: string;
  reviewTone: Tone;
  state: "ACTIVE" | "LIMITED";
};

const MEMBERS: Row[] = [
  {
    name: "Olivia Reed",
    role: "Tenant Owner",
    auth: "Passkey / step-up",
    boundary: "Acme only",
    review: "Current",
    reviewTone: "emerald",
    state: "ACTIVE",
  },
  {
    name: "Daniel Ross",
    role: "Tenant Administrator",
    auth: "Passkey",
    boundary: "Acme only",
    review: "Due",
    reviewTone: "amber",
    state: "ACTIVE",
  },
  {
    name: "Priya Nair",
    role: "Security Lead",
    auth: "Passkey / step-up",
    boundary: "Security data",
    review: "Current",
    reviewTone: "emerald",
    state: "ACTIVE",
  },
  {
    name: "Sarah Chen",
    role: "Security Analyst",
    auth: "Passkey",
    boundary: "Assigned cases",
    review: "Current",
    reviewTone: "emerald",
    state: "ACTIVE",
  },
  {
    name: "James Kim",
    role: "External Auditor",
    auth: "Passkey",
    boundary: "Read-only grant",
    review: "Expiring",
    reviewTone: "amber",
    state: "LIMITED",
  },
];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "profile", label: "Organization Profile" },
  { id: "residency", label: "Data Residency" },
  { id: "identity", label: "Identity & Access" },
  { id: "entitlements", label: "Service Entitlements" },
  { id: "audit", label: "Tenant Audit History" },
];

export default function TenantManagementPage() {
  const [state] = useDemoState();
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [boundaryDrawerOpen, setBoundaryDrawerOpen] = useState(false);
  const [regionChangeModalOpen, setRegionChangeModalOpen] = useState(false);
  const [requestedRegion, setRequestedRegion] = useState("eu-west-1");
  const [changeReason, setChangeReason] = useState("");
  const [changeRequestReceipt, setChangeRequestReceipt] = useState<
    string | null
  >(null);

  const show = useTabFilter(tab, "overview");
  const tenantName = state?.tenant?.organizationName || "Acme Corporation";
  const tenantRef = state?.tenant?.slug
    ? `DEMO-${state.tenant.slug.toUpperCase()}`
    : "DEMO-ACME-001";
  const currentRegionCode =
    state?.tenant?.dataResidencyRegion ||
    state?.tenant?.homeRegion ||
    "eu-west-2";
  const regionMeta = resolveRegionMetadata(currentRegionCode);

  const handleExportTenantAudit = async () => {
    setIsExporting(true);
    try {
      await downloadFromApi(
        "/api/v1/exports/data/audit?format=csv",
        "tenant-audit-history.csv",
        state?.tenant?.id
      );
    } catch (err) {
      console.error("Failed to export tenant audit:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSubmitRegionChangeRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const targetMeta = resolveRegionMetadata(requestedRegion);
    setChangeRequestReceipt(
      `RCR-${Date.now().toString(36).toUpperCase()} · Target: ${
        targetMeta.code
      } (${targetMeta.countryCode}) · Status: AWAITING_DUAL_APPROVAL`
    );
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? MEMBERS.filter((m) =>
          `${m.name} ${m.role} ${m.boundary}`.toLowerCase().includes(q)
        )
      : MEMBERS;
  }, [query]);

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Building2 className="w-5 h-5" />}
          title="Tenant Management"
          subtitle="Manage your organization's settings, data boundaries, retention schedules, entitlements and access governance (G02 & G08)."
          actions={
            <>
              <ActionButton onClick={() => setBoundaryDrawerOpen(true)}>
                <ShieldCheck className="w-3.5 h-3.5" /> Boundary Evidence
                (WF-G02-03)
              </ActionButton>
              <ActionButton onClick={() => setRegionChangeModalOpen(true)}>
                <Globe className="w-3.5 h-3.5" /> Request Region Change
                (WF-G02-04)
              </ActionButton>
              <ActionButton onClick={handleExportTenantAudit}>
                <FileText className="w-3.5 h-3.5" />{" "}
                {isExporting ? "Exporting..." : "Export tenant audit"}
              </ActionButton>
              <Link
                href="/team"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border bg-sky-600 hover:bg-sky-500 border-sky-500 text-white"
              >
                <KeyRound className="w-3.5 h-3.5" /> Review access requests
              </Link>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="cyan"
          icon={<ShieldCheck className="w-4 h-4" />}
          title="Tenant privacy boundary"
          body={`${tenantName} only · No cross-tenant browsing · Elevated support access denied by default`}
          tag="Design target · implementation unverified"
        />
      }
      kpis={
        <KpiGrid
          items={[
            {
              label: "Tenant state",
              value: "ACTIVE",
              hint: "Verified active organization state",
              tone: "emerald",
              icon: <Building2 className="w-3.5 h-3.5" />,
            },
            {
              label: "Tenant members",
              value: "24",
              hint: `Members within ${tenantName} only`,
              tone: "cyan",
              icon: <Users className="w-3.5 h-3.5" />,
            },
            {
              label: "Home data region",
              value: regionMeta.code.toUpperCase(),
              hint: `${regionMeta.shortLabel} (${regionMeta.countryCode}) residency enforcement`,
              tone: "blue",
              icon: <Globe className="w-3.5 h-3.5" />,
            },
            {
              label: "Access requests",
              value: "2",
              hint: "Pending owner or security review",
              tone: "amber",
              icon: <Clock className="w-3.5 h-3.5" />,
            },
            {
              label: "Support access grants",
              value: "0 ACTIVE",
              hint: "No standing support access — zero-trust",
              tone: "slate",
              icon: <Lock className="w-3.5 h-3.5" />,
            },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      footer={
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Zoiko Shield Inc. · Tenant Management (G02/G08)</span>
          <span className="text-emerald-400 font-semibold">
            Strict tenant boundary isolation &amp; KMS encryption verified
          </span>
        </div>
      }
    >
      {/* WF-G02-03 Role-Restricted Boundary Evidence Drawer */}
      {boundaryDrawerOpen && (
        <div className="mb-4 rounded-xl border border-cyan-500/40 bg-[#0b1628] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">
                Boundary Evidence Drawer (WF-G02-03) — {tenantName}
              </h3>
              <p className="text-xs text-slate-400">
                Signed BoundaryDecisionReceipt: BDR-{regionMeta.code.toUpperCase()}-20261031 · Profile: DEDICATED_DATA_NAMESPACE
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBoundaryDrawerOpen(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            {[
              ["Hot Events (Postgres RLS)", regionMeta.code, "ENFORCED"],
              ["Warm Analytics (ClickHouse)", regionMeta.code, "ENFORCED"],
              ["Cold Archive (WORM S3)", regionMeta.code, "ENFORCED"],
              ["Search Index (OpenSearch)", regionMeta.code, "ENFORCED"],
              ["Backups & WAL Snapshots", regionMeta.backupRegion, "ENFORCED"],
              ["KMS Key Custody", regionMeta.countryCode, "ENFORCED"],
              ["AI Retrieval Context", `${regionMeta.code} (No-Train)`, "ENFORCED"],
              ["Cross-Region Egress Gate", "BLOCKED_BY_DEFAULT", "ENFORCED"],
            ].map(([sys, loc, st]) => (
              <div
                key={sys}
                className="p-2.5 rounded-lg bg-surface border border-line space-y-1"
              >
                <div className="font-semibold text-slate-200">{sys}</div>
                <div className="text-[11px] font-mono text-cyan-300">{loc}</div>
                <div className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> {st}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WF-G02-04 Controlled Region Change Request Modal */}
      {regionChangeModalOpen && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-[#0b1628] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">
                Privileged Data Residency Change Request (WF-G02-04)
              </h3>
              <p className="text-xs text-slate-400">
                Direct in-place residency mutation is prohibited. Submitting creates an audited RegionChangeRequest requiring Tenant Owner + DPO approval.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRegionChangeModalOpen(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form
            onSubmit={handleSubmitRegionChangeRequest}
            className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
          >
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Target Residency Region
              </label>
              <select
                value={requestedRegion}
                onChange={(e) => setRequestedRegion(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line-strong text-xs text-slate-100"
              >
                {Object.values(CANONICAL_REGIONS).map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.displayName} ({r.countryCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Statutory / Business Justification
              </label>
              <input
                type="text"
                required
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="e.g., EU DORA localization mandate"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line-strong text-xs text-slate-100"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white"
            >
              Submit Region Change Request
            </button>
          </form>
          {changeRequestReceipt && (
            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-xs font-mono text-emerald-200">
              {changeRequestReceipt}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("profile", "residency") && (
          <Panel title="Organization Profile" meta="Tenant-scoped metadata ↗">
            <KeyValues
              items={[
                {
                  k: "Legal entity",
                  v: state?.tenant?.legalEntityName || `${tenantName} Ltd.`,
                },
                { k: "Tenant reference", v: tenantRef },
                {
                  k: "Verified domain",
                  v: state?.tenant?.slug
                    ? `${state.tenant.slug}.com`
                    : "zoikoshield.io",
                },
                { k: "Home jurisdiction", v: regionMeta.countryName },
                {
                  k: "Data residency",
                  v: `${regionMeta.code} · ${regionMeta.shortLabel}`,
                },
                { k: "Isolation profile", v: "DEDICATED_DATA_NAMESPACE" },
                { k: "Data classification", v: "Confidential" },
                { k: "Subscription", v: "Enterprise Tier" },
                { k: "Organization state", v: "Active", tone: "emerald" },
              ]}
            />
            <p className="mt-4 text-[11px] text-sky-200 border border-sky-500/30 bg-sky-950/30 rounded-lg p-2.5">
              <b>Data minimization:</b> Tenant owners see organization settings
              and memberships. Underlying employee security events, financial
              data and customer content require separately authorized workflows.
            </p>
          </Panel>
        )}
        {show("identity") && (
          <Panel
            title="Privacy & Privileged Access"
            meta="Least privilege · Four-eyes governance"
          >
            <CheckRow
              label="Platform support visibility"
              sub="No standing tenant-content privileges"
              status="Denied by default"
              tone="emerald"
            />
            <CheckRow
              label="Temporary elevation"
              sub="Tenant consent · 2 independent signers · step-up"
              status="Approval required"
              tone="amber"
            />
            <CheckRow
              label="Access audit & expiry"
              sub="Purpose bound · time-limited · recorded"
              status="Control design"
              tone="blue"
            />
            <p className="text-[10px] text-slate-500 mt-3">
              Shown as required security design, not as verification that
              backend access controls are already deployed.
            </p>
          </Panel>
        )}
        {show("identity", "entitlements") && (
          <Panel title="Tenant Security Snapshot" meta="Illustrative">
            <div className="space-y-2 text-xs">
              {[
                ["Passkeys enrolled", "21 / 24"],
                ["Privileged role assignments", "3"],
                ["Access reviews pending", "2"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between border-b border-line pb-2"
                >
                  <span className="text-slate-400">{k}</span>
                  <span className="font-semibold text-slate-100">{v}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span className="text-slate-400">Evidence proof state</span>
                <span className="font-semibold text-amber-300">Unverified</span>
              </div>
            </div>
            <p className="mt-4 text-[11px] text-cyan-200 border border-cyan-500/30 bg-cyan-950/30 rounded-lg p-2.5">
              Never equate valid authentication or evidence hashes with
              certification or full tenant safety.
            </p>
          </Panel>
        )}
      </div>

      {/* WF-G08-02: 7-Class Data Retention & Storage Schedule Matrix */}
      {show("residency", "entitlements") && (
        <Panel
          title="7-Class Data Retention & Deletion Schedule (WF-G08-02)"
          meta="Enforced per-class hot/warm/cold windows & crypto-shred disposition"
        >
          <DataTable
            rows={G08_RETENTION_SCHEDULE}
            rowKey={(r) => r.dataClass}
            columns={[
              {
                key: "cls",
                header: "Data Class",
                render: (r) => (
                  <span className="font-semibold text-slate-100">
                    {r.label}
                  </span>
                ),
              },
              {
                key: "hot",
                header: "Hot Tier",
                render: (r) => `${r.hotDays} days`,
              },
              {
                key: "warm",
                header: "Warm Tier",
                render: (r) => `${r.warmDays} days`,
              },
              {
                key: "cold",
                header: "Cold Archive",
                render: (r) => `${r.coldArchiveDays} days`,
              },
              {
                key: "disp",
                header: "Expiry Disposition",
                render: (r) => (
                  <Pill
                    tone={
                      r.deletionDisposition === "APPEND_ONLY_WORM"
                        ? "cyan"
                        : "emerald"
                    }
                  >
                    {r.deletionDisposition}
                  </Pill>
                ),
              },
              {
                key: "hold",
                header: "Legal Hold Scope",
                render: (r) => (
                  <Pill tone={r.legalHoldEligible ? "amber" : "slate"}>
                    {r.legalHoldEligible ? "HOLD_ELIGIBLE" : "EXEMPT"}
                  </Pill>
                ),
              },
            ]}
          />
        </Panel>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {show("identity") && (
          <Panel
            title="Members & Role Assignments"
            meta="24 members · Current tenant only"
            className="xl:col-span-3"
          >
            <div className="mb-3">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search tenant members, role or identity"
              />
            </div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.name}
              columns={[
                {
                  key: "n",
                  header: "Member",
                  render: (r) => (
                    <span className="font-semibold text-slate-100">
                      {r.name}
                    </span>
                  ),
                },
                { key: "r", header: "Assigned role", render: (r) => r.role },
                { key: "a", header: "Auth assurance", render: (r) => r.auth },
                {
                  key: "b",
                  header: "Access boundary",
                  render: (r) => r.boundary,
                },
                {
                  key: "rv",
                  header: "Review status",
                  render: (r) => <Pill tone={r.reviewTone}>{r.review}</Pill>,
                },
                {
                  key: "s",
                  header: "State",
                  render: (r) => (
                    <Pill tone={r.state === "ACTIVE" ? "emerald" : "blue"}>
                      {r.state}
                    </Pill>
                  ),
                },
              ]}
            />
            <div className="flex justify-between text-[11px] text-slate-500 mt-3">
              <span>
                Showing {rows.length} of 24 demo members · Platform roles cannot
                be granted by tenant invitation
              </span>
              <Link href="/team" className="text-sky-300 hover:underline">
                View members &amp; access →
              </Link>
            </div>
          </Panel>
        )}
        {show("audit") && (
          <Panel
            title="Access Requests & Tenant Audit"
            meta="Owner review required"
            className="xl:col-span-2"
          >
            <EventList
              items={[
                {
                  title: "SUP-0042 · Restricted support diagnostic",
                  sub: "Metadata-only request · ticket + purpose + explicit tenant consent",
                  tag: "Owner pending",
                  tone: "amber",
                },
                {
                  title: "INV-0074 · Security reviewer invitation",
                  sub: "Tenant-scoped membership · role authorization required",
                  tag: "In review",
                  tone: "amber",
                },
                {
                  time: "13:42",
                  title: "Organization role review requested",
                  sub: "Olivia Reed · audit event EV-1042",
                  tone: "cyan",
                },
                {
                  time: "13:21",
                  title: "Support access request created; no access granted",
                  sub: "System · audit event EV-1041",
                  tone: "cyan",
                },
                {
                  time: "12:08",
                  title: "Residency configuration inspected",
                  sub: "Daniel Ross · audit event EV-1039",
                  tone: "cyan",
                },
              ]}
            />
            <div className="flex gap-2 mt-4">
              <Link
                href="/audit"
                className="inline-flex items-center gap-1.5 text-[11px] text-sky-300 hover:underline"
              >
                <FileCheck2 className="w-3.5 h-3.5" /> Open audit &amp; verifier
              </Link>
              <Link
                href="/team"
                className="inline-flex items-center gap-1.5 text-[11px] text-sky-300 hover:underline ml-auto"
              >
                <Eye className="w-3.5 h-3.5" /> Team &amp; access
              </Link>
            </div>
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
