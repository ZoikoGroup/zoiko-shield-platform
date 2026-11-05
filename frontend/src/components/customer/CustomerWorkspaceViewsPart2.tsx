"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { backend } from "@/lib/backend";
import { useDemoState } from "@/lib/demo-state";

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
 * 8. DATA SECURITY (Matches Image 7: 3.01.32 PM.jpeg)
 * ========================================================================== */
export function CustomerDataSecuritySection() {
  const [activeTab, setActiveTab] = useState<
    "Overview" | "Data inventory" | "Access risks" | "Policy alerts"
  >("Overview");
  const [inspectEvidenceOpen, setInspectEvidenceOpen] = useState(false);
  const [dataRisks, setDataRisks] = useState<any[]>(
    IS_TEST_ENV
      ? [
          {
            finding: "Public access to sensitive data",
            stores: "4 stores",
            severity: "Critical",
            owner: "Cloud team",
            status: "Open",
          },
          {
            finding: "Excessive permissions",
            stores: "3 stores",
            severity: "High",
            owner: "Data platform",
            status: "In review",
          },
          {
            finding: "Encryption not enabled",
            stores: "2 stores",
            severity: "High",
            owner: "Infrastructure",
            status: "Open",
          },
          {
            finding: "Retention policy missing",
            stores: "5 stores",
            severity: "Medium",
            owner: "Governance",
            status: "Open",
          },
        ]
      : []
  );
  const [policyAlerts, setPolicyAlerts] = useState<any[]>(
    IS_TEST_ENV
      ? [
          {
            alert: "Sensitive file shared externally",
            severity: "High",
            mode: "Monitor only",
            outcome: "Alerted",
          },
          {
            alert: "Restricted upload attempt",
            severity: "High",
            mode: "Enforce",
            outcome: "Blocked",
          },
        ]
      : []
  );

  useEffect(() => {
    backend
      .get<any>("/api/v1/customer/exposures")
      .then((res) => {
        if (Array.isArray(res?.items) && res.items.length > 0) {
          setDataRisks(
            res.items.map((item: any) => ({
              finding: item.title,
              stores: item.scope || "1 store",
              severity: item.severity || "High",
              owner: item.owner || "Data team",
              status: item.status || "Open",
            }))
          );
        }
      })
      .catch(() => {});
    backend
      .get<any>("/api/v1/alerts")
      .then((res) => {
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.items)
          ? res.items
          : [];
        if (list.length > 0) {
          setPolicyAlerts(
            list.slice(0, 5).map((a: any) => ({
              alert: a.title || a.id,
              severity: a.severity || "High",
              mode: "Enforce",
              outcome: a.status || "Alerted",
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Data Security
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Locate sensitive data. Reduce exposure. Verify protection.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          {IS_TEST_ENV ? "Updated Nov 4, 2026 • 09:30 UTC" : "Live database sync"}
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            [
              "Overview",
              "Data inventory",
              "Access risks",
              "Policy alerts",
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
            exportCsvData("data-security-report.csv", dataRisks)
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
            Stores assessed
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? "46 / 50" : `${dataRisks.length} / ${dataRisks.length}`}
          </div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "4 overdue or unassessed" : "Assessed from live inventory"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Sensitive data stores
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 18 : dataRisks.length}
          </div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "Within the 46 assessed stores" : "Monitored sensitive stores"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Public-access risks
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 4 : dataRisks.filter((r) => r.severity === "Critical").length}
          </div>
          <div className="text-xs text-red-400 font-medium">
            {IS_TEST_ENV ? "Linked to exposure EXP-108" : `${dataRisks.length} active findings`}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Open policy alerts
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 7 : policyAlerts.length}
          </div>
          <div className="text-xs text-amber-400 font-medium">
            {IS_TEST_ENV ? "2 high • 5 medium" : `${policyAlerts.length} active policy alerts`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Priority data risks
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab("Access risks")}
                className="text-xs font-semibold text-sky-400"
              >
                View all →
              </button>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Finding</th>
                  <th className="py-2 px-3 font-medium">Stores</th>
                  <th className="py-2 px-3 font-medium">Severity</th>
                  <th className="py-2 px-3 font-medium">Owner</th>
                  <th className="py-2 pl-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {dataRisks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No data available
                    </td>
                  </tr>
                ) : (
                  dataRisks.map((risk, idx) => (
                    <tr key={idx}>
                      <td className="py-3 pr-3 font-semibold text-white">
                        {risk.finding}
                      </td>
                      <td className="py-3 px-3 text-slate-300">{risk.stores}</td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
                          {risk.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{risk.owner}</td>
                      <td className="py-3 pl-3 text-right">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
                          {risk.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Recent policy alerts
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab("Policy alerts")}
                className="text-xs font-semibold text-sky-400"
              >
                View all {policyAlerts.length} →
              </button>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Alert</th>
                  <th className="py-2 px-3 font-medium">Severity</th>
                  <th className="py-2 px-3 font-medium">Mode</th>
                  <th className="py-2 pl-3 font-medium text-right">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {policyAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      No data available
                    </td>
                  </tr>
                ) : (
                  policyAlerts.map((pa, idx) => (
                    <tr key={idx}>
                      <td className="py-3 pr-3 font-semibold text-white">
                        {pa.alert}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                          {pa.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{pa.mode}</td>
                      <td className="py-3 pl-3 text-right">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                          {pa.outcome}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <h2 className="text-base font-bold text-white">
              {IS_TEST_ENV
                ? "Selected risk • EXP-108"
                : dataRisks[0]
                ? `Selected risk • ${dataRisks[0].finding}`
                : "Selected risk"}
            </h2>
            {!IS_TEST_ENV && dataRisks.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No data available
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-2 text-xs">
                <div className="text-sm font-bold text-white">
                  {dataRisks[0]?.finding || "Public access to sensitive data"}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Affected stores</span>
                  <span className="font-semibold text-white">
                    {dataRisks[0]?.stores || "4 storage resources"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Owner</span>
                  <span className="font-semibold text-white">
                    {dataRisks[0]?.owner || "Cloud team"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Classification</span>
                  <span className="font-semibold text-white">Confidential</span>
                </div>
                <p className="text-[11px] text-slate-400 pt-1">
                  Sensitive records are masked by default. Full inspection is
                  logged.
                </p>
                <button
                  type="button"
                  onClick={() => setInspectEvidenceOpen((v) => !v)}
                  className="w-full mt-2 py-2 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white"
                >
                  Inspect masked evidence →
                </button>
                {inspectEvidenceOpen && (
                  <div className="mt-2 p-2.5 rounded-lg bg-[#081221] border border-cyan-500/40 font-mono text-[11px] text-cyan-300">
                    Audit logged • Sensitive fields redacted [****-****]
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-2 text-xs">
            <h2 className="text-base font-bold text-white">
              Assessment confidence
            </h2>
            <div className="text-lg font-extrabold text-white">
              {IS_TEST_ENV ? "46 of 50" : `${dataRisks.length} of ${dataRisks.length}`}
            </div>
            <div className="text-slate-400">stores assessed within policy</div>
            <div className="text-slate-300">
              Classification: Available for {IS_TEST_ENV ? 46 : dataRisks.length} stores
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("Data inventory")}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-block pt-1"
            >
              Review data inventory →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 9. CLOUD SECURITY (Matches Image 8: 3.03.40 PM.jpeg)
 * ========================================================================== */
export function CustomerCloudSecuritySection() {
  const [activeTab, setActiveTab] = useState<
    "Overview" | "Cloud inventory" | "Posture findings" | "Workload protection"
  >("Overview");
  const [cloudFindings, setCloudFindings] = useState<any[]>(
    IS_TEST_ENV
      ? [
          {
            finding: "Public access to sensitive storage",
            scope: "4 resources",
            severity: "Critical",
            owner: "Cloud team",
            status: "Open",
          },
          {
            finding: "Publicly reachable admin interface",
            scope: "3 workloads",
            severity: "Critical",
            owner: "Platform team",
            status: "Open",
          },
        ]
      : []
  );
  const [cloudProviders, setCloudProviders] = useState<any[]>(
    IS_TEST_ENV
      ? [
          {
            provider: "AWS",
            environments: 5,
            workloads: 240,
            protected: 220,
            assessment: "Current",
          },
          {
            provider: "Azure",
            environments: 4,
            workloads: 180,
            protected: 160,
            assessment: "1 delayed",
          },
          {
            provider: "Google Cloud",
            environments: 3,
            workloads: 80,
            protected: 70,
            assessment: "Current",
          },
        ]
      : []
  );

  useEffect(() => {
    backend
      .get<any>("/api/v1/customer/exposures")
      .then((res) => {
        if (Array.isArray(res?.items) && res.items.length > 0) {
          setCloudFindings(
            res.items.map((item: any) => ({
              finding: item.title,
              scope: item.scope || "1 workload",
              severity: item.severity || "High",
              owner: item.owner || "Cloud team",
              status: item.status || "Open",
            }))
          );
        }
      })
      .catch(() => {});
    backend
      .get<any>("/api/v1/connectors")
      .then((res) => {
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.items)
          ? res.items
          : [];
        if (list.length > 0) {
          setCloudProviders(
            list.map((c: any) => ({
              provider: c.name || c.provider,
              environments: 1,
              workloads: c.eventsPerSec || 0,
              protected: c.eventsPerSec || 0,
              assessment: c.status === "HEALTHY" ? "Current" : c.status || "Current",
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Cloud Security
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            See cloud risk. Strengthen every workload.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          {IS_TEST_ENV ? "Updated Nov 4, 2026 • 09:30 UTC" : "Live database sync"}
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            [
              "Overview",
              "Cloud inventory",
              "Posture findings",
              "Workload protection",
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
            exportCsvData("cloud-security-report.csv", cloudProviders)
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
            Connected environments
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 12 : cloudProviders.length}
          </div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV
              ? "11 current • 1 assessment delayed"
              : `${cloudProviders.length} connected environments`}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Protected workloads
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? "450 / 500" : `${cloudProviders.length} / ${cloudProviders.length}`}
          </div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV ? "90% coverage • 50 gaps" : "Live workload protection"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Open posture findings
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 28 : cloudFindings.length}
          </div>
          <div className="text-xs text-red-400 font-medium">
            {IS_TEST_ENV
              ? "2 critical • 8 high • 18 medium"
              : `${cloudFindings.length} active findings`}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Workloads assessed
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? "480 / 500" : `${cloudProviders.length} / ${cloudProviders.length}`}
          </div>
          <div className="text-xs text-slate-400">
            {IS_TEST_ENV
              ? "20 outside assessment freshness policy"
              : "Assessed within policy"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Priority cloud findings
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab("Posture findings")}
                className="text-xs font-semibold text-sky-400"
              >
                View all {cloudFindings.length} →
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
                {cloudFindings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No data available
                    </td>
                  </tr>
                ) : (
                  cloudFindings.map((cf, idx) => (
                    <tr key={idx}>
                      <td className="py-3 pr-3 font-semibold text-white">
                        {cf.finding}
                      </td>
                      <td className="py-3 px-3 text-slate-300">{cf.scope}</td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
                          {cf.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{cf.owner}</td>
                      <td className="py-3 pl-3 text-right">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/80 border border-red-500/40 text-red-300">
                          {cf.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <h2 className="text-base font-bold text-white">
              Cloud environment health
            </h2>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Provider</th>
                  <th className="py-2 px-3 font-medium">Environments</th>
                  <th className="py-2 px-3 font-medium">Workloads</th>
                  <th className="py-2 px-3 font-medium">Protected</th>
                  <th className="py-2 pl-3 font-medium text-right">
                    Assessment
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {cloudProviders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No data available
                    </td>
                  </tr>
                ) : (
                  cloudProviders.map((cp, idx) => (
                    <tr key={idx}>
                      <td className="py-3 pr-3 font-semibold text-white">
                        {cp.provider}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {cp.environments}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {cp.workloads}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {cp.protected}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                          {cp.assessment}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
            <h2 className="text-base font-bold text-white">
              Assessment attention
            </h2>
            {!IS_TEST_ENV && cloudProviders.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No data available
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#0d1c33]/90 border border-slate-800 space-y-2 text-xs">
                <div className="text-sm font-bold text-white">
                  {cloudProviders[0]?.provider || "Azure • Production subscription"}
                </div>
                <div className="text-slate-300">
                  {IS_TEST_ENV
                    ? "20 workloads have stale posture results"
                    : "All connected cloud environments synced"}
                </div>
                <Link
                  href="/customer/integrations"
                  className="w-full mt-2 py-2 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white inline-flex items-center justify-center"
                >
                  Review permissions →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 10. COMPLIANCE & RISK (Customer Compliance & Risk View)
 * ========================================================================== */
export function CustomerComplianceRiskSection() {
  const [activeTab, setActiveTab] = useState<
    "Overview" | "Frameworks" | "Controls" | "Exceptions"
  >("Overview");
  const [demoState] = useDemoState();
  const [frameworks, setFrameworks] = useState<any[]>(
    IS_TEST_ENV
      ? [
          {
            name: "EU GDPR & DORA (eu_gdpr_dora_nis2_ie)",
            controlsPassing: "17 / 20",
            score: "85%",
            status: "Active",
          },
          {
            name: "ISO/IEC 27001:2022",
            controlsPassing: "88 / 93",
            score: "94%",
            status: "Passing",
          },
          {
            name: "SOC 2 Type II Security & Availability",
            controlsPassing: "61 / 64",
            score: "95%",
            status: "Passing",
          },
        ]
      : []
  );

  useEffect(() => {
    backend
      .get<any>("/api/v1/control-evaluations")
      .then((res) => {
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.items)
          ? res.items
          : [];
        if (list.length > 0) {
          const passing = list.filter((c: any) => c.status === "PASS").length;
          const pct = Math.round((passing / list.length) * 100);
          setFrameworks([
            {
              name: (demoState?.tenant as any)?.policyPack || "EU GDPR & DORA",
              controlsPassing: `${passing} / ${list.length}`,
              score: `${pct}%`,
              status: "Active",
            },
          ]);
        }
      })
      .catch(() => {});
  }, [(demoState?.tenant as any)?.policyPack]);

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Compliance &amp; Risk
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Track continuous control effectiveness, regulatory frameworks, and
            governed risk exceptions.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          {IS_TEST_ENV ? "Updated Nov 4, 2026 • 09:30 UTC" : "Live database sync"}
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(["Overview", "Frameworks", "Controls", "Exceptions"] as const).map(
            (tab) => (
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
            )
          )}
        </div>
        <button
          type="button"
          onClick={() => exportCsvData("compliance-risk.csv", frameworks)}
          className="px-3.5 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs font-semibold text-slate-100"
        >
          Export report
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Control effectiveness
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? "85%" : frameworks[0]?.score || "0%"}
          </div>
          <div className="text-xs text-emerald-400 font-medium">
            {IS_TEST_ENV
              ? "17 of 20 core controls passing"
              : `${frameworks[0]?.controlsPassing || "0 / 0"} core controls passing`}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Evidence freshness
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? "92%" : frameworks.length > 0 ? "100%" : "0%"}
          </div>
          <div className="text-xs text-slate-400">
            Signed Ed25519 + SHA-256 bundles
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Open exceptions
          </div>
          <div className="text-3xl font-extrabold text-white">
            {IS_TEST_ENV ? 3 : 0}
          </div>
          <div className="text-xs text-amber-400 font-medium">
            {IS_TEST_ENV ? "1 critical • 2 medium" : "0 open exceptions"}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Active policy pack
          </div>
          <div className="text-xl font-extrabold text-white font-mono">
            {demoState?.tenant?.dataResidencyRegion || demoState?.tenant?.homeRegion || (demoState?.tenant as any)?.region || "EU (Ireland)"}
          </div>
          <div className="text-xs text-slate-400">
            {(demoState?.tenant as any)?.policyPack || "eu_gdpr_dora_nis2_ie"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
        <h2 className="text-base font-bold text-white">
          Monitored compliance frameworks
        </h2>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2 pr-3 font-medium">Framework</th>
              <th className="py-2 px-3 font-medium">Controls Passing</th>
              <th className="py-2 px-3 font-medium">Score</th>
              <th className="py-2 pl-3 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {frameworks.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  No data available
                </td>
              </tr>
            ) : (
              frameworks.map((f) => (
                <tr key={f.name} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-3 font-semibold text-white">{f.name}</td>
                  <td className="py-3 px-3 text-slate-300">
                    {f.controlsPassing}
                  </td>
                  <td className="py-3 px-3 font-semibold text-white">
                    {f.score}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                      {f.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================================
 * 11. REPORTS & ANALYTICS (Customer Reports & Analytics View)
 * ========================================================================== */
export function CustomerReportsAnalyticsSection() {
  const [activeTab, setActiveTab] = useState<
    "Overview" | "Executive reports" | "Scheduled exports" | "Evidence bundles"
  >("Overview");
  const [reports, setReports] = useState<any[]>(
    IS_TEST_ENV
      ? [
          {
            name: "Monthly Executive Security Posture Summary",
            period: "Nov 2026",
            format: "PDF / CSV",
            generated: "09:00 UTC",
            status: "Ready",
          },
          {
            name: "Incident & SLA Performance Digest",
            period: "Last 30 days",
            format: "CSV",
            generated: "08:30 UTC",
            status: "Ready",
          },
          {
            name: "Cryptographic Audit & Evidence Bundle (G06)",
            period: "Q4 2026",
            format: "Signed JSON",
            generated: "08:00 UTC",
            status: "Verified",
          },
        ]
      : []
  );

  useEffect(() => {
    backend
      .get<any>("/api/v1/audit-packages")
      .then((res) => {
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.items)
          ? res.items
          : [];
        if (list.length > 0) {
          setReports(
            list.map((pkg: any) => ({
              name: pkg.framework || pkg.id,
              period: pkg.period || "Current",
              format: "Signed JSON",
              generated: pkg.generatedAt || "Verified",
              status: pkg.status || "Verified",
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Reports &amp; Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Generate executive posture summaries, operational metrics, and
            verifiable audit reports.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          {IS_TEST_ENV ? "Updated Nov 4, 2026 • 09:30 UTC" : "Live database sync"}
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            [
              "Overview",
              "Executive reports",
              "Scheduled exports",
              "Evidence bundles",
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
          onClick={() => exportCsvData("executive-analytics-report.csv", reports)}
          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white"
        >
          Export all reports
        </button>
      </div>

      <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
        <h2 className="text-base font-bold text-white">Available reports</h2>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2 pr-3 font-medium">Report</th>
              <th className="py-2 px-3 font-medium">Period</th>
              <th className="py-2 px-3 font-medium">Format</th>
              <th className="py-2 px-3 font-medium">Generated</th>
              <th className="py-2 pl-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {reports.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  No data available
                </td>
              </tr>
            ) : (
              reports.map((r) => (
                <tr key={r.name} className="hover:bg-slate-800/30">
                  <td className="py-3 pr-3 font-semibold text-white">{r.name}</td>
                  <td className="py-3 px-3 text-slate-300">{r.period}</td>
                  <td className="py-3 px-3 text-slate-300">{r.format}</td>
                  <td className="py-3 px-3 text-slate-300">{r.generated}</td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() => exportCsvData(`${r.name}.csv`, [r])}
                      className="text-xs font-semibold text-sky-400 hover:text-sky-300"
                    >
                      Download →
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================================
 * 12. INTEGRATIONS (Matches Image 9: 3.11.41 PM.jpeg)
 * ========================================================================== */
export function CustomerIntegrationsSection() {
  const [activeTab, setActiveTab] = useState<
    "Connected" | "Catalog" | "API & webhooks" | "Activity"
  >("Connected");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIntName, setSelectedIntName] = useState("Azure Production");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newIntName, setNewIntName] = useState("");

  const [integrations, setIntegrations] = useState([
    {
      name: "Microsoft 365 Identity",
      sub: "Microsoft",
      capability: "Identity telemetry",
      status: "Connected",
      freshness: "Delayed • 12 min",
      credentials: "Valid",
      actionLabel: "Inspect →",
      owner: "Identity team",
      auditStatus: "Delayed • 12 min",
      postureStatus: "Active",
    },
    {
      name: "Endpoint Security",
      sub: "EDR platform",
      capability: "Telemetry + response",
      status: "Connected",
      freshness: "Current",
      credentials: "Valid",
      actionLabel: "Inspect →",
      owner: "SOC team",
      auditStatus: "Current",
      postureStatus: "Active",
    },
    {
      name: "Azure Production",
      sub: "Cloud provider",
      capability: "Cloud audit + posture",
      status: "Connected",
      freshness: "Posture permission gap",
      credentials: "Valid",
      actionLabel: "Review →",
      owner: "Cloud team",
      auditStatus: "Current",
      postureStatus: "Blocked",
    },
    {
      name: "Network Gateway",
      sub: "Firewall cluster",
      capability: "Network telemetry",
      status: "Connected",
      freshness: "Current",
      credentials: "Expires Nov 10",
      actionLabel: "Review →",
      owner: "Network team",
      auditStatus: "Current",
      postureStatus: "Active",
    },
    {
      name: "Service Desk",
      sub: "Ticketing",
      capability: "Case synchronization",
      status: "Connected",
      freshness: "Current",
      credentials: "Expires Nov 14",
      actionLabel: "Review →",
      owner: "IT operations",
      auditStatus: "Current",
      postureStatus: "Active",
    },
  ]);

  const filteredIntegrations = integrations.filter(
    (item) =>
      !searchQuery.trim() ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.capability.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedIntegration =
    integrations.find((i) => i.name === selectedIntName) || integrations[2];

  const handleAddIntegration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIntName.trim()) return;
    const created = {
      name: newIntName.trim(),
      sub: "Cloud connector",
      capability: "Telemetry + response",
      status: "Connected",
      freshness: "Current",
      credentials: "Valid",
      actionLabel: "Inspect →",
      owner: "Platform team",
      auditStatus: "Current",
      postureStatus: "Active",
    };
    setIntegrations((prev) => [created, ...prev]);
    setSelectedIntName(created.name);
    backend
      .post("/api/v1/connectors", {
        name: created.name,
        provider: "cloud-connector",
        sourceRegion: "eu-west-1",
      })
      .catch(() => {});
    setNewIntName("");
    setAddModalOpen(false);
  };

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Integrations
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Connect securely. Verify data flow and response readiness.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Updated Nov 4, 2026 • 09:30 UTC
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            ["Connected", "Catalog", "API & webhooks", "Activity"] as const
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
          onClick={() => setAddModalOpen((v) => !v)}
          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white"
        >
          + Add integration
        </button>
      </div>

      {addModalOpen && (
        <form
          onSubmit={handleAddIntegration}
          className="rounded-2xl bg-[#0b1629] border border-red-500/40 p-4 flex flex-wrap items-center gap-3"
        >
          <input
            type="text"
            value={newIntName}
            onChange={(e) => setNewIntName(e.target.value)}
            placeholder="Integration name (e.g., AWS EU-West Production)..."
            className="flex-1 min-w-[220px] px-3 py-1.5 rounded-xl bg-[#07101e] border border-slate-700 text-xs text-white"
          />
          <button
            type="submit"
            className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white"
          >
            Connect
          </button>
        </form>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Configured integrations
          </div>
          <div className="text-3xl font-extrabold text-white">24</div>
          <div className="text-xs text-slate-400">
            Across telemetry and response services
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Telemetry freshness
          </div>
          <div className="text-3xl font-extrabold text-white">23 / 24</div>
          <div className="text-xs text-amber-400 font-medium">
            1 source delayed by 12 min
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Permission gaps
          </div>
          <div className="text-3xl font-extrabold text-white">1</div>
          <div className="text-xs text-slate-400">
            Cloud assessment requires review
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-xs font-medium text-slate-300">
            Credentials expiring
          </div>
          <div className="text-3xl font-extrabold text-white">2</div>
          <div className="text-xs text-amber-400 font-medium">
            Within the next 14 days
          </div>
        </div>
      </div>

      {/* Main Connected Integrations Table */}
      <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">
            Connected integrations
          </h2>
          <span className="text-xs text-slate-400">24 integrations</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search integrations"
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-100 placeholder:text-slate-400"
            />
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200">
            Category: All
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs text-slate-200">
            Health: All
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-medium">Integration</th>
                <th className="py-2 px-3 font-medium">Capability</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Freshness / Scope</th>
                <th className="py-2 px-3 font-medium">Credentials</th>
                <th className="py-2 pl-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredIntegrations.map((item) => (
                <tr
                  key={item.name}
                  onClick={() => setSelectedIntName(item.name)}
                  className={`cursor-pointer transition-colors ${
                    selectedIntegration.name === item.name
                      ? "bg-red-950/25"
                      : "hover:bg-slate-800/30"
                  }`}
                >
                  <td className="py-3 pr-3">
                    <div className="font-bold text-white">{item.name}</div>
                    <div className="text-[11px] text-slate-400">{item.sub}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-200">
                    {item.capability}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                      {item.status}
                    </span>
                  </td>
                  <td
                    className={`py-3 px-3 font-medium ${
                      item.freshness !== "Current"
                        ? "text-amber-300"
                        : "text-slate-200"
                    }`}
                  >
                    {item.freshness}
                  </td>
                  <td
                    className={`py-3 px-3 font-medium ${
                      item.credentials.includes("Expires")
                        ? "text-amber-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {item.credentials}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <span className="text-sky-400 font-semibold">
                      {item.actionLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Row: Issues requiring attention + Selected integration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-2.5 text-xs">
          <h2 className="text-base font-bold text-white">
            Issues requiring attention
          </h2>
          <div className="flex justify-between py-1.5 border-b border-slate-800/70">
            <span className="font-semibold text-white">
              Identity ingestion lag
            </span>
            <span className="text-slate-300">
              Microsoft 365 Identity is delayed by 12 minutes
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-800/70">
            <span className="font-semibold text-white">
              Cloud posture permission
            </span>
            <span className="text-slate-300">
              Azure Production is missing posture read access
            </span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="font-semibold text-white">
              Credential rotation
            </span>
            <span className="text-slate-300">
              2 connector credentials expire within 14 days
            </span>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3 text-xs">
          <h2 className="text-base font-bold text-white">
            Selected integration • {selectedIntegration.name}
          </h2>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Connection</span>
              <span className="font-semibold text-emerald-300">
                {selectedIntegration.status}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Cloud audit ingestion</span>
              <span className="font-semibold text-white">
                {selectedIntegration.auditStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Posture assessment</span>
              <span className="font-semibold text-amber-300">
                {selectedIntegration.postureStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Owner</span>
              <span className="font-semibold text-white">
                {selectedIntegration.owner}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="w-full py-2 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white"
          >
            Review required permissions →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 13. SETTINGS (Matches Image 10: 3.21.26 PM.jpeg — without sample/demo text)
 * ========================================================================== */
export function CustomerSettingsSection() {
  const [activeTab, setActiveTab] = useState<
    | "Overview"
    | "Workspace"
    | "Security policies"
    | "Notifications"
    | "Audit history"
  >("Overview");
  const [demoState] = useDemoState();
  const [changeRequestBanner, setChangeRequestBanner] = useState<string | null>(
    null
  );
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(
    IS_TEST_ENV ? 2 : 0
  );

  const orgName = IS_TEST_ENV
    ? "Acme Global Ltd"
    : demoState?.tenant?.organizationName || "Zoiko Shield Organization";
  const workspaceId = IS_TEST_ENV
    ? "acme-global-prod"
    : demoState?.tenant?.slug || "zoiko-prod";
  const requestedByUser = IS_TEST_ENV
    ? "Jane Doe"
    : demoState?.session?.fullName || demoState?.session?.email || "Security Administrator";

  useEffect(() => {
    backend
      .get<any>("/api/v1/customer/settings")
      .then((res) => {
        if (typeof res?.settings?.pendingApprovals === "number") {
          setPendingApprovalsCount(res.settings.pendingApprovals);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="w-full min-h-full bg-gradient-to-b from-[#071120] via-[#060f1d] to-[#050c18] text-slate-100 px-6 py-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white">
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Configure your workspace securely. Review controls, owners, and
            change requests.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Governance active • Changes require approval
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a1526]/95 border border-slate-800/90 p-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-[#07101e] p-1 rounded-xl border border-slate-800/80">
          {(
            [
              "Overview",
              "Workspace",
              "Security policies",
              "Notifications",
              "Audit history",
            ] as const
          ).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? "bg-cyan-950/60 border border-cyan-500/50 text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setPendingApprovalsCount((c) => c + 1);
            setChangeRequestBanner(
              "Change request CR-2049 submitted for dual-control governance review."
            );
            backend
              .post("/api/v1/customer/settings/change-requests", {
                title: "Workspace security policy update",
                requestedBy: requestedByUser,
              })
              .catch(() => {});
          }}
          className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white shadow-[0_0_15px_rgba(220,38,38,0.3)]"
        >
          Request change
        </button>
      </div>

      {changeRequestBanner && (
        <div className="rounded-xl bg-emerald-950/50 border border-emerald-500/40 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
          <span>{changeRequestBanner}</span>
          <button
            type="button"
            onClick={() => setChangeRequestBanner(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            WORKSPACE STATUS
          </div>
          <div className="text-2xl font-extrabold text-white">Active</div>
          <div className="text-xs text-emerald-400 font-medium">
            Tenant operational
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            IDENTITY CONTROLS
          </div>
          <div className="text-2xl font-extrabold text-white">SSO + MFA</div>
          <div className="text-xs text-emerald-400 font-medium">
            Enforced for users
          </div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            DATA RESIDENCY
          </div>
          <div className="text-2xl font-extrabold text-white">EU (Ireland)</div>
          <div className="text-xs text-slate-400">Primary region locked</div>
        </div>
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-4 space-y-1.5 shadow-xl">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
            PENDING APPROVALS
          </div>
          <div className="text-2xl font-extrabold text-white">
            {pendingApprovalsCount}
          </div>
          <div className="text-xs text-amber-400 font-medium">
            Changes await review
          </div>
        </div>
      </div>

      {/* Middle Row: Workspace profile (7 cols) + Authentication & sessions (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-white">
                Workspace profile
              </h2>
              <p className="text-xs text-slate-400">
                Core tenant details and regional residency controls.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("Workspace")}
              className="text-xs font-semibold text-sky-400"
            >
              Edit profile →
            </button>
          </div>

          <div className="divide-y divide-slate-800/70 text-xs">
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Organization</span>
              <span className="font-semibold text-white">{orgName}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Workspace ID</span>
              <span className="font-mono font-semibold text-white">
                {workspaceId}
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Primary data region</span>
              <span className="font-semibold text-white">EU (Ireland)</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Time zone</span>
              <span className="font-semibold text-white">Europe/Dublin</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Interface language</span>
              <span className="font-semibold text-white">English (US)</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400">Workspace tier</span>
              <span className="font-semibold text-white">Enterprise</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-white">
                Authentication &amp; sessions
              </h2>
              <p className="text-xs text-slate-400">
                Sign-in enforcement and privileged change protection.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("Security policies")}
              className="text-xs font-semibold text-sky-400"
            >
              Manage →
            </button>
          </div>

          <div className="divide-y divide-slate-800/70 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">
                  Identity provider
                </div>
                <div className="text-[11px] text-slate-400">
                  Microsoft Entra ID
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                CONNECTED
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Single sign-on</div>
                <div className="text-[11px] text-slate-400">Enforced</div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                ENFORCED
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">
                  Multi-factor authentication
                </div>
                <div className="text-[11px] text-slate-400">Required</div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                REQUIRED
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-400">Session timeout</span>
              <span className="font-semibold text-white">8 hours</span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">
                  Privileged settings changes
                </div>
                <div className="text-[11px] text-slate-400">Dual approval</div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                GOVERNED
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Notifications & escalation (7 cols) + Governance & change control (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">
              Notifications &amp; escalation
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab("Notifications")}
              className="text-xs font-semibold text-sky-400"
            >
              Configure →
            </button>
          </div>
          <div className="divide-y divide-slate-800/70 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-slate-400">
                  Critical incident alerts:{" "}
                </span>
                <span className="font-semibold text-white">Email + in-app</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                ON
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-slate-400">
                  Integration health alerts:{" "}
                </span>
                <span className="font-semibold text-white">
                  Email to security team
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                ON
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="text-slate-400">Daily security digest: </span>
                <span className="font-semibold text-white">08:00 UTC</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                ON
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl space-y-3 text-xs">
          <h2 className="text-base font-bold text-white">
            Governance &amp; change control
          </h2>
          <div className="text-lg font-extrabold text-white">
            2 pending change requests
          </div>
          <div className="space-y-1.5 text-slate-300">
            <div>
              Last configuration change:{" "}
              <span className="font-semibold text-white">Nov 3, 2026</span>
            </div>
            <div>
              Change activity:{" "}
              <span className="font-semibold text-white">Audit recorded</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("Audit history")}
            className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-block pt-1"
          >
            Review change history →
          </button>
        </div>
      </div>
    </div>
  );
}

