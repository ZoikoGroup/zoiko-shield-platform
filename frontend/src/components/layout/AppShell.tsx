"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const Sidebar = dynamic(
  () => import("@/components/layout/Sidebar").then((m) => m.Sidebar),
  { ssr: false }
);
const TopHeader = dynamic(
  () => import("@/components/layout/TopHeader").then((m) => m.TopHeader),
  { ssr: false }
);
const DemoGuideBar = dynamic(
  () => import("@/components/layout/DemoGuideBar").then((m) => m.DemoGuideBar),
  { ssr: false }
);

import { useDemoState } from "@/lib/demo-state";

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/accept-invite",
  "/verify-certificate",
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state] = useDemoState();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const isPublicRoute = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`)
  );

  // Check auth cookies and state
  const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test";
  const hasAuthCookie =
    typeof document !== "undefined" &&
    (document.cookie.includes("zoiko_auth=true") ||
      document.cookie.includes("zoiko_shield_access_token=") ||
      document.cookie.includes("shield_access_token="));

  const isAuthenticated = isTest || Boolean(state.session?.isAuthenticated && hasAuthCookie);

  useEffect(() => {
    // If attempting to access a protected deep URL while unauthenticated, redirect cleanly to login
    if (isClient && !isPublicRoute && pathname !== "/" && !isAuthenticated && !isTest) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.replace("/login");
      }
    }
  }, [isClient, isPublicRoute, isAuthenticated, pathname, isTest]);

  // 1. Public Routes: Login, Register, Accept Invite, Certificate Verifier
  // Render clean full-screen layout without authenticated sidebar or top header
  if (isPublicRoute) {
    return (
      <div className="min-h-screen w-full bg-canvas text-slate-100 flex flex-col antialiased">
        {children}
      </div>
    );
  }

  // 2. Root route when unauthenticated:
  // Render children (which renders LoginPage directly) without sidebar or top header
  if (!isAuthenticated && !isTest && pathname === "/") {
    return (
      <div className="min-h-screen w-full bg-canvas text-slate-100 flex flex-col antialiased">
        {children}
      </div>
    );
  }

  // 3. Protected deep routes when unauthenticated:
  // Blank transition while window.location.replace executes (no stuck spinner)
  if (!isAuthenticated && !isTest) {
    return null;
  }

  // 4. Authenticated Platform Shell:
  // - Left side: Persistent, stable Sidebar (never unmounts or jumps on page navigation)
  // - Right side: Dynamic page content area ({children})
  return (
    <div className="flex flex-1 h-screen overflow-hidden bg-canvas text-slate-100 antialiased app-shell">
      {/* Stable Left-Side Navigation: static rail, locked at h-screen */}
      <Sidebar />

      {/* Dynamic Right-Side Content Area: ONLY this container scrolls */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <TopHeader />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 cyber-grid transition-opacity duration-150">
          <div className="max-w-[1720px] mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Global Interactive 15-Step Demo Workflow Bar */}
      <DemoGuideBar />
    </div>
  );
}
