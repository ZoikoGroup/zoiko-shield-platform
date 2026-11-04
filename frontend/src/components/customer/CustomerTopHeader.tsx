"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Globe,
  Search,
  Bell,
  HelpCircle,
  ChevronDown,
  LogOut,
  Building2,
  Sliders,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { useDemoState } from "@/lib/demo-state";
import {
  CANONICAL_REGIONS,
  resolveRegionMetadata,
} from "@/lib/assurance-primitives";

export function CustomerTopHeader({
  searchQuery = "",
  onSearchChange,
}: {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}) {
  const router = useRouter();
  const [state, setDemoState] = useDemoState();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(3);
  const [profileOpen, setProfileOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    fetch("/api/v1/notifications/deliveries")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.deliveries)
          ? data.deliveries
          : [];
        if (list.length > 0) {
          const unread = list.filter(
            (d: any) => d.status !== "ACKNOWLEDGED" && d.status !== "READ"
          ).length;
          setUnreadCount(unread);
        }
      })
      .catch(() => {});
  }, []);

  const currentRegionCode =
    state.tenant?.dataResidencyRegion || state.tenant?.homeRegion || "eu-west-1";
  const regionMeta = resolveRegionMetadata(currentRegionCode);

  const handleRegionSelect = (regionCode: string) => {
    setDemoState((prev) => ({
      ...prev,
      tenant: {
        ...prev.tenant,
        homeRegion: regionCode,
        dataResidencyRegion: regionCode,
      },
    }));
    fetch("/api/v1/customer/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryRegion: regionCode }),
    }).catch(() => {});
    setRegionMenuOpen(false);
  };

  const handleSignOut = () => {
    if (typeof document !== "undefined") {
      document.cookie =
        "zoiko_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie =
        "zoiko_shield_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      document.cookie =
        "shield_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
    setDemoState((prev) => ({
      ...prev,
      session: {
        ...prev.session,
        isAuthenticated: false,
      },
    }));
    router.push("/login");
  };

  const switchDashboardMode = (
    targetMode: "CUSTOMER" | "TENANT_ADMIN" | "SUPER_ADMIN"
  ) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("zoikoshield_workspace_mode", targetMode);
    }
    setWorkspaceMenuOpen(false);
    if (targetMode === "CUSTOMER") {
      router.push("/customer/dashboard");
    } else if (targetMode === "TENANT_ADMIN") {
      router.push("/admin/tenant");
    } else {
      router.push("/admin");
    }
  };

  const displayOrgName =
    state.tenant?.organizationName &&
    state.tenant.organizationName !== "Enterprise Security Operations"
      ? state.tenant.organizationName
      : "Acme Global Ltd";

  const displayUserName =
    state.session?.fullName &&
    state.session.fullName !== "Lead Security Operator"
      ? state.session.fullName
      : "Jane Doe";

  const displayRoleLabel =
    state.session?.role === "SECURITY_ANALYST"
      ? "SOC Analyst"
      : state.session?.role === "AUDITOR"
      ? "Security Auditor"
      : "CISO";

  const initials = displayUserName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-[68px] shrink-0 w-full bg-[#07101e]/95 backdrop-blur-md border-b border-slate-800/80 px-6 flex items-center justify-between gap-4 z-20">
      {/* Left Controls: Customer Workspace Switcher + Region Selector + Production Pill */}
      <div className="flex items-center gap-3">
        {/* Customer Workspace Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setWorkspaceMenuOpen((v) => !v);
              setRegionMenuOpen(false);
            }}
            className="flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-[#0c1829] hover:bg-[#102036] border border-slate-700/70 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-red-950/80 border border-red-500/40 flex items-center justify-center">
              <Shield className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-left leading-tight pr-2">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <span>Customer Workspace</span>
              </div>
              <div className="text-[11px] text-slate-400">{displayOrgName}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {workspaceMenuOpen && (
            <div className="absolute left-0 mt-2 w-72 rounded-xl bg-[#0b1526] border border-slate-700/80 shadow-2xl p-2 z-50 space-y-1">
              <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Separated Workspace Portals
              </div>
              <button
                type="button"
                onClick={() => switchDashboardMode("CUSTOMER")}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-red-950/40 border border-red-500/30 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-red-400" />
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Customer Dashboard
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Executive, SOC & Account Views
                    </div>
                  </div>
                </div>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </button>

              {(state.session?.role === "TENANT_OWNER" ||
                state.session?.role === "SUPER_ADMIN") && (
                <button
                  type="button"
                  onClick={() => switchDashboardMode("TENANT_ADMIN")}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/70 text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200">
                        Tenant Administrator Dashboard
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Residency, Connectors, Retention & RBAC
                      </div>
                    </div>
                  </div>
                </button>
              )}

              {state.session?.role === "SUPER_ADMIN" && (
                <button
                  type="button"
                  onClick={() => switchDashboardMode("SUPER_ADMIN")}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/70 text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200">
                        Super Admin Dashboard
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Platform Operator, DR Drills & G1 Gate
                      </div>
                    </div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Canonical Region Selector (EU Ireland default per wireframe) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setRegionMenuOpen((v) => !v);
              setWorkspaceMenuOpen(false);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0c1829] hover:bg-[#102036] border border-slate-700/70 text-xs font-medium text-slate-200 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>{regionMeta.shortLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>

          {regionMenuOpen && (
            <div className="absolute left-0 mt-2 w-72 rounded-xl bg-[#0b1526] border border-slate-700/80 shadow-2xl p-2 z-50 space-y-1">
              <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Data Residency Boundary (G02)
              </div>
              {Object.values(CANONICAL_REGIONS).map((reg) => (
                <button
                  key={reg.code}
                  type="button"
                  onClick={() => handleRegionSelect(reg.code)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                    reg.code === regionMeta.code
                      ? "bg-cyan-950/50 border border-cyan-500/40 text-white"
                      : "hover:bg-slate-800/70 text-slate-300"
                  }`}
                >
                  <div>
                    <div className="font-medium">{reg.shortLabel}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {reg.code} • {reg.countryCode} ({reg.sovereigntyRegime})
                    </div>
                  </div>
                  {reg.code === regionMeta.code && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Production Environment Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs font-semibold text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Production</span>
        </div>
      </div>

      {/* Right Controls: Search Input + Notifications + Help + User Profile */}
      <div className="flex items-center gap-3">
        {/* Global Search Input */}
        <div className="relative w-64 lg:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => {
              const val = e.target.value;
              setLocalSearch(val);
              onSearchChange?.(val);
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("zoiko:customer-search", { detail: val })
                );
              }
            }}
            placeholder="Search Zoiko Shield..."
            aria-label="Search Zoiko Shield"
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#0c1829] border border-slate-700/70 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500/60"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
        </div>

        {/* Notifications Bell with Red Badge "3" */}
        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative p-2 rounded-xl bg-[#0c1829] hover:bg-[#102036] border border-slate-700/70 text-slate-200 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center shadow">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-[#0b1526] border border-slate-700/80 shadow-2xl p-3 z-50 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-semibold text-white">
                  Active Security Notifications (3)
                </span>
                <span className="text-[10px] font-mono text-emerald-400">
                  {regionMeta.code}
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    router.push("/customer/threats-incidents");
                  }}
                  className="w-full text-left p-2 rounded-lg bg-red-950/30 border border-red-500/30 hover:bg-red-950/50"
                >
                  <div className="flex items-center gap-1.5 font-semibold text-red-300">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>14:18 UTC — Possible credential compromise</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Microsoft 365 • Rule ZS-DET-ID-002 triggered
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    router.push("/customer/detection-response");
                  }}
                  className="w-full text-left p-2 rounded-lg bg-amber-950/20 border border-amber-500/30 hover:bg-amber-950/40"
                >
                  <div className="font-semibold text-amber-300">
                    11:42 UTC — Suspicious lateral movement
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Active Directory • Case #4287 awaiting response approval
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    router.push("/customer/integrations");
                  }}
                  className="w-full text-left p-2 rounded-lg bg-slate-800/50 border border-slate-700/60 hover:bg-slate-800"
                >
                  <div className="font-semibold text-slate-200">
                    09:17 UTC — Detection coverage gap identified
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    3 unmonitored systems require connector activation
                  </p>
                </button>
              </div>
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setUnreadCount(0);
                    fetch("/api/v1/notifications/mark-all-read", { method: "POST" }).catch(() => {});
                  }}
                  className="text-slate-400 hover:text-emerald-400 font-medium"
                >
                  Mark all as read
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    router.push("/notifications");
                  }}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  Open Notification Ledger →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Help Button */}
        <button
          type="button"
          aria-label="Documentation and Help"
          onClick={() => router.push("/trust")}
          className="p-2 rounded-xl bg-[#0c1829] hover:bg-[#102036] border border-slate-700/70 text-slate-200 transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* User Profile Pill (Jane Doe / CISO) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl bg-[#0c1829] hover:bg-[#102036] border border-slate-700/70 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-900 font-bold text-xs flex items-center justify-center">
              {initials}
            </div>
            <div className="text-left leading-tight">
              <div className="text-xs font-semibold text-white">
                {displayUserName}
              </div>
              <div className="text-[11px] text-slate-400">{displayRoleLabel}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-xl bg-[#0b1526] border border-slate-700/80 shadow-2xl p-2 z-50 space-y-1">
              <div className="px-3 py-2 border-b border-slate-800">
                <div className="text-xs font-semibold text-white">
                  {displayUserName}
                </div>
                <div className="text-[11px] text-slate-400">
                  {state.session?.email || "jane.doe@acmeglobal.com"}
                </div>
                <div className="mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-red-950/60 border border-red-500/30 text-red-300">
                  Customer Workspace • {displayRoleLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-950/30 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

