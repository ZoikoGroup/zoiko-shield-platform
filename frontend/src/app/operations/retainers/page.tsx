"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  Clock,
  ShieldAlert,
  Coins,
  AlertOctagon,
  CheckCircle2,
  FileText,
  Activity,
  Zap,
  RefreshCw,
  Scale,
  DollarSign,
  ArrowUpRight,
} from "lucide-react";

interface MockRetainerWorkOrder {
  id: string;
  incidentRef: string;
  title: string;
  severity: "P1_CRITICAL" | "P2_HIGH" | "P3_MEDIUM";
  status: "ACTIVE" | "CONTAINED" | "RESOLVED";
  triageTargetMinutes: number;
  triageElapsedMinutes: number;
  responseTargetMinutes: number;
  responseElapsedMinutes: number;
  isTriageBreached: boolean;
  isResponseBreached: boolean;
  settledCreditAmount?: number;
  creditJournalEntryId?: string;
}

export default function RetainersAndSlaOperationsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Retainer summary metrics
  const [includedHours, setIncludedHours] = useState(50);
  const [consumedHours, setConsumedHours] = useState(14.5);
  const [overageCapHours, setOverageCapHours] = useState(25);
  const remainingHours = Math.max(includedHours - consumedHours, 0);

  // Work orders state
  const [workOrders, setWorkOrders] = useState<MockRetainerWorkOrder[]>([
    {
      id: "wo-2026-p1-001",
      incidentRef: "CASE-2026-882",
      title: "Swift Transaction Egress Anomaly",
      severity: "P1_CRITICAL",
      status: "ACTIVE",
      triageTargetMinutes: 15,
      triageElapsedMinutes: 9,
      responseTargetMinutes: 60,
      responseElapsedMinutes: 32,
      isTriageBreached: false,
      isResponseBreached: false,
    },
    {
      id: "wo-2026-p1-002",
      incidentRef: "CASE-2026-904",
      title: "SIM-Swap Telemetry Interception on Gateway",
      severity: "P1_CRITICAL",
      status: "ACTIVE",
      triageTargetMinutes: 15,
      triageElapsedMinutes: 18, // Breached
      responseTargetMinutes: 60,
      responseElapsedMinutes: 40,
      isTriageBreached: true,
      isResponseBreached: false,
    },
    {
      id: "wo-2026-p2-003",
      incidentRef: "CASE-2026-771",
      title: "Unauthorized EDR Host Configuration Modification",
      severity: "P2_HIGH",
      status: "CONTAINED",
      triageTargetMinutes: 30,
      triageElapsedMinutes: 12,
      responseTargetMinutes: 120,
      responseElapsedMinutes: 45,
      isTriageBreached: false,
      isResponseBreached: false,
    },
  ]);

  const [settlingWoId, setSettlingWoId] = useState<string | null>(null);

  const handleSettleCredit = async (woId: string) => {
    setSettlingWoId(woId);
    try {
      const res = await ZoikoShieldApiClient.settleSlaBreachCredit(
        woId,
        750,
        "Rule SVC-01 compensatory SLA credit for P1 triage response window breach"
      );

      setWorkOrders((prev) =>
        prev.map((wo) =>
          wo.id === woId
            ? {
                ...wo,
                settledCreditAmount: res.creditedAmount,
                creditJournalEntryId: res.creditJournalEntryId,
              }
            : wo
        )
      );

      setActionSuccess(
        `Automated SLA credit of $${res.creditedAmount} journaled to ledger entry ${res.creditJournalEntryId} (Evidence: ${res.evidenceReference}).`
      );
    } catch (err: any) {
      console.error(err);
    } finally {
      setSettlingWoId(null);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
            <Scale className="w-3.5 h-3.5" />
            <span>INCIDENT RESPONSE RETAINER & SLA ACCOUNTING (RULE SVC-01)</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
            Retainer Hours & Response SLA Cockpit
          </h1>
          <p className="text-slate-400 text-sm max-w-3xl">
            Live contractual response window timers, consumption meters, and automated cryptographic service credit settlement on SLA breach.
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshing(true);
            setTimeout(() => setRefreshing(false), 500);
          }}
          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors self-start sm:self-auto"
          title="Refresh Timers"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-slate-400 hover:text-slate-200 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Rule SVC-01 Callout */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3 text-xs">
        <ShieldAlert className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-slate-200">
            Contractual SLA Response Target Guarantee (Rule SVC-01 & ADR-07)
          </span>
          <p className="text-slate-400 leading-relaxed">
            P1 Critical incidents mandate <strong>15-minute triage acknowledgement</strong> and <strong>60-minute containment activation</strong>. Any breach triggers automated compensatory service credit calculation into the customer financial ledger with SHA-256 evidence anchoring.
          </p>
        </div>
      </div>

      {/* Retainer Capacity Meters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-slate-400 text-xs font-mono">ANNUAL INCLUDED HOURS</div>
          <div className="text-2xl font-bold text-slate-100">{includedHours}.0 hrs</div>
          <div className="text-[11px] text-slate-500">Contractual tier allocation</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-slate-400 text-xs font-mono">CONSUMED TO DATE</div>
          <div className="text-2xl font-bold text-cyan-400">{consumedHours} hrs</div>
          <div className="text-[11px] text-slate-500">29.0% of total tier allowance</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-slate-400 text-xs font-mono">AVAILABLE RETAINER BALANCE</div>
          <div className="text-2xl font-bold text-emerald-400">{remainingHours} hrs</div>
          <div className="text-[11px] text-slate-500">Active hours remaining</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-slate-400 text-xs font-mono">OVERAGE PROTECTION CAP</div>
          <div className="text-2xl font-bold text-amber-400">+{overageCapHours}.0 hrs</div>
          <div className="text-[11px] text-slate-500">Anti-perverse billing guard active</div>
        </div>
      </div>

      {/* Active Work Orders and SLA Clocks */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold text-slate-100">Active Incident Work Orders & Response Windows</h2>
            <p className="text-xs text-slate-400">Real-time countdown clocks against contractual triage and activation milestones</p>
          </div>
        </div>

        <div className="space-y-4">
          {workOrders.map((wo) => {
            const triageRemaining = wo.triageTargetMinutes - wo.triageElapsedMinutes;
            const responseRemaining = wo.responseTargetMinutes - wo.responseElapsedMinutes;

            return (
              <div
                key={wo.id}
                className="p-5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-cyan-400">{wo.id}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold">
                      {wo.severity}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">{wo.title}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {wo.isTriageBreached && !wo.creditJournalEntryId && (
                      <button
                        onClick={() => handleSettleCredit(wo.id)}
                        disabled={settlingWoId === wo.id}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-mono font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <Coins className="w-3.5 h-3.5 text-amber-400" />
                        <span>{settlingWoId === wo.id ? "Settling..." : "Settle SLA Credit ($750)"}</span>
                      </button>
                    )}
                    {wo.creditJournalEntryId && (
                      <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Credit Settled (${wo.settledCreditAmount})</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* SLA Milestone Countdown Clocks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Triage Milestone */}
                  <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Triage Acknowledgement Target (15m)</span>
                      </span>
                      {wo.isTriageBreached ? (
                        <span className="text-rose-400 font-bold flex items-center gap-1">
                          <AlertOctagon className="w-3 h-3" /> BREACHED (+{wo.triageElapsedMinutes - wo.triageTargetMinutes}m)
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-bold">{triageRemaining}m Remaining</span>
                      )}
                    </div>

                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          wo.isTriageBreached ? "bg-rose-500" : "bg-cyan-500"
                        }`}
                        style={{
                          width: `${Math.min((wo.triageElapsedMinutes / wo.triageTargetMinutes) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                      <span>Elapsed: {wo.triageElapsedMinutes}m</span>
                      <span>Target: {wo.triageTargetMinutes}m</span>
                    </div>
                  </div>

                  {/* Activation Milestone */}
                  <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Activation & Containment Target (60m)</span>
                      </span>
                      {wo.isResponseBreached ? (
                        <span className="text-rose-400 font-bold">BREACHED</span>
                      ) : (
                        <span className="text-emerald-400 font-bold">{responseRemaining}m Remaining</span>
                      )}
                    </div>

                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          wo.isResponseBreached ? "bg-rose-500" : "bg-indigo-500"
                        }`}
                        style={{
                          width: `${Math.min((wo.responseElapsedMinutes / wo.responseTargetMinutes) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                      <span>Elapsed: {wo.responseElapsedMinutes}m</span>
                      <span>Target: {wo.responseTargetMinutes}m</span>
                    </div>
                  </div>
                </div>

                {wo.creditJournalEntryId && (
                  <div className="text-[11px] text-emerald-400/90 font-mono bg-emerald-950/20 p-2 rounded border border-emerald-500/20 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>Cryptographic Ledger Receipt: {wo.creditJournalEntryId} (Rule SVC-01 settled)</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
