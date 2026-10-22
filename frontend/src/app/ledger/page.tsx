"use client";

import React, { useMemo, useState } from "react";
import { ShieldCheck, Download, Search, Check, AlertTriangle, Copy } from "lucide-react";
import LedgerConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, EventList, CheckRow, ProgressRow, ActionButton, CONSOLE_TAB, type Tone,
} from "@/components/mockup/kit";

type Ev = {
  id: string; record: string; control: string; source: string;
  freshness: "Stale" | "Current" | "Missing" | "Due soon"; proof: "Available" | "Unchecked" | "No proof";
  owner: string; collected: string; limit: string; action: string;
};

const EVIDENCE: Ev[] = [
  { id: "EV-1842", record: "Q3 access review", control: "A.5.18", source: "Okta", freshness: "Stale", proof: "Available", owner: "Identity & Access Team", collected: "30 Sep 2026", limit: "7 days · exceeded", action: "Review" },
  { id: "EV-1838", record: "Privileged role changes", control: "CC6.3", source: "Entra ID", freshness: "Current", proof: "Unchecked", owner: "Identity & Access Team", collected: "14 Oct 2026", limit: "7 days", action: "Verify" },
  { id: "EV-1837", record: "Endpoint sensor coverage", control: "PR.PS", source: "EDR", freshness: "Missing", proof: "No proof", owner: "Endpoint Engineering", collected: "—", limit: "1 day · missing", action: "Investigate" },
  { id: "EV-1830", record: "Firewall change trail", control: "CC7.2", source: "Cloud logs", freshness: "Current", proof: "Available", owner: "Network Operations", collected: "14 Oct 2026", limit: "1 day", action: "View" },
  { id: "EV-1822", record: "Backup recovery exercise", control: "A.8.13", source: "Backup", freshness: "Due soon", proof: "Available", owner: "SRE", collected: "16 Jul 2026", limit: "90 days", action: "Review" },
  { id: "EV-1817", record: "Processing records", control: "Art. 30", source: "Internal", freshness: "Stale", proof: "Unchecked", owner: "Privacy Office", collected: "02 Aug 2026", limit: "60 days · exceeded", action: "Review" },
];
const FRESH_TONE: Record<Ev["freshness"], Tone> = { Stale: "amber", Current: "emerald", Missing: "rose", "Due soon": "amber" };
const PROOF_TONE: Record<Ev["proof"], Tone> = { Available: "emerald", Unchecked: "amber", "No proof": "rose" };

export default function EvidenceCompliancePage() {
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"needs" | "all">("needs");
  const [selectedId, setSelectedId] = useState("EV-1842");
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EVIDENCE.filter((e) => (status === "all" || e.freshness !== "Current" || e.proof !== "Available") && (!q || `${e.id} ${e.record} ${e.control} ${e.source} ${e.owner}`.toLowerCase().includes(q)));
  }, [query, status]);
  const sel = EVIDENCE.find((e) => e.id === selectedId) ?? EVIDENCE[0];
  const sampleId = "8ac72f4e...68b1c2a9";

  const copy = async () => {
    try { await navigator.clipboard.writeText(sampleId); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* clipboard unavailable */ }
  };

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<ShieldCheck className="w-5 h-5" />}
          eyebrow="Control assurance / Evidence integrity"
          title="Evidence & Compliance"
          subtitle="Assess control tests, investigate missing evidence, verify provenance, and prepare independently checkable audit records."
          actions={
            <>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}><Download className="w-3.5 h-3.5" /> Export evidence index</ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}><Search className="w-3.5 h-3.5" /> Verify evidence proof</ActionButton>
            </>
          }
        />
      }
      banner={<NoticeBanner tone="cyan" title="Continuous Evidence & Cryptographic Assurance Ledger" body="RFC 3161 timestamped Merkle evidence tree with post-quantum signature verification and automated control evaluation." tag="Ledger Pipeline Active" />}
      kpis={
        <KpiGrid
          items={[
            { label: "Controls with passing tests", value: <>264 <span className="text-base text-slate-500">/ 312</span></>, tag: "84.6%", hint: "48 need review, remediation or retesting", tone: "emerald" },
            { label: "Evidence requiring attention", value: "12", tag: "7 stale · 5 missing", hint: "Prioritized by risk and control criticality", tone: "amber" },
            { label: "Proofs verified in ledger batch", value: <>1,284 <span className="text-base text-slate-500">/ 1,290</span></>, hint: "Continuous inclusion proof verification", tone: "cyan" },
            { label: "Open control exceptions", value: "5", tag: "2 high risk", hint: "Owner, expiry and approval required", tone: "rose" },
          ]}
        />
      }
      tabs={[{ id: "overview", label: "Overview" }]}
      activeTab={tab}
      onTabChange={setTab}
      console={<LedgerConsole />}
      consoleLabel="Merkle ledger explorer"
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Control test coverage by framework" meta="View mapped controls →">
          <div className="space-y-4">
            {[["ISO/IEC 27001", 87, "Tested", "emerald"], ["SOC 2 criteria", 82, "Tested", "emerald"], ["NIST CSF 2.0", 76, "Gaps", "amber"], ["CIS Controls", 68, "Gaps", "amber"]].map(([n, v, s, t]) => (
              <div key={n as string} className="flex items-center gap-3">
                <div className="flex-1"><ProgressRow label={n as string} value={v as number} display={`${v}%`} tone="blue" /></div>
                <Pill tone={t as Tone}>{s as string}</Pill>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-4">Internal mapping and evaluated controls only; no certification implied.</p>
        </Panel>
        <Panel title="Evidence coverage & freshness" meta="Last ledger sync 13:42 UTC">
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[["1,210", "Current", "text-emerald-300"], ["7", "Stale", "text-amber-300"], ["5", "Missing", "text-rose-300"]].map(([n, l, c]) => (
              <div key={l} className="rounded-lg border border-[#162238] bg-[#080c16] p-3 text-center"><div className={`text-xl font-bold font-mono ${c}`}>{n}</div><div className="text-[10px] text-slate-500">{l}</div></div>
            ))}
          </div>
          <CheckRow label="Source collection" status="Running · Active" tone="emerald" />
          <CheckRow label="Control evaluation refresh" status="Active" tone="emerald" />
          <CheckRow label="Exception monitoring" status="Available" tone="emerald" />
          <p className="text-[10px] text-slate-500 mt-2">Continuous evidence collection anchored against immutable Merkle tree checkpoints.</p>
        </Panel>
        <Panel title="Merkle verification chain" meta="View verifier →">
          <ul className="space-y-3">
            <li className="flex gap-2.5"><Check className="w-4 h-4 text-emerald-400 shrink-0" /><div><div className="text-xs font-semibold text-slate-200">Evidence record hashed</div><div className="text-[11px] text-slate-500">SHA-256 reference anchored in cryptographic block</div></div></li>
            <li className="flex gap-2.5"><Check className="w-4 h-4 text-emerald-400 shrink-0" /><div><div className="text-xs font-semibold text-slate-200">Inclusion proof available</div><div className="text-[11px] text-slate-500">Inclusion proof linked to Merkle checkpoint</div></div></li>
            <li className="flex gap-2.5"><Check className="w-4 h-4 text-emerald-400 shrink-0" /><div><div className="text-xs font-semibold text-slate-200">Verification chain active</div><div className="text-[11px] text-slate-500">Continuous background inclusion validation</div></div></li>
          </ul>
          <div className="flex justify-between text-[10px] mt-4 pt-3 border-t border-[#162238]"><span className="text-slate-500">Profile: ZS-MERKLE-V1</span><span className="text-emerald-400 font-semibold">Ledger Verified</span></div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Priority evidence review queue" meta={`${rows.length} records require attention`} className="xl:col-span-2">
          <div className="flex flex-wrap gap-2 mb-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search evidence, source, control or owner" />
            <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value as "needs" | "all")} className="px-3 py-2 rounded-lg bg-[#080c16] border border-[#162238] text-xs text-slate-300">
              <option value="needs">Status: Needs review</option>
              <option value="all">Status: All</option>
            </select>
          </div>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            selectedKey={sel.id}
            onSelect={(r) => setSelectedId(r.id)}
            columns={[
              { key: "id", header: "Evidence", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
              { key: "r", header: "Record / finding", render: (r) => <span className="font-semibold text-slate-100">{r.record}</span> },
              { key: "c", header: "Control", render: (r) => r.control },
              { key: "s", header: "Source", render: (r) => r.source },
              { key: "f", header: "Freshness", render: (r) => <Pill tone={FRESH_TONE[r.freshness]}>{r.freshness}</Pill> },
              { key: "p", header: "Proof", render: (r) => <Pill tone={PROOF_TONE[r.proof]}>{r.proof}</Pill> },
              { key: "a", header: "Action", render: (r) => <span className="text-sky-300">{r.action} →</span> },
            ]}
          />
        </Panel>
        <Panel title={sel.record} meta={`SELECTED RECORD · ${sel.id}`}>
          <div className="-mt-1 mb-3"><Pill tone={FRESH_TONE[sel.freshness]}>{sel.freshness}</Pill></div>
          <p className="text-[11px] text-slate-400 mb-3">Review this evidence item before using it in any control or audit assertion.</p>
          <KeyValues
            cols={1}
            items={[
              { k: "Source", v: `${sel.source} · active connector` },
              { k: "Control mapping", v: sel.control },
              { k: "Control owner", v: sel.owner },
              { k: "Collection date", v: sel.collected },
              { k: "Freshness limit", v: sel.limit, tone: sel.limit.includes("exceeded") || sel.limit.includes("missing") ? "amber" : undefined },
              { k: "Ledger reference", v: "Merkle checkpoint #1043" },
            ]}
          />
          <div className="mt-3 rounded-lg border border-[#162238] bg-[#080c16] p-2.5">
            <div className="text-[10px] font-mono uppercase text-slate-500">Cryptographic SHA-256 identifier</div>
            <div className="flex items-center justify-between mt-1 font-mono text-xs text-slate-200">{sampleId}<button type="button" aria-label="Copy identifier" onClick={copy} className="text-slate-500 hover:text-sky-300">{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</button></div>
          </div>
          <p className="text-[11px] text-amber-200 mt-3 border border-amber-500/40 bg-amber-950/30 rounded-lg p-2.5">Evidence integrity verification does not prove control effectiveness, freshness, or regulatory compliance.</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>View record</ActionButton>
            <ActionButton onClick={() => setTab(CONSOLE_TAB)}>Verify proof</ActionButton>
            <ActionButton onClick={() => setTab(CONSOLE_TAB)}>Open finding</ActionButton>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Evidence operations timeline" meta="Auditable event stream (demo)">
          <EventList
            items={[
              { time: "13:42", title: "Connector evidence collection completed with 2 partial sources", tag: "Partial", tone: "amber" },
              { time: "13:39", title: "Control test CC6.3 produced a new result", tag: "Recorded", tone: "emerald" },
              { time: "13:37", title: "Offline proof verification requested for EV-1838", tag: "Pending", tone: "amber" },
            ]}
          />
        </Panel>
        <Panel title="Open assurance issues" meta="Review exceptions →">
          <EventList
            items={[
              { title: "5 evidence gaps require attention", tag: "Review", tone: "amber" },
              { title: "2 high-risk exceptions approaching expiry", tag: "High", tone: "rose" },
              { title: "Evidence access restricted by tenant policy", tag: "Scoped", tone: "emerald" },
            ]}
          />
        </Panel>
        <Panel title="Assurance boundary" meta="Important">
          <p className="text-xs text-slate-300">ZoikoShield can collect, evaluate, timestamp and verify evidence. <b>It does not certify an organization</b> or substitute for independent audit, legal or control-owner judgment.</p>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
