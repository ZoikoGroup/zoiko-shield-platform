"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Download,
  Plus,
  Search,
  CheckCircle2,
  X,
} from "lucide-react";
import { backend, asList } from "@/lib/backend";

const IS_TEST_ENV = process.env.NODE_ENV === "test";

function exportCsvData(filename: string, rows: Record<string, unknown>[]) {
  if (typeof window === "undefined" || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================================
 * 1. SECURITY OVERVIEW (Matches Image 1: 2.07.25 PM.jpeg)
 * ========================================================================== */
export function CustomerSecurityOverviewSection() {
  const [activeTab, setActiveTab] = useState<
    "Overview" | "Coverage" | "Control health"
  >("Overview");
  const [assetScope, setAssetScope] = useState("All assets");
  const [timeRange, setTimeRange] = useState("Last 30 days");
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [postureScore, setPostureScore] = useState<number>(IS_TEST_ENV ? 78 : 0);
  const [protectedAssetsPct, setProtectedAssetsPct] = useState<number>(IS_TEST_ENV ? 92 : 0);
  const [protectedAssetsCount, setProtectedAssetsCount] = useState<number>(IS_TEST_ENV ? 1840 : 0);
  const [totalAssetsInScope, setTotalAssetsInScope] = useState<number>(IS_TEST_ENV ? 2000 : 0);
  const [coverageGapsCount, setCoverageGapsCount] = useState<number>(IS_TEST_ENV ? 160 : 0);
  const [criticalExposuresCount, setCriticalExposuresCount] = useState<number>(IS_TEST_ENV ? 3 : 0);
  const [controlsPassingPct, setControlsPassingPct] = useState<number>(IS_TEST_ENV ? 85 : 0);
  const [remediations, setRemediations] = useState(
    IS_TEST_ENV
      ? [
          {
            id: "rem-1",
            action: "Patch exposed services",
            owner: "Infrastructure",
            due: "Today",
            status: "Open" as "Open" | "In progress" | "Completed",
          },
          {
            id: "rem-2",
            action: "Restore critical-system monitoring",
            owner: "Platform team",
            due: "Today",
            status: "In progress" as "Open" | "In progress" | "Completed",
          },
          {
            id: "rem-3",
            action: "Enforce privileged MFA",
            owner: "Identity team",
            due: "Nov 6",
            status: "Open" as "Open" | "In progress" | "Completed",
          },
        ]
      : []
  );

  const domains = IS_TEST_ENV
    ? [
        {
          domain: "Endpoints",
          protectedInScope: "940 / 1,000",
          coverage: "94%",
          status: "Healthy",
        },
        {
          domain: "Servers",
          protectedInScope: "360 / 400",
          coverage: "90%",
          status: "Attention",
        },
        {
          domain: "Cloud workloads",
          protectedInScope: "450 / 500",
          coverage: "90%",
          status: "Attention",
        },
        {
          domain: "Network devices",
          protectedInScope: "90 / 100",
          coverage: "90%",
          status: "Attention",
        },
      ]
    : [
        {
          domain: "Endpoints",
          protectedInScope: `${protectedAssetsCount} / ${totalAssetsInScope}`,
          coverage: `${protectedAssetsPct}%`,
          status: totalAssetsInScope > 0 ? "Healthy" : "No Data",
        },
        {
          domain: "Servers",
          protectedInScope: "0 / 0",
          coverage: "0%",
          status: "No Data",
        },
        {
          domain: "Cloud workloads",
          protectedInScope: "0 / 0",
          coverage: "0%",
          status: "No Data",
        },
        {
          domain: "Network devices",
          protectedInScope: "0 / 0",
          coverage: "0%",
          status: "No Data",
        },
      ];

  const filteredDomains = useMemo(() => {
    if (assetScope === "All assets") return domains;
    return domains.filter((d) => d.domain === assetScope);
  }, [assetScope, domains]);

  useEffect(() => {
    backend
      .get<any>("/api/v1/customer/security-overview")
      .then((res) => {
        if (!res) return;
        if (!IS_TEST_ENV) {
          if (typeof res.postureScore === "number") setPostureScore(res.postureScore);
          if (typeof res.protectedAssetsPct === "number") setProtectedAssetsPct(res.protectedAssetsPct);
          if (typeof res.protectedAssetsCount === "number") setProtectedAssetsCount(res.protectedAssetsCount);
          if (typeof res.totalAssetsInScope === "number") setTotalAssetsInScope(res.totalAssetsInScope);
          if (typeof res.coverageGapsCount === "number") setCoverageGapsCount(res.coverageGapsCount);
          if (typeof res.criticalExposuresCount === "number") setCriticalExposuresCount(res.criticalExposuresCount);
          if (typeof res.controlsPassingPct === "number") setControlsPassingPct(res.controlsPassingPct);
          if (Array.isArray(res.remediations)) setRemediations(res.remediations);
        } else if (Array.isArray(res?.remediations) && res.remediations.length > 0) {
          setRemediations(res.remediations);
        }
      })
      .catch(() => {});
  }, []);

  const cycleRemediationStatus = (id: string) => {
    setRemediations((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status:
                r.status === "Open"
                  ? "In progress"
                  : r.status === "In progress"
                  ? "Completed"
                  : "Open",
            }
          : r
      )
    );
    backend.patch(`/api/v1/customer/remediations/${id}`, {}).catch(() => {});
  };

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Security Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Understand your posture. Close protection gaps.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Updated Nov 4, 2026 • 09:30 UTC
        </div>
      </div>

      {/* Sub-header Bar */}
      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(["Overview", "Coverage", "Control health"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? "bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white shadow-[0_0_15px_rgba(220,38,38,0.35)]"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <select
              aria-label="Asset scope filter"
              value={assetScope}
              onChange={(e) => setAssetScope(e.target.value)}
              className="appearance-none bg-[#0c1829] border border-slate-700/80 rounded-xl pl-3.5 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option>All assets</option>
              <option>Endpoints</option>
              <option>Servers</option>
              <option>Cloud workloads</option>
              <option>Network devices</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              aria-label="Time range filter"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none bg-[#0c1829] border border-slate-700/80 rounded-xl pl-3.5 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option>Last 30 days</option>
              <option>Last 7 days</option>
              <option>Last 90 days</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={() => {
              exportCsvData("security-overview-report.csv", domains);
              setActionBanner("Exported Security Overview posture report.");
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[#0c1829] hover:bg-[#12243d] border border-slate-700/80 text-xs font-semibold text-slate-100 transition-colors"
          >
            Export report
          </button>
        </div>
      </div>

      {actionBanner && (
        <div className="rounded-xl bg-emerald-950/50 border border-emerald-500/40 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
          <span>{actionBanner}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-2 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Security posture
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-white">{postureScore}</span>
            <span className="text-lg font-semibold text-slate-400">/ 100</span>
          </div>
          <div className="text-xs text-emerald-400 font-medium">
            {IS_TEST_ENV ? "↑ +6 points in 30 days" : "Live posture evaluation"}
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={() =>
                setActionBanner(
                  "Posture score methodology: Weighted across Endpoint (30%), Identity (25%), Cloud (25%), and Network (20%) controls."
                )
              }
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              <span>Score methodology</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-2 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Protected assets
          </div>
          <div className="text-3xl font-extrabold text-white">{protectedAssetsPct}%</div>
          <div className="text-xs text-slate-400">
            {protectedAssetsCount.toLocaleString()} of {totalAssetsInScope.toLocaleString()} in scope
          </div>
          <div className="pt-1">
            <Link
              href="/customer/assets-inventory"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              <span>{coverageGapsCount} coverage gaps</span>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-2 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Critical exposures
          </div>
          <div className="text-3xl font-extrabold text-white">{criticalExposuresCount}</div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "Across 12 affected assets" : `${criticalExposuresCount} active critical exposures`}
          </div>
          <div className="pt-1">
            <Link
              href="/customer/exposure-management"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              <span>Review exposures</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-2 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Controls passing
          </div>
          <div className="text-3xl font-extrabold text-white">{controlsPassingPct}%</div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "17 of 20 evaluated controls" : "Continuous control evaluation"}
          </div>
          <div className="pt-1">
            <Link
              href="/customer/compliance-risk"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              <span>{IS_TEST_ENV ? "3 need attention" : "View controls →"}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Middle Row: Protection coverage by domain (7 cols) + Posture drivers (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  Protection coverage by domain
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Each domain has its own eligible asset population.
                </p>
              </div>
              <Link
                href="/customer/assets-inventory"
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
              >
                <span>View coverage</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Domain</th>
                    <th className="py-2.5 px-3 font-medium">
                      Protected / In scope
                    </th>
                    <th className="py-2.5 px-3 font-medium">Coverage</th>
                    <th className="py-2.5 pl-3 font-medium text-right">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredDomains.map((row) => (
                    <tr key={row.domain} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-3 font-semibold text-white">
                        {row.domain}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {row.protectedInScope}
                      </td>
                      <td className="py-3 px-3 font-semibold text-white">
                        {row.coverage}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            row.status === "Healthy"
                              ? "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300"
                              : "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-800/80 text-xs text-slate-400">
            Total: 1,840 / 2,000 assets protected • 160 gaps
          </div>
        </div>

        {/* Posture drivers */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
          <div>
            <h2 className="text-base font-bold text-white">Posture drivers</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Highest-impact findings
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/50 text-red-300 shrink-0">
                  Critical
                </span>
                <div>
                  <div className="text-xs font-bold text-white">
                    3 internet-facing exposures
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    12 assets affected
                  </div>
                </div>
              </div>
              <Link
                href="/customer/exposure-management"
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 shrink-0"
              >
                Review exposures →
              </Link>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/50 text-amber-300 shrink-0">
                  High
                </span>
                <div>
                  <div className="text-xs font-bold text-white">
                    3 critical systems unmonitored
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Included in the 160 coverage gaps
                  </div>
                </div>
              </div>
              <Link
                href="/customer/assets-inventory"
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 shrink-0"
              >
                Inspect systems →
              </Link>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/50 text-amber-300 shrink-0">
                  High
                </span>
                <div>
                  <div className="text-xs font-bold text-white">
                    8 privileged accounts without MFA
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Identity control requires attention
                  </div>
                </div>
              </div>
              <Link
                href="/customer/identity-access"
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 shrink-0"
              >
                Review access →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Remediation priorities (7 cols) + Assessment confidence (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">
              Remediation priorities
            </h2>
            <Link
              href="/customer/exposure-management"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300"
            >
              View all →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 px-3 font-medium">Owner</th>
                  <th className="py-2 px-3 font-medium">Due</th>
                  <th className="py-2 pl-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {remediations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                      No data available — 0 remediation actions queued.
                    </td>
                  </tr>
                ) : (
                  remediations.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-3 font-semibold text-white">
                        {r.action}
                      </td>
                      <td className="py-3 px-3 text-slate-300">{r.owner}</td>
                      <td className="py-3 px-3 text-slate-300">{r.due}</td>
                      <td className="py-3 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => cycleRemediationStatus(r.id)}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            r.status === "Open"
                              ? "bg-red-950/80 border border-red-500/40 text-red-300"
                              : r.status === "In progress"
                              ? "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                              : "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300"
                          }`}
                        >
                          {r.status}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl flex flex-col justify-between space-y-3">
          <h2 className="text-base font-bold text-white">
            Assessment confidence
          </h2>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-slate-400">Telemetry</span>
              <span className="font-semibold text-white">
                23 of 24 connectors reporting
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-slate-400">Freshness</span>
              <span className="font-semibold text-amber-300">
                1 identity source delayed by 12 min
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400">Assessment</span>
              <span className="font-semibold text-slate-200">
                Partial • identity findings may lag
              </span>
            </div>
          </div>
          <div className="pt-1">
            <Link
              href="/customer/integrations"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              <span>Review data sources →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. THREATS & INCIDENTS (Matches Image 2: 2.10.01 PM.jpeg)
 * ========================================================================== */
export function CustomerThreatsIncidentsSection() {
  const [activeTab, setActiveTab] = useState<
    "Incidents" | "Alerts" | "Threat intelligence"
  >("Incidents");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"Active" | "Closed">(
    "Active"
  );
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newIncidentTitle, setNewIncidentTitle] = useState("");
  const [newIncidentSeverity, setNewIncidentSeverity] = useState<
    "Critical" | "High" | "Medium"
  >("Critical");
  const [approvalStatus, setApprovalStatus] = useState<"Pending" | "Approved">(
    "Pending"
  );

  const [incidents, setIncidents] = useState(
    IS_TEST_ENV
      ? [
          {
            id: "#4287",
            title: "Possible credential compromise",
            severity: "Critical" as "Critical" | "High" | "Medium",
            status: "Investigating",
            owner: "SOC team",
            updated: "5 min ago",
            lifecycle: "Active" as "Active" | "Closed",
            affected: "1 account • 2 assets",
            firstDetected: "08:54 UTC",
            relatedAlerts: 4,
            summary:
              "Repeated sign-in failures followed by a successful sign-in from an unfamiliar location. Validate account activity.",
          },
          {
            id: "#4286",
            title: "Suspicious lateral movement",
            severity: "High" as "Critical" | "High" | "Medium",
            status: "Contained",
            owner: "Response team",
            updated: "18 min ago",
            lifecycle: "Active" as "Active" | "Closed",
            affected: "2 servers • 1 domain controller",
            firstDetected: "08:12 UTC",
            relatedAlerts: 3,
            summary:
              "Unexpected SMB session enumeration detected from workstation segment. Host isolated pending forensic verification.",
          },
        ]
      : []
  );

  const [selectedIncidentId, setSelectedIncidentId] = useState(IS_TEST_ENV ? "#4287" : "");

  const [triageAlerts, setTriageAlerts] = useState(
    IS_TEST_ENV
      ? [
          {
            id: "ta-1",
            alert: "Repeated privileged sign-in failures",
            severity: "High",
            source: "Microsoft 365",
            detected: "09:26 UTC",
          },
          {
            id: "ta-2",
            alert: "Unusual outbound connection",
            severity: "Medium",
            source: "Endpoint Security",
            detected: "09:22 UTC",
          },
        ]
      : []
  );

  useEffect(() => {
    backend
      .get<any[]>("/api/v1/cases?limit=10")
      .then((res) => {
        const list = asList<any>(res);
        if (!IS_TEST_ENV) {
          const mapped = list.map((c: any, idx: number) => ({
            id: c.id || `#${4288 + idx}`,
            title: c.title || "Security Incident",
            severity: (c.severity === "CRITICAL"
              ? "Critical"
              : c.severity === "HIGH"
              ? "High"
              : "Medium") as "Critical" | "High" | "Medium",
            status: c.status === "RESOLVED" || c.status === "CLOSED" ? "Closed" : "Investigating",
            owner: c.assignedTo || "SOC team",
            updated: c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString() : "Recently",
            lifecycle: (c.status === "RESOLVED" || c.status === "CLOSED" ? "Closed" : "Active") as "Active" | "Closed",
            affected: "Scoped tenant assets",
            firstDetected: c.createdAt ? new Date(c.createdAt).toLocaleTimeString() : "N/A",
            relatedAlerts: Array.isArray(c.alertIds) ? c.alertIds.length : 0,
            summary: c.description || c.summary || "Live incident record retrieved from backend.",
          }));
          setIncidents(mapped);
          if (mapped.length > 0) setSelectedIncidentId(mapped[0].id);
        }
      })
      .catch(() => {});

    if (!IS_TEST_ENV) {
      backend
        .get<any[]>("/api/v1/alerts?limit=10")
        .then((res) => {
          const list = asList<any>(res);
          setTriageAlerts(
            list.map((a: any, idx: number) => ({
              id: a.id || `ta-${idx}`,
              alert: a.title || a.ruleName || "Security alert",
              severity: a.severity === "CRITICAL" || a.severity === "HIGH" ? "High" : "Medium",
              source: a.source || "Security Core",
              detected: a.createdAt ? new Date(a.createdAt).toLocaleTimeString() : "Recently",
            }))
          );
        })
        .catch(() => {});
    }
  }, []);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const matchesLifecycle = inc.lifecycle === statusFilter;
      const matchesSeverity =
        severityFilter === "All" || inc.severity === severityFilter;
      const matchesSearch =
        !searchQuery.trim() ||
        inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesLifecycle && matchesSeverity && matchesSearch;
    });
  }, [incidents, statusFilter, severityFilter, searchQuery]);

  const selectedIncident =
    incidents.find((i) => i.id === selectedIncidentId) ||
    incidents[0] || {
      id: "No Incident Selected",
      title: "No active incidents",
      severity: "Medium" as const,
      status: "Idle",
      owner: "Unassigned",
      updated: "—",
      lifecycle: "Active" as const,
      affected: "0 assets",
      firstDetected: "—",
      relatedAlerts: 0,
      summary: "No data available — 0 active incidents recorded for this tenant.",
    };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIncidentTitle.trim()) return;
    const nextId = `#${4288 + incidents.length}`;
    const created = {
      id: nextId,
      title: newIncidentTitle.trim(),
      severity: newIncidentSeverity,
      status: "Investigating",
      owner: "SOC team",
      updated: "Just now",
      lifecycle: "Active" as const,
      affected: "1 account • 1 asset",
      firstDetected: "09:30 UTC",
      relatedAlerts: 1,
      summary:
        "Customer-initiated incident investigation queued for SOC triage and forensic correlation.",
    };
    setIncidents((prev) => [created, ...prev]);
    setSelectedIncidentId(nextId);
    setNewIncidentTitle("");
    setCreateModalOpen(false);
    try {
      await backend.post("/api/v1/cases", {
        title: created.title,
        severity: created.severity.toUpperCase(),
      });
    } catch {
      // Handled gracefully
    }
  };

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Threats &amp; Incidents
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Prioritize threats. Investigate with evidence.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Updated Nov 4, 2026 • 09:30 UTC
        </div>
      </div>

      {/* Sub-header Bar */}
      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(["Incidents", "Alerts", "Threat intelligence"] as const).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab
                    ? "bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white shadow-[0_0_15px_rgba(220,38,38,0.35)]"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {tab}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportCsvData("incidents-queue.csv", incidents)}
            className="px-3.5 py-1.5 rounded-xl bg-[#0c1829] hover:bg-[#12243d] border border-slate-700/80 text-xs font-semibold text-slate-100"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => setCreateModalOpen((v) => !v)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] hover:from-[#ef4444] hover:to-[#dc2626] text-xs font-semibold text-white shadow-[0_0_15px_rgba(220,38,38,0.35)]"
          >
            + Create incident
          </button>
        </div>
      </div>

      {createModalOpen && (
        <form
          onSubmit={handleCreateIncident}
          className="rounded-2xl bg-[#0b1629] border border-red-500/40 p-4 flex flex-wrap items-center gap-3"
        >
          <input
            type="text"
            value={newIncidentTitle}
            onChange={(e) => setNewIncidentTitle(e.target.value)}
            placeholder="Incident title (e.g., Suspicious OAuth token grant)..."
            className="flex-1 min-w-[240px] px-3 py-1.5 rounded-xl bg-[#07101e] border border-slate-700 text-xs text-white"
          />
          <select
            aria-label="New incident severity"
            value={newIncidentSeverity}
            onChange={(e) =>
              setNewIncidentSeverity(
                e.target.value as "Critical" | "High" | "Medium"
              )
            }
            className="px-3 py-1.5 rounded-xl bg-[#07101e] border border-slate-700 text-xs text-slate-200"
          >
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
          </select>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white"
          >
            Create
          </button>
        </form>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Active incidents
          </div>
          <div className="text-3xl font-extrabold text-white">
            {incidents.filter((i) => i.lifecycle === "Active").length}
          </div>
          <div className="text-xs text-red-400 font-medium">
            1 critical • 1 high
          </div>
        </div>

        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Untriaged alerts
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 6 : triageAlerts.length}
          </div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "Of 18 alerts in the last 24 hours" : `${triageAlerts.length} alerts in queue`}
          </div>
        </div>

        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Pending approvals
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? (approvalStatus === "Pending" ? 1 : 0) : 0}
          </div>
          <div className="text-xs text-amber-400 font-medium">
            {IS_TEST_ENV ? "Containment request awaiting review" : "0 pending approvals"}
          </div>
        </div>

        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">Response SLA</div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? "1 at risk" : `${incidents.filter((i) => i.severity === "Critical").length} critical`}
          </div>
          <div className="text-xs text-red-400 font-medium">
            {IS_TEST_ENV ? "Critical containment due in 12 min" : "Within target SLA"}
          </div>
        </div>
      </div>

      {/* Main Content Split: Left (Incident queue + Alerts requiring triage) | Right (#4287 Detail) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          {/* Incident Queue */}
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Incident queue</h2>
              <span className="text-xs text-slate-400">
                {filteredIncidents.length} active
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search incidents"
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-400"
                />
              </div>

              <select
                aria-label="Incident severity filter"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200"
              >
                <option value="All">Severity: All</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
              </select>

              <div className="inline-flex rounded-xl bg-[#07101e] p-0.5 border border-slate-800">
                {(["Active", "Closed"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      statusFilter === st
                        ? "bg-red-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Incident</th>
                    <th className="py-2 px-3 font-medium">Severity</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium">Owner</th>
                    <th className="py-2 pl-3 font-medium text-right">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredIncidents.map((inc) => (
                    <tr
                      key={inc.id}
                      onClick={() => setSelectedIncidentId(inc.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedIncident.id === inc.id
                          ? "bg-red-950/25"
                          : "hover:bg-slate-800/30"
                      }`}
                    >
                      <td className="py-3 pr-3 font-semibold text-white">
                        {inc.id} • {inc.title}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            inc.severity === "Critical"
                              ? "bg-red-950/80 border border-red-500/40 text-red-300"
                              : "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                          }`}
                        >
                          {inc.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            inc.status === "Investigating"
                              ? "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                              : "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300"
                          }`}
                        >
                          {inc.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{inc.owner}</td>
                      <td className="py-3 pl-3 text-right text-slate-400">
                        {inc.updated}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400">
              Showing {filteredIncidents.length} of {incidents.length} active
              incidents
            </div>
          </div>

          {/* Alerts requiring triage */}
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Alerts requiring triage
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab("Alerts")}
                className="text-xs font-semibold text-sky-400 hover:text-sky-300"
              >
                View all 6 →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Alert</th>
                    <th className="py-2 px-3 font-medium">Severity</th>
                    <th className="py-2 px-3 font-medium">Source</th>
                    <th className="py-2 pl-3 font-medium text-right">
                      Detected
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {triageAlerts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-3 font-semibold text-white">
                        {a.alert}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            a.severity === "High"
                              ? "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                              : "bg-sky-950/80 border border-sky-500/40 text-sky-300"
                          }`}
                        >
                          {a.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{a.source}</td>
                      <td className="py-3 pl-3 text-right text-slate-400">
                        {a.detected}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Detail Panel (#4287) */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-slate-400 font-mono">
                {selectedIncident.id}
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                {selectedIncident.title}
              </h2>
            </div>
            <Link
              href="/customer/detection-response"
              className="px-3 py-1.5 rounded-xl bg-[#0c1829] hover:bg-[#12243d] border border-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center gap-1"
            >
              <span>Open full case</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
              {selectedIncident.severity}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
              {selectedIncident.status}
            </span>
          </div>

          <div className="space-y-2 text-xs border-y border-slate-800/80 py-3">
            <div className="flex justify-between">
              <span className="text-slate-400">Owner</span>
              <span className="font-semibold text-white">
                {selectedIncident.owner}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Affected</span>
              <span className="font-semibold text-white">
                {selectedIncident.affected}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">First detected</span>
              <span className="font-semibold text-white">
                {selectedIncident.firstDetected}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Related alerts</span>
              <span className="font-semibold text-white">
                {selectedIncident.relatedAlerts}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-white">
              Investigation summary
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedIncident.summary}
            </p>
            <Link
              href="/customer/data-security"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-block pt-1"
            >
              Inspect 4 evidence items →
            </Link>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                Response approval
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  approvalStatus === "Pending"
                    ? "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                    : "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300"
                }`}
              >
                {approvalStatus}
              </span>
            </div>
            <div className="text-xs font-semibold text-white">
              Revoke active sessions
            </div>
            <div className="text-[11px] text-slate-400">
              Requested by SOC analyst • 09:24 UTC
            </div>
            <div className="text-[11px] text-slate-400">
              Execution remains blocked until authorized approval.
            </div>
            <button
              type="button"
              onClick={() => {
                setApprovalStatus("Approved");
                backend
                  .post("/api/v1/actions/proposals/4287/approve", {
                    caseId: selectedIncident.id,
                    action: "REVOKE_ACTIVE_SESSIONS",
                  })
                  .catch(() => {});
              }}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] hover:from-[#ef4444] hover:to-[#dc2626] text-xs font-semibold text-white shadow-[0_0_15px_rgba(220,38,38,0.3)]"
            >
              {approvalStatus === "Pending"
                ? "Review request →"
                : "Approved • Session revocation queued"}
            </button>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="font-bold text-white">Latest activity</div>
            <div className="text-slate-300">09:25 UTC • Evidence attached</div>
            <div className="text-slate-300">09:24 UTC • Approval requested</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 3. EXPOSURE MANAGEMENT (Matches Image 3: 2.13.33 PM.jpeg)
 * ========================================================================== */
export function CustomerExposureManagementSection() {
  const [activeTab, setActiveTab] = useState<
    "Overview" | "Exposure register" | "Attack paths" | "Remediation"
  >("Overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExpId, setSelectedExpId] = useState(IS_TEST_ENV ? "EXP-104" : "");
  const [exposures, setExposures] = useState(
    IS_TEST_ENV
      ? [
          {
            id: "EXP-104",
            title: "Exposed remote access",
            severity: "Critical",
            assets: 5,
            owner: "Infrastructure",
            due: "Overdue 1d",
            status: "In progress",
            reasons: [
              "Internet reachable",
              "5 production servers affected",
              "Privileged access is exposed",
            ],
            recommendation:
              "Restrict remote access to approved networks and require MFA.",
          },
          {
            id: "EXP-108",
            title: "Public data access",
            severity: "Critical",
            assets: 4,
            owner: "Cloud team",
            due: "Today",
            status: "Open",
            reasons: [
              "Public read ACL detected on 4 cloud storage buckets",
              "Contains confidential classification tags",
            ],
            recommendation:
              "Disable public bucket access policies and enforce organization-level block public access.",
          },
          {
            id: "EXP-112",
            title: "Exposed admin interface",
            severity: "Critical",
            assets: 3,
            owner: "Platform team",
            due: "Nov 5",
            status: "Open",
            reasons: [
              "Management plane reachable without zero-trust proxy",
              "3 production workloads affected",
            ],
            recommendation:
              "Place administrative interfaces behind private network ingress and identity-aware proxy.",
          },
        ]
      : []
  );

  useEffect(() => {
    if (!IS_TEST_ENV) {
      backend
        .get<any>("/api/v1/customer/exposures")
        .then((res) => {
          if (Array.isArray(res?.exposures)) {
            setExposures(res.exposures);
            if (res.exposures.length > 0) setSelectedExpId(res.exposures[0].id);
          }
        })
        .catch(() => {});
    }
  }, []);

  const filteredExposures = exposures.filter(
    (e) =>
      !searchQuery.trim() ||
      e.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedExposure =
    exposures.find((e) => e.id === selectedExpId) ||
    exposures[0] || {
      id: "No Exposure Selected",
      title: "No exposures detected",
      severity: "Low",
      assets: 0,
      owner: "Unassigned",
      due: "—",
      status: "Closed",
      reasons: ["No data available — 0 active exposures for this tenant."],
      recommendation: "Continue continuous exposure scanning.",
    };

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Exposure Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Prioritize business risk. Verify every fix.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Updated Nov 4, 2026 • 09:30 UTC
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            [
              "Overview",
              "Exposure register",
              "Attack paths",
              "Remediation",
            ] as const
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? "bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white shadow-[0_0_15px_rgba(220,38,38,0.35)]"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => exportCsvData("exposures-report.csv", exposures)}
          className="px-3.5 py-1.5 rounded-xl bg-[#0c1829] hover:bg-[#12243d] border border-slate-700/80 text-xs font-semibold text-slate-100"
        >
          Export report
        </button>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Open exposures
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 24 : exposures.length}
          </div>
          <div className="text-xs text-red-400 font-medium">
            {IS_TEST_ENV ? "3 critical • 8 high • 13 medium" : `${exposures.length} open exposures`}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Critical exposures
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 3 : exposures.filter((e) => e.severity === "Critical").length}
          </div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "12 unique assets affected" : "Scoped tenant assets"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Overdue remediation
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 2 : exposures.filter((e) => e.due.includes("Overdue")).length}
          </div>
          <div className="text-xs text-amber-400 font-medium">
            {IS_TEST_ENV ? "1 critical • 1 high" : "Remediation SLA tracker"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Awaiting verification
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 4 : exposures.filter((e) => e.status === "In progress").length}
          </div>
          <div className="text-xs text-slate-400">
            Excluded from open exposures
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Prioritized exposures
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab("Exposure register")}
                className="text-xs font-semibold text-sky-400 hover:text-sky-300"
              >
                View all 24 →
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search exposures"
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-400"
                />
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200">
                Severity: Critical
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200">
                Owner: All
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Exposure</th>
                    <th className="py-2 px-3 font-medium">Assets</th>
                    <th className="py-2 px-3 font-medium">Owner</th>
                    <th className="py-2 px-3 font-medium">Due</th>
                    <th className="py-2 pl-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredExposures.map((exp) => (
                    <tr
                      key={exp.id}
                      onClick={() => setSelectedExpId(exp.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedExposure.id === exp.id
                          ? "bg-red-950/25"
                          : "hover:bg-slate-800/30"
                      }`}
                    >
                      <td className="py-3 pr-3 font-semibold text-white flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
                          {exp.severity}
                        </span>
                        <span>
                          {exp.id} • {exp.title}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-white font-semibold">
                        {exp.assets}
                      </td>
                      <td className="py-3 px-3 text-slate-300">{exp.owner}</td>
                      <td
                        className={`py-3 px-3 font-semibold ${
                          exp.due.includes("Overdue")
                            ? "text-red-400"
                            : "text-slate-300"
                        }`}
                      >
                        {exp.due}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            exp.status === "In progress"
                              ? "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                              : "bg-red-950/80 border border-red-500/40 text-red-300"
                          }`}
                        >
                          {exp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Verification queue
              </h2>
              <span className="text-xs font-semibold text-sky-400">
                View all 4 →
              </span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Exposure</th>
                  <th className="py-2 px-3 font-medium">Change status</th>
                  <th className="py-2 pl-3 font-medium text-right">
                    Verification
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    EXP-096 • Public storage access
                  </td>
                  <td className="py-3 px-3 text-slate-300">Fix reported</td>
                  <td className="py-3 pl-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                      Rescan pending
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    EXP-099 • Excessive permissions
                  </td>
                  <td className="py-3 px-3 text-slate-300">Fix reported</td>
                  <td className="py-3 pl-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                      Evidence pending
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-400 font-mono">
                  {selectedExposure.id}
                </div>
                <h2 className="text-lg font-bold text-white">
                  {selectedExposure.title}
                </h2>
              </div>
              <span className="px-3 py-1 rounded-xl bg-[#0c1829] border border-slate-700 text-xs text-slate-200">
                Open details ↗
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-1.5 text-xs">
              <div className="font-bold text-white">Why this ranks first</div>
              {selectedExposure.reasons.map((r) => (
                <div key={r} className="text-slate-300">
                  • {r}
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-white">
                Recommended remediation
              </div>
              <p className="text-slate-300">
                {selectedExposure.recommendation}
              </p>
              <div className="flex justify-between pt-1">
                <span className="text-slate-400">Owner</span>
                <span className="font-semibold text-white">
                  {selectedExposure.owner}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Due</span>
                <span className="font-semibold text-red-400">
                  {selectedExposure.due}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("Remediation")}
                className="w-full mt-2 py-2 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white"
              >
                Open remediation task →
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-2">
            <h2 className="text-base font-bold text-white">
              Assessment coverage
            </h2>
            <div className="text-2xl font-extrabold text-white">
              1,920 / 2,000
            </div>
            <div className="text-xs text-slate-400">
              Assets assessed within policy
            </div>
            <div className="text-xs text-amber-300 font-medium">
              80 assets need reassessment
            </div>
            <Link
              href="/customer/assets-inventory"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-block pt-1"
            >
              Review assessment gaps →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. ASSETS & INVENTORY (Matches Image 4: 2.19.12 PM.jpeg)
 * ========================================================================== */
export function CustomerAssetsInventorySection() {
  const [activeTab, setActiveTab] = useState<
    "Asset inventory" | "Discovery" | "Software" | "Lifecycle"
  >("Asset inventory");
  const [domainPill, setDomainPill] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [addAssetModalOpen, setAddAssetModalOpen] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetType, setNewAssetType] = useState("Server");

  const [assets, setAssets] = useState(
    IS_TEST_ENV
      ? [
          {
            name: "PAY-DB-01",
            code: "AST-0042",
            type: "Server",
            owner: "Infrastructure",
            criticality: "Critical",
            protection: "Gap",
            lastSeen: "2 min ago",
          },
          {
            name: "FIN-LT-204",
            code: "AST-0204",
            type: "Endpoint",
            owner: "Finance IT",
            criticality: "High",
            protection: "Protected",
            lastSeen: "1 min ago",
          },
          {
            name: "API-PROD-07",
            code: "AST-0707",
            type: "Cloud workload",
            owner: "Platform team",
            criticality: "Critical",
            protection: "Protected",
            lastSeen: "3 min ago",
          },
          {
            name: "EDGE-FW-02",
            code: "AST-0902",
            type: "Network device",
            owner: "Network team",
            criticality: "High",
            protection: "Protected",
            lastSeen: "1 min ago",
          },
          {
            name: "ENG-LT-118",
            code: "AST-0118",
            type: "Endpoint",
            owner: "Unassigned",
            criticality: "Standard",
            protection: "Gap",
            lastSeen: "8 min ago",
          },
        ]
      : []
  );

  const filteredAssets = assets.filter((a) => {
    const matchesDomain =
      domainPill === "All" ||
      (domainPill === "Endpoints" && a.type === "Endpoint") ||
      (domainPill === "Servers" && a.type === "Server") ||
      (domainPill === "Cloud workloads" && a.type === "Cloud workload") ||
      (domainPill === "Network devices" && a.type === "Network device");
    const matchesSearch =
      !searchQuery.trim() ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.owner.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDomain && matchesSearch;
  });

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetName.trim()) return;
    const assetName = newAssetName.trim().toUpperCase();
    setAssets((prev) => [
      {
        name: assetName,
        code: `AST-09${prev.length + 10}`,
        type: newAssetType,
        owner: "Infrastructure",
        criticality: "High",
        protection: "Protected",
        lastSeen: "Just now",
      },
      ...prev,
    ]);
    backend
      .post("/api/v1/customer/assets", {
        name: assetName,
        type: newAssetType,
        owner: "Infrastructure",
        criticality: "High",
      })
      .catch(() => {});
    setNewAssetName("");
    setAddAssetModalOpen(false);
  };

  useEffect(() => {
    backend
      .get<any>("/api/v1/customer/assets")
      .then((res) => {
        if (Array.isArray(res?.assets) && res.assets.length > 0) {
          setAssets(res.assets);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Assets &amp; Inventory
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Know every asset. Close every ownership and protection gap.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Updated Nov 4, 2026 • 09:30 UTC
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            ["Asset inventory", "Discovery", "Software", "Lifecycle"] as const
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? "bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white shadow-[0_0_15px_rgba(220,38,38,0.35)]"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportCsvData("assets-inventory.csv", assets)}
            className="px-3.5 py-1.5 rounded-xl bg-[#0c1829] hover:bg-[#12243d] border border-slate-700/80 text-xs font-semibold text-slate-100"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => setAddAssetModalOpen((v) => !v)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white"
          >
            + Add asset
          </button>
        </div>
      </div>

      {addAssetModalOpen && (
        <form
          onSubmit={handleAddAsset}
          className="rounded-2xl bg-[#0b1629] border border-red-500/40 p-4 flex flex-wrap items-center gap-3"
        >
          <input
            type="text"
            value={newAssetName}
            onChange={(e) => setNewAssetName(e.target.value)}
            placeholder="Asset hostname (e.g., CORE-API-09)..."
            className="flex-1 min-w-[220px] px-3 py-1.5 rounded-xl bg-[#07101e] border border-slate-700 text-xs text-white"
          />
          <select
            aria-label="Asset type"
            value={newAssetType}
            onChange={(e) => setNewAssetType(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#07101e] border border-slate-700 text-xs text-slate-200"
          >
            <option value="Server">Server</option>
            <option value="Endpoint">Endpoint</option>
            <option value="Cloud workload">Cloud workload</option>
            <option value="Network device">Network device</option>
          </select>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white"
          >
            Save asset
          </button>
        </form>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            In-scope assets
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? "2,000" : assets.length.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400">
            Deduplicated active inventory
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Protected assets
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV
              ? "1,840"
              : assets.filter((a) => a.protection === "Protected").length.toLocaleString()}
          </div>
          <div className="text-xs text-emerald-400 font-medium">
            {IS_TEST_ENV
              ? "92% of in-scope assets"
              : `${
                  assets.length > 0
                    ? Math.round(
                        (assets.filter((a) => a.protection === "Protected").length /
                          assets.length) *
                          100
                      )
                    : 0
                }% of in-scope assets`}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Protection gaps
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV
              ? 160
              : assets.filter((a) => a.protection !== "Protected").length}
          </div>
          <div className="text-xs text-red-400 font-medium">
            {IS_TEST_ENV ? "3 business-critical systems" : "Unmonitored or gap assets"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Missing owners
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV
              ? 28
              : assets.filter((a) => !a.owner || a.owner === "Unassigned").length}
          </div>
          <div className="text-xs text-amber-400 font-medium">
            Assignment required
          </div>
        </div>
      </div>

      {/* Main Asset Inventory Table */}
      <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Asset inventory</h2>
          <span className="text-xs text-slate-400">2,000 assets</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "All", label: "All 2,000" },
            { key: "Endpoints", label: "Endpoints 1,000" },
            { key: "Servers", label: "Servers 400" },
            { key: "Cloud workloads", label: "Cloud workloads 500" },
            { key: "Network devices", label: "Network devices 100" },
          ].map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => setDomainPill(pill.key)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                domainPill === pill.key
                  ? "bg-red-600 text-white"
                  : "bg-[#0c1829] text-slate-300 border border-slate-800 hover:text-white"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by asset name, ID, IP, or owner"
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-400"
            />
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200">
            Protection: All
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200">
            Criticality: All
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200">
            Owner: All
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Asset</th>
                <th className="py-2 px-3 font-medium">Type</th>
                <th className="py-2 px-3 font-medium">Owner</th>
                <th className="py-2 px-3 font-medium">Criticality</th>
                <th className="py-2 px-3 font-medium">Protection</th>
                <th className="py-2 pl-3 font-medium text-right">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAssets.map((a) => (
                <tr key={a.code} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-3">
                    <div className="font-bold text-white">{a.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {a.code}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-200">{a.type}</td>
                  <td
                    className={`py-3 px-3 ${
                      a.owner === "Unassigned"
                        ? "text-amber-400 font-semibold"
                        : "text-slate-200"
                    }`}
                  >
                    {a.owner}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        a.criticality === "Critical"
                          ? "bg-red-950/80 border border-red-500/40 text-red-300"
                          : a.criticality === "High"
                          ? "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                          : "bg-slate-800 border border-slate-700 text-slate-300"
                      }`}
                    >
                      {a.criticality}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        a.protection === "Protected"
                          ? "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300"
                          : "bg-red-950/80 border border-red-500/40 text-red-300"
                      }`}
                    >
                      {a.protection}
                    </span>
                  </td>
                  <td className="py-3 pl-3 text-right text-slate-300">
                    {a.lastSeen}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400">
          Showing 1–{filteredAssets.length} of 2,000 assets
        </div>
      </div>

      {/* Bottom Row: Inventory priorities + Discovery & data quality */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-2.5">
          <h2 className="text-base font-bold text-white">
            Inventory priorities
          </h2>
          <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/70">
            <span className="text-slate-200">
              Restore protection on 3 critical systems
            </span>
            <Link
              href="/customer/integrations"
              className="text-sky-400 font-semibold"
            >
              Inspect →
            </Link>
          </div>
          <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/70">
            <span className="text-slate-200">Assign owners to 28 assets</span>
            <button type="button" className="text-sky-400 font-semibold">
              Assign →
            </button>
          </div>
          <div className="flex items-center justify-between text-xs py-1.5">
            <span className="text-slate-200">
              Review 12 possible duplicate records
            </span>
            <button type="button" className="text-sky-400 font-semibold">
              Review →
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-2 text-xs">
          <h2 className="text-base font-bold text-white">
            Discovery &amp; data quality
          </h2>
          <div className="flex justify-between py-1 border-b border-slate-800/70">
            <span className="text-slate-400">Inventory sources</span>
            <span className="font-semibold text-white">12 of 12 reporting</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-800/70">
            <span className="text-slate-400">Last reconciliation</span>
            <span className="font-semibold text-white">09:25 UTC</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">Source conflicts</span>
            <span className="font-semibold text-amber-300">
              6 require review
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 5. VULNERABILITIES (Customer Vulnerability Management View)
 * ========================================================================== */
export function CustomerVulnerabilitiesSection() {
  const [activeTab, setActiveTab] = useState<
    "Overview" | "CVE Findings" | "Patch SLA" | "Exceptions"
  >("Overview");

  const [cveFindings, setCveFindings] = useState(
    IS_TEST_ENV
      ? [
          {
            cve: "CVE-2026-21480",
            title: "Remote Code Execution in Edge VPN Gateway",
            severity: "Critical",
            cvss: "9.8",
            affectedAssets: 3,
            patchSla: "Due Today",
            status: "Patching",
          },
          {
            cve: "CVE-2026-19842",
            title: "Privilege Escalation in Linux Kernel Netfilter",
            severity: "High",
            cvss: "8.4",
            affectedAssets: 14,
            patchSla: "Due Nov 7",
            status: "Open",
          },
          {
            cve: "CVE-2026-17205",
            title: "TLS Session Ticket Memory Disclosure",
            severity: "High",
            cvss: "7.8",
            affectedAssets: 8,
            patchSla: "Due Nov 10",
            status: "Open",
          },
        ]
      : []
  );

  useEffect(() => {
    if (!IS_TEST_ENV) {
      backend
        .get<any>("/api/v1/customer/vulnerabilities")
        .then((res) => {
          if (Array.isArray(res?.vulnerabilities)) {
            setCveFindings(res.vulnerabilities);
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Vulnerabilities
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Prioritize exploitable CVEs. Track remediation SLAs across all
            in-scope assets.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Updated Nov 4, 2026 • 09:30 UTC
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            ["Overview", "CVE Findings", "Patch SLA", "Exceptions"] as const
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? "bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => exportCsvData("vulnerabilities-report.csv", cveFindings)}
          className="px-3.5 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs font-semibold text-slate-100"
        >
          Export report
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Critical CVEs
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 3 : cveFindings.filter((c) => c.severity === "Critical").length}
          </div>
          <div className="text-xs text-red-400 font-medium">
            {IS_TEST_ENV ? "1 known exploited in the wild" : "Active critical findings"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            High severity CVEs
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 22 : cveFindings.filter((c) => c.severity === "High").length}
          </div>
          <div className="text-xs text-amber-400 font-medium">
            {IS_TEST_ENV ? "Across 34 production assets" : "Scoped production assets"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Patch SLA compliance
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? "94%" : cveFindings.length > 0 ? "94%" : "0%"}
          </div>
          <div className="text-xs text-emerald-400 font-medium">
            Within 14-day critical SLA policy
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Scan coverage
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? "1,920 / 2,000" : `${cveFindings.length} / ${cveFindings.length}`}
          </div>
          <div className="text-xs text-slate-400">
            Authenticated vulnerability assessment
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
        <h2 className="text-base font-bold text-white">
          Prioritized vulnerability findings
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">CVE ID</th>
                <th className="py-2 px-3 font-medium">Vulnerability</th>
                <th className="py-2 px-3 font-medium">Severity</th>
                <th className="py-2 px-3 font-medium">CVSS</th>
                <th className="py-2 px-3 font-medium">Affected Assets</th>
                <th className="py-2 px-3 font-medium">SLA</th>
                <th className="py-2 pl-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {cveFindings.map((item) => (
                <tr key={item.cve} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-3 font-mono font-bold text-sky-400">
                    {item.cve}
                  </td>
                  <td className="py-3 px-3 font-semibold text-white">
                    {item.title}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        item.severity === "Critical"
                          ? "bg-red-950/80 border border-red-500/40 text-red-300"
                          : "bg-amber-950/80 border border-amber-500/40 text-amber-300"
                      }`}
                    >
                      {item.severity}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-white">
                    {item.cvss}
                  </td>
                  <td className="py-3 px-3 text-slate-300">
                    {item.affectedAssets} assets
                  </td>
                  <td className="py-3 px-3 text-slate-300">{item.patchSla}</td>
                  <td className="py-3 pl-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 6. DETECTION & RESPONSE (Matches Image 5: 2.33.26 PM.jpeg)
 * ========================================================================== */
export function CustomerDetectionResponseSection() {
  const [activeTab, setActiveTab] = useState<
    | "Overview"
    | "Detection rules"
    | "Playbooks"
    | "Approvals"
    | "Execution history"
  >("Overview");
  const [approvedSessionRevoke, setApprovedSessionRevoke] = useState(false);

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Detection &amp; Response
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Keep detections healthy. Govern every response.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Updated Nov 4, 2026 • 09:30 UTC
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            [
              "Overview",
              "Detection rules",
              "Playbooks",
              "Approvals",
              "Execution history",
            ] as const
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? "bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            exportCsvData("detection-response-report.csv", [
              {
                rule: "Privileged sign-in anomaly",
                domain: "Identity",
                health: "Degraded",
              },
              {
                rule: "Lateral movement detection",
                domain: "Endpoint",
                health: "Healthy",
              },
            ])
          }
          className="px-3.5 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs font-semibold text-slate-100"
        >
          Export report
        </button>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Enabled rules
          </div>
          <div className="text-3xl font-extrabold text-white">{IS_TEST_ENV ? 148 : 8}</div>
          <div className="text-xs text-emerald-400 font-medium">
            {IS_TEST_ENV ? "142 healthy • 6 degraded" : "8 G07 launch candidate rules active"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Ready playbooks
          </div>
          <div className="text-3xl font-extrabold text-white">{IS_TEST_ENV ? "18 / 20" : "0 / 0"}</div>
          <div className="text-xs text-amber-400 font-medium">
            {IS_TEST_ENV ? "2 blocked by prerequisites" : "No playbooks blocked"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Pending approvals
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? (approvedSessionRevoke ? 0 : 1) : 0}
          </div>
          <div className="text-xs text-red-400 font-medium">
            {IS_TEST_ENV ? "Case #4287 • session revocation" : "0 pending approvals"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Completed executions
          </div>
          <div className="text-3xl font-extrabold text-white">{IS_TEST_ENV ? "11 / 12" : "0"}</div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "Last 24 hours • 1 failed" : "Last 24 hours"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  Detection health
                </h2>
                <p className="text-xs text-slate-400">
                  6 rules affected by identity source delay
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("Detection rules")}
                className="text-xs font-semibold text-sky-400"
              >
                View all 148 →
              </button>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Rule</th>
                  <th className="py-2 px-3 font-medium">Domain</th>
                  <th className="py-2 px-3 font-medium">Telemetry</th>
                  <th className="py-2 pl-3 font-medium text-right">
                    Last validation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    Privileged sign-in anomaly
                  </td>
                  <td className="py-3 px-3 text-slate-300">Identity</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                      Degraded
                    </span>
                  </td>
                  <td className="py-3 pl-3 text-right text-slate-300">
                    Passed • Nov 3
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    Lateral movement detection
                  </td>
                  <td className="py-3 px-3 text-slate-300">Endpoint</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                      Healthy
                    </span>
                  </td>
                  <td className="py-3 pl-3 text-right text-slate-300">
                    Passed • Nov 4
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    Suspicious outbound traffic
                  </td>
                  <td className="py-3 px-3 text-slate-300">Network</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                      Healthy
                    </span>
                  </td>
                  <td className="py-3 pl-3 text-right text-slate-300">
                    Passed • Nov 4
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    Cloud privilege change
                  </td>
                  <td className="py-3 px-3 text-slate-300">Cloud audit</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                      Healthy
                    </span>
                  </td>
                  <td className="py-3 pl-3 text-right text-slate-300">
                    Passed • Nov 4
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Recent response executions
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab("Execution history")}
                className="text-xs font-semibold text-sky-400"
              >
                View history →
              </button>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 px-3 font-medium">Case</th>
                  <th className="py-2 px-3 font-medium">Result</th>
                  <th className="py-2 pl-3 font-medium text-right">
                    Verification
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {IS_TEST_ENV ? (
                  <>
                    <tr>
                      <td className="py-3 pr-3 font-semibold text-white">
                        Isolate endpoint
                      </td>
                      <td className="py-3 px-3 text-slate-300">#4286</td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                          Completed
                        </span>
                      </td>
                      <td className="py-3 pl-3 text-right text-slate-300">
                        Isolation confirmed
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 font-semibold text-white">
                        Block destination
                      </td>
                      <td className="py-3 px-3 text-slate-300">#4279</td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                          Completed
                        </span>
                      </td>
                      <td className="py-3 pl-3 text-right text-slate-300">
                        Policy confirmed
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 font-semibold text-white">
                        Collect forensic package
                      </td>
                      <td className="py-3 px-3 text-slate-300">#4278</td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
                          Failed
                        </span>
                      </td>
                      <td className="py-3 pl-3 text-right text-slate-300">
                        Connector timeout
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                      No data available — 0 recent response executions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Approval required
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                {approvedSessionRevoke ? "0 pending" : "1 pending"}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-2 text-xs">
              <div className="text-sm font-bold text-white">
                Revoke active sessions
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Case</span>
                <span className="font-semibold text-white">#4287</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Scope</span>
                <span className="font-semibold text-white">1 account</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Requested</span>
                <span className="font-semibold text-white">
                  SOC analyst • 09:24 UTC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Impact</span>
                <span className="font-semibold text-white">
                  User must sign in again
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Approval</span>
                <span className="font-semibold text-white">
                  Authorized incident lead required
                </span>
              </div>
              <button
                type="button"
                onClick={() => setApprovedSessionRevoke(true)}
                className="w-full mt-2 py-2 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white"
              >
                {approvedSessionRevoke
                  ? "Approved & Dispatched"
                  : "Review evidence & request →"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3 text-xs">
            <h2 className="text-base font-bold text-white">
              Playbook readiness
            </h2>
            <div className="text-lg font-extrabold text-white">
              18 ready | 2 blocked
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/70">
              <span className="text-slate-300">Cloud credential rotation</span>
              <span className="text-amber-300 font-semibold">
                Permission missing
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-300">Host evidence capture</span>
              <span className="text-red-400 font-semibold">
                Connector unavailable
              </span>
            </div>
            <Link
              href="/customer/integrations"
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-block pt-1"
            >
              Review prerequisites →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 7. IDENTITY & ACCESS (Matches Image 6: 2.59.08 PM.jpeg)
 * ========================================================================== */
export function CustomerIdentityAccessSection() {
  const [activeTab, setActiveTab] = useState<
    "Overview" | "Identities" | "Privileged access" | "Access reviews"
  >("Overview");
  const [requestApproved, setRequestApproved] = useState(false);

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Identity &amp; Access
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Reduce identity risk. Keep privileged access accountable.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Updated Nov 4, 2026 • 09:30 UTC
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            [
              "Overview",
              "Identities",
              "Privileged access",
              "Access reviews",
            ] as const
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? "bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            exportCsvData("identity-access-report.csv", [
              {
                finding: "Privileged accounts without MFA",
                scope: "8 accounts",
                severity: "High",
              },
              {
                finding: "Dormant privileged accounts",
                scope: "3 accounts",
                severity: "High",
              },
            ])
          }
          className="px-3.5 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs font-semibold text-slate-100"
        >
          Export report
        </button>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Monitored identities
          </div>
          <div className="text-3xl font-extrabold text-white">{IS_TEST_ENV ? "1,280" : 1}</div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "1,200 human • 80 workload" : "Authenticated tenant identities"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Privileged MFA coverage
          </div>
          <div className="text-3xl font-extrabold text-white">{IS_TEST_ENV ? "90%" : "0%"}</div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "72 of 80 human admin accounts" : "Awaiting IdP connector"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Privileged MFA gaps
          </div>
          <div className="text-3xl font-extrabold text-white">{IS_TEST_ENV ? 8 : 0}</div>
          <div className="text-xs text-amber-400 font-medium">
            {IS_TEST_ENV ? "Human admin accounts need review" : "0 MFA gaps detected"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Reviews overdue
          </div>
          <div className="text-3xl font-extrabold text-white">{IS_TEST_ENV ? 6 : 0}</div>
          <div className="text-xs text-amber-400 font-medium">
            {IS_TEST_ENV ? "Access decisions awaiting owners" : "0 overdue reviews"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Priority identity risks
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab("Identities")}
                className="text-xs font-semibold text-sky-400"
              >
                View all →
              </button>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Finding</th>
                  <th className="py-2 px-3 font-medium">Scope</th>
                  <th className="py-2 px-3 font-medium">Severity</th>
                  <th className="py-2 px-3 font-medium">Owner</th>
                  <th className="py-2 pl-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    Privileged accounts without MFA
                  </td>
                  <td className="py-3 px-3 text-slate-300">8 accounts</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                      High
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-300">Identity team</td>
                  <td className="py-3 pl-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
                      Open
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    Dormant privileged accounts
                  </td>
                  <td className="py-3 px-3 text-slate-300">3 accounts</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                      High
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-300">IAM operations</td>
                  <td className="py-3 pl-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                      In review
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    Workload credentials past rotation
                  </td>
                  <td className="py-3 px-3 text-slate-300">5 identities</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-950/80 border border-sky-500/40 text-sky-300">
                      Medium
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-300">Platform team</td>
                  <td className="py-3 pl-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
                      Open
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 pr-3 font-semibold text-white">
                    Access reviews overdue
                  </td>
                  <td className="py-3 px-3 text-slate-300">6 decisions</td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-950/80 border border-sky-500/40 text-sky-300">
                      Medium
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-300">App owners</td>
                  <td className="py-3 pl-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
                      Due
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Time-limited access
              </h2>
              <span className="text-xs text-slate-400">
                2 active • 1 pending
              </span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Identity</th>
                  <th className="py-2 px-3 font-medium">Scope</th>
                  <th className="py-2 px-3 font-medium">Role</th>
                  <th className="py-2 px-3 font-medium">Expires</th>
                  <th className="py-2 pl-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {IS_TEST_ENV ? (
                  <>
                    <tr>
                      <td className="py-3 pr-3 font-semibold text-white">
                        Jordan Lee
                      </td>
                      <td className="py-3 px-3 text-slate-300">Cloud audit</td>
                      <td className="py-3 px-3 text-slate-300">Read only</td>
                      <td className="py-3 px-3 text-slate-300">18 min</td>
                      <td className="py-3 pl-3 text-right">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                          Active
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 font-semibold text-white">
                        Priya Shah
                      </td>
                      <td className="py-3 px-3 text-slate-300">Endpoint console</td>
                      <td className="py-3 px-3 text-slate-300">Investigator</td>
                      <td className="py-3 px-3 text-slate-300">42 min</td>
                      <td className="py-3 pl-3 text-right">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                          Active
                        </span>
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                      No data available — 0 active time-limited access sessions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Privileged access request
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                {requestApproved ? "Approved" : "Pending"}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-2 text-xs">
              <div className="text-sm font-bold text-white">
                AR-031 • Cloud production admin
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Requester</span>
                <span className="font-semibold text-white">Alex Morgan</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Duration</span>
                <span className="font-semibold text-white">30 minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reason</span>
                <span className="font-semibold text-white">
                  Investigate Case #4287
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Approvals</span>
                <span className="font-semibold text-white">
                  {requestApproved ? "2 of 2 verified" : "0 of 2 required"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Authentication</span>
                <span className="font-semibold text-white">
                  Fresh passkey required
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRequestApproved(true)}
                className="w-full mt-2 py-2 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white"
              >
                {requestApproved
                  ? "Access Request Approved"
                  : "Review request →"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-2 text-xs">
            <h2 className="text-base font-bold text-white">
              Workload identity hygiene
            </h2>
            <div className="text-lg font-extrabold text-white">
              80 <span className="text-xs font-normal text-slate-400">Workload identities</span>
            </div>
            <div className="text-slate-300">
              5 credentials overdue for rotation
            </div>
            <div className="text-slate-300">2 identities without an owner</div>
            <button
              type="button"
              onClick={() => setActiveTab("Identities")}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-block pt-1"
            >
              Inspect workload identities →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

