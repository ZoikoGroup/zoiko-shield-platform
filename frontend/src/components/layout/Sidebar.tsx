"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useDemoState } from "@/lib/demo-state";
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
} from "lucide-react";

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [state] = useDemoState();

  const navGroups = [
    {
      label: "SEC-OPS & INVESTIGATION",
      items: [
        {
          label: "Command Center",
          href: "/",
          icon: <LayoutDashboard className="w-4 h-4" />,
        },
        {
          label: "Ingestion Console",
          href: "/ingestion",
          icon: <Radio className="w-4 h-4" />,
          badge: state.normalizedEvents.length ? state.normalizedEvents.length : undefined,
        },
        {
          label: "Detection & Alerts",
          href: "/alerts",
          icon: <ShieldAlert className="w-4 h-4" />,
          badge: state.alerts.filter((a) => a.status === "NEW").length || undefined,
          badgeVariant: "critical" as const,
        },
        {
          label: "Case Workspace",
          href: state.cases[0] ? `/cases/${state.cases[0].id}` : "/cases",
          icon: <FolderLock className="w-4 h-4" />,
          badge: state.cases.length || undefined,
          badgeVariant: "ai" as const,
        },
        {
          label: "Threat Hunting Copilot",
          href: "/hunting",
          icon: <Compass className="w-4 h-4" />,
          badge: "ReAct",
          badgeVariant: "ai" as const,
        },
        {
          label: "Purple-Team Simulator",
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
      ],
    },
    {
      label: "CONNECTIVITY & COMPLIANCE",
      items: [
        {
          label: "Connectors Wizard",
          href: "/connectors",
          icon: <Network className="w-4 h-4" />,
          badge: state.connectors.length,
        },
        {
          label: "Merkle Evidence Ledger",
          href: "/ledger",
          icon: <GitCommit className="w-4 h-4" />,
          badge: "ZS-MERKLE",
          badgeVariant: "anchored" as const,
        },
        {
          label: "Controls & Compliance",
          href: "/controls",
          icon: <CheckSquare className="w-4 h-4" />,
        },
        {
          label: "Audit & Verifier",
          href: "/audit",
          icon: <FileCheck2 className="w-4 h-4" />,
          badge: state.auditPackages.length ? "SEALED" : undefined,
          badgeVariant: "anchored" as const,
        },
      ],
    },
    {
      label: "TENANT ADMINISTRATION",
      items: [
        {
          label: "Team & Invitations",
          href: "/team",
          icon: <Users className="w-4 h-4" />,
        },
        {
          label: "Organization Onboarding",
          href: "/onboarding",
          icon: <Building className="w-4 h-4" />,
        },
        {
          label: "Switch Account / Login",
          href: "/login",
          icon: <LogIn className="w-4 h-4" />,
        },
      ],
    },
    {
      label: "PLATFORM ADMIN (CROSS-TENANT)",
      items: [
        {
          label: "Support Access & JIT",
          href: "/admin/jit",
          icon: <KeyRound className="w-4 h-4" />,
          badge: "PLATFORM_ROLE_MANAGE",
          badgeVariant: "ai" as const,
        },
      ],
    },
  ];

  return (
    <aside className="w-64 shrink-0 bg-[#0c0e14] border-r border-slate-800/80 min-h-[calc(100vh-50px)] flex flex-col justify-between p-4 text-slate-300">
      <div className="space-y-6">
        {navGroups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1.5">
            <h4 className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase px-3 mb-2">
              {group.label}
            </h4>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group",
                      isActive
                        ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "transition-colors",
                          isActive
                            ? "text-cyan-400"
                            : "text-slate-500 group-hover:text-slate-300"
                        )}
                      >
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold",
                          item.badgeVariant === "critical"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse"
                            : item.badgeVariant === "ai"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : item.badgeVariant === "anchored"
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            : "bg-slate-800 text-slate-400"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Trust Indicator */}
      <div className="pt-4 border-t border-slate-800/80">
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] space-y-1.5 font-mono">
          <div className="flex items-center justify-between text-slate-400">
            <span>Merkle Epoch:</span>
            <span className="text-cyan-400 font-bold">#1043</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>PQC Seal:</span>
            <span className="text-emerald-400">Dilithium3 ✓</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
