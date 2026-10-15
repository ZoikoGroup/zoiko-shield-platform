"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
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
    <div className="min-h-screen bg-[#060911] text-slate-100 p-6 space-y-6">
      {/* Top Header */}
      <div className="surface-card p-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-[#0c111e] via-[#080d1a] to-[#120e24] shadow-[0_0_35px_rgba(6,182,212,0.12)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <Badge variant="info" className="font-mono text-[10px] tracking-wider">
              INCIDENT RESPONSE RETAINER & SLA ACCOUNTING (RULE SVC-01)
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Retainer Hours & Response SLA Cockpit
          </h1>
          <p className="text-slate-400 text-xs max-w-3xl">
            Live contractual response window timers, consumption meters, and automated cryptographic service credit settlement on SLA breach.
          </p>
        </div>

        <Button
          variant="ghost"
          onClick={() => {
            setRefreshing(true);
            setTimeout(() => setRefreshing(false), 500);
          }}
          className="p-2.5 rounded-lg bg-[#060911] border border-[#162238] text-slate-300 hover:text-white transition-colors self-start sm:self-auto shadow-sm"
          title="Refresh Timers"
        >
          <RefreshCw className={`w-4 h-4 text-cyan-400 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between gap-3 shadow-md">
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
      <div className="surface-card p-4 rounded-xl border border-cyan-500/20 flex items-start gap-3 text-xs bg-[#0c111e]/80">
        <ShieldAlert className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-white">
            Contractual SLA Response Target Guarantee (Rule SVC-01 & ADR-07)
          </span>
          <p className="text-slate-400 leading-relaxed text-xs">
            P1 Critical incidents mandate <strong className="text-cyan-300">15-minute triage acknowledgement</strong> and <strong className="text-cyan-300">60-minute containment activation</strong>. Any breach triggers automated compensatory service credit calculation into the customer financial ledger with SHA-256 evidence anchoring.
          </p>
        </div>
      </div>

      {/* Retainer Capacity Meters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-cyan-500/40 transition-all space-y-1">
          <div className="text-slate-400 text-xs font-mono font-semibold uppercase">ANNUAL INCLUDED HOURS</div>
          <div className="text-2xl font-bold text-white font-mono">{includedHours}.0 hrs</div>
          <div className="text-[10px] text-slate-500 font-mono">Contractual tier allocation</div>
        </Card>
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-cyan-500/40 transition-all space-y-1">
          <div className="text-slate-400 text-xs font-mono font-semibold uppercase">CONSUMED TO DATE</div>
          <div className="text-2xl font-bold text-cyan-400 font-mono">{consumedHours} hrs</div>
          <div className="text-[10px] text-cyan-400/80 font-mono">29.0% of total tier allowance</div>
        </Card>
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-emerald-500/40 transition-all space-y-1">
          <div className="text-slate-400 text-xs font-mono font-semibold uppercase">AVAILABLE RETAINER BALANCE</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{remainingHours} hrs</div>
          <div className="text-[10px] text-emerald-400/80 font-mono">Active hours remaining</div>
        </Card>
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-amber-500/40 transition-all space-y-1">
          <div className="text-slate-400 text-xs font-mono font-semibold uppercase">OVERAGE PROTECTION CAP</div>
          <div className="text-2xl font-bold text-amber-400 font-mono">+{overageCapHours}.0 hrs</div>
          <div className="text-[10px] text-amber-400/80 font-mono">Anti-perverse billing guard active</div>
        </Card>
      </div>

      {/* Active Work Orders and SLA Clocks */}
      <Card className="surface-card p-6 border border-[#162238] rounded-xl space-y-4 shadow-lg">
        <div className="flex items-center justify-between border-b border-[#162238] pb-4">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold text-white">Active Incident Work Orders & Response Windows</h2>
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
                className="p-5 rounded-xl bg-[#060911] border border-[#162238] hover:border-cyan-500/30 transition-all space-y-4 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded border border-cyan-500/30">
                      {wo.id}
                    </span>
                    <Badge variant={wo.severity === "P1_CRITICAL" ? "fail" : "medium"} className="font-mono text-[10px]">
                      {wo.severity}
                    </Badge>
                    <span className="text-sm font-semibold text-white">{wo.title}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {wo.isTriageBreached && !wo.creditJournalEntryId && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSettleCredit(wo.id)}
                        disabled={settlingWoId === wo.id}
                        className="bg-amber-600 hover:bg-amber-500 text-white border border-amber-400/30 text-xs font-mono font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-amber-950/40"
                      >
                        <Coins className="w-3.5 h-3.5 text-amber-200" />
                        <span>{settlingWoId === wo.id ? "Settling..." : "Settle SLA Credit ($750)"}</span>
                      </Button>
                    )}
                    {wo.creditJournalEntryId && (
                      <Badge variant="pass" className="font-mono text-xs flex items-center gap-1 py-1 px-3">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Credit Settled (${wo.settledCreditAmount})</span>
                      </Badge>
                    )}
                  </div>
                </div>

                {/* SLA Milestone Countdown Clocks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Triage Milestone */}
                  <div className="p-3.5 rounded-lg bg-[#0c111e] border border-[#162238] space-y-2">
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

                    <div className="w-full bg-[#060911] rounded-full h-2 overflow-hidden border border-[#162238]">
                      <div
                        className={`h-full transition-all ${
                          wo.isTriageBreached ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" : "bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
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
                  <div className="p-3.5 rounded-lg bg-[#0c111e] border border-[#162238] space-y-2">
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

                    <div className="w-full bg-[#060911] rounded-full h-2 overflow-hidden border border-[#162238]">
                      <div
                        className={`h-full transition-all ${
                          wo.isResponseBreached ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" : "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
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
                  <div className="text-[11px] text-emerald-400/90 font-mono bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/20 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>Cryptographic Ledger Receipt: {wo.creditJournalEntryId} (Rule SVC-01 settled)</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
