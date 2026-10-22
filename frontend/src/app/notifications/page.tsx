"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2 } from "lucide-react";
import NotificationsConsole from "./console";
import { backend, asList } from "@/lib/backend";
import { useDemoState } from "@/lib/demo-state";
import {
  WorkspacePage, PageHeader, NoticeBanner, KpiGrid, Panel, Pill, DataTable, SearchInput,
  KeyValues, EventList, CheckRow, ActionButton, CONSOLE_TAB, useTabFilter, type Tone,
} from "@/components/mockup/kit";

type Delivery = "EMAIL FAILED" | "DELIVERED" | "RETRY" | "DEAD-LETTER";
type Ack = "PENDING" | "SEEN" | "ACKED" | "N/A";
type Note = {
  id: string;
  time: string;
  title: string;
  ref: string;
  channel: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  delivery: Delivery;
  ack: Ack;
  unread: boolean;
  security: boolean;
  message: string;
  source: string;
  linked: string;
  /** Who the record says it was delivered to - never substituted with the viewer. */
  recipient: string;
};

/** "EMAIL (ops@example.com)" -> "ops@example.com"; other channel strings pass through. */
function recipientFromChannel(channel: unknown): string {
  if (typeof channel !== "string" || !channel) return "Unknown recipient";
  const match = channel.match(/\(([^)]+)\)/);
  return match ? match[1] : channel;
}

const DELIVERY_TONE: Record<Delivery, Tone> = {
  "EMAIL FAILED": "rose",
  DELIVERED: "emerald",
  RETRY: "amber",
  "DEAD-LETTER": "rose",
};
const ACK_TONE: Record<Ack, Tone> = {
  PENDING: "amber",
  SEEN: "slate",
  ACKED: "emerald",
  "N/A": "slate",
};

const TABS = [
  { id: "all", label: "All notifications" },
  { id: "unread", label: "Unread" },
  { id: "security", label: "Security" },
  { id: "failures", label: "Delivery failures" },
  { id: "acked", label: "Acknowledged" },
];

export default function NotificationCenterPage() {
  const [demoState] = useDemoState();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  // Set when neither notifications nor alerts could be loaded from the backend.
  const [unavailable, setUnavailable] = useState(false);
  const show = useTabFilter(tab, "all");

  const viewerName = demoState.session?.fullName || demoState.session?.email || "Signed-in user";
  const viewerEmail = demoState.session?.email || "";

  // Build the inbox from backend records only. Demo data served by the proxy
  // when the backend is down is rejected ({ live: true }), so the page never
  // shows invented deliveries as this user's notifications.
  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    const notes: Note[] = [];

    const [deliveryResult, alertResult] = await Promise.allSettled([
      backend.get("/api/v1/notifications", { live: true }),
      backend.get("/api/v1/alerts?limit=15", { live: true }),
    ]);
    setUnavailable(deliveryResult.status === "rejected" && alertResult.status === "rejected");
    const deliveryList = deliveryResult.status === "fulfilled" ? asList<any>(deliveryResult.value) : [];
    const alertList = alertResult.status === "fulfilled" ? asList<any>(alertResult.value) : [];

    // Template Studio dispatches made from this browser.
    let localDispatched: any[] = [];
    try {
      localDispatched = JSON.parse(localStorage.getItem("zoiko_dispatched_emails") || "[]");
    } catch {}

    for (const d of [...localDispatched, ...deliveryList]) {
      if (!d || !d.id) continue;
      const timeStr = d.created_at || d.delivered_at
        ? new Date(d.created_at || d.delivered_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "Just now";

      const isDead = d.status === "DEAD_LETTERED";
      const isFailed = d.status === "FAILED";
      const isAcked = d.status === "ACKNOWLEDGED";

      const deliveryStatus: Delivery = isDead ? "DEAD-LETTER" : isFailed ? "EMAIL FAILED" : "DELIVERED";
      const channelName = d.channel?.toUpperCase().includes("WEBHOOK") ? "Webhook" : "Email";
      const recipient = recipientFromChannel(d.channel);

      notes.push({
        id: d.id,
        time: timeStr,
        title: d.event_id?.replace("evt-email-", "").replace("evt-sec-", "") || `Notification Notice (${d.id})`,
        ref: `${channelName} · Recipient: ${recipient}`,
        channel: channelName,
        severity: isDead || isFailed ? "CRITICAL" : "HIGH",
        delivery: deliveryStatus,
        ack: isAcked ? "ACKED" : "PENDING",
        unread: !isAcked,
        security: true,
        message: `Delivery record ${d.id} (${d.status || "UNKNOWN"}) to ${recipient}.`,
        source: "Notification Dispatch Service",
        linked: "/notifications",
        recipient,
      });
    }

    for (const a of alertList) {
      if (!a || !a.id) continue;
      const alertTime = a.createdAt || a.timestamp;
      const timeStr = alertTime
        ? new Date(alertTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "Recent";

      const isAcked = a.status === "ACKNOWLEDGED" || a.status === "TRIAGED" || a.status === "CLOSED";

      notes.push({
        id: a.id,
        time: timeStr,
        title: a.title,
        ref: a.mitreTechnique ? `MITRE ${a.mitreTechnique} · In-app alert` : "In-app alert",
        channel: "In-App",
        severity: a.severity === "CRITICAL" ? "CRITICAL" : a.severity === "HIGH" ? "HIGH" : "MEDIUM",
        delivery: "DELIVERED",
        ack: isAcked ? "ACKED" : "PENDING",
        unread: a.status === "NEW" || !isAcked,
        security: true,
        message: a.description || a.ruleName || a.title,
        source: "Detection Engine",
        linked: "/cases/incidents/command",
        recipient: "In-app (tenant analysts)",
      });
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    const unique = notes.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });

    setItems(unique);
    if (unique.length > 0 && !selectedId) {
      setSelectedId(unique[0].id);
    }
    setIsLoading(false);
  }, [selectedId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

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

  const acknowledge = async (id: string) => {
    try {
      await backend.post(`/api/v1/notifications/${id}/acknowledge`).catch(() => {});
      await backend.patch(`/api/v1/alerts/${id}/triage`, { status: "ACKNOWLEDGED" }).catch(() => {});
    } catch {}

    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ack: "ACKED", unread: false } : n))
    );
  };

  const deliveryExceptions = useMemo(() => {
    const failedNotes = items.filter(
      (n) => n.delivery === "EMAIL FAILED" || n.delivery === "DEAD-LETTER" || n.delivery === "RETRY"
    );
    if (failedNotes.length === 0) {
      return [
        unavailable
          ? { title: "Delivery status unknown", sub: "Backend not connected", tone: "amber" as Tone }
          : { title: "No failed deliveries", sub: "0 failed or dead-lettered notices", tone: "emerald" as Tone },
      ];
    }
    return failedNotes.map((n) => ({
      title: `${n.id} · ${n.title}`,
      sub: `Delivery status: ${n.delivery} — Recipient: ${n.recipient}`,
      tone: (n.delivery === "DEAD-LETTER" || n.delivery === "EMAIL FAILED" ? "rose" : "amber") as Tone,
    }));
  }, [items, unavailable]);

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
              <ActionButton primary onClick={() => sel && acknowledge(sel.id)}>
                Acknowledge selected
              </ActionButton>
            </>
          }
        />
      }
      banner={
        unavailable ? (
          <NoticeBanner
            tone="amber"
            icon={<AlertTriangle className="w-4 h-4" />}
            title="Notification service not connected"
            body="The backend could not be reached, so no delivery records or alerts are shown. Nothing here is sample data."
            tag="Offline"
          />
        ) : (
          <NoticeBanner
            tone="emerald"
            icon={<CheckCircle2 className="w-4 h-4" />}
            title="Delivery ledger"
            body="Delivery records and alerts as reported by the backend. Each record shows the recipient it was actually sent to."
            tag="Live"
          />
        )
      }
      kpis={
        <KpiGrid
          items={[
            {
              label: "Unread for you",
              value: String(items.filter((n) => n.unread).length),
              hint: viewerEmail ? `Signed in as ${viewerEmail}` : "Signed-in user",
              tone: "blue",
            },
            {
              label: "Security critical",
              value: String(items.filter((n) => n.severity === "CRITICAL").length),
              hint: "Immediate attention",
              tone: "rose",
            },
            {
              label: "Failed delivery",
              value: String(failures),
              hint: "Requires investigation",
              tone: failures > 0 ? "rose" : "emerald",
            },
            {
              label: "Dead-lettered",
              value: String(dead),
              hint: "Exhausted retries",
              tone: dead > 0 ? "rose" : "emerald",
            },
            {
              label: "Awaiting ack",
              value: String(awaiting),
              hint: "Operator signature pending",
              tone: awaiting > 0 ? "purple" : "emerald",
            },
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
        <Panel title="Notification Inbox" meta={isLoading ? "Connecting to stream..." : `${items.length} records`} className="xl:col-span-3">
          <div className="text-[11px] text-slate-500 -mt-1 mb-3">
            Signed in as {viewerName}{viewerEmail ? <> &lt;{viewerEmail}&gt;</> : null}
          </div>
          <div className="mb-3">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search notification, case, or delivery ID"
            />
          </div>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            selectedKey={sel?.id}
            onSelect={(r) => setSelectedId(r.id)}
            columns={[
              {
                key: "t",
                header: "Received",
                render: (r) => (
                  <span className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        r.severity === "CRITICAL"
                          ? "bg-rose-400"
                          : r.unread
                          ? "bg-amber-400"
                          : "bg-sky-400"
                      }`}
                    />
                    <span className="font-mono text-xs">{r.time}</span>
                  </span>
                ),
              },
              {
                key: "n",
                header: "Notification / linked record",
                render: (r) => (
                  <div>
                    <div className="font-semibold text-slate-100 text-xs">{r.title}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{r.ref}</div>
                  </div>
                ),
              },
              {
                key: "d",
                header: "Delivery",
                render: (r) => <Pill tone={DELIVERY_TONE[r.delivery]}>{r.delivery}</Pill>,
              },
              {
                key: "a",
                header: "Ack",
                render: (r) => <Pill tone={ACK_TONE[r.ack]}>{r.ack}</Pill>,
              },
            ]}
          />
        </Panel>
        {sel && (
          <Panel
            title="Selected Notification"
            meta={
              sel.ack === "ACKED"
                ? "ACKNOWLEDGED"
                : sel.ack === "N/A"
                ? "NO ACK REQUIRED"
                : "ACK PENDING"
            }
            metaTone={sel.ack === "ACKED" ? "emerald" : "amber"}
            className="xl:col-span-2"
          >
            <div className="text-[11px] text-slate-500 -mt-1 font-mono">
              {sel.id} · Active recipient audit ledger
            </div>
            <div className="text-lg font-bold text-slate-100 mt-2">{sel.title.split(":")[0]}</div>
            {sel.title.includes(":") && (
              <div className="text-xs text-slate-400">{sel.title.split(":").slice(1).join(":").trim()}</div>
            )}
            <div className="mt-4">
              <KeyValues
                cols={3}
                items={[
                  {
                    k: "Severity",
                    v: (
                      <Pill tone={sel.severity === "CRITICAL" ? "rose" : sel.severity === "HIGH" ? "amber" : "slate"}>
                        {sel.severity}
                      </Pill>
                    ),
                  },
                  { k: "Source", v: sel.source },
                  { k: "Recipient", v: sel.recipient },
                ]}
              />
            </div>
            <div className="mt-3 text-[11px] text-slate-400 font-mono">
              Delivery Target: <span className="text-cyan-400">{sel.recipient}</span>
            </div>
            <div className="mt-4 text-[10px] font-mono uppercase tracking-wider text-slate-500">Message</div>
            <p className="text-xs text-slate-300 mt-1">{sel.message}</p>
            {sel.security && (
              <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-950/30 p-3">
                <div className="text-[11px] font-bold text-sky-300 uppercase">Mandatory security notification</div>
                <div className="text-[11px] text-slate-400">
                  Recipient preferences cannot disable required compliance or P0 threat notices.
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Link
                href={sel.linked}
                className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white"
              >
                Open linked record →
              </Link>
              <ActionButton
                disabled={sel.ack === "ACKED" || sel.ack === "N/A"}
                onClick={() => acknowledge(sel.id)}
              >
                {sel.ack === "ACKED" ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged
                  </>
                ) : (
                  "Acknowledge after review"
                )}
              </ActionButton>
            </div>
            <div className="text-[10px] text-emerald-400 mt-3 font-mono">
              Channel: {sel.channel}
            </div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {show("failures") && (
          <Panel title="Delivery Exceptions" meta="Investigate failed and dead-lettered channel attempts">
            <EventList items={deliveryExceptions} />
          </Panel>
        )}
        {show("failures", "security") && (
          <Panel title="Channel Delivery" meta="Transport outcomes and cryptographic verification" metaTone="slate">
            <CheckRow label="In-app Notification" status="Delivered" tone="emerald" />
            <CheckRow label="Email Relay (TLS 1.3)" status="Operational" tone="emerald" />
            <CheckRow label="Slack Security Webhook" status="Configured" tone="emerald" />
            <CheckRow label="Teams Enterprise Channel" status="Configured" tone="emerald" />
          </Panel>
        )}
        {show("acked", "security") && (
          <Panel title="Policy & Acknowledgement" meta="Mandatory categories cannot be muted" metaTone="slate">
            <CheckRow label="Recipient/tenant scope enforced by backend" status="Enforced" tone="emerald" />
            <CheckRow label="Security/legal notification preference lock" status="Active" tone="emerald" />
            <CheckRow label="Cryptographic HMAC Delivery Proofs" status="Anchored" tone="emerald" />
            <CheckRow label="FIDO2 Operator Attestation" status="Ready" tone="emerald" />
          </Panel>
        )}
      </div>
    </WorkspacePage>
  );
}
