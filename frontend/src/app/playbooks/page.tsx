"use client";

import React, { useCallback, useEffect, useState } from "react";
import { backend, asList, BackendError } from "@/lib/backend";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  RotateCcw,
  Terminal,
  Activity,
  Clock,
  ShieldAlert,
  Snowflake,
} from "lucide-react";
import { LoadingState, UnavailableState } from "@/components/states/mandatory-ui-states";

/**
 * W18 — Playbook run view.
 *
 * PlaybookDefinition/PlaybookVersion/PlaybookRun have existed in the schema
 * for some time, but nothing ever wrote or read them: the actual playbook
 * executor (shield-action's ResponsePlaybookService) runs an in-memory shape
 * and never persists to these tables. This page previously showed a
 * hardcoded run with a "Provide 4-Eyes Approval" button whose "success"
 * mutated local state to claim a step had been cryptographically signed, and
 * an "Emergency Kill-Switch" whose "success" claimed compensating actions
 * had executed across every affected endpoint. Neither call reached the
 * backend at all.
 *
 * What this page can honestly show: the runs and their step *plan* that are
 * actually recorded (PlaybookRunService, read-only — the schema does not
 * carry per-step execution state, so it isn't shown as if it did), and the
 * one real, consequential control that exists for a running response: a
 * tenant-wide freeze (POST /api/v1/response/freeze), which
 * FreezeControllerService checks before any action adapter executes. That
 * replaces the fake kill-switch with the real one.
 */

type PlaybookRunSummary = {
  id: string;
  caseId: string;
  playbookKey: string;
  playbookOwner: string;
  version: number;
  mode: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  terminationReason: string | null;
};

type PlaybookStepPlan = {
  stepNumber: number;
  actionType: string;
  authorityLevel: string;
  targetIdentifier: string;
  compensatingActionType?: string;
};

type PlaybookRunDetail = PlaybookRunSummary & {
  requiredAuthority: string;
  plannedSteps: PlaybookStepPlan[];
};

type FreezeStatus = {
  frozen: boolean;
  status: string;
  freeze: { reason: string; created_by: string; active_from: string } | null;
};

function statusVariant(status: string) {
  switch ((status || "").toUpperCase()) {
    case "COMPLETED":
      return "pass" as const;
    case "RUNNING":
      return "active" as const;
    case "FAILED":
    case "ABORTED":
      return "fail" as const;
    default:
      return "neutral" as const;
  }
}

export default function PlaybooksRunPage() {
  const [runs, setRuns] = useState<PlaybookRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlaybookRunDetail | null>(null);
  const [freezeStatus, setFreezeStatus] = useState<FreezeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [isFreezing, setIsFreezing] = useState(false);
  const [showFreezeForm, setShowFreezeForm] = useState(false);

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [runList, status] = await Promise.all([
        asList<PlaybookRunSummary>(await backend.get("/api/v1/playbooks/runs")),
        backend.get<FreezeStatus>("/api/v1/response/freeze-status"),
      ]);
      setRuns(runList);
      setFreezeStatus(status);
      if (runList.length > 0) setSelectedRunId((prev) => prev ?? runList[0].id);
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedRunId) {
      setDetail(null);
      return;
    }
    backend
      .get<PlaybookRunDetail>(`/api/v1/playbooks/runs/${selectedRunId}`)
      .then(setDetail)
      .catch((err) =>
        setError(err instanceof BackendError ? err.message : String(err)),
      );
  }, [selectedRunId]);

  const triggerFreeze = async () => {
    if (!freezeReason.trim()) {
      setError("A reason is required to freeze response actions.");
      return;
    }
    setIsFreezing(true);
    setError(null);
    try {
      await backend.post("/api/v1/response/freeze", { reason: freezeReason.trim() });
      const status = await backend.get<FreezeStatus>("/api/v1/response/freeze-status");
      setFreezeStatus(status);
      setShowFreezeForm(false);
      setFreezeReason("");
      setNotice(
        "Response freeze is active. Action adapters will refuse every live and compensating command for this tenant until it is lifted.",
      );
      setTimeout(() => setNotice(null), 8000);
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setIsFreezing(false);
    }
  };

  const liftFreeze = async () => {
    setIsFreezing(true);
    setError(null);
    try {
      await backend.post("/api/v1/response/unfreeze");
      const status = await backend.get<FreezeStatus>("/api/v1/response/freeze-status");
      setFreezeStatus(status);
      setNotice("Response freeze lifted.");
      setTimeout(() => setNotice(null), 6000);
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setIsFreezing(false);
    }
  };

  if (isLoading) return <LoadingState message="Loading playbook runs…" />;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Playbook runs
          </h1>
          <p className="text-xs font-mono text-slate-500">
            Recorded runs and the step plan each was launched against.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void loadList()}>
          <Clock className="w-4 h-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {error && <UnavailableState message={error} />}
      {notice && (
        <Card variant="cyber" className="p-3 border-indigo-500/40">
          <p className="text-sm text-indigo-300">{notice}</p>
        </Card>
      )}

      <Card variant="cyber" className={`p-4 ${freezeStatus?.frozen ? "border-rose-500/50" : "border-slate-800"}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Snowflake className={`w-5 h-5 ${freezeStatus?.frozen ? "text-rose-400" : "text-slate-500"}`} />
            <div>
              <p className="text-sm text-slate-200">
                {freezeStatus?.frozen ? "Response actions are frozen" : "Response actions are operational"}
              </p>
              {freezeStatus?.freeze && (
                <p className="text-xs font-mono text-slate-500">
                  {freezeStatus.freeze.reason} — by {freezeStatus.freeze.created_by} at{" "}
                  {formatTimestamp(freezeStatus.freeze.active_from)}
                </p>
              )}
            </div>
          </div>
          {freezeStatus?.frozen ? (
            <Button variant="secondary" isLoading={isFreezing} onClick={() => void liftFreeze()}>
              <span>Lift freeze</span>
            </Button>
          ) : showFreezeForm ? (
            <div className="flex items-center gap-2">
              <input
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 w-64"
                placeholder="Reason (required)"
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
              />
              <Button variant="danger" isLoading={isFreezing} onClick={() => void triggerFreeze()}>
                <span>Confirm freeze</span>
              </Button>
              <Button variant="ghost" onClick={() => setShowFreezeForm(false)}>
                <span>Cancel</span>
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setShowFreezeForm(true)}>
              <RotateCcw className="w-4 h-4" />
              <span>Emergency freeze</span>
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Runs
          </h2>
          {runs.length === 0 ? (
            <Card variant="cyber" className="p-6">
              <p className="text-sm text-slate-300">No playbook runs are recorded for this tenant.</p>
            </Card>
          ) : (
            runs.map((run) => (
              <Card
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                className={`p-4 cursor-pointer border ${
                  selectedRunId === run.id
                    ? "bg-slate-900/90 border-indigo-500"
                    : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono text-indigo-400">{run.caseId}</span>
                    <h3 className="font-semibold text-slate-100 text-sm mt-0.5">{run.playbookKey}</h3>
                  </div>
                  <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>{run.mode}</span>
                  <span>{formatTimestamp(run.startedAt)}</span>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-8">
          {detail ? (
            <Card variant="cyber" className="p-6">
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <Badge variant="neutral">{detail.id}</Badge>
                  <h2 className="text-xl font-bold text-white mt-1">{detail.playbookKey}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    v{detail.version} · owner {detail.playbookOwner} · requires {detail.requiredAuthority}
                  </p>
                </div>
                <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs font-mono text-slate-400">
                <span>case: {detail.caseId}</span>
                <span>triggered by: {detail.triggeredBy}</span>
                <span>started: {formatTimestamp(detail.startedAt)}</span>
                <span>
                  completed: {detail.completedAt ? formatTimestamp(detail.completedAt) : "—"}
                </span>
              </div>
              {detail.terminationReason && (
                <p className="mt-2 text-xs text-rose-300">
                  <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />
                  {detail.terminationReason}
                </p>
              )}

              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Step plan
                </h3>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  What this run was launched to do. Per-step execution status is not recorded, so
                  it is not shown here as if it were.
                </p>
                <div className="space-y-2">
                  {detail.plannedSteps.length === 0 ? (
                    <p className="text-xs text-slate-500">No step plan recorded on this version.</p>
                  ) : (
                    detail.plannedSteps.map((step) => (
                      <div
                        key={step.stepNumber}
                        className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-mono text-slate-300"
                      >
                        <span className="text-indigo-400">#{step.stepNumber}</span>{" "}
                        {step.actionType} → {step.targetIdentifier}{" "}
                        <span className="text-slate-500">({step.authorityLevel})</span>
                        {step.compensatingActionType && (
                          <span className="text-slate-500"> · rollback: {step.compensatingActionType}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Card variant="cyber" className="p-6">
              <p className="text-sm text-slate-300">Select a run to see its detail.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
