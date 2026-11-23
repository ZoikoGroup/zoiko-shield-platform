"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

export type EmailProtectionState =
  | "NO_COVERAGE"
  | "HEALTHY_SYNCED"
  | "DEGRADED"
  | "STALE"
  | "RECOVERY_IN_PROGRESS"
  | "UNAVAILABLE";

export const EMAIL_SUBNAV = [
  { href: "/email", label: "Overview" },
  { href: "/email/connectors", label: "Connectors" },
  { href: "/email/connectors/health", label: "Health & Gaps" },
  { href: "/email/threats", label: "Threat Queue" },
  { href: "/email/coverage", label: "Control Coverage" },
  { href: "/email/evidence", label: "Evidence Exports" },
  { href: "/email/policies", label: "Policies" },
  { href: "/email/intelligence", label: "AI Intelligence" },
  { href: "/email/actions", label: "Actions (Phase 2)" },
  { href: "/email/settings", label: "Governance" },
];

export function EmailWorkspaceHeader({
  title,
  subtitle,
  activeHref,
  actions,
}: {
  title: string;
  subtitle: string;
  activeHref: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400">
            <Mail className="w-4 h-4 shrink-0" />
            <span>ZOIKOSHIELD EMAIL THREAT INTELLIGENCE &amp; ASSURANCE</span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            {title}
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl">{subtitle}</p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>

      <nav
        aria-label="Email security sub-navigation"
        className="flex flex-wrap gap-1.5 border-b border-line pb-3"
      >
        {EMAIL_SUBNAV.map((tab) => {
          const active = activeHref === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`min-h-[36px] inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                active
                  ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-bold"
                  : "bg-raised border border-line text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function ProtectionStateBadge({
  state,
}: {
  state: EmailProtectionState | string;
}) {
  switch (state) {
    case "HEALTHY_SYNCED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Healthy (Synced)</span>
        </span>
      );
    case "RECOVERY_IN_PROGRESS":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Recovery in Progress</span>
        </span>
      );
    case "DEGRADED":
    case "STALE":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{state === "STALE" ? "Stale Telemetry" : "Degraded Coverage"}</span>
        </span>
      );
    case "UNAVAILABLE":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Source Unavailable</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
          <Clock className="w-3.5 h-3.5" />
          <span>No Coverage</span>
        </span>
      );
  }
}

export function ProviderBadge({ provider }: { provider: string }) {
  const label =
    provider === "MICROSOFT_365"
      ? "Microsoft 365 Defender"
      : provider === "GOOGLE_WORKSPACE"
        ? "Google Workspace Alert Center"
        : provider;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface border border-line text-[11px] font-mono text-cyan-300">
      <ShieldCheck className="w-3 h-3 text-cyan-400" />
      <span>{label}</span>
    </span>
  );
}

export function EmailTruthBanner({
  state,
  message,
  phase2Locked,
}: {
  state: EmailProtectionState | string;
  message?: string;
  phase2Locked?: boolean;
}) {
  const isNoCoverage = state === "NO_COVERAGE";
  const isDegraded =
    state === "DEGRADED" || state === "STALE" || state === "UNAVAILABLE";

  return (
    <div
      role="status"
      className={`p-4 rounded-xl border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
        isNoCoverage
          ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
          : isDegraded
            ? "bg-rose-950/25 border-amber-500/40 text-amber-200"
            : "bg-raised border-cyan-500/30 text-slate-300"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {isNoCoverage || isDegraded ? (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        )}
        <div className="space-y-1">
          <div className="font-mono font-bold">
            {isNoCoverage
              ? "No Email Telemetry Coverage Configured"
              : isDegraded
                ? "Partial or Delayed Email Coverage Detected"
                : "Read-Only Email Telemetry Verified"}
          </div>
          <p className="text-slate-300 leading-relaxed">
            {message ||
              (isNoCoverage
                ? "Connect Microsoft 365 Defender or Google Workspace Alert Center using read-only scopes to collect email security telemetry."
                : "ZoikoShield displays coverage bounded by active connector windows and retention settings.")}
          </p>
        </div>
      </div>

      {phase2Locked && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-300 shrink-0">
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>Phase 2 Mailbox Actions Locked</span>
        </div>
      )}
    </div>
  );
}
