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

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push("/risk")}>
            <ArrowLeft className="w-4 h-4" />
            <span>Risk register</span>
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Exception workflow</h1>
            <p className="text-xs font-mono text-slate-500">
              Controls currently excepted, their compensating controls and expiry.
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => void load()}>
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-mono">
          {error}
        </div>
      )}

      {records.length === 0 ? (
        <Card variant="cyber" className="p-6">
          <p className="text-sm text-slate-300">No exceptions are recorded for this tenant.</p>
          <p className="text-xs font-mono text-slate-500 mt-1">
            Nothing is currently excepted from a control.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
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
              <Card key={record.id} variant="cyber" className="p-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">{record.reason}</h2>
                    <p className="text-xs font-mono text-slate-500 mt-0.5 break-all">
                      applies to {scope}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusVariant(record.status)}>{record.status}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono mb-3">
                  <span className="text-slate-400">requested by {record.requested_by}</span>
                  <span className="text-slate-400">
                    approved by {record.approved_by || "nobody yet"}
                  </span>
                  <span
                    className={`flex items-center gap-1 ${
                      expiry.overdue ? "text-rose-300" : "text-slate-400"
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {expiry.text}
                  </span>
                </div>

                <div className="text-xs font-mono mb-3">
                  <p className="text-slate-500 mb-1">Compensating controls</p>
                  {controls.length > 0 ? (
                    <ul className="list-disc list-inside text-slate-300">
                      {controls.map((control) => (
                        <li key={control}>{control}</li>
                      ))}
                    </ul>
                  ) : (
                    // The spec requires compensating controls. An exception
                    // granted without them is a gap with nothing standing in
                    // for the control it replaced, and should read as one.
                    <p className="text-amber-300">
                      None recorded — nothing is standing in for the excepted control.
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {record.status === "REQUESTED" && (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={actioning === record.id}
                      onClick={() => void act(record.id, "approve")}
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
