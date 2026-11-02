"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Download, ScanLine, ShieldCheck, Clock, AlertTriangle, Lock, CheckCircle2, KeyRound, Terminal } from "lucide-react";
import AuditConsole from "./console";
import { downloadFromApi } from "@/lib/export-utils";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, EventList, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";
import type { ProofDimensionStatus, EvidenceReasonCode } from "@/lib/assurance-primitives";

type Pkg = {
  id: string;
  contents: string;
  created: string;
  proof: "Proof valid" | "Review due" | "Proof mismatch" | "Not checked";
  records: number;
  case: string;
  dimensions: {
    integrity: ProofDimensionStatus;
    authenticity: ProofDimensionStatus;
    completeness: ProofDimensionStatus;
    custody: ProofDimensionStatus;
  };
  reasonCode: EvidenceReasonCode;
  signingKeyId: string;
  tsaSerial: string;
};

const PACKAGES: Pkg[] = [
  {
    id: "ZS-AUD-2614",
    contents: "Identity incident evidence",
    created: "14 Oct · 12:26",
    proof: "Proof valid",
    records: 18,
    case: "C-1028",
    dimensions: { integrity: "PASS", authenticity: "PASS", completeness: "PASS", custody: "PASS" },
    reasonCode: "EVD-NONE",
    signingKeyId: "zs-kms-ed25519-eu-west-1-v4",
    tsaSerial: "RFC3161-TSA-8849201",
  },
  {
    id: "ZS-AUD-2613",
    contents: "Detection rule change",
    created: "14 Oct · 10:18",
    proof: "Review due",
    records: 7,
    case: "CHG-0412",
    dimensions: { integrity: "PASS", authenticity: "PASS", completeness: "INDETERMINATE", custody: "PASS" },
    reasonCode: "EVD-COV",
    signingKeyId: "zs-kms-ed25519-eu-west-1-v4",
    tsaSerial: "RFC3161-TSA-8848910",
  },
  {
    id: "ZS-AUD-2612",
    contents: "SOC shift handover",
    created: "13 Oct · 22:05",
    proof: "Proof valid",
    records: 11,
    case: "SHIFT-1013",
    dimensions: { integrity: "PASS", authenticity: "PASS", completeness: "PASS", custody: "PASS" },
    reasonCode: "EVD-NONE",
    signingKeyId: "zs-kms-ed25519-eu-west-1-v4",
    tsaSerial: "RFC3161-TSA-8847104",
  },
  {
    id: "ZS-AUD-2611",
    contents: "Connector configuration",
    created: "13 Oct · 18:42",
    proof: "Proof mismatch",
    records: 5,
    case: "CONN-009",
    dimensions: { integrity: "FAIL", authenticity: "PASS", completeness: "PASS", custody: "PASS" },
    reasonCode: "EVD-HSH",
    signingKeyId: "zs-kms-ed25519-eu-west-1-v3",
    tsaSerial: "RFC3161-TSA-8846002",
  },
  {
    id: "ZS-AUD-2610",
    contents: "SOAR approval decisions",
    created: "12 Oct · 16:07",
    proof: "Not checked",
    records: 9,
    case: "ACT-0187",
    dimensions: { integrity: "INDETERMINATE", authenticity: "INDETERMINATE", completeness: "INDETERMINATE", custody: "PASS" },
    reasonCode: "EVD-TSA",
    signingKeyId: "zs-kms-ed25519-eu-west-1-v3",
    tsaSerial: "PENDING-VERIFICATION",
  },
];
const PROOF_TONE: Record<Pkg["proof"], Tone> = { "Proof valid": "emerald", "Review due": "amber", "Proof mismatch": "rose", "Not checked": "blue" };
const DIM_TONE: Record<ProofDimensionStatus, Tone> = { PASS: "emerald", FAIL: "rose", INDETERMINATE: "amber", ERROR: "rose" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "packages", label: "Audit packages" },
  { id: "chain", label: "Evidence chain" },
  { id: "offline", label: "Offline verification" },
  { id: "auditor", label: "Auditor Workspace" },
  { id: "trail", label: "Audit trail" },
];

export default function AuditVerifierPage() {
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(PACKAGES[0].id);
  const [isExporting, setIsExporting] = useState(false);
  const show = useTabFilter(tab, "overview");

  const handleExportProof = async () => {
    setIsExporting(true);
    try {
      await downloadFromApi("/api/v1/exports/data/audit?format=csv", "audit-proof-package.csv");
    } catch (err) {
      console.error("Failed to export audit package:", err);
    } finally {
      setIsExporting(false);
    }
  };
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? PACKAGES.filter((p) => `${p.id} ${p.contents} ${p.case}`.toLowerCase().includes(q)) : PACKAGES;
  }, [query]);
  const sel = PACKAGES.find((p) => p.id === selectedId) ?? PACKAGES[0];
  const valid = sel.proof === "Proof valid";

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<FileText className="w-5 h-5" />}
          eyebrow="Assurance / Independent verification · G06"
          title="Audit & Verifier"
          subtitle="Inspect sealed audit packages, validate 4-dimensional evidence integrity, and prepare independently verifiable records."
          actions={
            <>
              <ActionButton onClick={() => setTab("offline")}><Download className="w-3.5 h-3.5" /> Offline verifier guide</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><ScanLine className="w-3.5 h-3.5" /> Verify proof</ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="cyan"
          icon={<ShieldCheck className="w-4 h-4" />}
          title="Cryptographic Evidence Verification Engine"
          body="Audit packages cryptographically sealed with Ed25519 / ECDSA P-256 signatures, RFC 3161 timestamps, and independent Merkle tree inclusion proofs. Continuous 4-dimension verification active across all tenant records."
          tag="Evidence Pipeline Active"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Sealed audit packages", value: "12", hint: "3 prepared in the selected period", tone: "blue", icon: <FileText className="w-3.5 h-3.5" /> },
            { label: "Proof checks completed", value: "128", hint: "Continuous cryptographic verification", tone: "emerald", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
            { label: "Packages awaiting review", value: "3", hint: "Human assurance review required", tone: "amber", icon: <Clock className="w-3.5 h-3.5" /> },
            { label: "Integrity exceptions", value: "1", hint: "Investigate before disclosure", tone: "rose", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<AuditConsole />}
      consoleLabel="Live package export & verifier"
      footer={<div className="flex justify-between text-[10px] text-slate-500"><span>ZoikoShield · Audit &amp; Verifier · Cryptographic Merkle Ledger</span><span>Sovereign Cell Telemetry · Zero-Trust Evidence Verification Active</span></div>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {show("packages", "chain") && (
          <Panel title="Audit package register" meta="View all packages →" className="xl:col-span-3">
            <div className="text-[11px] text-slate-500 -mt-1 mb-3">Searchable, tenant-scoped packages · immutable identifiers · 4-dimension proof vectors (WF-G06-02)</div>
            <div className="mb-3"><SearchInput value={query} onChange={setQuery} placeholder="Search ID, case, or evidence" /></div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              selectedKey={sel.id}
              onSelect={(r) => setSelectedId(r.id)}
              columns={[
                { key: "id", header: "Package ID", render: (r) => <span className="font-mono font-semibold text-sky-300">{r.id}</span> },
                { key: "c", header: "Contents / scope", render: (r) => r.contents },
                { key: "t", header: "Created (UTC)", render: (r) => <span className="font-mono">{r.created}</span> },
                { key: "p", header: "Proof status", render: (r) => <Pill tone={PROOF_TONE[r.proof]}>{r.proof}</Pill> },
                { key: "rc", header: "Reason Code", render: (r) => <span className="font-mono text-[10px] text-slate-300">{r.reasonCode}</span> },
                { key: "a", header: "Action", render: (r) => <span className="text-sky-300">{r.proof === "Proof mismatch" ? "Investigate →" : r.proof === "Not checked" ? "Verify proof →" : "Inspect package →"}</span> },
              ]}
            />
          </Panel>
        )}
        {show("offline", "packages") && (
          <Panel title={`Selected package · ${sel.contents}`} meta={sel.reasonCode} className="xl:col-span-2">
            <div className="text-[11px] text-slate-500 -mt-1 mb-3">{sel.id} · Case {sel.case} · Read-only</div>
            <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${valid ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200" : "border-amber-500/40 bg-amber-950/30 text-amber-200"}`}>
              <span className="flex items-center gap-2">{valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{valid ? "Inclusion proof valid in verified Merkle run" : `${sel.proof} — verification pending (${sel.reasonCode})`}</span>
              {valid && <span className="font-mono">12:31 UTC</span>}
            </div>

            {/* WF-G06-02: 4 Mandatory Independent Proof Dimensions */}
            <div className="mt-3 rounded-lg border border-line bg-slate-950/80 p-3 space-y-2">
              <div className="text-[10px] font-mono uppercase text-cyan-400 font-bold">
                WF-G06-02 · 4-Dimension Verification Vector
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400">1. INTEGRITY</span>
                  <Pill tone={DIM_TONE[sel.dimensions.integrity]}>{sel.dimensions.integrity}</Pill>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400">2. AUTHENTICITY</span>
                  <Pill tone={DIM_TONE[sel.dimensions.authenticity]}>{sel.dimensions.authenticity}</Pill>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400">3. COMPLETENESS</span>
                  <Pill tone={DIM_TONE[sel.dimensions.completeness]}>{sel.dimensions.completeness}</Pill>
                </div>
                <div className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400">4. CUSTODY</span>
                  <Pill tone={DIM_TONE[sel.dimensions.custody]}>{sel.dimensions.custody}</Pill>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-lg border border-line p-2.5"><div className="text-[10px] text-slate-500">Evidence records</div><div className="text-xs font-semibold text-slate-100">{sel.records} · sealed snapshot</div></div>
              <div className="rounded-lg border border-line p-2.5"><div className="text-[10px] text-slate-500">Verifier profile</div><div className="text-xs font-semibold text-slate-100">ZS-MERKLE-V1</div></div>
            </div>
            <div className="mt-3 rounded-lg border border-line bg-surface p-3 font-mono text-[11px] space-y-1">
              {[
                ["Merkle epoch", "#1043 · active ledger"],
                ["Root hash", "SHA-256: 9bc7…e41f"],
                ["Signing key ID (WF-G06-04)", sel.signingKeyId],
                ["Timestamp receipt", `RFC 3161 · ${sel.tsaSerial}`],
                ["Offline verifier", "verifier-cli · exit 0/2/3/4"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span className="text-slate-200">{v}</span></div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">Integrity confirms that the submitted bytes match the recorded proof. Review provenance, completeness, and access scope separately.</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><ScanLine className="w-3.5 h-3.5" /> Run verification</ActionButton>
              <ActionButton onClick={handleExportProof}><Download className="w-3.5 h-3.5" /> {isExporting ? "Exporting..." : "Export proof package"}</ActionButton>
            </div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {show("chain", "trail") && (
          <Panel title="Evidence and audit trail" meta="View immutable trail →" className="xl:col-span-3">
            <div className="text-[11px] text-slate-500 -mt-1 mb-3">Traceable verification events · selected tenant</div>
            <EventList
              items={[
                { time: "12:31", title: "Proof inclusion verified · ZS-AUD-2614", sub: "Independent recomputation matched the verified anchor root (EVD-NONE)", tag: "Verified", tone: "emerald" },
                { time: "12:26", title: "Audit package sealed · Identity incident evidence", sub: "Snapshot frozen · 18 records · initiated by an authorized principal", tag: "Sealed", tone: "blue" },
                { time: "10:18", title: "Control-change package awaiting review", sub: "Evidence scope and authorization review not yet completed (EVD-COV)", tag: "Pending", tone: "amber" },
                { time: "Yday", title: "Connector package integrity mismatch", sub: "Verification failed (EVD-HSH) — excluded from verified exports pending investigation", tag: "Exception", tone: "rose" },
              ]}
            />
          </Panel>
        )}
        {show("auditor") && (
          <Panel title="External auditor access" meta="NOT SHARED" metaTone="amber" className="xl:col-span-2">
            <div className="text-[11px] text-slate-500 -mt-1 mb-3">Independent review · least-privilege boundary</div>
            <div className="flex items-start gap-3">
              <Lock className="w-6 h-6 text-slate-300 shrink-0" />
              <div>
                <div className="text-sm font-bold text-slate-100">Read-only Auditor Workspace</div>
                <p className="text-[11px] text-slate-400 mt-1">Grant only the authorized evidence package, with a defined purpose, expiration, and logged access. No tenant-wide visibility by default.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {["Named auditor identity", "Scope-limited evidence", "Expiring access", "Offline verification"].map((t) => <Pill key={t} tone="slate">{t}</Pill>)}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">An auditor may verify an exported package independently without relying on ZoikoShield&apos;s online systems.</p>
            <div className="flex gap-2 mt-3">
              <Link href="/auditor" className="px-3 py-2 rounded-lg border border-sky-500/50 bg-sky-950/40 text-xs font-semibold text-sky-200 hover:bg-sky-900/50">View auditor requirements</Link>
              <ActionButton disabled><Lock className="w-3.5 h-3.5" /> Request grant · admin role</ActionButton>
            </div>
          </Panel>
        )}
      </div>

      {/* WF-G06-03 & WF-G06-04: Air-Gapped CLI Verifier Contract & Key Rotation History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Air-Gapped Offline Verifier Contract (WF-G06-03)" meta="verifier-cli · Zero Network Calls">
          <div className="flex items-center gap-2 text-xs text-cyan-300 font-mono mb-2">
            <Terminal className="w-4 h-4" />
            <span>zoikoshield-verifier verify --bundle ZS-AUD-2614.tar.gz --trust-bundle trust-roots.json</span>
          </div>
          <KeyValues
            cols={2}
            items={[
              { k: "Exit Code 0 (PASS)", v: "All 4 dimensions verified offline", tone: "emerald" },
              { k: "Exit Code 2 (FAIL)", v: "Hash, Merkle, or signature mismatch", tone: "rose" },
              { k: "Exit Code 3 (INDETERMINATE)", v: "Missing TSA root or gap in watermark", tone: "amber" },
              { k: "Exit Code 4 (ERROR)", v: "Malformed archive or schema error", tone: "rose" },
            ]}
          />
        </Panel>

        <Panel title="Signer & RFC 3161 TSA Key Rotation History (WF-G06-04)" meta="Key Continuity & Revocation Transparency">
          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between p-2 rounded border border-emerald-500/30 bg-emerald-950/15">
              <span className="flex items-center gap-1.5 text-emerald-300"><KeyRound className="w-3.5 h-3.5" /> zs-kms-ed25519-eu-west-1-v4</span>
              <span className="text-slate-300">Active (Epoch #1020–Present)</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-900/60">
              <span className="flex items-center gap-1.5 text-slate-300"><KeyRound className="w-3.5 h-3.5" /> zs-kms-ed25519-eu-west-1-v3</span>
              <span className="text-slate-400">Rotated Cleanly (Epoch #0800–#1019) · Valid for historical proofs</span>
            </div>
          </div>
        </Panel>
      </div>

      {tab === "offline" && (
        <Panel title="Offline verification" meta="verifier-cli">
          <KeyValues
            cols={3}
            items={[
              { k: "1 · Export", v: "Download the sealed package and its proof bundle" },
              { k: "2 · Verify", v: "Run verifier-cli against the bundle on an isolated host" },
              { k: "3 · Compare", v: "Match the recomputed root to the anchored epoch root" },
            ]}
          />
        </Panel>
      )}
    </WorkspacePage>
  );
}
