"use client";

import React, { useMemo, useState } from "react";
import { ClipboardCheck, ListChecks, Download, Lock, UserX } from "lucide-react";
import GtmChecklistConsole from "./console";
import { downloadCsvFile } from "@/lib/export-utils";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  NumberedList, ProgressRow, EventList, FooterStrip, ActionButton, CheckRow, CONSOLE_TAB, useTabFilter,
} from "@/components/mockup/kit";

type Item = { n: string; title: string; owner: string; evidence: "LINKED" | "MISSING" };

// "Recorded" reflects the demo flag set; evidence state is what is actually
// attached. The page never treats a recorded flag as release authorization.
const ITEMS: Item[] = [
  { n: "01", title: "Market positioning & buyer definition", owner: "Product", evidence: "LINKED" },
  { n: "02", title: "Pricing and plan disclosures", owner: "Commercial", evidence: "LINKED" },
  { n: "03", title: "Entitlement and packaging review", owner: "Commercial", evidence: "LINKED" },
  { n: "04", title: "Master service agreement approval", owner: "Legal", evidence: "MISSING" },
  { n: "05", title: "Privacy and residency disclosure", owner: "Privacy", evidence: "LINKED" },
  { n: "06", title: "Customer onboarding demonstration", owner: "Product", evidence: "LINKED" },
  { n: "07", title: "Tenant access & role documentation", owner: "Security", evidence: "LINKED" },
  { n: "08", title: "Connector setup walkthrough", owner: "Engineering", evidence: "LINKED" },
  { n: "09", title: "Incident escalation service handbook", owner: "IR Operations", evidence: "MISSING" },
  { n: "10", title: "Sales enablement and product demos", owner: "Marketing", evidence: "LINKED" },
  { n: "11", title: "Billing and invoice rehearsal", owner: "Finance", evidence: "MISSING" },
  { n: "12", title: "Customer support and handoff plan", owner: "Support", evidence: "LINKED" },
];

const TABS = [
  { id: "checklist", label: "Readiness checklist" },
  { id: "evidence", label: "Evidence register" },
  { id: "owners", label: "Owners & follow-ups" },
  { id: "commercial", label: "Commercial controls" },
  { id: "deps", label: "Release dependencies" },
];

export default function GtmPreFlightPage() {
  const [tab, setTab] = useState("checklist");
  const [query, setQuery] = useState("");
  const [evidenceFilter, setEvidenceFilter] = useState<"ALL" | "LINKED" | "MISSING">("ALL");
  const show = useTabFilter(tab, "checklist");

  const linked = ITEMS.filter((i) => i.evidence === "LINKED").length;
  const missing = ITEMS.length - linked;

  const handleExportDemoReview = () => {
    downloadCsvFile(
      ["Item Number", "Checklist Item", "Owner", "Evidence Status"],
      ITEMS.map((item) => [item.n, item.title, item.owner, item.evidence]),
      "gtm-preflight-checklist.csv"
    );
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.filter(
      (i) =>
        (evidenceFilter === "ALL" || i.evidence === evidenceFilter) &&
        (!q || `${i.title} ${i.owner}`.toLowerCase().includes(q)),
    );
  }, [query, evidenceFilter]);

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<ClipboardCheck className="w-5 h-5" />}
          title="GTM Pre-Flight Checklist"
          routeTag="/admin/gtm-checklist"
          subtitle="Commercial readiness review · twelve recorded checks · evidence-linked release governance"
          actions={
            <>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}><ListChecks className="w-3.5 h-3.5" /> Review checklist</ActionButton>
              <ActionButton primary onClick={handleExportDemoReview}><Download className="w-3.5 h-3.5" /> Export demo review</ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="rose"
          title="GTM checklist reported 12/12 — release authorization still blocked"
          body="Demo flags do not replace supporting evidence, verified platform readiness or the independent eight-signer G1 launch decision."
          tag="Illustrative status · not verified"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Reported checklist result", value: `${ITEMS.length} / ${ITEMS.length}`, tag: "Verified", hint: "Production readiness criteria passed", tone: "emerald" },
            { label: "Linked evidence", value: `${linked} / ${ITEMS.length}`, tag: `${Math.round((linked / ITEMS.length) * 100)}% attached`, hint: `${missing} proof files awaiting upload`, tone: "cyan" },
            { label: "Evidence gaps", value: String(missing), tag: "Needs follow-up", hint: "Request authoritative records", tone: "amber" },
            { label: "G1 approval signatures", value: "0 / 8", tag: "Quorum Gate", hint: "Executive signature quorum required", tone: "rose" },
            { label: "Release decision", value: "GOVERNED", tag: "Fail-closed", hint: "Dual-custody release authorization active", tone: "purple" },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<GtmChecklistConsole />}
      consoleLabel="Live checklist console"
      footer={<FooterStrip left="ZoikoShield Sovereign GTM Governance · Independent dual-custody authorization and verified deployment controls." right="G1 Ratification Enforced · Strict Tenant Isolation" />}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {show("evidence", "owners") && (
          <Panel title="Twelve-Point Go-to-Market Register" meta={`12 recorded passes · ${linked} proof links`} className="xl:col-span-2">
            <div className="flex flex-wrap gap-2 mb-3">
              <SearchInput value={query} onChange={setQuery} placeholder="Search controls or evidence" />
              <select
                aria-label="Evidence filter"
                value={evidenceFilter}
                onChange={(e) => setEvidenceFilter(e.target.value as typeof evidenceFilter)}
                className="px-3 py-2 rounded-lg bg-surface border border-line text-xs text-slate-300"
              >
                <option value="ALL">Evidence: All</option>
                <option value="LINKED">Linked</option>
                <option value="MISSING">Missing</option>
              </select>
              <Pill tone="amber">Read-only demo</Pill>
            </div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.n}
              columns={[
                { key: "n", header: "#", render: (r) => <span className="font-mono text-slate-500">{r.n}</span> },
                { key: "t", header: "Control / launch readiness item*", render: (r) => <span className="font-semibold text-slate-100">{r.title}</span> },
                { key: "o", header: "Owner team", render: (r) => r.owner },
                { key: "r", header: "Recorded", render: () => <Pill tone="emerald">✓ Recorded</Pill> },
                { key: "e", header: "Evidence", render: (r) => <Pill tone={r.evidence === "LINKED" ? "cyan" : "amber"}>{r.evidence === "LINKED" ? "● Linked" : "◐ Missing"}</Pill> },
              ]}
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-3">
              <span>* Control labels are proposed UX examples; confirm canonical 12 item names in source.</span>
              <span className="font-mono font-bold text-slate-300">12 / 12 DEMO FLAGS</span>
            </div>
          </Panel>
        )}

        <div className="space-y-4">
          {show("deps", "commercial") && (
            <Panel title="Production Release Decision" meta="Authorization locked" metaTone="rose">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-rose-500/40 bg-rose-950/30 mb-4">
                <UserX className="w-6 h-6 text-rose-300" />
                <div>
                  <div className="text-lg font-black text-slate-100">NO GO</div>
                  <div className="text-[11px] text-slate-400">Checklist completion does not equal release authorization</div>
                </div>
              </div>
              <CheckRow label="GTM recorded checklist" status="12 / 12" tone="emerald" />
              <CheckRow label="Evidence linked to checks" status={`${linked} / 12`} tone="amber" />
              <CheckRow label="G1 executive ratification" status="0 / 8 (demo)" tone="rose" />
              <CheckRow label="Platform service readiness" status="Unverified" tone="amber" />
              <button type="button" disabled className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-rose-500/40 bg-rose-950/30 text-xs font-semibold text-rose-300 cursor-not-allowed">
                <Lock className="w-3.5 h-3.5" /> Production release disabled
              </button>
            </Panel>
          )}
          {show("commercial", "evidence") && (
            <Panel title="Proof Validation Rules" meta="Proposed safeguards">
              <NumberedList
                items={[
                  { title: "Evidence provenance", sub: "Approved document version and owner", tag: "Review", tone: "amber" },
                  { title: "Freshness & applicability", sub: "Valid for planned release and regions", tag: "Review", tone: "amber" },
                  { title: "Independent gate ratification", sub: "Eight eligible signers for same artifact", tag: "Required", tone: "rose" },
                ]}
              />
            </Panel>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("evidence") && (
          <Panel title="Evidence Coverage by Workstream" meta="Example categorization">
            <div className="space-y-3.5">
              <ProgressRow label="Offer & pricing" value={3} max={3} tone="emerald" />
              <ProgressRow label="Legal & privacy" value={1} max={2} tone="amber" />
              <ProgressRow label="Product demonstration" value={2} max={2} tone="cyan" />
              <ProgressRow label="Support operations" value={1} max={2} tone="amber" />
              <ProgressRow label="Commercial operations" value={2} max={3} tone="purple" />
            </div>
          </Panel>
        )}
        {show("owners", "evidence") && (
          <Panel title="Outstanding Evidence Requests" meta={`${missing} pending attachments`}>
            {ITEMS.filter((i) => i.evidence === "MISSING").map((i) => (
              <CheckRow key={i.n} label={i.title} sub={`${i.owner} · Signed or current record required`} status="Missing" tone="amber" />
            ))}
          </Panel>
        )}
        {show("owners", "deps") && (
          <Panel title="Approval & Review Trail" meta="Governance history">
            <EventList
              items={[
                { title: "Checklist demo flags imported", sub: "12 entries · provenance unverified", tag: "Simulated", tone: "cyan" },
                { title: "Evidence validation requested", sub: `${missing} supporting records not linked`, tag: "Illustrative", tone: "amber" },
                { title: "Production release remains locked", sub: "Independent G1 authorization required", tag: "Blocked", tone: "rose" },
              ]}
            />
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
