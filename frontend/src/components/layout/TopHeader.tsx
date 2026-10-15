"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  Search,
  Bell,
  HelpCircle,
  Sun,
  Moon,
  ShieldCheck,
  AlertTriangle,
  Activity,
  User,
  ChevronRight,
  Command,
} from "lucide-react";

export const TopHeader: React.FC = () => {
  const pathname = usePathname();
  const [state] = useDemoState();
  const [isDark, setIsDark] = useState(true);
  const [healthStatus, setHealthStatus] = useState<{
    healthyCount: number;
    totalCount: number;
    state: string;
  }>({ healthyCount: 5, totalCount: 5, state: "OK" });

  useEffect(() => {
    let mounted = true;
    const fetchHealth = async () => {
      try {
        const snap = await ZoikoShieldApiClient.getPlatformReadiness();
        if (mounted && snap) {
          const healthy = snap.healthyServicesCount ?? 5;
          const total = snap.totalServicesCount ?? 5;
          const isDegraded = (snap.degradedServicesCount ?? 0) > 0;
          setHealthStatus({
            healthyCount: healthy,
            totalCount: total,
            state: isDegraded ? "DEGRADED" : "OK",
          });
        }
      } catch {
        // Fallback gracefully during tests or offline
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Compute breadcrumbs based on pathname
  const getBreadcrumbs = () => {
    if (pathname === "/") {
      return { section: "SECURITY OPERATIONS", current: "Command Center" };
    }
    if (pathname.startsWith("/alerts") || pathname.startsWith("/detections")) {
      return { section: "SECURITY OPERATIONS", current: "Detection & Alerts" };
    }
    if (pathname.startsWith("/cases")) {
      if (pathname.includes("incidents/command")) {
        return { section: "OPERATIONS & RESPONSE", current: "Incident Command" };
      }
      return { section: "SECURITY OPERATIONS", current: "Case Workspace" };
    }
    if (pathname.startsWith("/hunting")) {
      return { section: "SECURITY OPERATIONS", current: "Threat Hunting" };
    }
    if (pathname.startsWith("/copilot")) {
      return { section: "SECURITY OPERATIONS", current: "AI Security Copilot" };
    }
    if (pathname.startsWith("/playbooks")) {
      return { section: "OPERATIONS & RESPONSE", current: "Playbook Runs" };
    }
    if (pathname.startsWith("/response-proposals")) {
      return { section: "OPERATIONS & RESPONSE", current: "Response Proposals" };
    }
    if (pathname.startsWith("/actions")) {
      return { section: "OPERATIONS & RESPONSE", current: "SOAR Actions & Freeze" };
    }
    if (pathname.startsWith("/red-team")) {
      return { section: "OPERATIONS & RESPONSE", current: "Simulation & Training" };
    }
    if (pathname.startsWith("/ir-retainer")) {
      return { section: "OPERATIONS & RESPONSE", current: "IR Retainer & SLA" };
    }
    if (pathname.startsWith("/ingestion")) {
      return { section: "DATA & INTEGRATIONS", current: "Data Sources & Integrations" };
    }
    if (pathname.startsWith("/connectors")) {
      return { section: "DATA & INTEGRATIONS", current: "Connectors Wizard" };
    }
    if (pathname.startsWith("/assets")) {
      return { section: "DATA & INTEGRATIONS", current: "Assets & Inventory" };
    }
    if (pathname.startsWith("/ledger") || pathname.startsWith("/audit")) {
      return { section: "COMPLIANCE & GOVERNANCE", current: "Evidence & Compliance" };
    }
    if (pathname.startsWith("/controls") || pathname.startsWith("/policies")) {
      return { section: "COMPLIANCE & GOVERNANCE", current: "Policy & Controls" };
    }
    if (pathname.startsWith("/risk") || pathname.startsWith("/exceptions")) {
      return { section: "COMPLIANCE & GOVERNANCE", current: "Risk & Exceptions" };
    }
    if (pathname.startsWith("/notifications")) {
      return { section: "OPERATIONS", current: "Notification Center" };
    }
    if (pathname.startsWith("/admin")) {
      if (pathname.includes("g1-gate")) return { section: "PLATFORM ADMIN / GOVERNANCE", current: "G1 Launch Gate Protocol" };
      if (pathname.includes("jit")) return { section: "PLATFORM ADMIN / GOVERNANCE", current: "JIT Elevation Quorum" };
      if (pathname.includes("gtm-checklist")) return { section: "PLATFORM ADMIN / GOVERNANCE", current: "GTM Pre-Flight Checklist" };
      if (pathname.includes("platform-health")) return { section: "PLATFORM / OPERATIONS", current: "Platform Service Health" };
      return { section: "PLATFORM ADMIN / GOVERNANCE", current: "Operations & Entitlements" };
    }
    if (pathname.startsWith("/team") || pathname.startsWith("/onboarding")) {
      return { section: "ADMINISTRATION", current: "Tenant Management" };
    }
    if (pathname.startsWith("/partner")) {
      return { section: "MSSP OPERATIONS", current: "MSSP Fleet & 2-Party JIT" };
    }

    const pathSegment = pathname.split("/").filter(Boolean)[0] || "Command Center";
    return {
      section: "ZOIKOSHIELD",
      current: pathSegment.charAt(0).toUpperCase() + pathSegment.slice(1).replace(/-/g, " "),
    };
  };

  const breadcrumbs = getBreadcrumbs();
  const userInitials = (state.session.fullName || "Sarah Chen")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const unresolvedAlertCount = (state.alerts || []).filter((a) => a.status === "NEW").length;

  return (
    <header className="sticky top-0 z-30 w-full bg-[#080c16]/95 backdrop-blur-md border-b border-[#141d2e] px-4 md:px-6 py-2.5 flex items-center justify-between gap-4">
      {/* Left: Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-slate-400 font-medium tracking-wider">
          {breadcrumbs.section}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-cyan-400 font-semibold tracking-wide">
          {breadcrumbs.current}
        </span>
      </div>

      {/* Center: Global Search Bar */}
      <div className="hidden lg:flex items-center max-w-md w-full relative">
        <div className="w-full flex items-center gap-2 bg-[#0c111e] border border-[#162238] rounded-lg px-3 py-1.5 text-xs text-slate-400 focus-within:border-cyan-500/50 focus-within:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search alerts, cases, assets, controls..."
            className="bg-transparent border-none outline-none w-full text-slate-200 placeholder-slate-400 font-sans text-xs"
          />
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#141d2e] border border-slate-700/60 text-[10px] font-mono text-slate-400">
            <Command className="w-2.5 h-2.5" />
            <span>K</span>
          </div>
        </div>
      </div>

      {/* Right: Actions, Badges & Profile */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Environment / Demo Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-medium">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span>SIMULATED DEMO</span>
        </div>

        {/* Region / Control Plane indicator */}
        <div className="hidden xl:flex items-center gap-1.5 text-slate-400 text-xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{state.tenant.homeRegion || "US East (1)"}</span>
        </div>

        {/* Microservices Health */}
        <Link
          href="/admin/platform-health"
          title="Microservices Readiness Health"
          className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-[#0c111e] border border-[#162238] hover:border-cyan-500/40 text-xs font-mono text-slate-300 transition-colors"
        >
          <Activity
            className={`w-3.5 h-3.5 ${
              healthStatus.state === "OK" ? "text-cyan-400" : "text-amber-400"
            }`}
          />
          <span className="text-[11px] text-slate-400">{healthStatus.healthyCount}/{healthStatus.totalCount} OK</span>
        </Link>

        {/* Notification Bell */}
        <Link
          href="/notifications"
          className="relative p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#141d2e] transition-colors"
          title="Notification Center"
        >
          <Bell className="w-4 h-4" />
          {unresolvedAlertCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          )}
        </Link>

        {/* Help */}
        <Link
          href="/trust"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#141d2e] transition-colors"
          title="Help & Documentation"
        >
          <HelpCircle className="w-4 h-4" />
        </Link>

        {/* Theme Toggle (Visual) */}
        <button
          onClick={() => setIsDark(!isDark)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-[#141d2e] transition-colors"
          title="Toggle Theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User Profile Pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#162238]">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-bold text-xs shadow-[0_0_10px_rgba(6,182,212,0.3)]">
            {userInitials || "SC"}
          </div>
          <div className="hidden sm:block text-left text-xs leading-tight">
            <div className="font-semibold text-slate-200">
              {state.session.fullName || "Sarah Chen"}
            </div>
            <div className="text-[10px] font-mono text-cyan-400">
              {state.session.role?.replace(/_/g, " ") || "Security Analyst"}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
