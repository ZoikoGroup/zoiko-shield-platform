"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatTimestamp } from "@/lib/utils";
import { useContractSources, sourceData, sourceList } from "@/lib/contract-state";
import { ContractSurface, UnbackedField } from "@/components/contracts/ContractSurface";

/**
 * W19 — Incident command view.
 *
 * The contract asks for scope, severity, roles, clocks, decisions,
 * communications, recovery, evidence reconciliation and PIR handoff. Almost
 * all of that already existed in shield-core: the case row carries scope and
 * severity, CaseSlaClock carries the response clock with its pause
 * bookkeeping, CaseDecision carries decisions with rationale and evidence
 * refs, CaseNote carries communications with an internal/customer
 * classification, and CaseEvidence carries the linked evidence. None of it
 * had a surface, so an incident could be run and closed with no single place
 * that showed what was decided, on what evidence, against which clock.
 *
 * Two of the nine are not backed and are shown as unmet rather than
 * approximated: there is no incident-role model (so an incident commander is
 * not distinguishable from the case owner), and there is no post-incident
 * review object to hand off to.
 */

type CaseRow = {
  id: string;
  title: string;
  severity: string;
  priority: string;
  status: string;
  region?: string;
  environment_id?: string;
  owner_id?: string | null;
  queue_id?: string | null;
  primary_asset_id?: string | null;
  primary_identity_id?: string | null;
  disposition?: string | null;
  incident_id?: string | null;
  correlation_id?: string | null;
  created_by?: string;
  created_at?: string;
  sla_started_at?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
};

type TimelineEntry = {
  id: string;
  entry_type: string;
  actor_id: string;
  occurred_at: string;
  title: string;
  summary: string;
  source_ref?: string | null;
  evidence_ref?: string | null;
};

type Decision = {
  id: string;
  decision_type: string;
  decision: string;
  rationale: string;
  actor_id: string;
  evidence_refs?: string;
  policy_version?: string | null;
  created_at: string;
};

type Note = {
  id: string;
  author_id: string;
  content: string;
  classification: string;
  created_at: string;
  supersedes_id?: string | null;
};

type SlaClock = {
  case_id: string;
  severity: string;
  coverage_tier: string;
  target_response_minutes: number;
  status: string;
  started_at: string;
  paused_at?: string | null;
  pause_reason?: string | null;
  total_paused_ms: number;
  stopped_at?: string | null;
  active_triage_minutes?: number | null;
  breached_at?: string | null;
} | null;

type EvidenceLink = {
  id: string;
  evidence_id: string;
  relationship: string;
  added_by: string;
  added_at: string;
  note?: string | null;
};

function severityVariant(severity: string) {
  const value = (severity || "").toUpperCase();
  if (value === "CRITICAL") return "critical" as const;
  if (value === "HIGH") return "high" as const;
  if (value === "MEDIUM") return "medium" as const;
  return "low" as const;
}

function parseRefs(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xs text-slate-200">{value ?? "not stated"}</p>
    </div>
  );
}

/** Elapsed minutes against the response target, stated rather than colour-coded. */
function clockReading(clock: SlaClock) {
  if (!clock) return null;
  const started = new Date(clock.started_at).getTime();
  const end = clock.stopped_at ? new Date(clock.stopped_at).getTime() : Date.now();
  const elapsedMinutes = Math.max(
    0,
    Math.round((end - started - (clock.total_paused_ms || 0)) / 60000),
  );
  return {
    elapsedMinutes,
    target: clock.target_response_minutes,
    over: elapsedMinutes > clock.target_response_minutes,
  };
}

export default function IncidentCommandPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listSpecs = useMemo(
    () => [
      {
        key: "cases",
        label: "Open cases",
        path: "/api/v1/cases?limit=100",
      },
    ],
    [],
  );
  const listEvidence = useContractSources(listSpecs);
  const cases = sourceList<CaseRow>(listEvidence, "cases");

  // Incident command is about the cases being actively run, not the archive.
  const activeIncidents = useMemo(
    () =>
      cases.filter(
        (row) => !["CLOSED", "RESOLVED"].includes((row.status || "").toUpperCase()),
      ),
    [cases],
  );

  const activeId = selectedId ?? activeIncidents[0]?.id ?? null;

  const detailSpecs = useMemo(() => {
    if (!activeId) return [];
    return [
      { key: "case", label: "Case record", path: `/api/v1/cases/${activeId}` },
      { key: "timeline", label: "Timeline", path: `/api/v1/cases/${activeId}/timeline` },
      { key: "decisions", label: "Decisions", path: `/api/v1/cases/${activeId}/decisions` },
      { key: "notes", label: "Communications", path: `/api/v1/cases/${activeId}/notes` },
      { key: "sla", label: "Response clock", path: `/api/v1/cases/${activeId}/sla` },
      { key: "evidence", label: "Linked evidence", path: `/api/v1/cases/${activeId}/evidence` },
      {
        key: "quality",
        label: "Quality reviews",
        path: `/api/v1/cases/${activeId}/quality-reviews`,
        optional: true,
      },
    ];
  }, [activeId]);

  const evidence = useContractSources(detailSpecs);

  const record = sourceData<CaseRow>(evidence, "case");
  const timeline = sourceList<TimelineEntry>(evidence, "timeline");
  const decisions = sourceList<Decision>(evidence, "decisions");
  const notes = sourceList<Note>(evidence, "notes");
  const clock = sourceData<SlaClock>(evidence, "sla");
  const evidenceLinks = sourceList<EvidenceLink>(evidence, "evidence");

  // Evidence reconciliation: anything the timeline cites must also be linked
  // to the case, or the citation is unverifiable from here.
  const citedRefs = useMemo(
    () =>
      Array.from(
        new Set(
          timeline
            .map((entry) => entry.evidence_ref)
            .filter((ref): ref is string => Boolean(ref)),
        ),
      ),
    [timeline],
  );
  const linkedIds = useMemo(
    () => new Set(evidenceLinks.map((link) => link.evidence_id)),
    [evidenceLinks],
  );
  const unreconciled = citedRefs.filter((ref) => !linkedIds.has(ref));

  const reading = clockReading(clock ?? null);
  const communications = notes.filter((n) => n.classification !== "INTERNAL");
  const internalNotes = notes.filter((n) => n.classification === "INTERNAL");

  const selector = (
    <select
      value={activeId ?? ""}
      onChange={(e) => setSelectedId(e.target.value || null)}
      className="rounded border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
      aria-label="Incident under command"
    >
      {activeIncidents.length === 0 && <option value="">No open incidents</option>}
      {activeIncidents.map((row) => (
        <option key={row.id} value={row.id}>
          {row.severity} · {row.title}
        </option>
      ))}
    </select>
  );

  if (listEvidence.status !== "LOADING" && activeIncidents.length === 0) {
    return (
      <ContractSurface
        contractId="W19"
        title="Incident command"
        purpose="Scope, severity, roles, clocks, decisions, communications, recovery, evidence reconciliation and PIR handoff for the incident being run."
        evidence={listEvidence}
      >
        <Card variant="cyber" className="p-6">
          <p className="text-sm text-slate-300">No open incidents for this tenant.</p>
          <p className="mt-1 text-xs font-mono text-slate-500">
            An empty command view means nothing is currently being run here — not that
            nothing happened. Closed cases are in the case workspace.
          </p>
        </Card>
      </ContractSurface>
    );
  }

  return (
    <ContractSurface
      contractId="W19"
      title="Incident command"
      purpose="Scope, severity, roles, clocks, decisions, communications, recovery, evidence reconciliation and PIR handoff for the incident being run."
      evidence={evidence}
      actions={selector}
    >
      <div className="space-y-4">
        <Section
          title="Scope and severity"
          requirement="What this incident covers, and how badly."
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100">
              {record?.title ?? "—"}
            </h3>
            <Badge variant={severityVariant(record?.severity ?? "")}>
              {record?.severity ?? "?"} / {record?.priority ?? "?"}
            </Badge>
            <Badge variant="neutral">{record?.status ?? "?"}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Environment" value={record?.environment_id} />
            <Field label="Region" value={record?.region} />
            <Field label="Primary asset" value={record?.primary_asset_id} />
            <Field label="Primary identity" value={record?.primary_identity_id} />
            <Field label="Incident id" value={record?.incident_id} />
            <Field label="Correlation id" value={record?.correlation_id} />
            <Field label="Case id" value={record?.id} />
            <Field label="Raised by" value={record?.created_by} />
          </div>
        </Section>

        <Section
          title="Roles"
          requirement="Who holds which position on this incident."
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Case owner" value={record?.owner_id ?? "unassigned"} />
            <Field label="Queue" value={record?.queue_id} />
            <Field label="Raised by" value={record?.created_by} />
          </div>
          <div className="mt-3">
            <UnbackedField
              label="Incident commander, communications lead, scribe"
              requirement="Case carries a single owner_id; there is no incident-role assignment model, so command roles cannot be distinguished from case ownership."
            />
          </div>
        </Section>

        <Section
          title="Clocks"
          requirement="The response commitment and what has elapsed against it."
        >
          {clock ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Coverage tier" value={clock.coverage_tier} />
              <Field label="Clock status" value={clock.status} />
              <Field
                label="Elapsed vs target"
                value={
                  reading ? (
                    <span className={reading.over ? "text-rose-300" : "text-slate-200"}>
                      {reading.elapsedMinutes} / {reading.target} min
                      {reading.over ? " — over" : ""}
                    </span>
                  ) : (
                    "not computable"
                  )
                }
              />
              <Field
                label="Paused"
                value={
                  clock.paused_at
                    ? `${formatTimestamp(clock.paused_at)} — ${clock.pause_reason ?? "no reason recorded"}`
                    : `no (${Math.round((clock.total_paused_ms || 0) / 60000)} min total)`
                }
              />
              <Field label="Breached at" value={clock.breached_at ? formatTimestamp(clock.breached_at) : "not breached"} />
              <Field label="Started" value={clock.started_at ? formatTimestamp(clock.started_at) : null} />
              <Field label="Acknowledged" value={record?.acknowledged_at ? formatTimestamp(record.acknowledged_at) : "not acknowledged"} />
              <Field label="Resolved" value={record?.resolved_at ? formatTimestamp(record.resolved_at) : "not resolved"} />
            </div>
          ) : (
            <p className="text-xs font-mono text-amber-300">
              No response clock is running on this case, so there is no commitment to
              measure against.
            </p>
          )}
        </Section>

        <Section
          title="Decisions"
          requirement="What was decided, by whom, on what reasoning and against which evidence."
        >
          {decisions.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No decisions are recorded. An incident that has been run without a recorded
              decision cannot be reviewed afterwards.
            </p>
          ) : (
            <div className="space-y-2">
              {decisions.map((decision) => {
                const refs = parseRefs(decision.evidence_refs);
                return (
                  <div key={decision.id} className="rounded border border-slate-800 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{decision.decision_type}</Badge>
                      <span className="text-xs font-semibold text-slate-100">
                        {decision.decision}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {decision.actor_id} · {formatTimestamp(decision.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{decision.rationale}</p>
                    <p className="mt-1 text-[11px] font-mono text-slate-500">
                      policy: {decision.policy_version ?? "not stated"} · evidence:{" "}
                      {refs.length > 0 ? refs.join(", ") : "none cited"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section
          title="Communications"
          requirement="What was said to the customer, kept separable from internal notes."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-mono uppercase text-slate-500">
                Customer-facing ({communications.length})
              </p>
              {communications.length === 0 ? (
                <p className="text-xs font-mono text-amber-300">
                  Nothing has been communicated to the customer on this incident.
                </p>
              ) : (
                communications.map((note) => (
                  <div key={note.id} className="mb-2 rounded border border-slate-800 p-2">
                    <p className="text-xs text-slate-300">{note.content}</p>
                    <p className="mt-1 text-[11px] font-mono text-slate-500">
                      {note.classification} · {note.author_id} ·{" "}
                      {formatTimestamp(note.created_at)}
                      {note.supersedes_id ? " · supersedes an earlier note" : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-mono uppercase text-slate-500">
                Internal ({internalNotes.length})
              </p>
              {internalNotes.length === 0 ? (
                <p className="text-xs font-mono text-slate-500">No internal notes.</p>
              ) : (
                internalNotes.map((note) => (
                  <div key={note.id} className="mb-2 rounded border border-slate-800 p-2">
                    <p className="text-xs text-slate-300">{note.content}</p>
                    <p className="mt-1 text-[11px] font-mono text-slate-500">
                      {note.author_id} · {formatTimestamp(note.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </Section>

        <Section
          title="Recovery"
          requirement="Where this incident has got to, and how it was dispositioned."
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Status" value={record?.status} />
            <Field label="Disposition" value={record?.disposition ?? "not dispositioned"} />
            <Field
              label="Resolved"
              value={record?.resolved_at ? formatTimestamp(record.resolved_at) : "not resolved"}
            />
            <Field
              label="Closed"
              value={record?.closed_at ? formatTimestamp(record.closed_at) : "open"}
            />
          </div>
          <div className="mt-3 space-y-2">
            {timeline
              .filter((entry) => /recover|contain|erad|restore/i.test(entry.entry_type + entry.title))
              .map((entry) => (
                <div key={entry.id} className="rounded border border-slate-800 p-2">
                  <p className="text-xs font-semibold text-slate-200">{entry.title}</p>
                  <p className="text-xs text-slate-400">{entry.summary}</p>
                  <p className="mt-1 text-[11px] font-mono text-slate-500">
                    {entry.actor_id} · {formatTimestamp(entry.occurred_at)}
                  </p>
                </div>
              ))}
          </div>
        </Section>

        <Section
          title="Evidence reconciliation"
          requirement="Everything the timeline cites must be linked to the case and retrievable."
        >
          <div className="mb-3 grid grid-cols-3 gap-3">
            <Field label="Timeline entries" value={String(timeline.length)} />
            <Field label="Evidence cited" value={String(citedRefs.length)} />
            <Field label="Evidence linked" value={String(evidenceLinks.length)} />
          </div>
          {unreconciled.length > 0 ? (
            <div className="rounded border border-rose-500/40 bg-rose-500/5 p-3">
              <p className="text-xs font-semibold text-rose-200">
                {unreconciled.length} cited reference
                {unreconciled.length === 1 ? "" : "s"} not linked to this case
              </p>
              <ul className="mt-1 space-y-0.5">
                {unreconciled.map((ref) => (
                  <li key={ref} className="text-[11px] font-mono text-rose-300/80 break-all">
                    {ref}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] font-mono text-rose-300/70">
                A timeline entry citing evidence that is not attached cannot be verified
                from this view.
              </p>
            </div>
          ) : citedRefs.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No timeline entry cites evidence, so there is nothing to reconcile — that is
              an absence, not a clean reconciliation.
            </p>
          ) : (
            <p className="text-xs font-mono text-emerald-300">
              All {citedRefs.length} cited references are linked to this case.
            </p>
          )}
          {evidenceLinks.length > 0 && (
            <table className="mt-3 w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="py-1">Evidence</th>
                  <th className="py-1">Relationship</th>
                  <th className="py-1">Added by</th>
                  <th className="py-1">Added</th>
                </tr>
              </thead>
              <tbody>
                {evidenceLinks.map((link) => (
                  <tr key={link.id} className="border-b border-slate-900 last:border-0">
                    <td className="py-1 break-all text-slate-300">{link.evidence_id}</td>
                    <td className="py-1 text-slate-400">{link.relationship}</td>
                    <td className="py-1 text-slate-400">{link.added_by}</td>
                    <td className="py-1 text-slate-500">{formatTimestamp(link.added_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="PIR handoff"
          requirement="The post-incident review this incident hands off to."
        >
          <UnbackedField
            label="Post-incident review object"
            requirement="No PIR model exists in case-management; there is nothing to create, assign or hand off to. Quality reviews cover sampled closure, not post-incident review."
          />
        </Section>
      </div>
    </ContractSurface>
  );
}
