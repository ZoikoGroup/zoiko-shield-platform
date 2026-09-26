"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { useDemoState } from "@/lib/demo-state";
import { useContractSources, sourceList } from "@/lib/contract-state";
import { ContractSurface, UnbackedField } from "@/components/contracts/ContractSurface";

/**
 * W32 — Board / audit report generation.
 *
 * Versioned snapshot, scope and period, limitations auto-populated, approval,
 * immutable manifest.
 *
 * The distinction this surface has to hold onto is between a report and a
 * reading. ReportSnapshot freezes a payload and hashes it, so a board paper
 * can be re-rendered later and shown to be the same document — that is a
 * report. The live summaries on the executive page cannot do that, because
 * re-running them tomorrow gives different numbers with no record that they
 * changed.
 *
 * Limitations are not written here. build() derives them from the assurance
 * summary — unknown control effectiveness, expired risk acceptances — and
 * freezes them into the snapshot. A limitation an author can forget to type
 * is not a control, so this surface only displays what the generator found.
 */

type ReportDefinition = {
  id: string;
  key: string;
  name: string;
  report_type: string;
  version: string;
  purpose: string;
  audience: string;
  source_requirements?: string;
  status: string;
};

type ReportSnapshot = {
  id: string;
  report_definition_id: string;
  report_definition_version: string;
  period_start: string;
  period_end: string;
  generated_by: string;
  freshness_state: string;
  completeness_state: string;
  limitations?: string;
  payload?: string;
  snapshot_hash: string;
  status: string;
  generated_at: string;
  source_snapshot_refs?: string;
};

function parseJsonArray(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => (typeof v === "string" ? v : JSON.stringify(v))) : [];
  } catch {
    return [];
  }
}

function statusVariant(status: string) {
  if (status === "READY") return "healthy" as const;
  if (status === "PARTIAL") return "medium" as const;
  if (status === "FAILED") return "critical" as const;
  if (status === "SUPERSEDED") return "neutral" as const;
  return "pending" as const;
}

function Section({
  title,
  requirement,
  children,
}: {
  title: string;
  requirement: string;
  children: React.ReactNode;
}) {
  return (
    <Card variant="cyber" className="p-4">
      <div className="mb-3 border-b border-slate-800 pb-2">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        <p className="text-[11px] font-mono text-slate-500">{requirement}</p>
      </div>
      {children}
    </Card>
  );
}

/** Default period: the calendar month that has most recently completed. */
function defaultPeriod() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function BoardReportGenerationPage() {
  const [state] = useDemoState();
  const period = useMemo(defaultPeriod, []);
  const [definitionId, setDefinitionId] = useState("");
  const [periodStart, setPeriodStart] = useState(period.start);
  const [periodEnd, setPeriodEnd] = useState(period.end);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastGeneratedId, setLastGeneratedId] = useState<string | null>(null);

  const specs = useMemo(
    () => [
      {
        key: "definitions",
        label: "Report definitions",
        path: "/api/v1/reporting/definitions",
      },
      { key: "snapshots", label: "Snapshot history", path: "/api/v1/reporting/snapshots" },
    ],
    [],
  );
  const evidence = useContractSources(specs);

  const definitions = sourceList<ReportDefinition>(evidence, "definitions");
  const snapshots = sourceList<ReportSnapshot>(evidence, "snapshots");

  const selectedDefinition = definitions.find((d) => d.id === definitionId) ?? definitions[0];

  const generate = async () => {
    if (!selectedDefinition) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const response = await fetch("/api/v1/reporting/snapshots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(state.tenant?.id ? { "x-tenant-id": state.tenant.id } : {}),
        },
        body: JSON.stringify({
          reportDefinitionId: selectedDefinition.id,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as { message?: string })?.message ||
            `Generation failed with ${response.status}`,
        );
      }
      const body = await response.json();
      const snapshotId =
        (body as { snapshot?: { id?: string } })?.snapshot?.id ??
        (body as { id?: string })?.id ??
        null;
      setLastGeneratedId(snapshotId);
      evidence.reload();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ContractSurface
      contractId="W32"
      title="Board / audit report generation"
      purpose="Versioned snapshot over a stated scope and period, with limitations auto-populated, an approval step and an immutable manifest."
      evidence={evidence}
    >
      <div className="space-y-4">
        <Section
          title="Scope and period"
          requirement="What the report covers and over what window — fixed before generation, not described afterwards."
        >
          {definitions.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No active report definitions exist, so there is nothing whose scope a
              snapshot could be generated against.
            </p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="text-[11px] font-mono uppercase text-slate-500">
                    Report definition
                  </span>
                  <select
                    value={selectedDefinition?.id ?? ""}
                    onChange={(e) => setDefinitionId(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                  >
                    {definitions.map((definition) => (
                      <option key={definition.id} value={definition.id}>
                        {definition.name} (v{definition.version})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-mono uppercase text-slate-500">
                    Period start
                  </span>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-mono uppercase text-slate-500">
                    Period end
                  </span>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                  />
                </label>
              </div>

              {selectedDefinition && (
                <div className="mt-3 rounded border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-300">{selectedDefinition.purpose}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    type {selectedDefinition.report_type} · audience{" "}
                    {selectedDefinition.audience} · definition version{" "}
                    {selectedDefinition.version}
                  </p>
                  {parseJsonArray(selectedDefinition.source_requirements).length > 0 && (
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      requires:{" "}
                      {parseJsonArray(selectedDefinition.source_requirements).join(", ")}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => void generate()}
                  disabled={generating || !selectedDefinition}
                >
                  <span>{generating ? "Generating…" : "Generate snapshot"}</span>
                </Button>
                <p className="font-mono text-[11px] text-slate-500">
                  Generation freezes a payload and hashes it. It does not approve it.
                </p>
              </div>
              {generateError && (
                <p className="mt-2 font-mono text-[11px] text-rose-300">{generateError}</p>
              )}
              {lastGeneratedId && !generateError && (
                <p className="mt-2 font-mono text-[11px] text-emerald-300">
                  generated snapshot {lastGeneratedId}
                </p>
              )}
            </>
          )}
        </Section>

        <Section
          title="Versioned snapshots"
          requirement="Every snapshot generated for this tenant, including superseded ones."
        >
          {snapshots.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No snapshots have been generated. Nothing has been frozen that could be put
              in front of a board or an auditor.
            </p>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snapshot) => {
                const limitations = parseJsonArray(snapshot.limitations);
                const sourceRefs = parseJsonArray(snapshot.source_snapshot_refs);
                const definition = definitions.find(
                  (d) => d.id === snapshot.report_definition_id,
                );
                return (
                  <div
                    key={snapshot.id}
                    className="rounded border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(snapshot.status)}>
                        {snapshot.status}
                      </Badge>
                      <span className="text-xs font-semibold text-slate-100">
                        {definition?.name ?? snapshot.report_definition_id}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        definition v{snapshot.report_definition_version}
                      </span>
                      {snapshot.id === lastGeneratedId && (
                        <Badge variant="pending">just generated</Badge>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                      <div>
                        <p className="text-[11px] font-mono uppercase text-slate-500">
                          Period
                        </p>
                        <p className="font-mono text-[11px] text-slate-300">
                          {formatTimestamp(snapshot.period_start)} →{" "}
                          {formatTimestamp(snapshot.period_end)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono uppercase text-slate-500">
                          Generated
                        </p>
                        <p className="font-mono text-[11px] text-slate-300">
                          {formatTimestamp(snapshot.generated_at)} by{" "}
                          {snapshot.generated_by}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono uppercase text-slate-500">
                          Freshness
                        </p>
                        <p
                          className={`font-mono text-[11px] ${snapshot.freshness_state === "STALE" ? "text-amber-300" : "text-slate-300"}`}
                        >
                          {snapshot.freshness_state}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono uppercase text-slate-500">
                          Completeness
                        </p>
                        <p
                          className={`font-mono text-[11px] ${snapshot.completeness_state !== "COMPLETE" ? "text-amber-300" : "text-slate-300"}`}
                        >
                          {snapshot.completeness_state}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 rounded border border-slate-800 bg-slate-900/40 p-2">
                      <p className="text-[11px] font-mono uppercase text-slate-500">
                        Immutable manifest
                      </p>
                      <p className="font-mono text-[11px] text-slate-300 break-all">
                        hash {truncateHash(snapshot.snapshot_hash, 16, 12)}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        sources: {sourceRefs.length > 0 ? sourceRefs.join(" · ") : "none recorded"}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate-600">
                        The payload is frozen at generation, so this report re-renders
                        identically and any alteration changes the hash.
                      </p>
                    </div>

                    <div className="mt-2">
                      <p className="text-[11px] font-mono uppercase text-slate-500">
                        Limitations (auto-populated at generation)
                      </p>
                      {limitations.length === 0 ? (
                        <p className="font-mono text-[11px] text-slate-500">
                          The generator found none. This is the generator&apos;s finding,
                          not an author&apos;s assurance.
                        </p>
                      ) : (
                        <ul className="mt-0.5 space-y-0.5">
                          {limitations.map((limitation, index) => (
                            <li
                              key={`${index}-${limitation}`}
                              className="font-mono text-[11px] text-amber-300/90"
                            >
                              — {limitation}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section
          title="Approval"
          requirement="A named approver signs the snapshot before it leaves the platform."
        >
          <UnbackedField
            label="Snapshot approval"
            requirement="ReportSnapshot has no approver or approved_at column and no approval route exists for it. ExecutiveReportSnapshot carries approved_by/approved_at, but nothing sets them. Every snapshot above is unapproved, and this surface cannot approve one."
          />
        </Section>
      </div>
    </ContractSurface>
  );
}
