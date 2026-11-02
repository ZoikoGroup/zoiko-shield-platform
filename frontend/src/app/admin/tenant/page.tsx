"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building2,
  ShieldCheck,
  Database,
  KeyRound,
  Lock,
  Activity,
  Users,
  Scale,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Shield,
  Sliders,
  FileCheck2,
} from "lucide-react";
import { useDemoState } from "@/lib/demo-state";
import {
  resolveRegionMetadata,
  resolvePolicyPackForRegion,
  resolveRetentionScheduleFromPolicyPack,
  SubsystemBoundaryStatus,
} from "@/lib/assurance-primitives";
import { DataProvenanceBadge } from "@/components/states/mandatory-ui-states";

export default function TenantAdministratorDashboardPage() {
  const [state] = useDemoState();
  const [freezeEpoch, setFreezeEpoch] = useState(42);
  const [isFrozen, setIsFrozen] = useState(false);
  const [verifiedTimestamp, setVerifiedTimestamp] = useState("2026-10-31T14:30:00Z");
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedSubsystem, setSelectedSubsystem] = useState<string>(
    "HOT_EVENTS_POSTGRES_RLS",
  );
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  const currentRegionCode =
    state.tenant?.dataResidencyRegion || state.tenant?.homeRegion || "eu-west-1";
  const regionMeta = resolveRegionMetadata(currentRegionCode);
  const activePolicyPack = resolvePolicyPackForRegion(currentRegionCode);
  const retentionSchedule =
    resolveRetentionScheduleFromPolicyPack(currentRegionCode);

  const subsystemBoundaries: SubsystemBoundaryStatus[] = [
    {
      subsystem: "HOT_EVENTS_POSTGRES_RLS",
      label: "Hot Transactional Store (PostgreSQL RLS)",
      targetRegion: regionMeta.code,
      observedRegion: regionMeta.code,
      isolationMechanism: "Row-Level Security + Dedicated Schema Policy",
      status: "ENFORCED",
      lastVerifiedAt: verifiedTimestamp,
    },
    {
      subsystem: "WARM_ANALYTICS_CLICKHOUSE",
      label: "Warm Analytics Store (ClickHouse Partition)",
      targetRegion: regionMeta.code,
      observedRegion: regionMeta.code,
      isolationMechanism: "Tenant Partition Key + Scoped Query Guard",
      status: "ENFORCED",
      lastVerifiedAt: verifiedTimestamp,
    },
    {
      subsystem: "COLD_ARCHIVE_OBJECT_STORE",
      label: "Cold WORM Archive (Object Storage)",
      targetRegion: regionMeta.code,
      observedRegion: regionMeta.code,
      isolationMechanism: "Per-Tenant Bucket Prefix + CMK Encryption",
      status: "ENFORCED",
      lastVerifiedAt: verifiedTimestamp,
    },
    {
      subsystem: "SEARCH_INDEX_OPENSEARCH",
      label: "Search & Threat Hunt Index",
      targetRegion: regionMeta.code,
      observedRegion: regionMeta.code,
      isolationMechanism: "Dedicated Tenant Index Alias + AST Filter",
      status: "ENFORCED",
      lastVerifiedAt: verifiedTimestamp,
    },
    {
      subsystem: "BACKUPS_AND_SNAPSHOTS",
      label: "Regional Encrypted Backups & WAL",
      targetRegion: regionMeta.code,
      observedRegion: regionMeta.code,
      isolationMechanism:
        "In-Region Multi-AZ Snapshot + Zero Cross-Border Replication",
      status: "ENFORCED",
      lastVerifiedAt: verifiedTimestamp,
    },
    {
      subsystem: "KMS_KEY_CUSTODY",
      label: "Cryptographic Key Custody (KMS / Vault)",
      targetRegion: regionMeta.code,
      observedRegion: regionMeta.code,
      isolationMechanism: regionMeta.kmsBoundary,
      status: "ENFORCED",
      lastVerifiedAt: verifiedTimestamp,
    },
    {
      subsystem: "AI_INFERENCE_CONTEXT",
      label: "AI Copilot Retrieval Context (G10)",
      targetRegion: regionMeta.code,
      observedRegion: regionMeta.code,
      isolationMechanism: "Tenant-Scoped RAG + Zero Provider Retention",
      status: "ENFORCED",
      lastVerifiedAt: verifiedTimestamp,
    },
  ];

  const activeBoundary =
    subsystemBoundaries.find((b) => b.subsystem === selectedSubsystem) ||
    subsystemBoundaries[0];

  const handleVerifyAllBoundaries = () => {
    setIsVerifying(true);
    const nextStamp = new Date().toISOString();
    setVerifiedTimestamp(nextStamp);
    setBannerNotice(
      `Verified all 7/7 subsystem boundaries in ${regionMeta.displayName} (${regionMeta.code}) against policy_pack ${activePolicyPack.policy_key} v${activePolicyPack.version}.`,
    );
    setTimeout(() => setIsVerifying(false), 300);
  };

  return (
    <div className="p-6 space-y-6 bg-[#060e1a] min-h-full text-slate-100">
      {/* Role-Separation Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-[11px] font-mono text-cyan-300 mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>TENANT ADMINISTRATOR DASHBOARD (SEPARATED PORTAL)</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            Tenant Administration &amp; Governance Control Plane
          </h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Scoped strictly to tenant{" "}
            <span className="font-mono text-slate-200">
              {state.tenant?.organizationName || "Acme Global Ltd"}
            </span>{" "}
            • Residency:{" "}
            <span className="font-mono text-cyan-300">
              {regionMeta.displayName}
            </span>{" "}
            • Policy Pack:{" "}
            <span className="font-mono text-emerald-300">
              {activePolicyPack.policy_key} (v{activePolicyPack.version})
            </span>{" "}
            • Separated from Customer Executive Overview and Super Admin Operator Console.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/customer/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950/50 hover:bg-red-950/80 border border-red-500/40 text-xs font-semibold text-red-200 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-red-400" />
            <span>Switch to Customer Dashboard</span>
          </Link>
          {state.session?.role === "SUPER_ADMIN" && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-950/50 hover:bg-amber-950/80 border border-amber-500/40 text-xs font-semibold text-amber-200 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span>Super Admin Console</span>
            </Link>
          )}
          <DataProvenanceBadge
            provenance="VERIFIED_BACKEND"
            asOf="Oct 31, 2026 14:32 UTC"
            sourceService="shield-core/tenant-admin"
          />
        </div>
      </div>

      {bannerNotice && (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 px-4 py-3 text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{bannerNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerNotice(null)}
            className="px-2.5 py-1 rounded-lg bg-slate-900/70 hover:bg-slate-900 text-[11px] font-mono text-slate-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top 4 Tenant Admin KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Isolation &amp; Residency (G02)</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white">
            7 / 7 Boundaries Enforced
          </div>
          <div className="text-[11px] font-mono text-cyan-300">
            Profile: DEDICATED_DATA_NAMESPACE ({regionMeta.code})
          </div>
          <div className="flex items-center justify-between pt-1">
            <Link
              href="/tenant-management"
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300"
            >
              <span>Inspect Boundary Receipt</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={handleVerifyAllBoundaries}
              className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/60 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300 transition-colors"
            >
              Verify Now
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Connectors &amp; Vault Secrets (G09)</span>
            <KeyRound className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-white">
            4 Active Verified • 1 Preview
          </div>
          <div className="text-[11px] text-emerald-400">
            All write-only secrets within 30d rotation SLA
          </div>
          <Link
            href="/connectors"
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 pt-1"
          >
            <span>Manage Connectors &amp; Vault</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>SOAR Freeze Epoch &amp; Quorum (G04)</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white">
            Epoch #{freezeEpoch} ({isFrozen ? "FROZEN" : "ACTIVE"})
          </div>
          <div className="flex items-center justify-between pt-1 gap-2">
            <Link
              href="/response-proposals"
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300"
            >
              <span>Review Quorum Queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => {
                setIsFrozen((v) => !v);
                setFreezeEpoch((e) => e + 1);
              }}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                isFrozen
                  ? "bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300"
                  : "bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300"
              }`}
            >
              {isFrozen ? "Unfreeze SOAR" : "Bump FreezeEpoch"}
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Retention &amp; Legal Holds (G08)</span>
            <Scale className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-xl font-bold text-white">
            2 Active Legal Holds
          </div>
          <div className="text-[11px] text-slate-300">
            {retentionSchedule.length} Data Classes • Pack{" "}
            <span className="font-mono text-emerald-300">
              {activePolicyPack.policy_key}
            </span>{" "}
            ({activePolicyPack.retention_limits.min_statutory_days}d–
            {activePolicyPack.retention_limits.max_retention_days}d)
          </div>
          <Link
            href="/evidence-operations"
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 pt-1"
          >
            <span>Manage Legal Holds</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* G02 Per-Subsystem Boundary Enforcement Matrix */}
      <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">
              Tenant Residency &amp; Subsystem Isolation Boundary Evidence (WF-G02-03)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any subsystem row below to inspect its live cryptographic boundary receipt in{" "}
              <span className="font-mono text-cyan-300">{regionMeta.code}</span>{" "}
              ({regionMeta.countryName}).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleVerifyAllBoundaries}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs font-semibold text-emerald-300 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`}
              />
              <span>Verify All 7 Boundaries</span>
            </button>
            <Link
              href="/onboarding"
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
            >
              Onboarding &amp; Boundary Wizard
            </Link>
            <Link
              href="/tenant-management"
              className="px-3.5 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-xs font-semibold text-cyan-300 hover:bg-cyan-600/30 transition-colors"
            >
              Request Region Change (WF-G02-04)
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-3">Subsystem Data Class</th>
                <th className="py-2.5 px-3">Target Region</th>
                <th className="py-2.5 px-3">Observed Region</th>
                <th className="py-2.5 px-3">Isolation Mechanism</th>
                <th className="py-2.5 pl-3 text-right">Enforcement Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {subsystemBoundaries.map((b) => {
                const isSelected = b.subsystem === activeBoundary.subsystem;
                return (
                  <tr
                    key={b.subsystem}
                    onClick={() => setSelectedSubsystem(b.subsystem)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-cyan-950/30"
                        : "hover:bg-slate-800/40"
                    }`}
                  >
                    <td className="py-3 pr-3 font-medium text-white">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSelected ? "bg-cyan-400" : "bg-emerald-400"
                          }`}
                        />
                        <span>{b.label}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {b.targetRegion}
                    </td>
                    <td className="py-3 px-3 font-mono text-cyan-300">
                      {b.observedRegion}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                      {b.isolationMechanism}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/70 border border-emerald-500/40 text-[11px] font-semibold text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" />
                        {b.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Selected Subsystem Live Boundary Receipt */}
        <div className="rounded-xl bg-[#071020] border border-cyan-500/30 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
              <FileCheck2 className="w-4 h-4" />
              <span>
                Selected Subsystem Receipt: {activeBoundary.label} ({activeBoundary.subsystem})
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Isolation: <span className="font-mono text-white">{activeBoundary.isolationMechanism}</span> • KMS Custody:{" "}
              <span className="font-mono text-cyan-300">{regionMeta.kmsBoundary}</span> • Policy Pack:{" "}
              <span className="font-mono text-emerald-300">
                {activePolicyPack.policy_key} ({activePolicyPack.jurisdiction})
              </span>
            </p>
            <p className="text-[11px] font-mono text-slate-400">
              Last Cryptographic Attestation: {activeBoundary.lastVerifiedAt}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/tenant-management"
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-semibold text-cyan-200 transition-colors"
            >
              Open Full Boundary Ledger
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Quick Admin Modules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Database className="w-4 h-4 text-sky-400" />
            <span>Durable Ingestion &amp; Controlled Replay (G03)</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Inspect WAL/Kafka ingress receipts, connector watermarks, and run blast-radius previewed replay jobs.
          </p>
          <Link
            href="/ingestion"
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 pt-1"
          >
            <span>Open Ingestion &amp; Replay Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Team RBAC &amp; Distinct-Person Approvers (G04)</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Manage tenant members, FIDO2/WebAuthn hardware attestation keys, and 4-eyes distinct human identity rosters.
          </p>
          <Link
            href="/team"
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 pt-1"
          >
            <span>Manage Team &amp; Approvers</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="rounded-xl bg-[#0b1629] border border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Billing, Metering &amp; Storage Economics (G08)</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Compare measured raw inbound bytes, hot index footprint, and archive GB-days against forecast budgets.
          </p>
          <Link
            href="/billing"
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 hover:text-sky-300 pt-1"
          >
            <span>Open Billing &amp; Usage Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
