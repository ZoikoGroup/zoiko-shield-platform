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
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { resolveRegionMetadata } from "@/lib/assurance-primitives";
import { asList, backend } from "@/lib/backend";
import { customerApi } from "@/lib/customer-api";

interface HeaderIdentity {
  fullName: string;
  email: string;
  orgName: string;
  region: string;
  roleCodes: string[];
  roleNames: string[];
}

interface NotificationDeliveryRow {
  id: string;
  event_id?: string;
  channel?: string;
  status?: string;
  created_at?: string;
}

const READ_STATUSES = new Set(["ACKNOWLEDGED", "READ", "SEEN"]);

interface HeaderNotificationItem {
  id: string;
  title: string;
  subtitle: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  href: string;
}

export function CustomerTopHeader({
  searchQuery = "",
  onSearchChange,
}: {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}) {
  const router = useRouter();
  const [, setDemoState] = useDemoState();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<HeaderNotificationItem[]>([]);
  const [unreadIds, setUnreadIds] = useState<string[]>([]);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<HeaderIdentity | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await customerApi.session();
        const [tenantRes, membersRes] = await Promise.allSettled([
          customerApi.tenant(),
          backend.get<unknown>(`/api/v1/tenants/${encodeURIComponent(me.tenantId)}/members`),
        ]);
        const tenant = tenantRes.status === "fulfilled" ? tenantRes.value : null;
        const members =
          membersRes.status === "fulfilled"
            ? asList<{ principalId: string; roles?: Array<{ code: string; name: string }> }>(membersRes.value)
            : [];
        const roles = members.find((m) => m.principalId === me.id)?.roles ?? [];
        const next: HeaderIdentity = {
          fullName: me.fullName || "",
          email: me.email || "",
          orgName: tenant?.name || "",
          region: tenant?.dataResidencyRegion || tenant?.homeRegion || me.region || "",
          roleCodes: roles.map((r) => r.code),
          roleNames: roles.map((r) => r.name),
        };
        if (cancelled) return;
        setIdentity(next);
        // Other pages still read tenant/session from this store: give them real values.
        setDemoState((prev) => ({
          ...prev,
          session: {
            ...prev.session,
            userId: me.id,
            email: next.email,
            fullName: next.fullName,
            role: (next.roleCodes[0] as typeof prev.session.role) || prev.session?.role,
            tenantId: me.tenantId,
            isAuthenticated: true,
          },
          tenant: {
            ...prev.tenant,
            id: me.tenantId,
            organizationName: next.orgName || prev.tenant?.organizationName || "",
            ...(tenant ? { homeRegion: tenant.homeRegion, dataResidencyRegion: tenant.dataResidencyRegion } : {}),
          },
        }));
      } catch {
        // Not signed in or backend unreachable: the header shows no identity rather than a made-up one.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setDemoState]);

  const loadNotifications = React.useCallback(async () => {
    try {
      const rows = asList<NotificationDeliveryRow>(await backend.get("/api/v1/notifications?limit=20"));
      setNotifications(
        rows.slice(0, 6).map((d) => ({
          id: d.id,
          title: d.event_id || "Notification",
          subtitle: [d.channel, d.status, d.created_at ? new Date(d.created_at).toLocaleString() : ""].filter(Boolean).join(" • "),
          severity: d.status === "DEAD_LETTERED" || d.status === "FAILED" ? "WARNING" : "INFO",
          href: "/notifications",
        })),
      );
      setUnreadIds(rows.filter((d) => !READ_STATUSES.has(String(d.status))).map((d) => d.id));
      setNotifError(null);
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markAllRead = async () => {
    const results = await Promise.allSettled(
      unreadIds.map((id) =>
        backend.post(`/api/v1/notifications/${encodeURIComponent(id)}/acknowledge`, { acknowledgementType: "SEEN" }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    await loadNotifications();
    if (failed > 0) setNotifError(`${failed} of ${results.length} notifications could not be marked as read.`);
  };

  const unreadCount = unreadIds.length;
  const regionMeta = identity?.region ? resolveRegionMetadata(identity.region) : null;

  const handleSignOut = async () => {
    await ZoikoShieldApiClient.logout();
    setDemoState((prev) => ({
      ...prev,
      session: {
        ...prev.session,
        userId: "",
        email: "",
        fullName: "",
        token: "",
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

  const displayOrgName = identity?.orgName || "";
  const displayUserName = identity?.fullName || identity?.email || "";
  const displayUserEmail = identity?.email || "";
  const displayRoleLabel = identity?.roleNames.join(", ") || "";
  const isTenantOwner = identity?.roleCodes.includes("TENANT_OWNER") ?? false;
  const isSuperAdmin = identity?.roleCodes.includes("SUPER_ADMIN") ?? false;

  const initials = displayUserName
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "ZS";

  return (
    <header className="h-[68px] shrink-0 w-full bg-[#07101e]/95 backdrop-blur-md border-b border-slate-800/80 px-6 flex items-center justify-between gap-4 z-20">
      {/* Left Controls: Customer Workspace Switcher + Data Residency Region */}
      <div className="flex items-center gap-3">
        {/* Customer Workspace Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setWorkspaceMenuOpen((v) => !v)}
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

              {(isTenantOwner || isSuperAdmin) && (
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

              {isSuperAdmin && (
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

        {/* Data residency region of this workspace (read-only: residency is not changed from the header) */}
        {regionMeta && (
          <div
            title={`Data residency: ${regionMeta.code}`}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0c1829] border border-slate-700/70 text-xs font-medium text-slate-200"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>{regionMeta.shortLabel}</span>
          </div>
        )}
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
                  Active Security Notifications ({notifications.length})
                </span>
                {regionMeta && (
                  <span className="text-[10px] font-mono text-emerald-400">{regionMeta.code}</span>
                )}
              </div>
              {notifError && (
                <div role="alert" className="text-[11px] text-red-300">
                  {notifError}
                </div>
              )}
              {notifications.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">No notifications.</div>
              ) : (
                <div className="space-y-1.5 text-xs max-h-64 overflow-y-auto">
                  {notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        router.push(item.href);
                      }}
                      className={`w-full text-left p-2 rounded-lg border transition-colors ${
                        item.severity === "CRITICAL"
                          ? "bg-red-950/30 border-red-500/30 hover:bg-red-950/50"
                          : "bg-slate-800/50 border-slate-700/60 hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                        <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${item.severity === "INFO" ? "text-sky-400" : "text-amber-400"}`} />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {item.subtitle}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={unreadCount === 0}
                  className="text-slate-400 hover:text-emerald-400 font-medium disabled:opacity-40"
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

        {/* User Profile Pill */}
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
                  {displayUserEmail}
                </div>
                {displayRoleLabel && (
                  <div className="mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-red-950/60 border border-red-500/30 text-red-300">
                    {displayRoleLabel}
                  </div>
                )}
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

