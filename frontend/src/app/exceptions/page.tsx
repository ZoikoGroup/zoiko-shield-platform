"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { ArrowLeft, CheckCircle2, Clock, Plus, RefreshCw, XCircle } from "lucide-react";
import { LoadingState, UnavailableState } from "@/components/states/mandatory-ui-states";

/**
 * W28 — Exception workflow.
 *
 * The backend could request, approve and revoke an exception, and consumed
 * exception.expired.v1 to expire them. It could not list them: GET /exceptions
 * returned the tenant id it had just been handed. So an exception could be
 * granted against a control and then never be seen again — nobody could answer
 * which controls were currently excepted, on what compensating controls, or
 * when the exception lapses. An exception nobody can enumerate is an
 * unmonitored hole in the control posture.
 *
 * Expiry is shown against the clock rather than left as a date to interpret,
 * because an exception that quietly outlives its approval is the failure this
 * contract exists to prevent.
 */

type ExceptionRecord = {
  id: string;
  reason: string;
  status: string;
  requested_by: string;
  approved_by?: string | null;
  starts_at: string;
  expires_at: string;
  compensating_controls: string;
  control_objective_id?: string | null;
  control_implementation_id?: string | null;
  requirement_id?: string | null;
  risk_id?: string | null;
  created_at: string;
};

function statusVariant(status: string) {
  switch ((status || "").toUpperCase()) {
    case "APPROVED":
      return "pass" as const;
    case "REJECTED":
    case "REVOKED":
      return "fail" as const;
    case "EXPIRED":
      return "medium" as const;
    default:
      return "pending" as const;
  }
}

function parseControls(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Days remaining, or how long it has already been expired. */
function expiryLabel(expiresAt: string): { text: string; overdue: boolean } {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  const days = Math.round(Math.abs(remainingMs) / 86_400_000);
  if (remainingMs < 0) {
    return { text: `expired ${days} day${days === 1 ? "" : "s"} ago`, overdue: true };
  }
  return { text: `expires in ${days} day${days === 1 ? "" : "s"}`, overdue: false };
}

export default function ExceptionsPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [records, setRecords] = useState<ExceptionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const tenantHeaders = useCallback(
    (): Record<string, string> =>
      state.tenant?.id ? { "x-tenant-id": state.tenant.id } : {},
    [state.tenant?.id],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/exceptions", { headers: tenantHeaders() });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || `Request failed with ${response.status}`);
      }
      const body = await response.json();
      setRecords(Array.isArray(body) ? body : (body.data ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tenantHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "approve" | "revoke") => {
    setActioning(id);
    setError(null);
    try {
      const response = await fetch(`/api/v1/exceptions/${id}/${action}`, {
        method: "POST",
        headers: { ...tenantHeaders(), "content-type": "application/json" },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || `Request failed with ${response.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActioning(null);
    }
  };

  if (isLoading) return <LoadingState message="Loading exceptions…" />;

  const activeCount = records.filter(r => (r.status || '').toUpperCase() === 'APPROVED').length;
  const requestedCount = records.filter(r => (r.status || '').toUpperCase() === 'REQUESTED').length;
  const overdueCount = records.filter(r => expiryLabel(r.expires_at).overdue).length;
  const missingCompensating = records.filter(r => parseControls(r.compensating_controls).length === 0).length;

  return (
    <div className="min-h-screen bg-canvas text-slate-100 p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-line pb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push("/risk")} className="border border-line bg-raised hover:bg-overlay text-slate-300">
            <ArrowLeft className="w-4 h-4 text-cyan-400" />
            <span>Risk register</span>
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="info" className="font-mono text-[10px] tracking-wider border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                SPEC §W28 / GOVERNANCE CONTROLS
              </Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Exception workflow</h1>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Controls currently excepted, their compensating controls and expiry.
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => void load()} className="border border-line bg-raised hover:bg-overlay text-slate-300">
          <RefreshCw className="w-4 h-4 text-cyan-400" />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
          {error}
        </div>
      )}

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="surface-card p-4 border border-line rounded-xl hover:border-emerald-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Active Approved</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{activeCount}</div>
          <span className="text-[10px] text-emerald-400/80 mt-1 inline-block font-mono">Operative exceptions</span>
        </Card>
        <Card className="surface-card p-4 border border-line rounded-xl hover:border-amber-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Pending Approval</span>
          <div className="text-2xl font-bold text-amber-300 mt-1 font-mono">{requestedCount}</div>
          <span className="text-[10px] text-amber-400/80 mt-1 inline-block font-mono">Awaiting risk review</span>
        </Card>
        <Card className="surface-card p-4 border border-line rounded-xl hover:border-rose-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Expired / Overdue</span>
          <div className="text-2xl font-bold text-rose-400 mt-1 font-mono">{overdueCount}</div>
          <span className="text-[10px] text-rose-400/80 mt-1 inline-block font-mono">Lapsed approvals</span>
        </Card>
        <Card className="surface-card p-4 border border-line rounded-xl hover:border-cyan-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Missing Compensating</span>
          <div className="text-2xl font-bold text-slate-200 mt-1 font-mono">{missingCompensating}</div>
          <span className="text-[10px] text-slate-500 mt-1 inline-block font-mono">Require mitigation review</span>
        </Card>
      </div>

      {records.length === 0 ? (
        <Card className="surface-card border border-line p-8 text-center rounded-xl">
          <p className="text-sm font-semibold text-slate-200">No exceptions are recorded for this tenant.</p>
          <p className="text-xs font-mono text-slate-500 mt-1.5 max-w-md mx-auto">
            Nothing is currently excepted from a control.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {records.map((record) => {
            const controls = parseControls(record.compensating_controls);
            const expiry = expiryLabel(record.expires_at);
            const scope =
              record.control_objective_id ||
              record.control_implementation_id ||
              record.requirement_id ||
              record.risk_id ||
              "no scope recorded";
            return (
              <Card key={record.id} className="surface-card p-5 border border-line rounded-xl hover:border-cyan-500/30 transition-all shadow-md">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white tracking-wide">{record.reason}</h2>
                    <p className="text-xs font-mono text-cyan-400/80 mt-0.5 break-all">
                      applies to {scope}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusVariant(record.status)} className="font-mono text-[10px] uppercase font-semibold">
                      {record.status}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono mb-4 bg-canvas p-3 rounded-lg border border-line">
                  <span className="text-slate-400"><span className="text-slate-500 uppercase text-[10px]">requested by:</span> {record.requested_by}</span>
                  <span className="text-slate-400">
                    <span className="text-slate-500 uppercase text-[10px]">approved by:</span> {record.approved_by || "nobody yet"}
                  </span>
                  <span
                    className={`flex items-center gap-1.5 ${
                      expiry.overdue ? "text-rose-400 font-semibold" : "text-emerald-400"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    {expiry.text}
                  </span>
                </div>

                <div className="text-xs font-mono mb-4">
                  <p className="text-slate-400 uppercase text-[10px] font-semibold mb-1.5">Compensating controls</p>
                  {controls.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {controls.map((control) => (
                        <span key={control} className="px-2.5 py-1 rounded bg-canvas border border-line text-slate-300 text-xs">
                          {control}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded bg-amber-500/5 border border-amber-500/20 text-amber-300">
                      None recorded — nothing is standing in for the excepted control.
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t border-line">
                  {record.status === "REQUESTED" && (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={actioning === record.id}
                      onClick={() => void act(record.id, "approve")}
                      className="border border-emerald-500/30 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve</span>
                    </Button>
                  )}
                  {(record.status === "REQUESTED" || record.status === "APPROVED") && (
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={actioning === record.id}
                      onClick={() => void act(record.id, "revoke")}
                      className="border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold text-xs"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Revoke</span>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
