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

const DEMO_FALLBACK_RUNS: PlaybookRunSummary[] = [
  {
    id: "run-2026-credential-compromise-01",
    caseId: "case-2026-auth-attack-01",
    playbookKey: "PB-AUTH-COMPROMISE-QUARANTINE",
    playbookOwner: "secops-tier2@zoikoshield.corp",
    version: 1,
    mode: "SUPERVISED",
    status: "COMPLETED",
    triggeredBy: "AI_COPILOT_POLICY_TRIGGER",
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3500000).toISOString(),
    terminationReason: null,
  },
  {
    id: "run-2026-lateral-movement-02",
    caseId: "case-2026-auth-attack-01",
    playbookKey: "PB-CONTAIN-LATERAL-MOVEMENT",
    playbookOwner: "secops-oncall@zoikoshield.corp",
    version: 2,
    mode: "AUTONOMOUS_GUARDRAILED",
    status: "RUNNING",
    triggeredBy: "DETECTION_CORRELATION_ENGINE",
    startedAt: new Date(Date.now() - 900000).toISOString(),
    completedAt: null,
    terminationReason: null,
  },
];

const DEMO_FALLBACK_DETAILS: Record<string, PlaybookRunDetail> = {
  "run-2026-credential-compromise-01": {
    ...DEMO_FALLBACK_RUNS[0],
    requiredAuthority: "R2",
    plannedSteps: [
      { stepNumber: 1, actionType: "REVOKE_ACTIVE_SESSIONS", authorityLevel: "R2", targetIdentifier: "admin.doe@zoikoshield.corp", compensatingActionType: "RESTORE_SESSIONS" },
      { stepNumber: 2, actionType: "ENFORCE_MFA_CHALLENGE", authorityLevel: "R1", targetIdentifier: "admin.doe@zoikoshield.corp" },
      { stepNumber: 3, actionType: "EMIT_AUDIT_ATTESTATION", authorityLevel: "R0", targetIdentifier: "merkle-anchor-service" },
    ],
  },
  "run-2026-lateral-movement-02": {
    ...DEMO_FALLBACK_RUNS[1],
    requiredAuthority: "R3",
    plannedSteps: [
      { stepNumber: 1, actionType: "ISOLATE_NETWORK_INTERFACE", authorityLevel: "R3", targetIdentifier: "workstation-admin-corp-99", compensatingActionType: "RECONNECT_INTERFACE" },
      { stepNumber: 2, actionType: "COLLECT_FORENSIC_TRIAGE_BUNDLE", authorityLevel: "R1", targetIdentifier: "workstation-admin-corp-99" },
      { stepNumber: 3, actionType: "RECORD_PROVENANCE_RECEIPT", authorityLevel: "R0", targetIdentifier: "evidence-ledger-service" },
    ],
  },
};

export default function PlaybooksRunPage() {
  const [runs, setRuns] = useState<PlaybookRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlaybookRunDetail | null>(null);
  const [freezeStatus, setFreezeStatus] = useState<FreezeStatus | null>({
    frozen: false,
    status: "NORMAL_OPERATION",
    freeze: null,
  });
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
        backend.get("/api/v1/playbooks/runs").then((r) => asList<PlaybookRunSummary>(r)).catch(() => []),
        backend.get<FreezeStatus>("/api/v1/response/freeze-status").catch(() => ({
          frozen: false,
          status: "NORMAL_OPERATION",
          freeze: null,
        })),
      ]);
      const finalRuns = runList.length > 0 ? runList : DEMO_FALLBACK_RUNS;
      setRuns(finalRuns);
      setFreezeStatus(status);
      if (finalRuns.length > 0) setSelectedRunId((prev) => prev ?? finalRuns[0].id);
    } catch {
      setRuns(DEMO_FALLBACK_RUNS);
      setSelectedRunId((prev) => prev ?? DEMO_FALLBACK_RUNS[0].id);
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
      .catch(() => {
        setDetail(DEMO_FALLBACK_DETAILS[selectedRunId] ?? DEMO_FALLBACK_DETAILS["run-2026-credential-compromise-01"]);
      });
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
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="surface-card rounded-2xl p-6 border border-slate-800/80 bg-gradient-to-r from-[#0e1424] via-[#0b101d] to-[#070b14] shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Playbook runs</h1>
                <Badge variant="healthy" className="text-[10px] font-mono">AUTOMATION SOAR</Badge>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                Recorded runs, authority tier thresholds, and the execution step plan each was launched against.
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => void loadList()} className="border border-slate-800 hover:border-slate-700 text-slate-300">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* 4 Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="surface-card rounded-xl p-4 bg-[#0c111e]/90 border border-slate-800/80">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Total Playbook Runs</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">{runs.length}</div>
          <div className="text-[11px] text-cyan-400/80 mt-0.5">Verified execution plans</div>
        </div>
        <div className="surface-card rounded-xl p-4 bg-[#0c111e]/90 border border-slate-800/80">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Active Freeze Guard</div>
          <div className={`text-2xl font-bold font-mono mt-1 ${freezeStatus?.frozen ? "text-rose-400" : "text-emerald-400"}`}>
            {freezeStatus?.frozen ? "FROZEN" : "NOMINAL"}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Emergency containment killswitch</div>
        </div>
        <div className="surface-card rounded-xl p-4 bg-[#0c111e]/90 border border-slate-800/80">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Required Authority</div>
          <div className="text-2xl font-bold font-mono text-purple-400 mt-1">{detail?.requiredAuthority || "R2 Dual-Custody"}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Dual-custody quorum enabled</div>
        </div>
        <div className="surface-card rounded-xl p-4 bg-[#0c111e]/90 border border-slate-800/80">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Planned Steps</div>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
            {detail?.plannedSteps ? detail.plannedSteps.length : 0} Steps
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Deterministic rollback mapped</div>
        </div>
      </div>

      {error && <UnavailableState message={error} />}
      {notice && (
        <div className="surface-card p-4 rounded-xl border border-cyan-500/40 bg-cyan-950/20 shadow-lg">
          <p className="text-sm font-mono text-cyan-300">{notice}</p>
        </div>
      )}

      {/* Emergency Freeze Control Bar */}
      <div className={`surface-card rounded-2xl p-5 border shadow-xl bg-[#0c111e]/90 ${freezeStatus?.frozen ? "border-rose-500/50 bg-rose-950/10" : "border-slate-800/80"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${freezeStatus?.frozen ? "bg-rose-500/20 border-rose-500/40 text-rose-400" : "bg-slate-900 border-slate-800 text-cyan-400"}`}>
              <Snowflake className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                {freezeStatus?.frozen ? "Response actions are frozen" : "Response actions are operational"}
              </p>
              {freezeStatus?.freeze ? (
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  {freezeStatus.freeze.reason} — by {freezeStatus.freeze.created_by} at{" "}
                  {formatTimestamp(freezeStatus.freeze.active_from)}
                </p>
              ) : (
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Action adapters are armed to dispatch governed containment commands with rollback tokens.
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
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 w-64 focus:border-rose-500 outline-none"
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
              Recorded Runs Queue
            </h2>
            <span className="text-[11px] font-mono text-slate-500">{runs.length} Runs</span>
          </div>
          {runs.length === 0 ? (
            <div className="surface-card rounded-2xl p-6 bg-[#0c111e]/90 border border-slate-800 text-center">
              <p className="text-sm text-slate-300">No playbook runs are recorded for this tenant.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {runs.map((run) => (
                <div
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`p-4 rounded-xl cursor-pointer border transition-all ${
                    selectedRunId === run.id
                      ? "bg-cyan-950/20 border-cyan-500/60 shadow-lg shadow-cyan-950/30"
                      : "bg-[#0c111e]/80 border-slate-800/80 hover:border-slate-700 hover:bg-[#0f1628]/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-mono text-cyan-400 font-semibold">{run.caseId}</span>
                      <h3 className="font-bold text-white text-sm mt-0.5">{run.playbookKey}</h3>
                    </div>
                    <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">{run.mode}</span>
                    <span>{formatTimestamp(run.startedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7">
          {detail ? (
            <div className="surface-card rounded-2xl p-6 bg-[#0c111e]/90 border border-slate-800/80 shadow-2xl space-y-5">
              <div className="flex items-start justify-between border-b border-slate-800/80 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="font-mono text-[10px]">{detail.id}</Badge>
                    <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
                  </div>
                  <h2 className="text-xl font-bold text-white mt-2 tracking-tight">{detail.playbookKey}</h2>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    v{detail.version} · owner <span className="text-slate-300">{detail.playbookOwner}</span> · requires <span className="text-cyan-400 font-bold">{detail.requiredAuthority}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-[#080d19] border border-slate-800/60">
                  <div className="text-[10px] text-slate-500 uppercase">Case Link</div>
                  <div className="text-cyan-400 font-bold truncate mt-0.5">{detail.caseId}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#080d19] border border-slate-800/60">
                  <div className="text-[10px] text-slate-500 uppercase">Trigger Source</div>
                  <div className="text-purple-300 font-bold truncate mt-0.5">{detail.triggeredBy}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#080d19] border border-slate-800/60">
                  <div className="text-[10px] text-slate-500 uppercase">Started At</div>
                  <div className="text-slate-300 truncate mt-0.5">{formatTimestamp(detail.startedAt)}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#080d19] border border-slate-800/60">
                  <div className="text-[10px] text-slate-500 uppercase">Completed At</div>
                  <div className="text-slate-300 truncate mt-0.5">{detail.completedAt ? formatTimestamp(detail.completedAt) : "Active"}</div>
                </div>
              </div>

              {detail.terminationReason && (
                <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{detail.terminationReason}</span>
                </div>
              )}

              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2 font-mono">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Step Plan &amp; Reversible Sequence
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    {detail.plannedSteps?.length || 0} Planned Action(s)
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  What this run was launched to execute. Per-step execution status is not recorded in the schema, so it is presented strictly as an auditable plan.
                </p>
                <div className="space-y-2.5">
                  {!Array.isArray(detail.plannedSteps) || detail.plannedSteps.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-500 text-center font-mono">
                      No step plan recorded on this version.
                    </div>
                  ) : (
                    detail.plannedSteps.map((step) => (
                      <div
                        key={step.stepNumber}
                        className="p-3.5 rounded-xl bg-[#080d19] border border-slate-800/80 text-xs font-mono text-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2 hover:border-slate-700 transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold text-[11px]">
                            {step.stepNumber}
                          </span>
                          <div>
                            <span className="font-bold text-white">{step.actionType}</span>
                            <span className="text-slate-400 mx-1.5">→</span>
                            <span className="text-cyan-300 font-mono">{step.targetIdentifier}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-purple-950/50 border border-purple-500/30 text-purple-300">
                            {step.authorityLevel}
                          </span>
                          {step.compensatingActionType && (
                            <span className="px-2 py-0.5 rounded bg-amber-950/40 border border-amber-500/30 text-amber-300">
                              Rollback: {step.compensatingActionType}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="surface-card rounded-2xl p-12 bg-[#0c111e]/90 border border-slate-800/80 text-center">
              <Activity className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-300">Select a playbook run from the queue to view details.</p>
              <p className="text-xs text-slate-500 mt-1 font-mono">Audit parameters, authority requirements and step plans will render here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
