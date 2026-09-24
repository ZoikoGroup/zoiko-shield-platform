"use client";

import React, { useCallback, useEffect, useState } from "react";
import { backend, asList, BackendError } from "@/lib/backend";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Bell, CheckCircle2, RefreshCw } from "lucide-react";
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

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationDelivery[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setItems(asList<NotificationDelivery>(await backend.get("/api/v1/notifications")));
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = async (id: string) => {
    setAcking(id);
    setError(null);
    try {
      await backend.post(`/api/v1/notifications/${id}/acknowledge`, {
        acknowledgementType: "ACKNOWLEDGED",
      });
      await load();
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setAcking(null);
    }
  };

  if (isLoading) return <LoadingState message="Loading notifications…" />;

  const undelivered = items.filter(
    (i) => i.status === "FAILED" || i.status === "DEAD_LETTERED",
  );

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            Notifications
          </h1>
          <p className="text-xs font-mono text-slate-500">
            Delivered to you, with delivery outcome and acknowledgment.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()}>
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-mono">
          {error}
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
          {items.map((item) => (
            <Card key={item.id} variant="cyber" className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 break-all">
                    event {item.event_id}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs font-mono text-slate-500 mt-1">
                    <span>channel {item.channel}</span>
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
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={acking === item.id}
                    onClick={() => void acknowledge(item.id)}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Acknowledge</span>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
