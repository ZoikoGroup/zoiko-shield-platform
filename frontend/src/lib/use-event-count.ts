"use client";

import { useEffect, useState } from "react";
import { backend } from "@/lib/backend";

/** The dashboard's activity windows, in hours. Anything unknown is treated as the default. */
const HOURS_BY_WINDOW: Record<string, number> = {
  "Last 24 hours": 24,
  "Last 7 days": 168,
};

export function hoursForWindow(label: string): number {
  return HOURS_BY_WINDOW[label] ?? 24;
}

/**
 * How many events this tenant actually received in the chosen window, from the backend.
 *
 * `null` means "not known": still loading, or the request failed. The caller shows a dash
 * for that, never a zero, because a zero reads as "nothing happened" when the truth is "we
 * could not tell". Bump `refreshKey` to ask again (the dashboard's refresh button does).
 */
export function useEventCount(windowLabel: string, enabled = true, refreshKey = 0): number | null {
  const hours = hoursForWindow(windowLabel);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true; // a slower, older request must not overwrite a newer answer
    backend
      .get<{ receivedInWindow?: number }>(`/api/v1/dashboard/events?hours=${hours}`)
      .then((metrics) => {
        if (alive && typeof metrics?.receivedInWindow === "number") setCount(metrics.receivedInWindow);
      })
      .catch(() => {
        if (alive) setCount(null);
      });
    return () => {
      alive = false;
    };
  }, [hours, enabled, refreshKey]);

  // A different window has its own number: show "not known" until it arrives.
  useEffect(() => {
    setCount(null);
  }, [hours]);

  return enabled ? count : null;
}
