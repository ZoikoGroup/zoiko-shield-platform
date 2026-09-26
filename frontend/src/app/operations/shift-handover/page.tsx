"use client";

import React, { useMemo } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatTimestamp } from "@/lib/utils";
import { useContractSources, sourceData, sourceList } from "@/lib/contract-state";
import { ContractSurface, UnbackedField } from "@/components/contracts/ContractSurface";

/**
 * W20 — SOC shift handover.
 *
 * Handover is where an unrecorded fact stops being one analyst's context and
 * becomes the next shift's blind spot, so the contract asks for open cases,
 * commitments, watch items, unresolved risk, incoming acknowledgment and
 * quality sampling.
 *
 * Five of those six compose from data shield-core already holds — the
 * handover snapshot returns open cases with their response clocks, pending
 * quality reviews and latest notes in one query, and the risk register
 * supplies unresolved risk. The sixth does not: there is no handover record,
 * so an incoming analyst has nothing to acknowledge and no acknowledgment can
 * be retained. That is shown as unmet, because a handover nobody signed for
 * is the failure mode the requirement exists to prevent.
 */

type SlaClock = {
  target_response_minutes: number;
  status: string;
  started_at: string;
  paused_at?: string | null;
  pause_reason?: string | null;
  total_paused_ms: number;
  stopped_at?: string | null;
  breached_at?: string | null;
  coverage_tier: string;
};

type QualityReview = {
  id: string;
  review_type: string;
  trigger: string;
  requested_by: string;
  status: string;
  reviewer_id?: string | null;
  created_at: string;
};

type Note = {
  id: string;
  author_id: string;
  content: string;
  classification: string;
  created_at: string;
};

type HandoverCase = {
  id: string;
  title: string;
  severity: string;
  priority: string;
  status: string;
  owner_id?: string | null;
  created_at: string;
  acknowledged_at?: string | null;
  slaClock?: SlaClock | null;
  qualityReviews?: QualityReview[];
  notes?: Note[];
};

type Risk = {
  id: string;
  title: string;
  likelihood: string;
  impact: string;
  status?: string;
  owner_id?: string | null;
};

type AssuranceSummary = {
  metrics?: {
    activeRisks?: number;
    activeExceptions?: number;
    expiredRiskAcceptances?: number;
    expiredExceptions?: number;
    evidenceGapsOpen?: number;
  };
  healthState?: string;
};

function severityVariant(severity: string) {
  const value = (severity || "").toUpperCase();
  if (value === "CRITICAL") return "critical" as const;
  if (value === "HIGH") return "high" as const;
  if (value === "MEDIUM") return "medium" as const;
  return "low" as const;
}

/** Minutes remaining against the response target; negative means over. */
function clockMargin(clock?: SlaClock | null): number | null {
  if (!clock) return null;
  const started = new Date(clock.started_at).getTime();
  const end = clock.stopped_at ? new Date(clock.stopped_at).getTime() : Date.now();
  const elapsed = (end - started - (clock.total_paused_ms || 0)) / 60000;
  if (!Number.isFinite(elapsed)) return null;
  return Math.round(clock.target_response_minutes - elapsed);
}

function Section({
  title,
  requirement,
  count,
  children,
}: {
  title: string;
  requirement: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card variant="cyber" className="p-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-slate-800 pb-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <p className="text-[11px] font-mono text-slate-500">{requirement}</p>
        </div>
        {count !== undefined && (
          <span className="font-mono text-lg text-slate-200">{count}</span>
        )}
      </div>
      {children}
    </Card>
  );
}

export default function ShiftHandoverPage() {
  const specs = useMemo(
    () => [
      { key: "handover", label: "Open cases", path: "/api/v1/cases/handover" },
      { key: "risks", label: "Risk register", path: "/api/v1/risks" },
      {
        key: "assurance",
        label: "Assurance summary",
        path: "/api/v1/reporting/assurance",
        optional: true,
      },
    ],
    [],
  );
  const evidence = useContractSources(specs);

  const cases = sourceList<HandoverCase>(evidence, "handover");
  const risks = sourceList<Risk>(evidence, "risks");
  const assurance = sourceData<AssuranceSummary>(evidence, "assurance");

  // Commitments are the cases carrying a live response clock; the ones
  // closest to (or past) their target are what the outgoing shift owes.
  const commitments = useMemo(
    () =>
      cases
        .filter((row) => row.slaClock)
        .map((row) => ({ row, margin: clockMargin(row.slaClock) }))
        .sort((a, b) => (a.margin ?? 9999) - (b.margin ?? 9999)),
    [cases],
  );

  // A watch item is an open case nobody has acknowledged, or one whose clock
  // is paused — both are things that will sit still unless someone picks
  // them up, which is precisely what a handover is for.
  const watchItems = useMemo(
    () =>
      cases.filter(
        (row) => !row.acknowledged_at || !row.owner_id || row.slaClock?.paused_at,
      ),
    [cases],
  );

  const sampledReviews = useMemo(
    () =>
      cases.flatMap((row) =>
        (row.qualityReviews ?? []).map((review) => ({ row, review })),
      ),
    [cases],
  );

  const unresolvedRisks = useMemo(
    () => risks.filter((r) => (r.status ?? "OPEN").toUpperCase() !== "CLOSED"),
    [risks],
  );

  return (
    <ContractSurface
      contractId="W20"
      title="SOC shift handover"
      purpose="Open cases, commitments, watch items, unresolved risk, incoming acknowledgment and quality sampling at the point of handover."
      evidence={evidence}
    >
      <div className="space-y-4">
        <Section
          title="Open cases"
          requirement="Everything still running at the end of this shift."
          count={cases.length}
        >
          {cases.length === 0 ? (
            <p className="text-xs font-mono text-slate-500">
              No open cases. Nothing carries over from this shift.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-slate-500">
                  <th className="py-1">Case</th>
                  <th className="py-1">Severity</th>
                  <th className="py-1">Status</th>
                  <th className="py-1">Owner</th>
                  <th className="py-1">Opened</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((row) => (
                  <tr key={row.id} className="border-b border-slate-900 last:border-0">
                    <td className="py-1.5 pr-3 text-slate-200">{row.title}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={severityVariant(row.severity)}>
                        {row.severity} / {row.priority}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-slate-400">{row.status}</td>
                    <td className="py-1.5 pr-3 font-mono text-slate-400">
                      {row.owner_id ?? (
                        <span className="text-amber-300">unassigned</span>
                      )}
                    </td>
                    <td className="py-1.5 font-mono text-slate-500">
                      {formatTimestamp(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Commitments"
          requirement="Response clocks the outgoing shift is handing over, nearest the target first."
          count={commitments.length}
        >
          {commitments.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No open case is running a response clock, so there is no measurable
              commitment to hand over.
            </p>
          ) : (
            <div className="space-y-2">
              {commitments.map(({ row, margin }) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-2"
                >
                  <div>
                    <p className="text-xs text-slate-200">{row.title}</p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {row.slaClock?.coverage_tier} · clock {row.slaClock?.status}
                      {row.slaClock?.paused_at
                        ? ` · paused: ${row.slaClock.pause_reason ?? "no reason recorded"}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    {row.slaClock?.breached_at ? (
                      <span className="font-mono text-xs text-rose-300">
                        breached {formatTimestamp(row.slaClock.breached_at)}
                      </span>
                    ) : margin === null ? (
                      <span className="font-mono text-xs text-slate-500">
                        not computable
                      </span>
                    ) : (
                      <span
                        className={`font-mono text-xs ${margin < 0 ? "text-rose-300" : margin < 30 ? "text-amber-300" : "text-slate-300"}`}
                      >
                        {margin < 0 ? `${Math.abs(margin)} min over` : `${margin} min left`}
                      </span>
                    )}
                    <p className="text-[11px] font-mono text-slate-600">
                      target {row.slaClock?.target_response_minutes} min
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Watch items"
          requirement="Open work that will not move unless the incoming shift picks it up."
          count={watchItems.length}
        >
          {watchItems.length === 0 ? (
            <p className="text-xs font-mono text-slate-500">
              Every open case is acknowledged, owned and running.
            </p>
          ) : (
            <div className="space-y-2">
              {watchItems.map((row) => {
                const why: string[] = [];
                if (!row.acknowledged_at) why.push("never acknowledged");
                if (!row.owner_id) why.push("unassigned");
                if (row.slaClock?.paused_at) why.push("clock paused");
                return (
                  <div key={row.id} className="rounded border border-slate-800 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={severityVariant(row.severity)}>{row.severity}</Badge>
                      <span className="text-xs text-slate-200">{row.title}</span>
                      <span className="text-[11px] font-mono text-amber-300">
                        {why.join(" · ")}
                      </span>
                    </div>
                    {(row.notes ?? []).slice(0, 1).map((note) => (
                      <p key={note.id} className="mt-1 text-[11px] text-slate-400">
                        latest note ({note.author_id}): {note.content}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section
          title="Unresolved risk"
          requirement="Risk carried into the next shift, and assurance that has lapsed."
          count={unresolvedRisks.length}
        >
          {assurance?.metrics && (
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                ["Active risks", assurance.metrics.activeRisks],
                ["Expired acceptances", assurance.metrics.expiredRiskAcceptances],
                ["Expired exceptions", assurance.metrics.expiredExceptions],
                ["Open evidence gaps", assurance.metrics.evidenceGapsOpen],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded border border-slate-800 p-2">
                  <p className="text-[11px] font-mono uppercase text-slate-500">{label}</p>
                  <p
                    className={`font-mono text-lg ${Number(value) > 0 ? "text-amber-300" : "text-slate-300"}`}
                  >
                    {value === undefined ? "unknown" : String(value)}
                  </p>
                </div>
              ))}
            </div>
          )}
          {unresolvedRisks.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              The risk register is empty for this tenant. That is an unassessed register,
              not an absence of risk.
            </p>
          ) : (
            <div className="space-y-1">
              {unresolvedRisks.map((risk) => (
                <div
                  key={risk.id}
                  className="flex items-center justify-between rounded border border-slate-800 px-2 py-1.5"
                >
                  <span className="text-xs text-slate-200">{risk.title}</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {risk.likelihood}/{risk.impact} · {risk.owner_id ?? "unowned"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Quality sampling"
          requirement="Reviews awaiting a second pair of eyes before a closure becomes the record."
          count={sampledReviews.length}
        >
          {sampledReviews.length === 0 ? (
            <p className="text-xs font-mono text-slate-500">
              No quality review is pending on an open case.
            </p>
          ) : (
            <div className="space-y-2">
              {sampledReviews.map(({ row, review }) => (
                <div key={review.id} className="rounded border border-slate-800 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="pending">{review.status}</Badge>
                    <span className="text-xs text-slate-200">{row.title}</span>
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-slate-500">
                    {review.review_type} · triggered by {review.trigger} · requested by{" "}
                    {review.requested_by} · {formatTimestamp(review.created_at)} ·
                    reviewer {review.reviewer_id ?? "not assigned"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Incoming acknowledgment"
          requirement="The incoming shift signs for what it is taking on."
        >
          <UnbackedField
            label="Handover record and acknowledgment"
            requirement="There is no handover object in case-management, so this snapshot cannot be frozen, addressed to an incoming analyst, or signed for. Everything above is a live read at page load, not an agreed handover."
          />
        </Section>
      </div>
    </ContractSurface>
  );
}
