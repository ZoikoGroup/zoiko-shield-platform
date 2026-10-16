"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2 } from "lucide-react";
import NotificationsConsole from "./console";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, EventList, CheckRow, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Delivery = "EMAIL FAILED" | "DELIVERED" | "RETRY" | "DEAD-LETTER";
type Ack = "PENDING" | "SEEN" | "ACKED" | "N/A";
type Note = {
  id: string; time: string; title: string; ref: string; channel: string; severity: "CRITICAL" | "HIGH" | "MEDIUM";
  delivery: Delivery; ack: Ack; unread: boolean; security: boolean; message: string; source: string; linked: string;
};

const SAMPLE: Note[] = [
  { id: "NOT-0218", time: "14:02", title: "P1 incident escalation: unusual privileged sign-ins", ref: "INC-00473 · Security event · In-App + Email", channel: "Email", severity: "CRITICAL", delivery: "EMAIL FAILED", ack: "PENDING", unread: true, security: true, message: "Multiple failed privileged sign-ins were correlated with suspicious activity. Open the linked incident and acknowledge this notification after review.", source: "Detection & Alerts", linked: "/cases/incidents/command" },
  { id: "NOT-0217", time: "13:58", title: "Dual approval requested for endpoint containment", ref: "ACT-0187 · Human approval required", channel: "In-App", severity: "HIGH", delivery: "DELIVERED", ack: "PENDING", unread: true, security: true, message: "An endpoint containment action awaits a second independent approver.", source: "SOAR Actions & Freeze", linked: "/actions" },
  { id: "NOT-0216", time: "13:46", title: "Connector health degraded: endpoint source stale", ref: "CONN-009 · Freshness gap >10 min", channel: "In-App", severity: "MEDIUM", delivery: "DELIVERED", ack: "SEEN", unread: true, security: false, message: "Endpoint telemetry freshness exceeded its objective. Detection coverage may be incomplete.", source: "Data Sources", linked: "/ingestion" },
  { id: "NOT-0215", time: "13:37", title: "Audit package sealed for independent review", ref: "AUD-051 · Evidence package receipt", channel: "Email", severity: "MEDIUM", delivery: "DELIVERED", ack: "ACKED", unread: false, security: false, message: "An audit package was sealed and is ready for offline verification.", source: "Audit & Verifier", linked: "/audit" },
  { id: "NOT-0214", time: "12:45", title: "Identity exception nearing automatic expiry", ref: "EXC-023 · Expires in 48 hours", channel: "Email", severity: "HIGH", delivery: "DELIVERED", ack: "PENDING", unread: true, security: true, message: "A temporary identity exception expires in 48 hours. Renew or revert access.", source: "Risk & Exceptions", linked: "/risk" },
  { id: "NOT-0213", time: "11:22", title: "Notification email entered retry queue", ref: "DLV-0087 · Transport failure", channel: "Email", severity: "MEDIUM", delivery: "RETRY", ack: "N/A", unread: true, security: false, message: "Email transport failed; the delivery is queued for retry.", source: "Notification service", linked: "/notifications" },
  { id: "NOT-0212", time: "10:54", title: "Critical security notice dead-lettered", ref: "DLV-0076 · Escalation required", channel: "Email", severity: "CRITICAL", delivery: "DEAD-LETTER", ack: "N/A", unread: true, security: true, message: "A security notice exhausted all retries. Escalate through an alternate channel.", source: "Notification service", linked: "/notifications" },
];

const DELIVERY_TONE: Record<Delivery, Tone> = { "EMAIL FAILED": "rose", DELIVERED: "emerald", RETRY: "amber", "DEAD-LETTER": "rose" };
const ACK_TONE: Record<Ack, Tone> = { PENDING: "amber", SEEN: "slate", ACKED: "emerald", "N/A": "slate" };

const TABS = [
  { id: "all", label: "All notifications" },
  { id: "unread", label: "Unread" },
  { id: "security", label: "Security" },
  { id: "failures", label: "Delivery failures" },
  { id: "acked", label: "Acknowledged" },
];

export default function NotificationCenterPage() {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(SAMPLE);
  const [selectedId, setSelectedId] = useState(SAMPLE[0].id);
  const show = useTabFilter(tab, "all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (tab === "unread" && !n.unread) return false;
      if (tab === "security" && !n.security) return false;
      if (tab === "failures" && !["EMAIL FAILED", "RETRY", "DEAD-LETTER"].includes(n.delivery)) return false;
      if (tab === "acked" && n.ack !== "ACKED") return false;
      return !q || `${n.title} ${n.ref} ${n.id}`.toLowerCase().includes(q);
    });
  }, [items, query, tab]);
  const sel = items.find((n) => n.id === selectedId) ?? items[0];
  const failures = items.filter((n) => n.delivery === "EMAIL FAILED" || n.delivery === "RETRY").length;
  const dead = items.filter((n) => n.delivery === "DEAD-LETTER").length;
  const awaiting = items.filter((n) => n.ack === "PENDING").length;

  // These rows are labelled fixtures with no server record behind them, so a
  // local acknowledgement is honest here. Real acknowledgements go through
  // the live console, which persists them and reports failures.
  const acknowledge = (id: string) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, ack: "ACKED", unread: false } : n)));

  return (
    <WorkspacePage
      header={
        <PageHeader
          icon={<Bell className="w-5 h-5" />}
          title="Notification Center"
          subtitle="Triage security messages, investigate failed deliveries, and acknowledge required actions."
          actions={
            <>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}>Notification preferences</ActionButton>
              <ActionButton primary onClick={() => sel && acknowledge(sel.id)}>Acknowledge selected</ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="rose"
          title="Delivery integrity notice"
          body="Demo values only. Real delivery and acknowledgement states must come from recipient-scoped backend records; never substitute fallback samples."
          tag="Demo · synthetic data"
        />
      }
      kpis={
        <KpiGrid
          items={[
            { label: "Unread for you", value: String(items.filter((n) => n.unread).length), hint: "Recipient-scoped inbox", tone: "blue" },
            { label: "Security critical", value: String(items.filter((n) => n.severity === "CRITICAL").length), hint: "Attention required", tone: "rose" },
            { label: "Failed delivery", value: String(failures), hint: "Retry or investigate", tone: "amber" },
            { label: "Dead-lettered", value: String(dead), hint: "Escalation required", tone: "rose" },
            { label: "Awaiting ack", value: String(awaiting), hint: "No acceptance implied", tone: "purple" },
          ]}
        />
      }
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      console={<NotificationsConsole />}
      consoleLabel="Live delivery ledger"
    >
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Panel title="Notification Inbox" meta="View all →" className="xl:col-span-3">
          <div className="text-[11px] text-slate-500 -mt-1 mb-3">Visible only to the signed-in recipient and permitted tenant context</div>
          <div className="mb-3"><SearchInput value={query} onChange={setQuery} placeholder="Search notification, case, or actor" /></div>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            selectedKey={sel?.id}
            onSelect={(r) => setSelectedId(r.id)}
            columns={[
              { key: "t", header: "Received", render: (r) => <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${r.severity === "CRITICAL" ? "bg-rose-400" : r.unread ? "bg-amber-400" : "bg-sky-400"}`} /><span className="font-mono">{r.time}</span></span> },
              { key: "n", header: "Notification / linked record", render: (r) => <div><div className="font-semibold text-slate-100">{r.title}</div><div className="text-[10px] text-slate-500">{r.ref}</div></div> },
              { key: "d", header: "Delivery", render: (r) => <Pill tone={DELIVERY_TONE[r.delivery]}>{r.delivery}</Pill> },
              { key: "a", header: "Ack", render: (r) => <Pill tone={ACK_TONE[r.ack]}>{r.ack}</Pill> },
            ]}
          />
        </Panel>
        {sel && (
          <Panel title="Selected Notification" meta={sel.ack === "ACKED" ? "ACKNOWLEDGED" : sel.ack === "N/A" ? "NO ACK REQUIRED" : "ACK PENDING"} metaTone={sel.ack === "ACKED" ? "emerald" : "amber"} className="xl:col-span-2">
            <div className="text-[11px] text-slate-500 -mt-1">{sel.id} · Generated from demo record</div>
            <div className="text-lg font-bold text-slate-100 mt-2">{sel.title.split(":")[0]}</div>
            {sel.title.includes(":") && <div className="text-xs text-slate-400">{sel.title.split(":").slice(1).join(":").trim()}</div>}
            <div className="mt-4">
              <KeyValues
                cols={3}
                items={[
                  { k: "Severity", v: <Pill tone={sel.severity === "CRITICAL" ? "rose" : sel.severity === "HIGH" ? "amber" : "slate"}>{sel.severity}</Pill> },
                  { k: "Source", v: sel.source },
                  { k: "Recipient", v: "Sarah Chen" },
                ]}
              />
            </div>
            <div className="mt-4 text-[10px] font-mono uppercase tracking-wider text-slate-500">Message</div>
            <p className="text-xs text-slate-300 mt-1">{sel.message}</p>
            {sel.security && (
              <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-950/30 p-3">
                <div className="text-[11px] font-bold text-sky-300 uppercase">Mandatory security notification</div>
                <div className="text-[11px] text-slate-400">Recipient preferences cannot disable required security notices.</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Link href={sel.linked} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white">Open linked record →</Link>
              <ActionButton disabled={sel.ack === "ACKED" || sel.ack === "N/A"} onClick={() => acknowledge(sel.id)}>
                {sel.ack === "ACKED" ? <><CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged</> : "Acknowledge after review"}
              </ActionButton>
            </div>
            <div className="text-[10px] text-amber-300 mt-3">Audit: available · In-app: delivered · Email: {sel.delivery === "DELIVERED" ? "delivered" : "failed"} · Proof: unverified</div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("failures") && (
          <Panel title="Delivery Exceptions" meta="Investigate failed and dead-lettered channel attempts">
            <EventList
              items={[
                { title: "DLV-0076 · Dead-lettered security notification", sub: "Needs escalation", tone: "rose" },
                { title: "DLV-0087 · Email transport failed; retry queued", sub: "Retry pending", tone: "amber" },
                { title: "DLV-0081 · Remote provider rejected payload", sub: "Operator review", tone: "amber" },
              ]}
            />
          </Panel>
        )}
        {show("failures", "security") && (
          <Panel title="Channel Delivery" meta="Transport outcomes are NOT system-health guarantees" metaTone="slate">
            <CheckRow label="In-app" status="Delivered" tone="emerald" />
            <CheckRow label="Email" status="Failures observed" tone="rose" />
            <CheckRow label="Slack" status="Unverified" tone="amber" />
            <CheckRow label="Teams" status="Unverified" tone="amber" />
          </Panel>
        )}
        {show("acked", "security") && (
          <Panel title="Policy & Acknowledgement" meta="Mandatory categories cannot be muted" metaTone="slate">
            <CheckRow label="Recipient/tenant scope enforced by backend" status="Policy" tone="emerald" />
            <CheckRow label="Security/legal notification preference lock" status="Policy" tone="emerald" />
            <CheckRow label="Never show unlabeled fallback samples" status="Required" tone="amber" />
            <CheckRow label="Resolve actual recipients before production" status="Required" tone="amber" />
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
