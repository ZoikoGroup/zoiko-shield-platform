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
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || `Request failed with ${response.status}`);
      }
      const body = await response.json();
      setRisks(Array.isArray(body) ? body : (body.data ?? []));
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

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-cyan-400" />
            Risk register
          </h1>
          <p className="text-xs font-mono text-slate-500">
            Every risk, its contributing factors, its owner and its treatment.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void load()}>
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </Button>
          <Button variant="secondary" onClick={() => router.push("/exceptions")}>
            <span>Exceptions</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {risks.length === 0 ? (
        <Card variant="cyber" className="p-6">
          <p className="text-sm text-slate-300">No risks are recorded for this tenant.</p>
          <p className="text-xs font-mono text-slate-500 mt-1">
            This is an empty register, not a clean bill of health — nothing has assessed
            this tenant yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {risks.map((risk) => (
            <Card key={risk.id} variant="cyber" className="p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">{risk.title}</h2>
                  {risk.description && (
                    <p className="text-xs text-slate-400 mt-0.5">{risk.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={severityVariant(risk.impact)}>
                    {risk.likelihood} / {risk.impact}
                  </Badge>
                  {risk.status && <Badge variant="neutral">{risk.status}</Badge>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono text-slate-400 mb-3">
                <span>owner: {risk.owner_id || "unassigned"}</span>
                <span>
                  raised: {risk.created_at ? formatTimestamp(risk.created_at) : "unknown"}
                </span>
                <span className="break-all">id: {risk.id}</span>
              </div>

              {risk.factors && risk.factors.length > 0 ? (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-slate-500 text-left border-b border-slate-800">
                      <th className="py-1">Factor</th>
                      <th className="py-1">Value</th>
                      <th className="py-1">Contribution</th>
                      <th className="py-1">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risk.factors.map((factor) => (
                      <tr key={factor.factor} className="border-b border-slate-900">
                        <td className="py-1 text-slate-300">{factor.factor}</td>
                        <td className="py-1 text-slate-300">{factor.value}</td>
                        <td className="py-1 text-slate-200">{factor.contribution}</td>
                        <td className="py-1 text-slate-500 break-all">
                          {factor.sourceRef || "not stated"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs font-mono text-amber-300">
                  No factor breakdown is recorded, so this rating cannot be taken apart.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
