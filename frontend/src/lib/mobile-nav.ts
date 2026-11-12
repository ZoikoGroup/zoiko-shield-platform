"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Shared open/closed state for the off-canvas navigation drawer used below the
 * `lg` breakpoint. The sidebar and the header hamburger live in different
 * subtrees, so a tiny external store keeps them in sync without prop drilling.
 */
let open = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function setMobileNavOpen(next: boolean) {
  if (open === next) return;
  open = next;
  emit();
}

export function toggleMobileNav() {
  setMobileNavOpen(!open);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useMobileNavOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false
  );
}

/**
 * True once the viewport reaches `minWidth` px. Defaults to Tailwind's `xl`
 * (1280px), where the admin sidebar stops being an off-canvas drawer.
 */
export function useIsDesktop(minWidth = 1280): boolean {
  const query = `(min-width: ${minWidth}px)`;
  const sub = useCallback(
    (cb: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    sub,
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : true,
    () => true
  );
}
