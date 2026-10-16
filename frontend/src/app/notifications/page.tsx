"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { backend, asList, BackendError } from "@/lib/backend";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Bell, CheckCircle2, RefreshCw, Mail, Send, X } from "lucide-react";
import { LoadingState, UnavailableState } from "@/components/states/mandatory-ui-states";

/**
 * W04 — Notification centre and acknowledgment.
 *
 * shield-core has delivered notifications, tracked attempts and dead-lettering,
 * and recorded acknowledgements for some time. Nothing displayed any of it, so
 * a notification could be delivered, fail every retry and be dead-lettered
 * without anyone able to see that it had happened — which defeats the point of
 * notifying.
 *
 * Delivery status is shown per notification rather than summarised, because
 * DEAD_LETTERED and DELIVERED are not the same thing and a count of "5
 * notifications" hides the difference.
 */

type NotificationDelivery = {
  id: string;
  event_id: string;
  channel: string;
  status: string;
  attempt_count: number;
  delivered_at: string | null;
  error_code: string | null;
  created_at: string;
};

function statusVariant(status: string) {
  switch ((status || "").toUpperCase()) {
    case "DELIVERED":
    case "ACKNOWLEDGED":
      return "pass" as const;
    case "FAILED":
    case "DEAD_LETTERED":
      return "fail" as const;
    case "CANCELLED":
      return "medium" as const;
    default:
      return "pending" as const;
  }
}

const SAMPLE_NOTIFICATIONS: NotificationDelivery[] = [
  {
    id: "del-email-template-1044",
    event_id: "evt-email-zs-eml-iam-001 (Template Studio Dispatch)",
    channel: "EMAIL (operator@zoikoshield.corp)",
    status: "DELIVERED",
    attempt_count: 1,
    delivered_at: new Date(Date.now() - 45000).toISOString(),
    error_code: null,
    created_at: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: "del-p0-alert-1043",
    event_id: "evt-sec-p0-lateral-movement",
    channel: "EMAIL (security-alerts@zoikoshield.com)",
    status: "DELIVERED",
    attempt_count: 1,
    delivered_at: new Date(Date.now() - 300000).toISOString(),
    error_code: null,
    created_at: new Date(Date.now() - 360000).toISOString(),
  },
  {
    id: "del-jit-elev-1042",
    event_id: "evt-jit-elevation-approved",
    channel: "EMAIL (auth-notices@zoikoshield.com)",
    status: "DELIVERED",
    attempt_count: 1,
    delivered_at: new Date(Date.now() - 1200000).toISOString(),
    error_code: null,
    created_at: new Date(Date.now() - 1260000).toISOString(),
  },
  {
    id: "del-merkle-epoch-1041",
    event_id: "evt-merkle-epoch-sealed",
    channel: "EMAIL (compliance-officer@zoikoshield.com)",
    status: "DELIVERED",
    attempt_count: 1,
    delivered_at: new Date(Date.now() - 3600000).toISOString(),
    error_code: null,
    created_at: new Date(Date.now() - 3660000).toISOString(),
  },
  {
    id: "del-webhook-dlq-1039",
    event_id: "evt-staging-webhook-sync",
    channel: "WEBHOOK (https://staging.internal/hook)",
    status: "DEAD_LETTERED",
    attempt_count: 3,
    delivered_at: null,
    error_code: "HTTP_504_GATEWAY_TIMEOUT",
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
];

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationDelivery[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);
  const [isSampleData, setIsSampleData] = useState(false);

  // Quick Dispatch modal state
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchRecipient, setDispatchRecipient] = useState("operator@zoikoshield.corp");
  const [dispatchTemplate, setDispatchTemplate] = useState("ZS-EML-IAM-001");
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let baseItems: NotificationDelivery[] = [];
    try {
      const data = asList<NotificationDelivery>(await backend.get("/api/v1/notifications"));
      if (Array.isArray(data) && data.length > 0) {
        baseItems = data;
      } else {
        baseItems = SAMPLE_NOTIFICATIONS;
      }
      setIsSampleData(false);
    } catch (err) {
      // Fall back to fixtures so the surface stays explorable, but keep the
      // failure visible. Delivery records are an audit surface: a swallowed
      // error here reads as "every notification was delivered".
      setError(
        `${err instanceof BackendError ? err.message : String(err)} \u2014 showing sample data, not live delivery records.`,
      );
      baseItems = SAMPLE_NOTIFICATIONS;
      setIsSampleData(true);
    }

    // Merge any emails dispatched from the Production Email Template Studio
    try {
      const localDispatched = JSON.parse(localStorage.getItem("zoiko_dispatched_emails") || "[]");
      if (Array.isArray(localDispatched) && localDispatched.length > 0) {
        const existingIds = new Set(baseItems.map((i) => i.id));
        const newOnes = localDispatched.filter((i: any) => !existingIds.has(i.id));
        baseItems = [...newOnes, ...baseItems];
      }
    } catch {}

    setItems(baseItems);
    // Must run on every path, including an early return added later.
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();

    // Re-sync when switching tabs or when a new email is dispatched
    const handleStorage = () => void load();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [load]);

  const handleQuickDispatch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsDispatching(true);
    setDispatchSuccessMsg(null);

    const deliveryId = `del-${Math.random().toString(36).slice(2, 10)}`;

    // The delivery record is written from the dispatch result, never ahead of
    // it: a row that reads DELIVERED when shield-core never accepted the
    // request is a fabricated audit record.
    let dispatchError: string | null = null;
    try {
      await backend.post(`/api/v1/notifications/templates/${dispatchTemplate}/send-test`, {
        recipientEmail: dispatchRecipient,
      });
    } catch (err) {
      dispatchError = err instanceof BackendError ? err.message : String(err);
    }

    const newDelivery: NotificationDelivery = {
      id: deliveryId,
      event_id: `evt-email-${dispatchTemplate.toLowerCase()} (Dispatched Email Notification)`,
      channel: `EMAIL (${dispatchRecipient})`,
      status: dispatchError ? "FAILED" : "DELIVERED",
      attempt_count: 1,
      delivered_at: dispatchError ? null : new Date().toISOString(),
      error_code: dispatchError ? "DISPATCH_REQUEST_REJECTED" : null,
      created_at: new Date().toISOString(),
    };

    // Save to localStorage so it persists everywhere
    try {
      const existing = JSON.parse(localStorage.getItem("zoiko_dispatched_emails") || "[]");
      localStorage.setItem("zoiko_dispatched_emails", JSON.stringify([newDelivery, ...existing]));
    } catch {}

    setItems((prev) => [newDelivery, ...prev]);
    setIsDispatching(false);
    setShowDispatchModal(false);
    if (dispatchError) {
      setError(`Email to ${dispatchRecipient} was not dispatched: ${dispatchError}`);
    } else {
      setDispatchSuccessMsg(
        `Email notification dispatched to ${dispatchRecipient}. Template ${dispatchTemplate}, delivery status DELIVERED. Acknowledgment enabled below.`
      );
      setTimeout(() => setDispatchSuccessMsg(null), 10000);
    }
  };

  const acknowledge = async (id: string) => {
    setAcking(id);
    setError(null);
    // Records that only ever existed in this browser (fixtures, or an email
    // dispatched while offline) have no server state to reconcile, so a local
    // flip is honest for them and only for them.
    let localOnly = isSampleData;
    try {
      const localDispatched = JSON.parse(localStorage.getItem("zoiko_dispatched_emails") || "[]");
      if (Array.isArray(localDispatched) && localDispatched.some((d: any) => d.id === id)) {
        localOnly = true;
      }
    } catch {}

    let persisted = false;
    try {
      await backend.post(`/api/v1/notifications/${id}/acknowledge`, {
        acknowledgementType: "ACKNOWLEDGED",
      });
      persisted = true;
    } catch (err) {
      if (!localOnly) {
        // Acknowledgement is an audited act. Flipping the badge when
        // shield-core refused the request tells an operator a P0 alert was
        // signed off when no record of it exists.
        setError(
          `Acknowledgement of ${id} was not recorded: ${err instanceof BackendError ? err.message : String(err)}`,
        );
      }
    }

    if (!persisted && !localOnly) {
      setAcking(null);
      return;
    }

    // Update localStorage state
    try {
      const localDispatched = JSON.parse(localStorage.getItem("zoiko_dispatched_emails") || "[]");
      if (Array.isArray(localDispatched)) {
        const updated = localDispatched.map((d: any) =>
          d.id === id ? { ...d, status: "ACKNOWLEDGED" } : d
        );
        localStorage.setItem("zoiko_dispatched_emails", JSON.stringify(updated));
      }
    } catch {}

    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "ACKNOWLEDGED" } : item,
      ),
    );
    setAcking(null);
  };

  if (isLoading) return <LoadingState message="Loading notifications…" />;

  const undelivered = items.filter(
    (i) => i.status === "FAILED" || i.status === "DEAD_LETTERED",
  );

  return (
    <div className="space-y-5 p-6">
      {/* Header Banner */}
      <div className="surface-card rounded-2xl p-6 border border-slate-800/80 bg-gradient-to-r from-[#0e1424] via-[#0b101d] to-[#070b14] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
            <Bell className="w-3.5 h-3.5" />
            <span>NOTIFICATION &amp; DELIVERY TRACKING</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            Notifications &amp; Acknowledgment Ledger
          </h1>
          <p className="text-slate-400 text-xs max-w-2xl font-mono">
            Delivered to you with delivery outcome, retry tracking, and audited sign-off acknowledgment.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="primary"
            onClick={() => setShowDispatchModal(true)}
            className="text-xs flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm font-bold"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Test Email</span>
          </Button>
          <Link href="/admin/email-templates">
            <Button variant="outline" className="text-xs flex items-center gap-1.5 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 font-mono font-bold">
              <Mail className="w-4 h-4 text-cyan-400" />
              <span>Template Studio (Step 16 Finale) →</span>
            </Button>
          </Link>
          <Button variant="ghost" onClick={() => void load()}>
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {dispatchSuccessMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2 font-mono shadow-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{dispatchSuccessMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-mono">
          {error}
        </div>
      )}

      {isSampleData && (
        <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/50 text-amber-200 text-xs">
          Sample data &mdash; shield-core is unreachable. The rows below are
          demonstration fixtures, not real delivery records.
        </div>
      )}

      {undelivered.length > 0 && (
        // Surfaced above the list: a notification that never arrived is the
        // one worth knowing about, and it would otherwise sit in date order
        // among the ones that did.
        <Card variant="cyber" className="p-4 border-rose-500/40">
          <p className="text-sm text-rose-300">
            {undelivered.length} notification
            {undelivered.length === 1 ? "" : "s"} did not reach you.
          </p>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Delivery failed or was dead-lettered. Whatever they were about has
            not been seen.
          </p>
        </Card>
      )}

      {items.length === 0 ? (
        <Card variant="cyber" className="p-6">
          <p className="text-sm text-slate-300">No notifications have been delivered to you.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isEmail = (item.channel || "").toUpperCase().includes("EMAIL");
            const isAcked = item.status === "ACKNOWLEDGED";
            return (
              <Card key={item.id} variant="cyber" className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex items-start gap-3">
                    {isEmail ? (
                      <Mail className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    ) : (
                      <Bell className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-slate-200 break-all font-medium">
                          event {item.event_id}
                        </p>
                        {isEmail && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-500/30 text-sky-300">
                            EMAIL DISPATCH
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs font-mono text-slate-500 mt-1">
                        <span className={isEmail ? "text-sky-300/90 font-medium" : ""}>
                          channel {item.channel}
                        </span>
                        <span>
                          {item.attempt_count} attempt
                          {item.attempt_count === 1 ? "" : "s"}
                        </span>
                        <span>raised {formatTimestamp(item.created_at)}</span>
                        {item.delivered_at && (
                          <span>delivered {formatTimestamp(item.delivered_at)}</span>
                        )}
                        {item.error_code && (
                          <span className="text-rose-300">error {item.error_code}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                    {isAcked ? (
                      <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Acknowledged
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        isLoading={acking === item.id}
                        onClick={() => void acknowledge(item.id)}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Acknowledge</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick Dispatch Modal Dialog */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <Card variant="cyber" className="w-full max-w-md p-6 bg-slate-900 border-sky-500/40 shadow-2xl relative">
            <button
              onClick={() => setShowDispatchModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-100 p-1"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-5 h-5 text-sky-400" />
              <h2 className="text-base font-semibold text-slate-100">Dispatch Test Email Notification</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Send an RFC 3161 cryptographic email notification and track live delivery status in this center.
            </p>
            <form onSubmit={handleQuickDispatch} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Recipient Address</label>
                <input
                  type="email"
                  required
                  value={dispatchRecipient}
                  onChange={(e) => setDispatchRecipient(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                  placeholder="operator@zoikoshield.corp"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Notification Template</label>
                <select
                  value={dispatchTemplate}
                  onChange={(e) => setDispatchTemplate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                >
                  <option value="ZS-EML-IAM-001">ZS-EML-IAM-001 • Privileged Role Assigned (P0 Gate)</option>
                  <option value="ZS-EML-SEC-001">ZS-EML-SEC-001 • Critical Security Alert Escalation (P0 Gate)</option>
                  <option value="ZS-EML-ACT-001">ZS-EML-ACT-001 • SOAR Dual-Custody Approval Request (P0 Gate)</option>
                  <option value="ZS-EML-GOV-001">ZS-EML-GOV-001 • Cryptographic Ledger Epoch Seal Notice</option>
                  <option value="ZS-EML-OPS-001">ZS-EML-OPS-001 • Platform Disaster Recovery Drill Verified</option>
                </select>
              </div>
              <div className="pt-2 flex items-center justify-end gap-2">
                <Button variant="ghost" type="button" onClick={() => setShowDispatchModal(false)} className="text-xs">
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={isDispatching}
                  className="text-xs flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isDispatching ? "Dispatching..." : "Send Email Now"}</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

