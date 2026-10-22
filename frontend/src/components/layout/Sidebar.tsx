"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { NAV_GROUPS, findActiveNav, type NavBadgeVariant } from "@/components/layout/nav-config";
import {
  Building,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  LogOut,
} from "lucide-react";

const badgeClass = (variant?: NavBadgeVariant) =>
  variant === "critical"
    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
    : variant === "ai"
    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
    : variant === "anchored"
    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
    : "bg-line text-slate-300 border border-slate-700/60";

const signOut = async () => {
  await ZoikoShieldApiClient.logout();
  window.location.href = "/login?logout=true";
};

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [state] = useDemoState();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const newAlertsCount = state.alerts.filter((a) => a.status === "NEW").length;
  const openCasesCount = state.cases.filter((c) => c.status !== "CLOSED").length;
  const activeAiIncidents = (state.aiIncidents || []).filter((i) => i.state !== "CLOSED").length;

  // Live counts from demo state, keyed by href. Only shown when non-zero.
  const liveCounts: Record<string, { count: number; variant: NavBadgeVariant }> = {
    "/alerts": { count: newAlertsCount, variant: "critical" },
    "/cases": { count: openCasesCount, variant: "ai" },
    "/ai-governance": { count: activeAiIncidents, variant: "critical" },
    "/connectors": { count: state.connectors.length, variant: "anchored" },
  };

  const activeHref = findActiveNav(pathname)?.item.href;

  const query = searchQuery.trim().toLowerCase();
  const visibleGroups = query
    ? NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => item.label.toLowerCase().includes(query)),
      })).filter((g) => g.items.length > 0)
    : NAV_GROUPS;

  const userInitials = (state.session.fullName || state.session.email || "Operator")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex shrink-0 relative z-30 select-none h-screen sticky top-0 overflow-hidden">
      <aside
        className={cn(
          "bg-surface border-r border-line h-screen flex flex-col justify-between transition-all duration-300 text-slate-300 overflow-hidden",
          isCollapsed ? "w-[72px] px-2 py-3" : "w-72 lg:w-80 px-3.5 py-4"
        )}
      >
        <div className="space-y-4 min-h-0 flex flex-col">
          {/* Logo & Header */}
          <div className="flex items-center justify-between pb-3 border-b border-line">
            {!isCollapsed ? (
              <Link href="/" className="flex items-center gap-2.5 group">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black shadow-[0_0_20px_rgba(6,182,212,0.4)] group-hover:scale-105 transition-transform">
                  <span className="font-extrabold text-sm tracking-tight text-slate-950 font-mono">ZS</span>
                </div>
                <div>
                  <div className="font-bold text-slate-100 text-sm tracking-tight flex items-center gap-1.5">
                    <span>ZoikoShield</span>
                  </div>
                  <div className="text-[9px] font-mono font-medium text-cyan-400 tracking-wider uppercase">
                    SECURE · DETECT · RESPOND · ASSURE
                  </div>
                </div>
              </Link>
            ) : (
              <Link href="/" className="mx-auto" title="ZoikoShield">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                  <span className="font-extrabold text-sm tracking-tight text-slate-950 font-mono">ZS</span>
                </div>
              </Link>
            )}

            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(
                "p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-overlay transition-colors",
                isCollapsed && "mx-auto mt-2"
              )}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {!isCollapsed && (
            <>
              {/* Tenant Box */}
              <div className="p-2.5 rounded-xl bg-raised border border-line space-y-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <div className="truncate">
                    <div className="text-xs font-semibold text-slate-100 truncate">
                      {state.tenant.organizationName || "ZoikoShield Enterprise"}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {state.tenant.planTier || "Enterprise Tenant"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-mono pt-1.5 border-t border-line text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>{state.tenant.homeRegion || "US East (1)"}</span>
                </div>
              </div>

              {/* Navigation Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter navigation..."
                  className="w-full bg-raised border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
                />
              </div>
            </>
          )}

          {/* Navigation Links */}
          <nav className="overflow-y-auto min-h-0 flex-1 pr-1 space-y-4">
            {visibleGroups.map((group) => {
              const isOpen = isCollapsed || !!query || !collapsedSections[group.id];
              return (
                <div key={group.id} className="space-y-1">
                  {!isCollapsed && (
                    <button
                      type="button"
                      onClick={() => toggleSection(group.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase hover:text-slate-200 transition-colors"
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={cn("w-3 h-3 transition-transform text-slate-500", !isOpen && "-rotate-90")}
                      />
                    </button>
                  )}

                  {isOpen && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.href === activeHref;
                        const live = liveCounts[item.href];
                        const badge = live && live.count > 0 ? live.count : item.tag;
                        const badgeVariant = live && live.count > 0 ? live.variant : item.tagVariant;

                        if (isCollapsed) {
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              title={`${item.label}${badge !== undefined ? ` (${badge})` : ""}`}
                              className={cn(
                                "relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all my-1 group",
                                isActive
                                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                                  : "text-slate-400 hover:text-slate-100 hover:bg-overlay"
                              )}
                            >
                              <Icon className={cn("w-4 h-4 transition-colors", isActive ? "text-cyan-400" : "text-slate-400 group-hover:text-slate-200")} />
                              {live && live.count > 0 && (
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-surface" />
                              )}
                            </Link>
                          );
                        }

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                              "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all group",
                              isActive
                                ? "bg-cyan-950/40 text-cyan-300 border-l-2 border-cyan-400 border-y border-r border-line shadow-[0_0_15px_rgba(6,182,212,0.12)]"
                                : "text-slate-400 hover:text-slate-200 hover:bg-raised"
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Icon
                                className={cn(
                                  "w-4 h-4 transition-colors shrink-0",
                                  isActive ? "text-cyan-400" : "text-slate-400 group-hover:text-slate-200"
                                )}
                              />
                              <span className="truncate">{item.label}</span>
                            </div>

                            {badge !== undefined && (
                              <span
                                className={cn(
                                  "shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight",
                                  badgeClass(badgeVariant)
                                )}
                              >
                                {badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {visibleGroups.length === 0 && (
              <p className="px-2.5 text-[11px] text-slate-500">No pages match &ldquo;{searchQuery}&rdquo;.</p>
            )}
          </nav>
        </div>

        {/* Footer Area: Help, Profile & Sign Out */}
        <div className="pt-3 border-t border-line space-y-2.5 shrink-0">
          {!isCollapsed ? (
            <>
              <Link
                href="/help"
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-raised transition-colors"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-slate-400" />
                  <span>Help & Documentation</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </Link>

              {/* User Profile Card */}
              <div className="p-2.5 rounded-xl bg-raised border border-line flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-bold text-xs shadow-[0_0_12px_rgba(6,182,212,0.3)] shrink-0">
                    {userInitials || "SC"}
                  </div>
                  <div className="truncate text-xs">
                    <div className="font-semibold text-slate-200 truncate">
                      {state.session.fullName || state.session.email || "Active Operator"}
                    </div>
                    <div className="text-[10px] font-mono text-cyan-400 truncate">
                      {state.session.role?.replace(/_/g, " ") || "Security Analyst"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={signOut}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-line rounded transition-colors shrink-0"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1">
                <span>ZoikoShield v3.2</span>
                <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                  NOT PRODUCTION
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Link
                href="/help"
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-overlay rounded-lg"
                title="Help & Documentation"
              >
                <HelpCircle className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-overlay rounded-lg"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <div
                className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-bold text-xs shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                title={`${state.session.fullName} (${state.session.role})`}
              >
                {userInitials || "SC"}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
