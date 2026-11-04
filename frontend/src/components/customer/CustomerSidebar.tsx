"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  ShieldAlert,
  BellRing,
  Shield,
  Server,
  ShieldCheck,
  Crosshair,
  UserCheck,
  FileLock2,
  Cloud,
  ClipboardCheck,
  PieChart,
  Share2,
  Settings,
} from "lucide-react";

export interface CustomerNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPaths?: string[];
}

export const CUSTOMER_PRIMARY_NAV: CustomerNavItem[] = [
  {
    label: "Command Center",
    href: "/customer/dashboard",
    icon: LayoutGrid,
    matchPaths: ["/customer/dashboard", "/customer", "/"],
  },
  {
    label: "Security Overview",
    href: "/customer/security-overview",
    icon: ShieldAlert,
    matchPaths: ["/customer/security-overview", "/risk/executive"],
  },
  {
    label: "Threats & Incidents",
    href: "/customer/threats-incidents",
    icon: BellRing,
    matchPaths: ["/customer/threats-incidents", "/alerts", "/incident-command"],
  },
  {
    label: "Exposure Management",
    href: "/customer/exposure-management",
    icon: Shield,
    matchPaths: ["/customer/exposure-management", "/risk"],
  },
  {
    label: "Assets & Inventory",
    href: "/customer/assets-inventory",
    icon: Server,
    matchPaths: ["/customer/assets-inventory", "/assets"],
  },
  {
    label: "Vulnerabilities",
    href: "/customer/vulnerabilities",
    icon: ShieldCheck,
    matchPaths: ["/customer/vulnerabilities", "/assessments", "/red-team"],
  },
  {
    label: "Detection & Response",
    href: "/customer/detection-response",
    icon: Crosshair,
    matchPaths: [
      "/customer/detection-response",
      "/cases",
      "/hunting",
      "/response-proposals",
      "/actions",
      "/copilot",
    ],
  },
  {
    label: "Identity & Access",
    href: "/customer/identity-access",
    icon: UserCheck,
    matchPaths: ["/customer/identity-access", "/team"],
  },
  {
    label: "Data Security",
    href: "/customer/data-security",
    icon: FileLock2,
    matchPaths: ["/customer/data-security", "/evidence-operations", "/ledger"],
  },
  {
    label: "Cloud Security",
    href: "/customer/cloud-security",
    icon: Cloud,
    matchPaths: ["/customer/cloud-security", "/ingestion"],
  },
  {
    label: "Compliance & Risk",
    href: "/customer/compliance-risk",
    icon: ClipboardCheck,
    matchPaths: ["/customer/compliance-risk", "/compliance", "/controls", "/trust"],
  },
  {
    label: "Reports & Analytics",
    href: "/customer/reports-analytics",
    icon: PieChart,
    matchPaths: ["/customer/reports-analytics", "/audit"],
  },
];

export const CUSTOMER_FOOTER_NAV: CustomerNavItem[] = [
  {
    label: "Integrations",
    href: "/customer/integrations",
    icon: Share2,
    matchPaths: ["/customer/integrations", "/connectors"],
  },
  {
    label: "Settings",
    href: "/customer/settings",
    icon: Settings,
    matchPaths: ["/customer/settings", "/settings"],
  },
];

export function CustomerSidebar() {
  const pathname = usePathname();

  const isItemActive = (item: CustomerNavItem) => {
    if (pathname === item.href) return true;
    if (item.matchPaths?.includes(pathname)) return true;
    return false;
  };

  return (
    <aside
      aria-label="Customer Workspace Navigation"
      className="w-[248px] shrink-0 h-screen bg-[#060d18] border-r border-slate-800/80 flex flex-col justify-between select-none z-30"
    >
      {/* Top Brand Logo */}
      <div>
        <div className="h-[68px] px-5 flex items-center border-b border-slate-800/60">
          <Link href="/customer/dashboard" className="flex items-center gap-2 group">
            <div className="flex flex-col leading-none">
              <div className="flex items-baseline tracking-tight font-black text-2xl">
                <span className="text-[#ef4444] drop-shadow-[0_0_10px_rgba(239,68,68,0.45)]">
                  ZO
                </span>
                <span className="text-white">iKO</span>
                <span className="text-[9px] font-bold text-slate-400 ml-0.5 align-top">
                  TM
                </span>
              </div>
              <span className="text-[11px] font-extrabold tracking-[0.26em] text-[#ef4444] -mt-0.5">
                SHIELD
              </span>
            </div>
          </Link>
        </div>

        {/* 12 Primary Customer Navigation Links */}
        <nav className="px-3 py-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-235px)]">
          {CUSTOMER_PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                  active
                    ? "bg-gradient-to-r from-[#b91c1c] via-[#991b1b] to-[#7f1d1d]/80 text-white shadow-[0_0_18px_rgba(220,38,38,0.35)] border border-red-500/40"
                    : "text-slate-300/90 hover:text-white hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? "text-white" : "text-slate-400"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Integrations, Settings & Brand Assurance Card */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-800/70 space-y-2 bg-[#060d18]">
        <div className="space-y-0.5">
          {CUSTOMER_FOOTER_NAV.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  active
                    ? "bg-gradient-to-r from-[#b91c1c] via-[#991b1b] to-[#7f1d1d]/80 text-white shadow-[0_0_18px_rgba(220,38,38,0.35)] border border-red-500/40"
                    : "text-slate-300/85 hover:text-white hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? "text-white" : "text-slate-400"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Zoiko Shield Brand Card */}
        <div className="p-3 rounded-xl bg-gradient-to-br from-[#0b1628] to-[#08101e] border border-slate-800/90 flex items-center gap-3 shadow-inner">
          <div className="w-9 h-9 rounded-lg bg-red-950/70 border border-red-500/40 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(239,68,68,0.25)]">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <div className="leading-tight">
            <div className="text-xs font-bold text-white">Zoiko Shield</div>
            <div className="text-[11px] text-slate-400">Smarter Security.</div>
            <div className="text-[11px] text-slate-400">Stronger Business.</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

