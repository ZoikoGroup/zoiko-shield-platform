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
      setRecords(asList<EvidenceRecord>(await backend.get("/api/v1/evidence")));
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
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
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FileWarning className="w-5 h-5 text-amber-400" />
            Evidence operations
          </h1>
          <p className="text-xs font-mono text-slate-500">
            Records whose integrity or completeness is not established.
          </p>
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

      <Card variant="cyber" className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div>
            <p className="text-slate-500">total records</p>
            <p className="text-slate-200 text-base">{records.length}</p>
          </div>
          <div>
            <p className="text-slate-500">fully verified and complete</p>
            <p className="text-slate-200 text-base">{verified}</p>
          </div>
          <div>
            <p className="text-slate-500">needing attention</p>
            <p
              className={`text-base ${needsAttention.length > 0 ? "text-amber-300" : "text-slate-200"}`}
            >
              {needsAttention.length}
            </p>
          </div>
        </div>
      </Card>

      {records.length === 0 ? (
        <Card variant="cyber" className="p-6">
          <p className="text-sm text-slate-300">No evidence records exist for this tenant.</p>
          <p className="text-xs font-mono text-slate-500 mt-1">
            An empty ledger is not a clean one — nothing has been collected yet.
          </p>
        </Card>
      ) : needsAttention.length === 0 ? (
        <Card variant="cyber" className="p-6">
          <p className="text-sm text-slate-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Every record is verified and complete.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {needsAttention.map((record) => (
            <Card key={record.id} variant="cyber" className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">{record.evidence_type}</p>
                  <div className="flex flex-wrap gap-3 text-xs font-mono text-slate-500 mt-1">
                    <span>from {record.source_system_id}</span>
                    <span>collected {formatTimestamp(record.created_at)}</span>
                    <span className="break-all">
                      {record.content_hash?.slice(0, 16)}…
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={integrityVariant(record.integrity_state)}>
                    {record.integrity_state}
                  </Badge>
                  <Badge variant={completenessVariant(record.completeness_state)}>
                    {record.completeness_state}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={verifying === record.id}
                    onClick={() => void verify(record.id)}
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
