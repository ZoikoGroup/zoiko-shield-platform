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
const CustomerSidebar = dynamic(
  () =>
    import("@/components/customer/CustomerSidebar").then(
      (m) => m.CustomerSidebar
    ),
  { ssr: false }
);
const CustomerTopHeader = dynamic(
  () =>
    import("@/components/customer/CustomerTopHeader").then(
      (m) => m.CustomerTopHeader
    ),
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
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`) ||
      pathname.startsWith(`${prefix}?`)
  );

  const isCustomerDashboardRoute =
    pathname === "/customer" || pathname.startsWith("/customer/");

  // Check auth cookies and state only after mounting on client, or in test environment
  const isTest =
    typeof process !== "undefined" && process.env.NODE_ENV === "test";
  const hasAuthCookie =
    Boolean(isClient || isTest) &&
    typeof document !== "undefined" &&
    (document.cookie.includes("zoiko_auth=true") ||
      document.cookie.includes("zoiko_shield_access_token=") ||
      document.cookie.includes("shield_access_token="));

  const isAuthenticated =
    isTest || Boolean(isClient && state.session?.isAuthenticated && hasAuthCookie);

  useEffect(() => {
    // If attempting to access a protected deep URL while unauthenticated, redirect cleanly to login
    if (
      isClient &&
      !isPublicRoute &&
      pathname !== "/" &&
      !isAuthenticated &&
      !isTest
    ) {
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login") &&
        !(window as any).__zoiko_logging_out
      ) {
        window.location.href = "/login";
      }
      return;
    }

    // Role-based route isolation: prevent non-admin customer roles from accessing admin routes
    if (isClient && isAuthenticated && !isTest) {
      const role = state.session?.role || "SECURITY_ANALYST";
      const isPlatformAdminRoute =
        pathname === "/admin" ||
        pathname.startsWith("/admin/platform-health") ||
        pathname.startsWith("/admin/jit") ||
        pathname.startsWith("/admin/g1-gate") ||
        pathname.startsWith("/admin/gtm-checklist") ||
        pathname.startsWith("/admin/email-templates");
      const isTenantAdminRoute =
        pathname === "/admin/tenant" ||
        pathname.startsWith("/admin/export") ||
        pathname.startsWith("/tenant-management");

      if (isPlatformAdminRoute && role !== "SUPER_ADMIN") {
        window.location.href =
          role === "TENANT_OWNER" ? "/admin/tenant" : "/customer/dashboard";
      } else if (
        isTenantAdminRoute &&
        role !== "TENANT_OWNER" &&
        role !== "SUPER_ADMIN"
      ) {
        window.location.href = "/customer/dashboard";
      }
    }
  }, [isClient, isPublicRoute, isAuthenticated, pathname, isTest, state.session?.role]);

  // 1. Public Routes: Login, Register, Accept Invite, Certificate Verifier
  if (isPublicRoute) {
    return (
      <div className="min-h-screen w-full bg-canvas text-slate-100 flex flex-col antialiased">
        {children}
      </div>
    );
  }

  // 2. Root route when unauthenticated:
  if (!isAuthenticated && !isTest && pathname === "/") {
    return (
      <div className="min-h-screen w-full bg-canvas text-slate-100 flex flex-col antialiased">
        {children}
      </div>
    );
  }

  // 3. Protected deep routes when unauthenticated:
  if (!isAuthenticated && !isTest) {
    return null;
  }

  // 4A. Separated Customer Workspace Shell (Lennox Sir's Executive Security Overview):
  if (isCustomerDashboardRoute) {
    return (
      <div className="flex flex-1 h-screen overflow-hidden bg-[#060f1d] text-slate-100 antialiased customer-app-shell">
        <CustomerSidebar />
        <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
          <CustomerTopHeader />
          <main
            id="main-content"
            className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
          >
            {children}
          </main>
        </div>
      </div>
    );
  }

  // 4B. Administrator & Super Admin / Platform Operator Shell:
  return (
    <div className="flex flex-1 h-screen overflow-hidden bg-canvas text-slate-100 antialiased app-shell">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        <TopHeader />
        <DemoGuideBar />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 scroll-smooth"
        >
          <div className="max-w-[1600px] mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
