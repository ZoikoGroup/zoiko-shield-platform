"use client";

import { useEffect } from "react";

/**
 * Calls `callback` now and every `intervalMs` while the tab is visible.
 * A hidden tab stops polling; coming back to it refreshes immediately.
 *
 * `callback` must be stable (useCallback): a new identity restarts the timer
 * and fires it once, which is how a changed session triggers a refetch.
 */
export function useVisibleInterval(callback: () => void, intervalMs: number) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      callback();
      timer = setInterval(callback, intervalMs);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [callback, intervalMs]);
}
