"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { backend, asList, BackendError } from "@/lib/backend";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { FileWarning, RefreshCw, ShieldCheck } from "lucide-react";
import { LoadingState } from "@/components/states/mandatory-ui-states";

/**
 * W24 — Evidence operations queue.
 *
 * The ledger view shows evidence that exists. This shows evidence that is in
 * trouble: records whose integrity has not been established, whose
 * completeness is unknown or partial, or whose verification failed. Those were
 * previously invisible — an evidence record could sit PENDING forever and
 * nothing would surface it, while the audit package that cites it reports
 * clean.
 *
 * Ordered worst-first rather than newest-first, because this is a work queue
 * and the oldest unverified record is usually the most important one.
 */

type EvidenceRecord = {
  id: string;
  evidence_type: string;
  source_system_id: string;
  content_hash: string;
  integrity_state: string;
  completeness_state: string;
  created_at: string;
};

const INTEGRITY_RANK: Record<string, number> = {
  FAILED: 0,
  SIGNATURE_FAILED: 0,
  HASH_MISMATCH: 0,
  CHAIN_DIVERGED: 0,
  PENDING: 1,
  UNSIGNED: 2,
  VERIFIED: 3,
};

function integrityVariant(state: string) {
  switch ((state || "").toUpperCase()) {
    case "VERIFIED":
      return "pass" as const;
    case "PENDING":
      return "pending" as const;
    case "UNSIGNED":
      return "medium" as const;
    default:
      return "fail" as const;
  }
}

function completenessVariant(state: string) {
  switch ((state || "UNKNOWN").toUpperCase()) {
    case "COMPLETE":
      return "pass" as const;
    case "PARTIAL":
      return "medium" as const;
    case "MISSING":
      return "fail" as const;
    default:
      return "pending" as const;
  }
}

export default function EvidenceOperationsPage() {
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = asList<EvidenceRecord>(await backend.get("/api/v1/evidence"));
      setRecords(data);
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async (id: string) => {
    setVerifying(id);
    setError(null);
    try {
      await backend.post(`/api/v1/evidence/${id}/verify`);
      await load();
    } catch (err) {
      // A verification call that failed must never be shown as VERIFIED —
      // that would claim a cryptographic check happened when it didn't.
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setVerifying(null);
    }
  };

  const needsAttention = useMemo(
    () =>
      records
        .filter(
          (r) =>
            (r.integrity_state || "").toUpperCase() !== "VERIFIED" ||
            (r.completeness_state || "UNKNOWN").toUpperCase() !== "COMPLETE",
        )
        .sort((a, b) => {
          const rank =
            (INTEGRITY_RANK[(a.integrity_state || "").toUpperCase()] ?? 4) -
            (INTEGRITY_RANK[(b.integrity_state || "").toUpperCase()] ?? 4);
          if (rank !== 0) return rank;
          // Oldest first within a band: a record that has been unverified for
          // a month is a worse problem than one from this morning.
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }),
    [records],
  );

  if (isLoading) return <LoadingState message="Loading evidence operations queue…" />;

  const verified = records.length - needsAttention.length;

  return (
    <div className="min-h-screen bg-canvas text-slate-100 p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="info" className="font-mono text-[10px] tracking-wider border-amber-500/30 bg-amber-500/10 text-amber-400">
              SPEC §W24 / ASSURANCE QUEUE
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-sm shadow-amber-500/20">
              <FileWarning className="w-6 h-6" />
            </div>
            <span className="bg-gradient-to-r from-white via-slate-100 to-amber-300 bg-clip-text text-transparent">
              Evidence operations
            </span>
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Records whose integrity or completeness is not established. Worst-first prioritized verification.
          </p>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="surface-card p-4 border border-line rounded-xl hover:border-cyan-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Total Records</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{records.length}</div>
          <span className="text-[10px] text-slate-500 mt-1 inline-block font-mono">Ingested evidence items</span>
        </Card>
        <Card className="surface-card p-4 border border-line rounded-xl hover:border-emerald-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Fully Verified & Complete</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{verified}</div>
          <span className="text-[10px] text-emerald-400/80 mt-1 inline-block font-mono">Passed cryptographic assurance</span>
        </Card>
        <Card className="surface-card p-4 border border-line rounded-xl hover:border-amber-500/40 transition-all">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">Needing Attention</span>
          <div className={`text-2xl font-bold mt-1 font-mono ${needsAttention.length > 0 ? "text-amber-400" : "text-slate-400"}`}>
            {needsAttention.length}
          </div>
          <span className="text-[10px] text-amber-400/80 mt-1 inline-block font-mono">Pending, degraded or unverified</span>
        </Card>
      </div>

      {records.length === 0 ? (
        <Card className="surface-card border border-line p-8 text-center rounded-xl">
          <p className="text-sm font-semibold text-slate-200">No evidence records exist for this tenant.</p>
          <p className="text-xs font-mono text-slate-500 mt-1.5 max-w-md mx-auto">
            An empty ledger is not a clean one — nothing has been collected yet.
          </p>
        </Card>
      ) : needsAttention.length === 0 ? (
        <Card className="surface-card border border-line p-8 text-center rounded-xl">
          <div className="flex flex-col items-center justify-center">
            <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-3 shadow-lg shadow-emerald-500/10">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-white">Every record is verified and complete.</p>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Zero unverified items in the work queue.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {needsAttention.map((record) => (
            <Card key={record.id} className="surface-card p-4 border border-line rounded-xl hover:border-amber-500/30 transition-all">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white tracking-wide">{record.evidence_type}</p>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-canvas border border-line text-slate-400">
                      ID: {record.id.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400 mt-1.5">
                    <span>from <span className="text-cyan-400">{record.source_system_id}</span></span>
                    <span>•</span>
                    <span>collected {formatTimestamp(record.created_at)}</span>
                    <span>•</span>
                    <span className="break-all text-[11px] text-slate-400">
                      SHA: <span className="text-emerald-400">{record.content_hash?.slice(0, 16)}…</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={integrityVariant(record.integrity_state)} className="font-mono text-[10px]">
                    {record.integrity_state}
                  </Badge>
                  <Badge variant={completenessVariant(record.completeness_state)} className="font-mono text-[10px]">
                    {record.completeness_state}
                  </Badge>
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={verifying === record.id}
                    onClick={() => void verify(record.id)}
                    className="border border-cyan-500/30 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-sm"
                  >
                    <span>Verify</span>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
