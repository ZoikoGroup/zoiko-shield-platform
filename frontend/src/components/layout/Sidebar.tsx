"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  LayoutDashboard,
  Radio,
  ShieldAlert,
  FolderLock,
  Compass,
  Skull,
  AlertOctagon,
  GitCommit,
  Network,
  CheckSquare,
  FileCheck2,
  KeyRound,
  Users,
  Building,
  LogIn,
  Flame,
  PhoneCall,
  Sliders,
  Layers,
  Scale,
  Landmark,
  Bot,
  ShieldCheck,
  Activity,
  Terminal,
  Bell,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  HelpCircle,
  Settings,
  LogOut,
  ExternalLink,
  Lock,
  Eye,
  FileText,
} from "lucide-react";

interface NavSubItem {
  label: string;
  href: string;
  badge?: string | number;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string | number;
  badgeVariant?: "critical" | "ai" | "anchored";
  hasFlyout?: string;
  children?: NavSubItem[];
}

interface NavGroup {
  id: string;
  label: string;
  hasFlyout?: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [state] = useDemoState();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFlyout, setActiveFlyout] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    investigations: true,
    response: true,
    data: true,
    governance: true,
    admin: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const activeAiIncidents = (state.aiIncidents || []).filter((i) => i.state !== "CLOSED").length;
  const newAlertsCount = state.alerts.filter((a) => a.status === "NEW").length || 0;
  const openCasesCount = state.cases.filter((c) => c.status !== "CLOSED").length || 0;

  // Flyout detailed panels data
  const flyoutPanels: Record<
    string,
    {
      title: string;
      subtitle: string;
      groups: {
        title: string;
        items: {
          label: string;
          desc: string;
          href: string;
          badge?: string | number;
          badgeColor?: string;
          icon: React.ReactNode;
        }[];
      }[];
    }
  > = {
    investigations: {
      title: "Investigations",
      subtitle: "Investigate, analyse and respond to security incidents.",
      groups: [
        {
          title: "INCIDENT OPERATIONS",
          items: [
            {
              label: "Incident Command",
              desc: "Live incident overview, coordination and actions",
              href: "/cases/incidents/command",
              icon: <Flame className="w-4 h-4 text-rose-400" />,
            },
            {
              label: "SOC Shift Handover",
              desc: "Structured handover between analysts",
              href: "/operations/shift-handover",
              icon: <Users className="w-4 h-4 text-blue-400" />,
            },
            {
              label: "Case Workspace",
              desc: "Manage cases, evidence and collaboration",
              href: state.cases[0] ? `/cases/${state.cases[0].id}` : "/cases",
              badge: openCasesCount || 4,
              badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
              icon: <FolderLock className="w-4 h-4 text-amber-400" />,
            },
            {
              label: "Findings",
              desc: "Analyst findings and validations",
              href: "/findings",
              icon: <ShieldAlert className="w-4 h-4 text-cyan-400" />,
            },
          ],
        },
        {
          title: "THREAT ANALYSIS",
          items: [
            {
              label: "Threat Intelligence",
              desc: "External and internal threat intelligence",
              href: "/hunting",
              icon: <Network className="w-4 h-4 text-indigo-400" />,
            },
            {
              label: "Threat Hunting",
              desc: "Proactive search and analysis",
              href: "/hunting",
              icon: <Compass className="w-4 h-4 text-cyan-400" />,
            },
            {
              label: "Simulation Replay",
              desc: "Replay attacks and response scenarios",
              href: "/red-team",
              icon: <Skull className="w-4 h-4 text-rose-400" />,
            },
            {
              label: "ITDR (Identity Threat Detection)",
              desc: "Detect and investigate identity threats",
              href: "/alerts",
              icon: <Users className="w-4 h-4 text-emerald-400" />,
            },
          ],
        },
        {
          title: "RESPONSE & ACTION",
          items: [
            {
              label: "Response Proposals (AI)",
              desc: "AI-assisted response recommendations",
              href: "/response-proposals",
              badge: 6,
              badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
              icon: <Bot className="w-4 h-4 text-purple-400" />,
            },
            {
              label: "SOAR Actions & Freeze",
              desc: "Run, approve and monitor SOAR actions",
              href: "/actions",
              icon: <AlertOctagon className="w-4 h-4 text-amber-400" />,
            },
            {
              label: "IR Retainer & SLA",
              desc: "Incident response retainer and SLA management",
              href: "/ir-retainer",
              icon: <PhoneCall className="w-4 h-4 text-cyan-400" />,
            },
          ],
        },
      ],
    },
    response: {
      title: "Response & Automation",
      subtitle: "Investigation-led, approval-gated response",
      groups: [
        {
          title: "RESPONSE WORKFLOWS",
          items: [
            {
              label: "Response Proposals",
              desc: "Review, simulate, approve or reject",
              href: "/response-proposals",
              badge: 2,
              badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
              icon: <AlertOctagon className="w-4 h-4 text-amber-400" />,
            },
            {
              label: "Playbook Runs",
              desc: "Review automation status and execution history",
              href: "/playbooks",
              badge: "W18",
              badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
              icon: <Terminal className="w-4 h-4 text-cyan-400" />,
            },
            {
              label: "SOAR Actions & Freeze",
              desc: "Controlled execution, freeze and rollback",
              href: "/actions",
              badge: "R0-R4",
              badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
              icon: <AlertOctagon className="w-4 h-4 text-rose-400" />,
            },
          ],
        },
        {
          title: "INCIDENT READINESS",
          items: [
            {
              label: "Simulation Replay",
              desc: "Isolated scenario testing with synthetic events",
              href: "/red-team",
              badge: "SIM",
              badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
              icon: <Skull className="w-4 h-4 text-rose-400" />,
            },
            {
              label: "Incident Command",
              desc: "Coordinated response and escalation",
              href: "/cases/incidents/command",
              icon: <Flame className="w-4 h-4 text-amber-400" />,
            },
            {
              label: "IR Retainer & SLA",
              desc: "Support coverage and service commitments",
              href: "/ir-retainer",
              badge: "24x7",
              badgeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
              icon: <PhoneCall className="w-4 h-4 text-cyan-400" />,
            },
          ],
        },
      ],
    },
  };

  const navGroups: NavGroup[] = [
    {
      id: "workspace",
      label: "PRIMARY WORKSPACE",
      items: [
        {
          label: "Command Center",
          href: "/",
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          label: "Detection & Alerts",
          href: "/alerts",
          icon: <ShieldAlert className="w-4 h-4" />,
          badge: newAlertsCount || 12,
          badgeVariant: "critical" as const,
        },
        {
          label: "Investigations",
          href: "/cases",
          icon: <Search className="w-4 h-4" />,
          hasFlyout: "investigations",
          badge: openCasesCount || 4,
          badgeVariant: "ai" as const,
          children: [
            { label: "Incident Command", href: "/cases/incidents/command" },
            { label: "SOC Shift Handover", href: "/operations/shift-handover" },
            { label: "Case Workspace", href: state.cases[0] ? `/cases/${state.cases[0].id}` : "/cases", badge: openCasesCount || 2 },
            { label: "Findings", href: "/findings" },
            { label: "Threat Intelligence", href: "/hunting" },
            { label: "Threat Hunting", href: "/hunting" },
            { label: "Simulation Replay", href: "/red-team" },
          ],
        },
        {
          label: "Case Workspace",
          href: state.cases[0] ? `/cases/${state.cases[0].id}` : "/cases",
          icon: <FolderLock className="w-4 h-4" />,
          badge: openCasesCount || 4,
          badgeVariant: "ai" as const,
        },
        {
          label: "Threat Hunting",
          href: "/hunting",
          icon: <Compass className="w-4 h-4" />,
          badge: "ReAct",
          badgeVariant: "ai" as const,
        },
        {
          label: "AI Security Copilot",
          href: "/copilot",
          icon: <Bot className="w-4 h-4" />,
          badge: 6,
          badgeVariant: "ai" as const,
        },
      ],
    },
    {
      id: "response",
      label: "OPERATIONS & RESPONSE",
      hasFlyout: "response",
      items: [
        {
          label: "Incident Command",
          href: "/cases/incidents/command",
          icon: <Flame className="w-4 h-4" />,
        },
        {
          label: "Playbook Runs",
          href: "/playbooks",
          icon: <Terminal className="w-4 h-4" />,
          badge: "W18",
          badgeVariant: "anchored" as const,
        },
        {
          label: "Response Proposals",
          href: "/response-proposals",
          icon: <AlertOctagon className="w-4 h-4" />,
          badge: "§16.1",
          badgeVariant: "ai" as const,
        },
        {
          label: "Simulation & Training",
          href: "/red-team",
          icon: <Skull className="w-4 h-4" />,
          badge: "SIM",
          badgeVariant: "critical" as const,
        },
        {
          label: "SOAR Actions & Freeze",
          href: "/actions",
          icon: <AlertOctagon className="w-4 h-4" />,
          badge: "R0-R4",
          badgeVariant: "anchored" as const,
        },
        {
          label: "IR Retainer & SLA",
          href: "/ir-retainer",
          icon: <PhoneCall className="w-4 h-4" />,
          badge: "24x7",
          badgeVariant: "anchored" as const,
        },
      ],
    },
    {
      id: "data",
      label: "ASSETS & CONNECTIVITY",
      items: [
        {
          label: "Assets & Inventory",
          href: "/assets",
          icon: <Building className="w-4 h-4" />,
        },
        {
          label: "Data Sources & Integrations",
          href: "/ingestion",
          icon: <Radio className="w-4 h-4" />,
          badge: state.normalizedEvents.length || undefined,
        },
        {
          label: "Connectors Wizard",
          href: "/connectors",
          icon: <Network className="w-4 h-4" />,
          badge: state.connectors.length,
        },
      ],
    },
    {
      id: "governance",
      label: "COMPLIANCE & GOVERNANCE",
      items: [
        {
          label: "Evidence & Compliance",
          href: "/ledger",
          icon: <GitCommit className="w-4 h-4" />,
          badge: "ZS-MERKLE",
          badgeVariant: "anchored" as const,
        },
        {
          label: "Policy & Controls",
          href: "/policies",
          icon: <Sliders className="w-4 h-4" />,
          badge: "4-EYES",
          badgeVariant: "anchored" as const,
        },
        {
          label: "Controls & Compliance",
          href: "/controls",
          icon: <CheckSquare className="w-4 h-4" />,
        },
        {
          label: "Risk & Exceptions",
          href: "/risk",
          icon: <Scale className="w-4 h-4" />,
        },
        {
          label: "Notification Center",
          href: "/notifications",
          icon: <Bell className="w-4 h-4" />,
        },
        {
          label: "Audit & Verifier",
          href: "/audit",
          icon: <FileCheck2 className="w-4 h-4" />,
          badge: state.auditPackages.length ? "SEALED" : undefined,
          badgeVariant: "anchored" as const,
        },
        {
          label: "Trust Center",
          href: "/trust",
          icon: <ShieldCheck className="w-4 h-4" />,
        },
      ],
    },
    {
      id: "admin",
      label: "ADMINISTRATION",
      items: [
        {
          label: "Tenant Management",
          href: "/tenant-management",
          icon: <Building className="w-4 h-4" />,
        },
        {
          label: "Team & Access",
          href: "/team",
          icon: <Users className="w-4 h-4" />,
        },
        {
          label: "Organization Onboarding",
          href: "/onboarding",
          icon: <Building className="w-4 h-4" />,
        },
        {
          label: "MSSP Fleet & 2-Party JIT",
          href: "/partner/fleet",
          icon: <Building className="w-4 h-4" />,
          badge: "2-PARTY",
          badgeVariant: "anchored" as const,
        },
        {
          label: "Platform Service Health",
          href: "/admin/platform-health",
          icon: <Activity className="w-4 h-4" />,
          badge: "§31/§32",
          badgeVariant: "ai" as const,
        },
        {
          label: "G1 Launch Gate Protocol",
          href: "/admin/g1-gate",
          icon: <ShieldCheck className="w-4 h-4" />,
          badge: "0/8",
          badgeVariant: "critical" as const,
        },
        {
          label: "JIT Elevation Quorum",
          href: "/admin/jit-elevation",
          icon: <KeyRound className="w-4 h-4" />,
          badge: "4-EYES",
          badgeVariant: "anchored" as const,
        },
        {
          label: "GTM Pre-Flight Checklist",
          href: "/admin/gtm-checklist",
          icon: <CheckSquare className="w-4 h-4" />,
          badge: "12/12",
          badgeVariant: "anchored" as const,
        },
        {
          label: "Operations & Entitlements",
          href: "/admin",
          icon: <Sliders className="w-4 h-4" />,
          badge: "OPERATOR",
          badgeVariant: "anchored" as const,
        },
        {
          label: "Sign Out / Logout",
          href: "/login?logout=true",
          icon: <LogOut className="w-4 h-4 text-rose-400" />,
          badge: "EXIT",
        },
      ],
    },
  ];

  // Filter items by search query if any
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return navGroups;
    const query = searchQuery.toLowerCase();
    return navGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(query) ||
            item.children?.some((c) => c.label.toLowerCase().includes(query))
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, searchQuery]);

  const userInitials = (state.session.fullName || "Sarah Chen")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex shrink-0 relative z-30 select-none h-screen sticky top-0 overflow-hidden">
      {/* Primary Sidebar Rail/Panel */}
      <aside
        className={cn(
          "bg-[#080c16] border-r border-[#141c2e] h-screen flex flex-col justify-between transition-all duration-300 text-slate-300 overflow-hidden",
          isCollapsed ? "w-[72px] px-2 py-3" : "w-72 lg:w-80 px-3.5 py-4"
        )}
      >
        <div className="space-y-4">
          {/* Logo & Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#141c2e]">
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
              onClick={() => {
                setIsCollapsed(!isCollapsed);
                if (!isCollapsed) setActiveFlyout(null);
              }}
              className={cn(
                "p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-[#101626] transition-colors",
                isCollapsed && "mx-auto mt-2"
              )}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {!isCollapsed && (
            <>
              {/* Tenant Selector Box */}
              <div className="p-2.5 rounded-xl bg-[#0c111e] border border-[#162238] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <div className="truncate">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {state.tenant.organizationName || "Acme Corporation"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {state.tenant.planTier || "Enterprise Tenant"}
                      </div>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>

                {/* Environment indicator */}
                <div className="flex items-center justify-between text-[10px] font-mono pt-1.5 border-t border-[#141f33] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-300 font-medium">Production</span>
                    <span className="text-slate-500">|</span>
                    <span>{state.tenant.homeRegion || "US East (1)"}</span>
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-500" />
                </div>
              </div>

              {/* Navigation Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search modules, pages or actions..."
                  className="w-full bg-[#0c111e] border border-[#162238] rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
                />
                <span className="absolute right-2 top-2 px-1 py-0.5 rounded bg-[#141f33] text-[9px] font-mono text-slate-400">
                  ⌘K
                </span>
              </div>
            </>
          )}

          {/* Navigation Links Scroll Container */}
          <div className="overflow-y-auto max-h-[calc(100vh-340px)] pr-1 space-y-4">
            {filteredGroups.map((group) => (
              <div key={group.id} className="space-y-1">
                {!isCollapsed && (
                  <div
                    onClick={() => toggleSection(group.id)}
                    className="flex items-center justify-between px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase cursor-pointer hover:text-slate-200 transition-colors"
                  >
                    <span>{group.label}</span>
                    {group.hasFlyout ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFlyout(activeFlyout === group.hasFlyout ? null : (group.hasFlyout || null));
                        }}
                        className="text-cyan-400 hover:text-cyan-300"
                        title="Open detailed workspace"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <ChevronDown
                        className={cn(
                          "w-3 h-3 transition-transform text-slate-500",
                          !expandedSections[group.id] && "-rotate-90"
                        )}
                      />
                    )}
                  </div>
                )}

                {(isCollapsed || expandedSections[group.id] !== false) && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== "/" && pathname.startsWith(item.href));

                      if (isCollapsed) {
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            title={`${item.label} ${item.badge ? `(${item.badge})` : ""}`}
                            className={cn(
                              "relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all my-1 group",
                              isActive
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                                : "text-slate-400 hover:text-slate-100 hover:bg-[#101626]"
                            )}
                          >
                            <span className={cn("transition-colors", isActive ? "text-cyan-400" : "text-slate-400 group-hover:text-slate-200")}>
                              {item.icon}
                            </span>
                            {item.badge !== undefined && (
                              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#080c16]" />
                            )}
                          </Link>
                        );
                      }

                      return (
                        <div key={item.href} className="space-y-0.5">
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all group",
                              isActive
                                ? "bg-cyan-950/40 text-cyan-300 border-l-2 border-cyan-400 border-y border-r border-[#162238] shadow-[0_0_15px_rgba(6,182,212,0.12)]"
                                : "text-slate-400 hover:text-slate-200 hover:bg-[#0c111e]"
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={cn(
                                  "transition-colors shrink-0",
                                  isActive
                                    ? "text-cyan-400"
                                    : "text-slate-400 group-hover:text-slate-200"
                                )}
                              >
                                {item.icon}
                              </span>
                              <span className="truncate">{item.label}</span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.badge !== undefined && (
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight",
                                    item.badgeVariant === "critical"
                                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse"
                                      : item.badgeVariant === "ai"
                                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                      : item.badgeVariant === "anchored"
                                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                      : "bg-[#141f33] text-slate-300 border border-slate-700/60"
                                  )}
                                >
                                  {item.badge}
                                </span>
                              )}

                              {item.hasFlyout && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveFlyout(
                                      activeFlyout === item.hasFlyout ? null : (item.hasFlyout || null)
                                    );
                                  }}
                                  className="text-slate-500 hover:text-cyan-400 p-0.5"
                                  title="Expand detailed drawer"
                                >
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </Link>

                          {/* Nested items if any (like Investigations dropdown) */}
                          {item.children && isActive && (
                            <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-[#141f33] ml-4">
                              {item.children.map((child) => (
                                <Link
                                  key={child.href + child.label}
                                  href={child.href}
                                  className={cn(
                                    "flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors",
                                    pathname === child.href
                                      ? "text-cyan-300 font-semibold bg-cyan-500/10"
                                      : "text-slate-400 hover:text-slate-200 hover:bg-[#0c111e]"
                                  )}
                                >
                                  <span className="truncate">• {child.label}</span>
                                  {child.badge && (
                                    <span className="px-1 rounded bg-[#141f33] text-[9px] font-mono text-purple-300">
                                      {child.badge}
                                    </span>
                                  )}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer Area: Help, Profile & Version Info */}
        <div className="pt-3 border-t border-[#141c2e] space-y-2.5">
          {!isCollapsed ? (
            <>
              {/* Help Link */}
              <Link
                href="/help"
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-[#0c111e] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-slate-400" />
                  <span>Help & Documentation</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </Link>

              {/* User Profile Card */}
              <div className="p-2.5 rounded-xl bg-[#0c111e] border border-[#162238] flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-bold text-xs shadow-[0_0_12px_rgba(6,182,212,0.3)] shrink-0">
                    {userInitials || "SC"}
                  </div>
                  <div className="truncate text-xs">
                    <div className="font-semibold text-slate-200 truncate">
                      {state.session.fullName || "Sarah Chen"}
                    </div>
                    <div className="text-[10px] font-mono text-cyan-400 truncate">
                      {state.session.role?.replace(/_/g, " ") || "Security Analyst"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 text-slate-400">
                  <Link
                    href="/notifications"
                    className="p-1 hover:text-cyan-400 hover:bg-[#141f33] rounded relative"
                    title="Notifications"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    {newAlertsCount > 0 && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      ZoikoShieldApiClient.logout();
                      window.location.href = "/login?logout=true";
                    }}
                    className="p-1 hover:text-rose-400 hover:bg-[#141f33] rounded transition-colors"
                    title="Sign Out of Platform"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Full-Width Prominent Sign Out Button */}
              <button
                type="button"
                onClick={() => {
                  ZoikoShieldApiClient.logout();
                  window.location.href = "/login?logout=true";
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 border border-rose-500/30 hover:border-rose-500/60 text-xs font-mono font-bold text-rose-400 transition-all shadow-[0_0_12px_rgba(244,63,94,0.15)] group"
                title="Sign Out of Platform"
              >
                <div className="flex items-center gap-2">
                  <LogOut className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                  <span>Sign Out / Logout</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-rose-400/60 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* Version & Environment Tag */}
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
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-[#101626] rounded-lg"
                title="Help & Documentation"
              >
                <HelpCircle className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => {
                  ZoikoShieldApiClient.logout();
                  window.location.href = "/login?logout=true";
                }}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-[#101626] rounded-lg"
                title="Sign Out"
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

      {/* Flyout Secondary Drawer Panel ("Section Expanded") */}
      {activeFlyout && flyoutPanels[activeFlyout] && (
        <aside className="w-72 lg:w-80 bg-[#0b101c] border-r border-[#162238] min-h-[calc(100vh-50px)] p-4 flex flex-col justify-between shadow-2xl animate-in slide-in-from-left-4 duration-200">
          <div className="space-y-4">
            {/* Drawer Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#162238]">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-wider uppercase">
                  WORKSPACE
                </span>
                <h3 className="text-sm font-bold text-slate-100">
                  {flyoutPanels[activeFlyout].title}
                </h3>
                <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
                  {flyoutPanels[activeFlyout].subtitle}
                </p>
              </div>
              <button
                onClick={() => setActiveFlyout(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-[#141f33] transition-colors"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Groups & Items */}
            <div className="space-y-5 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
              {flyoutPanels[activeFlyout].groups.map((group, idx) => (
                <div key={idx} className="space-y-2">
                  <h4 className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                    {group.title}
                  </h4>
                  <div className="space-y-1">
                    {group.items.map((item, itemIdx) => {
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={itemIdx}
                          href={item.href}
                          onClick={() => setActiveFlyout(null)}
                          className={cn(
                            "block p-2.5 rounded-lg border transition-all group",
                            isActive
                              ? "bg-cyan-950/40 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                              : "bg-[#080c16]/70 border-[#141f33] hover:border-cyan-500/30 hover:bg-[#0c111e]"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {item.icon}
                              <span className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                                {item.label}
                              </span>
                            </div>
                            {item.badge !== undefined && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border",
                                  item.badgeColor || "bg-slate-800 text-slate-300 border-slate-700"
                                )}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 leading-snug mt-1 pl-6">
                            {item.desc}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Drawer Footer Notice */}
          <div className="pt-3 border-t border-[#162238] space-y-2">
            <div className="p-2.5 rounded-lg bg-[#080c16] border border-[#141f33] text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 text-cyan-400 font-mono font-semibold">
                <Lock className="w-3 h-3" />
                <span>CONTROLLED ACTIONS</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Sensitive responses require authorization, human approval and dual custody where specified by response policy.
              </p>
            </div>
            <Link
              href="/help"
              className="flex items-center justify-between text-[11px] text-slate-400 hover:text-cyan-300 py-1"
            >
              <span>Need help? View documentation</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </aside>
      )}
    </div>
  );
};
