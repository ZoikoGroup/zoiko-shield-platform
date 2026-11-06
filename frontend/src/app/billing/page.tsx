"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  CreditCard,
  Download,
  ShieldCheck,
  Zap,
  ArrowRight,
  Database,
  Lock,
  Layers,
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { useDemoState } from "@/lib/demo-state";
import {
  resolveRegionMetadata,
  resolvePolicyPackForRegion,
  resolveRetentionScheduleFromPolicyPack,
} from "@/lib/assurance-primitives";

export default function BillingPage() {
  const [state] = useDemoState();
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  const currentRegionCode =
    state.tenant?.dataResidencyRegion || state.tenant?.homeRegion || "eu-west-1";
  const regionMeta = resolveRegionMetadata(currentRegionCode);
  const activePolicyPack = resolvePolicyPackForRegion(currentRegionCode);
  const retentionSchedule = resolveRetentionScheduleFromPolicyPack(currentRegionCode);

  const mockInvoices = [
    {
      id: "INV-2026-004",
      date: "Nov 01, 2026",
      amount: "$12,000.00",
      status: "PAID",
      plan: "Enterprise Sovereign Shield",
      receiptUrl: "#",
    },
    {
      id: "INV-2026-003",
      date: "Oct 01, 2026",
      amount: "$12,000.00",
      status: "PAID",
      plan: "Enterprise Sovereign Shield",
      receiptUrl: "#",
    },
    {
      id: "INV-2026-002",
      date: "Sep 01, 2026",
      amount: "$12,000.00",
      status: "PAID",
      plan: "Enterprise Sovereign Shield",
      receiptUrl: "#",
    },
  ];

  const handleDownloadInvoice = (id: string) => {
    setDownloadingReceiptId(id);
    setTimeout(() => {
      const blob = new Blob(
        [
          `ZoikoShield Cryptographic Invoice Receipt\nInvoice ID: ${id}\nTenant: ${
            state.tenant?.organizationName || "Zoiko Tenant"
          }\nDate: ${new Date().toISOString()}\nStatus: SETTLED\nPolicy Pack: ${
            activePolicyPack.policy_key
          }\nEd25519 Anchor: SHA256:${Math.random().toString(16).substring(2, 18)}`,
        ],
        { type: "text/plain" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}_receipt.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadingReceiptId(null);
    }, 400);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
            <Link href="/admin/tenant" className="hover:text-slate-200 transition-colors">
              Tenant Administration
            </Link>
            <span>/</span>
            <span className="text-amber-400 font-mono">G08 Storage Economics</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-amber-400" />
            <span>Billing, Metering &amp; Storage Economics</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Contracted storage tiers, cryptographic evidence retention schedules, and consumption metering under{" "}
            <span className="font-mono text-cyan-300">{activePolicyPack.policy_key}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/pricing"
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-xs font-bold text-white shadow-lg shadow-red-950/40 transition-all flex items-center gap-2"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Upgrade / Plan Catalog</span>
          </Link>
          <Link
            href="/audit"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Verify Evidence Bundles</span>
          </Link>
        </div>
      </div>

      {/* Top 3 KPI Economics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Data Residency Profile */}
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Data Residency &amp; Policy Pack (G02)
            </span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-white">{regionMeta.displayName}</div>
            <div className="text-xs text-cyan-400 font-mono mt-0.5">
              Isolation Profile: DEDICATED_DATA_NAMESPACE
            </div>
            <div className="text-xs text-slate-400 mt-2">
              Active Policy Pack:{" "}
              <span className="font-mono text-slate-300">
                {activePolicyPack.policy_key} (v{activePolicyPack.version})
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Active Entitlements */}
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Active Service Entitlements
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-white">Enterprise Sovereign Shield</div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
                Managed Detection
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-950/70 border border-sky-500/40 text-sky-300">
                Continuous Assurance
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/70 border border-amber-500/40 text-amber-300">
                Exposure Management
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/70 border border-purple-500/40 text-purple-300">
                Cryptographic Evidence
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950/70 border border-red-500/40 text-red-300">
                24x7 IR Retainer
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Storage & Query Economics */}
        <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Storage &amp; Query Economics (G08)
            </span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-white">1,345.9 GB Measured Actual</div>
            <div className="text-xs text-slate-400 mt-1">
              Hot Index: <span className="text-white font-mono">284.5 GB</span> • Cold WORM Archive:{" "}
              <span className="text-white font-mono">481.2 GB</span>
            </div>
            <div className="text-xs text-emerald-400 mt-2 font-medium">
              Within Committed Monthly Tier (67.3% utilized)
            </div>
          </div>
        </div>
      </div>

      {/* Contracted Data Class Retention Table */}
      <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white">
              Contracted Data Class Retention &amp; Legal Hold Schedule (G08)
            </h2>
            <p className="text-xs text-slate-400">
              Per-class retention limits resolved directly from canonical policy pack{" "}
              <span className="font-mono text-cyan-300">{activePolicyPack.policy_key}</span> (
              {activePolicyPack.authority_reference})
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">
            Immutable Audit Trail Enabled
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-3">Data Class</th>
                <th className="py-2.5 px-3">Hot Tier</th>
                <th className="py-2.5 px-3">Warm Tier</th>
                <th className="py-2.5 px-3">Cold Archive</th>
                <th className="py-2.5 px-3">Disposition</th>
                <th className="py-2.5 pl-3 text-right">Measured Footprint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {retentionSchedule.map((item) => (
                <tr key={item.dataClass} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 pr-3 font-medium text-white">{item.label}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">{item.hotDays}d</td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">{item.warmDays}d</td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">{item.coldArchiveDays}d</td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-cyan-300">
                    {item.deletionDisposition}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono text-white">
                    {item.currentFootprintGb.toFixed(1)} GB
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoicing & Billing History */}
      <div className="rounded-2xl bg-[#0a1628]/95 border border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Invoicing &amp; Cryptographic Settlement Receipts</h2>
            <p className="text-xs text-slate-400">
              Download Ed25519 tamper-proof invoice certificates for finance and compliance reconciliation.
            </p>
          </div>
          <Link
            href="/pricing"
            className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 font-semibold"
          >
            <span>Change payment method</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-3">Invoice ID</th>
                <th className="py-2.5 px-3">Billing Date</th>
                <th className="py-2.5 px-3">Plan / Description</th>
                <th className="py-2.5 px-3">Amount</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 pl-3 text-right">Receipt Certificate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {mockInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 pr-3 font-mono text-sky-400 font-semibold">{inv.id}</td>
                  <td className="py-2.5 px-3 text-slate-300">{inv.date}</td>
                  <td className="py-2.5 px-3 text-white font-medium">{inv.plan}</td>
                  <td className="py-2.5 px-3 font-mono text-white font-semibold">{inv.amount}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDownloadInvoice(inv.id)}
                      disabled={downloadingReceiptId === inv.id}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 border border-slate-700 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {downloadingReceiptId === inv.id ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3 text-slate-400" />
                          <span>Download Certificate</span>
                        </>
                      )}
                    </button>
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
