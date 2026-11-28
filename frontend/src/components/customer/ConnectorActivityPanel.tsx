"use client";

import React, { useCallback, useEffect, useState } from "react";
import { backend } from "@/lib/backend";
import { timeAgo } from "@/lib/customer-api";

interface ActivityEvent {
  id: string;
  receivedAt: string;
  status: string;
  activity: string | null;
  category: string | null;
  severity: string | null;
  outcome: string | null;
  actor: string | null;
  resource: string | null;
  resourceType: string | null;
  details: Record<string, string | number> | null;
}

interface Activity {
  total: number;
  last24h: number;
  lastReceivedAt: string | null;
  events: ActivityEvent[];
}

/** How often to look again while the tab is visible. */
const POLL_MS = 20_000;
const SHOWN = 10;

/** GIT_PUSH -> "Git push". */
export function humanizeActivity(value: string | null): string {
  if (!value) return "Event";
  const words = value.replace(/[_.]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What the stored status means to a person. */
function statusLabel(status: string): { text: string; tone: string; hint: string } {
  switch (status) {
    case "NORMALIZED":
      return { text: "Processed", tone: "text-emerald-300 border-emerald-500/40", hint: "Received, stored and understood." };
    case "QUARANTINED":
      return { text: "Rejected", tone: "text-red-300 border-red-500/40", hint: "Received but set aside: it was empty or did not match this connector." };
    default:
      return { text: "Received", tone: "text-sky-300 border-sky-500/40", hint: "Stored; not processed yet." };
  }
}

function detailsLine(d: Record<string, string | number> | null): string {
  if (!d) return "";
  const parts: string[] = [];
  if (d.branch) parts.push(`branch ${d.branch}`);
  if (typeof d.commits === "number") parts.push(`${d.commits} commit${d.commits === 1 ? "" : "s"}`);
  if (d.message) parts.push(`“${d.message}”`);
  if (d.eventType) parts.push(String(d.eventType));
  if (d.action) parts.push(String(d.action));
  return parts.join(" · ");
}

/**
 * What a connector has actually received: counts, when the last delivery arrived, and the
 * latest deliveries with what each was understood as. The payload itself is never shown or
 * fetched; the server sends only a short summary.
 */
export default function ConnectorActivityPanel({ connectorId }: { connectorId: string }) {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const path = `/api/v1/connectors/${encodeURIComponent(connectorId)}/activity?limit=${SHOWN}`;

  const load = useCallback(
    async (isAlive: () => boolean) => {
      try {
        const result = await backend.get<Activity>(path);
        if (!isAlive()) return;
        if (result && Array.isArray(result.events)) {
          setData(result);
          setError(null);
          setLoadedAt(new Date());
        } else {
          setError("Unexpected answer from the server.");
        }
      } catch (e) {
        if (isAlive()) setError(e instanceof Error ? e.message : "Could not load activity.");
      }
    },
    [path],
  );

  // A different connector must never show the previous one's activity.
  useEffect(() => {
    let alive = true; // a slow, older answer must not overwrite a newer one
    const isAlive = () => alive;
    setData(null);
    setError(null);
    void load(isAlive);

    // Look again every so often, but only while someone can see it.
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void load(isAlive);
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(() => true);
    setRefreshing(false);
  };

  return (
    <div className="rounded-xl border border-slate-700/80 bg-[#07101e] p-3 space-y-2" aria-label="Recent activity">
      <div className="flex items-center justify-between gap-2">
        <div className="text-slate-300 font-semibold">Recent activity</div>
        <div className="flex items-center gap-2 text-slate-500">
          {loadedAt && <span>Updated {loadedAt.toLocaleTimeString()}</span>}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="px-2.5 py-1 rounded-lg bg-[#0c1829] border border-slate-700/80 text-[11px] font-semibold text-slate-100 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && !data && <p className="text-red-300">Activity unavailable: {error}</p>}
      {error && data && <p className="text-amber-300">Could not refresh ({error}). Showing the last result.</p>}
      {!data && !error && <p className="text-slate-400">Loading activity…</p>}

      {data && (
        <>
          <p className="text-slate-300">
            <span className="font-semibold text-white">{data.total.toLocaleString()}</span> deliveries ·{" "}
            <span className="font-semibold text-white">{data.last24h.toLocaleString()}</span> in the last 24 hours
            {data.lastReceivedAt && <> · last {timeAgo(data.lastReceivedAt)}</>}
          </p>

          {data.events.length === 0 ? (
            <p className="text-slate-400">
              No deliveries yet. When the sender posts to this connector&apos;s webhook URL, each delivery appears here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800/70" aria-label="Recent deliveries">
              {data.events.map((e) => {
                const status = statusLabel(e.status);
                const line = detailsLine(e.details);
                return (
                  <li key={e.id} className="py-2 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{humanizeActivity(e.activity)}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span title={new Date(e.receivedAt).toLocaleString()} className="text-slate-400">
                          {timeAgo(e.receivedAt)}
                        </span>
                        <span title={status.hint} className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${status.tone}`}>
                          {status.text}
                        </span>
                      </span>
                    </div>
                    <div className="text-slate-400">
                      {[e.resource, e.actor && `by ${e.actor}`, e.outcome && e.outcome.toLowerCase()].filter(Boolean).join(" · ") ||
                        "No details were extracted from this delivery."}
                    </div>
                    {line && <div className="text-slate-500">{line}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
