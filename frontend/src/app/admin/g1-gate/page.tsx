"use client";

import React, { useState } from "react";
import { Lock, FileText, Download, FileSearch } from "lucide-react";
import G1GateConsole from "./console";
import { downloadCsvFile } from "@/lib/export-utils";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, NumberedList,
  ProgressRow, CheckRow, KeyValues, ActionButton, FooterStrip, CONSOLE_TAB, useTabFilter,
} from "@/components/mockup/kit";

const ROSTER = [
  { n: "01", role: "CISO", remit: "Security risk and control posture" },
  { n: "02", role: "DPO", remit: "Privacy, residency and data protection" },
  { n: "03", role: "VP Engineering", remit: "Release integrity and engineering sign-off" },
  { n: "04", role: "AI Risk Lead", remit: "AI safety and model governance" },
  { n: "05", role: "QA Lead", remit: "Test evidence and regression coverage" },
  { n: "06", role: "SRE Lead", remit: "Operational readiness and recovery" },
  { n: "07", role: "Product Lead", remit: "Product acceptance and release scope" },
  { n: "08", role: "SOC Lead", remit: "Detection and response operations" },
];

const TABS = [
  { id: "roster", label: "Ratification Roster" },
  { id: "evidence", label: "Release Evidence" },
  { id: "history", label: "Approval History" },
  { id: "preconditions", label: "Launch Preconditions" },
  { id: "exceptions", label: "Governance Exceptions" },
];

export default function G1LaunchGatePage() {
  const [tab, setTab] = useState("roster");
  const show = useTabFilter(tab, "roster");
  // The demo snapshot carries no verified signatures; ratification is read from
  // the governance roster in the live console, never inferred here.
  const signed = 0;

  const handleExportDemonstrationReport = () => {
    downloadCsvFile(
      ["Signer Number", "Executive Role", "Remit Area", "Ratification Status"],
      ROSTER.map((signer) => [signer.n, signer.role, signer.remit, "PENDING_RATIFICATION"]),
      "g1-launch-gate-protocol-report.csv"
    );
  };

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Lock className="w-5 h-5" />}
          title="G1 Launch Gate Protocol"
          routeTag="/admin/g1-gate"
          subtitle="Eight-signer ratification cockpit · authorized executive approvals before any production promotion"
          actions={
            <>
              <ActionButton onClick={() => setTab("preconditions")}><FileText className="w-3.5 h-3.5" /> Review protocol</ActionButton>
              <ActionButton primary onClick={handleExportDemonstrationReport}><Download className="w-3.5 h-3.5" /> Export demonstration report</ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="rose"
          icon={<Lock className="w-4 h-4" />}
          title="Production promotion blocked — G1 not ratified"
          body="Example state: no verified signatures recorded; launch controls must fail closed until all eight authorized roles sign the same release decision."
          tag="Multi-Signer Governance Gate"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Required approvals", value: `${signed} / 8`, tag: "0% ratified", hint: "Distinct authorized executive signers", tone: "rose" },
            { label: "Release gate", value: "BLOCKED", tag: "Fail closed", hint: "Production promotion disabled", tone: "amber" },
            { label: "Approval roster", value: "8", tag: "Source defined", hint: "Mandatory governance roles", tone: "cyan" },
            { label: "Release artifact", value: "UNBOUND", tag: "Review required", hint: "No verified digest selected", tone: "purple" },
            { label: "Verified evidence", value: "UNKNOWN", tag: "Not assessed", hint: "Do not infer readiness from UI", tone: "amber" },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<G1GateConsole />}
      consoleLabel="Live ratification console"
      footer={<FooterStrip tone="amber" left="G1 Multi-Signer Launch Gate · Cryptographic quorum required across eight executive domains before release promotion." right="Zero-Trust Enforcement Active" />}
    >
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {show("roster") && (
          <Panel title="Eight-Domain Executive Sign-Off Roster" meta={`${signed} / 8 verified signatures`} className="xl:col-span-3">
            <DataTable
              rows={ROSTER}
              rowKey={(r) => r.n}
              columns={[
                { key: "role", header: "Required role", render: (r) => <span><span className="font-mono text-slate-500 mr-2">{r.n}</span><span className="font-semibold text-slate-100">{r.role}</span></span> },
                { key: "remit", header: "Review remit*", render: (r) => r.remit },
                { key: "state", header: "Gate state", render: () => <Pill tone="amber">Not signed</Pill> },
                { key: "sig", header: "Signature proof", render: () => <span className="text-slate-500">No signature</span> },
                { key: "act", header: "Action", render: () => <button type="button" onClick={() => setTab(CONSOLE_TAB)} className="text-sky-300 hover:underline">Review →</button> },
              ]}
            />
          </Panel>
        )}
        {show("preconditions", "evidence") && (
          <Panel title="Gate Decision & Release Controls" meta="Platform-only · read-only demo" className="xl:col-span-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-rose-500/40 bg-rose-950/30 mb-4">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-rose-300" />
                <div>
                  <div className="text-sm font-bold text-slate-100">Launch authorization unavailable</div>
                  <div className="text-[11px] text-slate-400">Approval progress — illustrative, not live</div>
                </div>
              </div>
              <Pill tone="rose">Gate closed</Pill>
            </div>
            <ProgressRow label={`${signed} of 8 signed decisions`} value={signed} max={8} display={`${Math.round((signed / 8) * 100)}% ratification`} tone="rose" />
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3">
              <div className="text-xs font-bold text-slate-200 mb-2">Blocking requirements</div>
              <CheckRow label="Eight distinct executive approvals must be evidenced" status={`${signed} / 8`} tone="rose" />
              <CheckRow label="Signed release artifact not selected or verified" status="Unknown" tone="rose" />
              <CheckRow label="Roster provenance not independently confirmed" status="Review" tone="amber" />
              <CheckRow label="Production readiness cannot be inferred from demo data" status="Unverified" tone="amber" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <ActionButton disabled><Lock className="w-3.5 h-3.5" /> Promote to production · Disabled</ActionButton>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}><FileSearch className="w-3.5 h-3.5" /> Inspect sign-off evidence</ActionButton>
            </div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("preconditions") && (
          <Panel title="Approval Control Sequence" meta="Target UX safeguards">
            <NumberedList
              items={[
                { title: "Role-bound authentication", sub: "Executive identity + required step-up", tag: "Pending", tone: "amber" },
                { title: "Release-context binding", sub: "Signature must reference specific release digest", tag: "Pending", tone: "amber" },
                { title: "Independent ratification", sub: "All eight distinct, eligible signers", tag: "Pending", tone: "amber" },
                { title: "Auditable decision event", sub: "Evidence retained; no silent override", tag: "Pending", tone: "amber" },
              ]}
            />
          </Panel>
        )}
        {show("history", "evidence") && (
          <Panel title="Governance Evidence & History" meta="Inspect audit log →">
            <div className="rounded-lg border border-line bg-surface p-3 mb-3">
              <div className="text-xs font-semibold text-slate-200">No approval events in this demo snapshot</div>
              <div className="text-[11px] text-slate-500">Verified signatures must be read from the governance roster.</div>
            </div>
            <KeyValues
              cols={1}
              items={[
                { k: "Document of record", v: "docs/g1-gate-signoff-roster.md", tone: "rose" },
                { k: "Signature action", v: "/governance/g1-roster/sign", tone: "rose" },
                { k: "Gate promotion decision", v: "BLOCKED · DEMO" },
              ]}
            />
          </Panel>
        )}
        {show("exceptions") && (
          <Panel title="Engineering Hardening Checks" meta="Known reference gaps">
            <CheckRow label="Durable dual-custody quorum" sub="Reference audit identifies an in-memory approval store; persistence needs verification." status="Open" tone="amber" />
            <CheckRow label="Secret and signing key governance" sub="Remove hard-coded quorum key fallbacks before production release." status="Open" tone="amber" />
            <CheckRow label="Measured platform readiness" sub="Replace static TrustBar badges with authoritative service health before ratification." status="Open" tone="amber" />
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
