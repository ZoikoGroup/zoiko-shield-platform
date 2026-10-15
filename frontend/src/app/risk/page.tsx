"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { ArrowRight, RefreshCw, ShieldAlert } from "lucide-react";
import { LoadingState, UnavailableState } from "@/components/states/mandatory-ui-states";

/**
 * W27 — Risk register and acceptance.
 *
 * shield-core has had the whole risk API for some time: list, create,
 * treatments and acceptance, with a per-risk factor breakdown and risk.*
 * events published on every change. Nothing displayed any of it, so a risk
 * could be raised and accepted with no surface on which anyone could see what
 * had been accepted, by whom, or on what reasoning.
 *
 * The contract's requirement is transparent factors: a risk score that cannot
 * be taken apart is a number to argue with rather than evidence to act on.
 */

type RiskFactor = {
  factor: string;
  value: string;
  contribution: number;
  sourceRef?: string;
  evaluatorVersion?: string;
};

type Risk = {
  id: string;
  title: string;
  description?: string | null;
  likelihood: string;
  impact: string;
  status?: string;
  owner_id?: string | null;
  created_at?: string;
  factors?: RiskFactor[];
};

function severityVariant(impact: string) {
  const normalized = (impact || "").toUpperCase();
  if (normalized === "CRITICAL" || normalized === "VERY_HIGH") return "critical" as const;
  if (normalized === "HIGH") return "high" as const;
  if (normalized === "MEDIUM") return "medium" as const;
  return "low" as const;
}

export default function RiskRegisterPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/risks", {
        headers: state.tenant?.id ? { "x-tenant-id": state.tenant.id } : {},
      });
      if (!response.ok) {
        let message = `Request to /api/v1/risks failed with ${response.status}`;
        try {
          const errBody = await response.json();
          if (errBody?.message) message = errBody.message;
        } catch {
          // body wasn't JSON; keep the status-based message
        }
        setError(message);
        return;
      }
      const body = await response.json();
      const list = Array.isArray(body) ? body : (body.data ?? []);
      setRisks(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [state.tenant?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) return <LoadingState message="Loading risk register…" />;

  if (error) {
    return (
      <div className="space-y-4 p-6">
        <UnavailableState message={error} />
        <Button variant="secondary" onClick={() => void load()}>
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  const criticalCount = risks.filter(r => ['CRITICAL', 'VERY_HIGH', 'HIGH'].includes((r.impact || '').toUpperCase())).length;
  const withFactorsCount = risks.filter(r => r.factors && r.factors.length > 0).length;
  const unassignedCount = risks.filter(r => !r.owner_id).length;

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#162238] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="info" className="font-mono text-[10px] tracking-wider border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              SPEC §W27 / RISK ASSURANCE
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-sm shadow-cyan-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <span className="bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
              Risk register
            </span>
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Every risk, its contributing factors, its owner and its treatment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => void load()} className="border border-[#162238] bg-[#0c111e] hover:bg-[#111a2e] text-slate-300">
            <RefreshCw className="w-4 h-4 text-cyan-400" />
            <span>Refresh</span>
          </Button>
          <Button variant="secondary" onClick={() => router.push("/exceptions")} className="border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300">
            <span>Exceptions</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-cyan-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Risks Logged</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{risks.length}</div>
          <span className="text-[10px] text-slate-500 mt-1 inline-block font-mono">Active register items</span>
        </Card>
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-rose-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">High & Critical Severity</span>
          <div className="text-2xl font-bold text-rose-400 mt-1 font-mono">{criticalCount}</div>
          <span className="text-[10px] text-rose-400/80 mt-1 inline-block font-mono">Requiring immediate mitigation</span>
        </Card>
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-emerald-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Factor Coverage</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
            {risks.length > 0 ? `${Math.round((withFactorsCount / risks.length) * 100)}%` : "100%"}
          </div>
          <span className="text-[10px] text-emerald-400/80 mt-1 inline-block font-mono">{withFactorsCount} / {risks.length} decomposed</span>
        </Card>
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-amber-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Unassigned Owners</span>
          <div className="text-2xl font-bold text-amber-300 mt-1 font-mono">{unassignedCount}</div>
          <span className="text-[10px] text-amber-400/80 mt-1 inline-block font-mono">Pending accountability</span>
        </Card>
      </div>

      {risks.length === 0 ? (
        <Card className="surface-card border border-[#162238] p-8 text-center rounded-xl">
          <p className="text-sm font-semibold text-slate-200">No risks are recorded for this tenant.</p>
          <p className="text-xs font-mono text-slate-500 mt-1.5 max-w-md mx-auto">
            This is an empty register, not a clean bill of health — nothing has assessed
            this tenant yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {risks.map((risk) => (
            <Card key={risk.id} className="surface-card p-5 border border-[#162238] rounded-xl hover:border-cyan-500/30 transition-all shadow-md">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-white tracking-wide">{risk.title}</h2>
                  {risk.description && (
                    <p className="text-xs text-slate-400 mt-1">{risk.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={severityVariant(risk.impact)} className="font-mono text-[10px] uppercase font-semibold">
                    {risk.likelihood} / {risk.impact}
                  </Badge>
                  {risk.status && (
                    <Badge variant="neutral" className="font-mono text-[10px] border-[#162238] text-slate-300">
                      {risk.status}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono text-slate-400 mb-4 bg-[#060911] p-3 rounded-lg border border-[#162238]">
                <span><span className="text-slate-500 uppercase text-[10px]">owner:</span> {risk.owner_id || "unassigned"}</span>
                <span>
                  <span className="text-slate-500 uppercase text-[10px]">raised:</span> {risk.created_at ? formatTimestamp(risk.created_at) : "unknown"}
                </span>
                <span className="break-all text-[11px] text-slate-400">
                  <span className="text-slate-500 uppercase text-[10px]">id:</span> {risk.id}
                </span>
              </div>

              {risk.factors && risk.factors.length > 0 ? (
                <div className="overflow-x-auto border border-[#162238] rounded-lg">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-[#060911] border-b border-[#162238]">
                      <tr className="text-slate-400 text-left text-[10px] uppercase">
                        <th className="py-2.5 px-3">Factor</th>
                        <th className="py-2.5 px-3">Value</th>
                        <th className="py-2.5 px-3">Contribution</th>
                        <th className="py-2.5 px-3">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#162238]">
                      {(risk.factors || []).map((factor) => (
                        <tr key={factor.factor} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 px-3 text-slate-200 font-medium">{factor.factor}</td>
                          <td className="py-2.5 px-3 text-cyan-400">{factor.value}</td>
                          <td className="py-2.5 px-3 text-emerald-400 font-semibold">{factor.contribution}</td>
                          <td className="py-2.5 px-3 text-slate-400 break-all text-[11px]">
                            {factor.sourceRef || "not stated"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <p className="text-xs font-mono text-amber-300">
                    No factor breakdown is recorded, so this rating cannot be taken apart.
                  </p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
