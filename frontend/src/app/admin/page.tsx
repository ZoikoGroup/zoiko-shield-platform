"use client";

import React, { useMemo, useState } from "react";
import { SlidersHorizontal, BookOpen, Plus, Lock, AlertOctagon } from "lucide-react";
import PlatformAdminConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, StepFlow, ProgressRow, EventList, CheckRow, FooterStrip, ActionButton,
  CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Entitlement = {
  id: string; capability: string; owner: string; source: string;
  state: "ENABLED" | "PENDING" | "RECONCILE" | "UNVERIFIED"; tag: string;
  scope: string; runtime: string; contract: string; impact: string;
};

// Illustrative register: every row is labelled as a sample in the UI and none
// of it is read back as a real entitlement decision.
const ENTITLEMENTS: Entitlement[] = [
  { id: "EN-101", capability: "Core detection & casework", owner: "Shield Core", source: "Enterprise demo", state: "ENABLED", tag: "REVIEWED", scope: "Tenant · demo", runtime: "Untested", contract: "Not verified", impact: "STANDARD" },
  { id: "EN-102", capability: "Threat Hunting Copilot", owner: "Threat Hunting", source: "Enterprise demo", state: "ENABLED", tag: "REVIEWED", scope: "Tenant · demo", runtime: "Untested", contract: "Not verified", impact: "STANDARD" },
  { id: "EN-103", capability: "AI Security Copilot", owner: "AI Services", source: "Enterprise demo", state: "ENABLED", tag: "REVIEWED", scope: "Tenant · demo", runtime: "Untested", contract: "Not verified", impact: "STANDARD" },
  { id: "EN-104", capability: "SOAR execution privileges", owner: "Response Broker", source: "Restricted", state: "PENDING", tag: "HIGH RISK", scope: "Unassigned · demo", runtime: "Untested", contract: "Not verified", impact: "HIGH IMPACT" },
  { id: "EN-105", capability: "Evidence export & verifier", owner: "Audit Services", source: "Enterprise demo", state: "ENABLED", tag: "REVIEWED", scope: "Tenant · demo", runtime: "Untested", contract: "Not verified", impact: "STANDARD" },
  { id: "EN-106", capability: "Data ingestion quota", owner: "Ingestion", source: "100 GB / day", state: "RECONCILE", tag: "QUOTA", scope: "Tenant · demo", runtime: "Untested", contract: "Not verified", impact: "MEDIUM" },
  { id: "EN-107", capability: "Regional retention policy", owner: "Evidence Vault", source: "90 days sample", state: "RECONCILE", tag: "POLICY", scope: "Region unspecified", runtime: "Untested", contract: "Not verified", impact: "MEDIUM" },
  { id: "EN-108", capability: "IR Retainer access", owner: "IR Services", source: "Contract-bound", state: "UNVERIFIED", tag: "CONTRACT", scope: "Contract-bound", runtime: "Untested", contract: "Not verified", impact: "MEDIUM" },
];

const STATE_TONE: Record<Entitlement["state"], Tone> = { ENABLED: "emerald", PENDING: "purple", RECONCILE: "amber", UNVERIFIED: "rose" };

const TABS = [
  { id: "register", label: "Entitlement register" },
  { id: "quota", label: "Quota & usage" },
  { id: "changes", label: "Change requests" },
  { id: "policy", label: "Policy evaluation" },
  { id: "audit", label: "Audit & reconciliation" },
];

export default function OperationsEntitlementsPage() {
  const [tab, setTab] = useState("register");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("EN-104");
  const show = useTabFilter(tab, "register");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ENTITLEMENTS.filter((e) => `${e.id} ${e.capability} ${e.owner} ${e.tag}`.toLowerCase().includes(q)) : ENTITLEMENTS;
  }, [query]);
  const selected = ENTITLEMENTS.find((e) => e.id === selectedId) ?? ENTITLEMENTS[0];
  const highRisk = selected.impact === "HIGH IMPACT";

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<SlidersHorizontal className="w-5 h-5" />}
          title="Operations & Entitlements"
          routeTag="/admin · OPERATOR"
          subtitle="Operator control plane · contract-bound capabilities, quota policy and governed change management"
          actions={
            <>
              <ActionButton onClick={() => setTab("policy")}><BookOpen className="w-3.5 h-3.5" /> View policy catalogue</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><Plus className="w-3.5 h-3.5" /> Draft change request</ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="cyan"
          title="Platform Operations Control Plane — Zero-Trust Entitlement & Capability Register"
          body="Cryptographic policy boundaries and contract authorizations active. All tenant privileges are enforced at the API gateway."
          tag="Platform Operations Active"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Active Entitlements", value: String(ENTITLEMENTS.length).padStart(2, "0"), tag: "Active", hint: "Verified platform capabilities", tone: "cyan" },
            { label: "Reconciliation flags", value: "03", tag: "Requires review", hint: "Commercial / quota / region", tone: "amber" },
            { label: "Pending change requests", value: "02", tag: "Pending Quorum", hint: "Awaiting authorized decision", tone: "purple" },
            { label: "Independent approvals", value: "0 / 2", tag: "Execution blocked", hint: "Selected high-risk SOAR privilege", tone: "rose" },
            { label: "Enforcement verification", value: "ENFORCED", tag: "Fail closed", hint: "Gateway policy verification active", tone: "emerald" },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<PlatformAdminConsole />}
      consoleLabel="Live admin console"
      footer={<FooterStrip left="ZoikoShield Sovereign Defense Platform · Real-time cryptographic tenant isolation and enforced policy boundaries." right="ZoikoShield v3.2 · Live Operations" />}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("register", "policy") && (
          <Panel title="Entitlement & Capability Register" meta="8 active entries · policy-derived access enforced" className="xl:col-span-2">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search capability, service, rule ID" />
              <Pill tone="amber">Sandbox read-only</Pill>
            </div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              selectedKey={selected.id}
              onSelect={(r) => setSelectedId(r.id)}
              columns={[
                { key: "id", header: "ID", render: (r) => <span className="font-mono text-slate-400">{r.id}</span> },
                { key: "cap", header: "Product capability", render: (r) => <span className="font-semibold text-slate-100">{r.capability}</span> },
                { key: "owner", header: "Service owner", render: (r) => r.owner },
                { key: "src", header: "Entitlement source*", render: (r) => r.source },
                { key: "state", header: "Mock state", render: (r) => <Pill tone={STATE_TONE[r.state]}>{r.state}</Pill> },
                { key: "tag", header: "Control tag", render: (r) => <span className="font-mono text-[10px] text-slate-400">{r.tag}</span> },
              ]}
            />
            <div className="flex flex-wrap justify-between gap-2 mt-3 text-[10px] text-slate-500">
              <span>* Scope values are UX examples, not the verified commercial contract.</span>
              <span className="font-mono font-bold text-emerald-400">NO CROSS-TENANT CONTENT</span>
            </div>
            <div className="mt-4 rounded-lg border border-[#162238] bg-[#080c16] p-3">
              <div className="flex justify-between text-xs mb-3">
                <span className="font-semibold text-slate-200">Entitlement Enforcement Path</span>
                <span className="text-[10px] text-slate-500">Proposed checks, not confirmed integration</span>
              </div>
              <StepFlow
                steps={[
                  { label: "Contract / plan", sub: "Source of truth", state: "pending" },
                  { label: "Entitlement rule", sub: "Effective version", state: "pending" },
                  { label: "Policy decision", sub: "Fail closed", state: "pending" },
                  { label: "Usage enforcement", sub: "Audit outcome", state: "pending" },
                ]}
              />
            </div>
          </Panel>
        )}

        <div className="space-y-4">
          {show("register", "policy") && (
            <Panel title={`Selected Entitlement: ${selected.capability}`} meta={`${selected.impact} · DRAFT ONLY`} metaTone={highRisk ? "rose" : "cyan"}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${highRisk ? "bg-rose-950/50 border-rose-500/40 text-rose-300" : "bg-cyan-950/40 border-cyan-500/40 text-cyan-300"}`}>
                    <AlertOctagon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-100">{selected.capability}</div>
                    <div className="text-[11px] text-slate-500">{selected.id} · {selected.tag} · No grant in effect</div>
                  </div>
                </div>
                <Pill tone={highRisk ? "rose" : STATE_TONE[selected.state]}>{highRisk ? "BLOCKED" : selected.state}</Pill>
              </div>
              <KeyValues
                items={[
                  { k: "Proposed capability", v: selected.owner },
                  { k: "Contract entitlement", v: selected.contract.toUpperCase(), tone: "amber" },
                  { k: "Tenant/region scope", v: selected.scope },
                  { k: "Runtime enforcement", v: selected.runtime.toUpperCase(), tone: "amber" },
                ]}
              />
              {highRisk && (
                <p className="mt-4 text-[11px] text-amber-200 border-l-2 border-amber-500 bg-amber-950/30 px-3 py-2 rounded">
                  The operator may prepare a request but cannot directly enable high-risk response privileges. Contract scope, authorized roles and independent signers must be validated.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <ActionButton onClick={() => setTab("policy")}>View policy &amp; evidence</ActionButton>
                <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>Create approval request</ActionButton>
              </div>
            </Panel>
          )}

          {show("changes") && (
            <Panel title="Change Approval & Activation Gate" meta="Separate principals required">
              <StepFlow
                steps={[
                  { label: "Draft", sub: "Prepared", state: "active" },
                  { label: "Commercial", sub: "Pending", state: "pending" },
                  { label: "Security", sub: "Pending", state: "pending" },
                  { label: "Activate", sub: "Blocked", state: "blocked" },
                ]}
              />
              <div className="flex justify-between text-[11px] mt-4 mb-3">
                <span className="font-semibold text-amber-300">0 / 2 independent approvals</span>
                <span className="text-slate-500">No activation token · No direct override</span>
              </div>
              <button type="button" disabled className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-rose-500/40 bg-rose-950/30 text-xs font-semibold text-rose-300 cursor-not-allowed">
                <Lock className="w-3.5 h-3.5" /> Apply entitlement change — disabled
              </button>
            </Panel>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("quota") && (
          <Panel title="Usage & Quota Policy" meta="Illustrative limits only">
            <div className="space-y-4">
              <ProgressRow label="Data ingestion" value={72} max={100} display="72 / 100 GB per day" tone="cyan" />
              <ProgressRow label="AI analysis requests" value={2800} max={5000} display="2,800 / 5,000" tone="purple" />
              <ProgressRow label="Evidence export" value={36} max={100} display="36 / 100 packages" tone="emerald" />
            </div>
            <p className="text-[11px] text-slate-500 mt-4">Soft / hard limit behavior must be validated against the entitlement-enforcement service.</p>
          </Panel>
        )}
        {show("audit") && (
          <Panel title="Reconciliation & Integration Gaps" meta="3 design-test issues" metaTone="amber">
            <CheckRow label="Overlapping commercial modules" sub="Confirm one authoritative entitlement source" status="Review" tone="amber" />
            <CheckRow label="Quota enforcement not tested" sub="Validate hard-stop and threshold behavior" status="Verify" tone="amber" />
            <CheckRow label="Region/retention scope unspecified" sub="Resolve contractual and policy precedence" status="Review" tone="amber" />
          </Panel>
        )}
        {show("changes", "audit") && (
          <Panel title="Governed Change / Audit Trail" meta="Simulated entries">
            <EventList
              items={[
                { title: "EN-104 change draft recorded", sub: "High-risk response execution · Operator", tag: "Demo", tone: "cyan" },
                { title: "Commercial reconciliation requested", sub: "Contract source not independently confirmed", tag: "Pending", tone: "amber" },
                { title: "Attempted activation prevented", sub: "Missing approval and enforceable scope", tag: "Blocked", tone: "rose" },
              ]}
            />
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
