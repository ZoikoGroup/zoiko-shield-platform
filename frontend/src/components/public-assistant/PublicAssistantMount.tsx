"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AssistantLauncher } from "./AssistantLauncher";
import { loadConfig } from "./api";

const AssistantPanel = dynamic(
  () => import("./AssistantPanel").then((module) => module.AssistantPanel),
  { ssr: false },
);

const ALLOWED_EXACT = new Set([
  "/",
  "/login",
  "/register",
  "/accept-invite",
  "/verify-certificate",
  "/help",
  "/trust",
  "/pricing",
]);

const ALLOWED_PREFIXES = ["/login/", "/register/", "/accept-invite/", "/verify-certificate/", "/help/", "/trust/", "/pricing/"];

function isAllowed(pathname: string | null) {
  if (!pathname) return false;
  if (pathname === "/assistant" || pathname.startsWith("/assistant/")) return false;
  return ALLOWED_EXACT.has(pathname) || ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function PublicAssistantMount() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const allowed = isAllowed(pathname);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    // Do not put a config request on the critical path. The launcher renders
    // immediately; the flag check happens after the page is interactive.
    const timer = window.setTimeout(() => {
      loadConfig()
        .then((config) => {
          if (!active) return;
          if (!config.flags.assistant_launcher || config.flags.assistant_kill) {
            setAvailable(false);
            setOpen(false);
          }
        })
        .catch(() => {
          // Keep the launcher visible so the panel can show its own fallback.
        });
    }, 1500);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [allowed]);

  if (!allowed || !available) return null;

  const close = () => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 20);
  };

  return (
    <>
      {!open && (
        <div className="fixed bottom-6 right-6 z-[80] max-sm:bottom-[max(16px,env(safe-area-inset-bottom))] max-sm:right-4">
          <AssistantLauncher ref={launcherRef} onClick={() => setOpen(true)} expanded={open} />
        </div>
      )}
      {open && (
        <div
          id="zoiko-public-assistant-panel"
          className="fixed bottom-6 right-6 z-[80] max-sm:inset-0 max-sm:bottom-0 max-sm:right-0"
        >
          <AssistantPanel onClose={close} />
        </div>
      )}
    </>
  );
}
