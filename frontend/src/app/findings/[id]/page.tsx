"use client";

import React, { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { useContractSources, sourceData } from "@/lib/contract-state";
import { ContractSurface } from "@/components/contracts/ContractSurface";

/**
 * W30 — Finding / vulnerability detail.
 *
 * Priority factors, evidence age, attack path, remediation, acceptance and a
 * stale assertion warning.
 *
 * The stale assertion warning is the requirement that shapes the page. A
 * finding is a claim a scanner made at a moment in time, and the most common
 * way a vulnerability surface misleads is by presenting a months-old claim in
 * the present tense — so the reader cannot tell whether the port is still
 * open or whether nobody has looked since. The service derives assertion
 * state from last_confirmed_at against each source's own declared reassertion
 * interval, and that derivation is rendered before anything else on the page,
 * because every other field below is conditional on it.
 *
 * Priority is shown as its factor breakdown rather than as a score. A factor
 * the evaluator could not resolve is marked unknown and contributes nothing,
 * so a priority computed over missing inputs is visibly computed over missing
 * inputs rather than quietly ranking below one that was not.
 */

type PriorityFactor = {
  id: string;
  factor: string;
  value: string;
  contribution: number;
  weight?: number | null;
  unknown_input: boolean;
  source_ref?: string | null;
  evaluator_version?: string | null;
};

type AttackPathNode = {
  id: string;
  step_index: number;
  node_type: string;
  node_ref: string;
  node_label?: string | null;
  relation: string;
  confidence: number;
  inferred: boolean;
  source: string;
};

type Remediation = {
  id: string;
  action: string;
  guidance?: string | null;
  owner_id?: string | null;
  status: string;
  due_at?: string | null;
  completed_at?: string | null;
  verification_ref?: string | null;
  blocked_reason?: string | null;
  created_by: string;
  created_at: string;
};

type Acceptance = {
  id: string;
  rationale: string;
  authority: string;
  accepted_by: string;
  compensating_controls: string;
  risk_ref?: string | null;
  status: string;
  accepted_at: string;
  expires_at: string;
  review_at?: string | null;
  revoked_at?: string | null;
  revoke_reason?: string | null;
} | null;

type FindingEvidenceRow = {
  id: string;
  evidence_ref: string;
  collector: string;
  collector_version?: string | null;
  collected_at: string;
  content_hash: string;
  summary?: string | null;
};

type Finding = {
  id: string;
  tenant_id: string;
  asset_id?: string | null;
  asset_external_ref?: string | null;
  source_system: string;
  source_finding_id: string;
  scanner_version?: string | null;
  finding_type: string;
  title: string;
  description?: string | null;
  vulnerability_ref?: string | null;
  severity: string;
  status: string;
  priority_score?: number | null;
  evaluator_version?: string | null;
  priority_evaluated_at?: string | null;
  first_detected_at: string;
  last_confirmed_at: string;
  reassertion_interval_hours?: number | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  detection_confidence: number;
  factors: PriorityFactor[];
  attackPath: AttackPathNode[];
  remediations: Remediation[];
  evidenceLinks: FindingEvidenceRow[];
  acceptance: Acceptance;
  assertion: {
    state: "CURRENT" | "AGEING" | "STALE";
    ageHours: number;
    expectedWithinHours: number;
    reason: string;
  };
  priorityIntegrity: {
    scored: boolean;
    unknownInputs: string[];
    resolvedFactors: number;
    computedOverUnknowns: boolean;
  };
};

function severityVariant(severity: string) {
  const value = (severity || "").toUpperCase();
  if (value === "CRITICAL") return "critical" as const;
  if (value === "HIGH") return "high" as const;
  if (value === "MEDIUM") return "medium" as const;
  return "low" as const;
}

function parseJsonArray(raw?: string): string[] {
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
      <p className="text-[11px] font-mono uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-xs text-slate-200">{value ?? "not stated"}</p>
    </div>
  );
}

export default function FindingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const findingId = params?.id ?? "";

  const specs = useMemo(
    () => [
      {
        key: "finding",
        label: "Finding",
        path: `/api/v1/findings/${encodeURIComponent(findingId)}`,
      },
    ],
    [findingId],
  );
  const evidence = useContractSources(specs);
  const finding = sourceData<Finding>(evidence, "finding");

  const assertion = finding?.assertion;
  const integrity = finding?.priorityIntegrity;

  const acceptanceExpired =
    finding?.acceptance &&
    new Date(finding.acceptance.expires_at).getTime() < Date.now();

  return (
    <ContractSurface
      contractId="W30"
      title={finding?.title ?? "Finding detail"}
      purpose="Priority factors, evidence age, attack path, remediation, acceptance and stale assertion warning for a single finding."
      evidence={evidence}
    >
      {!finding ? (
        <Card variant="cyber" className="p-6">
          <p className="text-sm text-slate-300">
            No finding was returned for id{" "}
            <span className="font-mono">{findingId}</span>.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* The staleness warning goes first: everything below is a claim
              whose currency this determines. */}
          {assertion && assertion.state !== "CURRENT" && (
            <div
              className={`rounded-lg border p-3 ${
                assertion.state === "STALE"
                  ? "border-rose-500/50 bg-rose-500/5"
                  : "border-amber-500/40 bg-amber-500/5"
              }`}
            >
              <p
                className={`text-xs font-semibold ${assertion.state === "STALE" ? "text-rose-200" : "text-amber-200"}`}
              >
                {assertion.state === "STALE"
                  ? "Stale assertion — this may no longer be true"
                  : "Ageing assertion — overdue for reconfirmation"}
              </p>
              <p
                className={`mt-1 font-mono text-[11px] ${assertion.state === "STALE" ? "text-rose-300/90" : "text-amber-300/90"}`}
              >
                {assertion.reason}
              </p>
            </div>
          )}

          <Section
            title="Finding"
            requirement="What is asserted, by which source, against which asset."
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant={severityVariant(finding.severity)}>
                {finding.severity}
              </Badge>
              <Badge variant="neutral">{finding.status}</Badge>
              <Badge variant="neutral">{finding.finding_type}</Badge>
              {finding.vulnerability_ref && (
                <span className="font-mono text-xs text-cyan-300">
                  {finding.vulnerability_ref}
                </span>
              )}
            </div>
            {finding.description && (
              <p className="mb-3 text-xs text-slate-300">{finding.description}</p>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Source system" value={finding.source_system} />
              <Field
                label="Scanner version"
                value={finding.scanner_version ?? "not stated"}
              />
              <Field label="Source id" value={finding.source_finding_id} />
              <Field
                label="Detection confidence"
                value={finding.detection_confidence.toFixed(2)}
              />
              <Field
                label="Asset"
                value={
                  finding.asset_id ? (
                    <button
                      onClick={() => router.push("/assets")}
                      className="text-cyan-300 underline-offset-2 hover:underline"
                    >
                      {finding.asset_id}
                    </button>
                  ) : (
                    <span className="text-amber-300">
                      unresolved ({finding.asset_external_ref ?? "no external ref"})
                    </span>
                  )
                }
              />
              <Field
                label="First detected"
                value={formatTimestamp(finding.first_detected_at)}
              />
              <Field
                label="Last confirmed"
                value={formatTimestamp(finding.last_confirmed_at)}
              />
              <Field
                label="Reassertion interval"
                value={
                  finding.reassertion_interval_hours
                    ? `${finding.reassertion_interval_hours}h`
                    : "not declared by source"
                }
              />
            </div>
          </Section>

          <Section
            title="Evidence age"
            requirement="How old this claim is against how often its source says it re-checks."
          >
            {assertion && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field
                  label="Assertion state"
                  value={
                    <span
                      className={
                        assertion.state === "STALE"
                          ? "text-rose-300"
                          : assertion.state === "AGEING"
                            ? "text-amber-300"
                            : "text-emerald-300"
                      }
                    >
                      {assertion.state}
                    </span>
                  }
                />
                <Field
                  label="Age"
                  value={`${Math.round(assertion.ageHours)}h`}
                />
                <Field
                  label="Expected within"
                  value={`${assertion.expectedWithinHours}h`}
                />
                <Field
                  label="Evidence records"
                  value={String(finding.evidenceLinks.length)}
                />
              </div>
            )}
            {finding.evidenceLinks.length === 0 ? (
              <p className="mt-3 text-xs font-mono text-amber-300">
                No raw evidence is attached, so this finding cannot be traced back to
                what the scanner actually observed.
              </p>
            ) : (
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-left font-mono text-slate-500">
                    <th className="py-1">Collector</th>
                    <th className="py-1">Collected</th>
                    <th className="py-1">Hash</th>
                    <th className="py-1">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {finding.evidenceLinks.map((row) => (
                    <tr key={row.id} className="border-b border-slate-900 last:border-0">
                      <td className="py-1.5 font-mono text-slate-300">
                        {row.collector}
                        {row.collector_version ? `@${row.collector_version}` : ""}
                      </td>
                      <td className="py-1.5 font-mono text-slate-400">
                        {formatTimestamp(row.collected_at)}
                      </td>
                      <td className="py-1.5 break-all font-mono text-slate-500">
                        {truncateHash(row.content_hash)}
                      </td>
                      <td className="py-1.5 text-slate-400">
                        {row.summary ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section
            title="Priority factors"
            requirement="What produced this priority, factor by factor, including what could not be resolved."
          >
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase text-slate-500">
                  Priority score
                </p>
                <p
                  className={`font-mono text-2xl ${integrity?.scored ? (integrity.computedOverUnknowns ? "text-amber-300" : "text-slate-100") : "text-slate-500"}`}
                >
                  {finding.priority_score ?? "unscored"}
                </p>
              </div>
              <div className="text-[11px] font-mono text-slate-500">
                <p>evaluator {finding.evaluator_version ?? "not stated"}</p>
                <p>
                  evaluated{" "}
                  {finding.priority_evaluated_at
                    ? formatTimestamp(finding.priority_evaluated_at)
                    : "never"}
                </p>
              </div>
            </div>

            {integrity?.computedOverUnknowns && (
              <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/5 p-2">
                <p className="text-[11px] font-mono text-amber-300">
                  This score was computed over {integrity.unknownInputs.length} unresolved
                  input{integrity.unknownInputs.length === 1 ? "" : "s"} (
                  {integrity.unknownInputs.join(", ")}). It is not comparable with a score
                  derived from complete inputs.
                </p>
              </div>
            )}
            {!integrity?.scored && (
              <p className="mb-3 text-xs font-mono text-amber-300">
                No evaluator has scored this finding. Unscored is not low priority.
              </p>
            )}

            {finding.factors.length === 0 ? (
              <p className="text-xs font-mono text-amber-300">
                No factor breakdown is recorded, so this rating cannot be taken apart.
              </p>
            ) : (
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-slate-500">
                    <th className="py-1">Factor</th>
                    <th className="py-1">Value</th>
                    <th className="py-1">Contribution</th>
                    <th className="py-1">Weight</th>
                    <th className="py-1">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {finding.factors.map((factor) => (
                    <tr
                      key={factor.id}
                      className="border-b border-slate-900 last:border-0"
                    >
                      <td className="py-1 text-slate-300">{factor.factor}</td>
                      <td
                        className={`py-1 ${factor.unknown_input ? "text-amber-300" : "text-slate-300"}`}
                      >
                        {factor.unknown_input ? "unknown" : factor.value}
                      </td>
                      <td className="py-1 text-slate-200">
                        {factor.unknown_input ? "—" : factor.contribution}
                      </td>
                      <td className="py-1 text-slate-400">{factor.weight ?? "—"}</td>
                      <td className="py-1 break-all text-slate-500">
                        {factor.source_ref ?? "not stated"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section
            title="Attack path"
            requirement="The route to exploitation, with observed and inferred steps distinguished."
          >
            {finding.attackPath.length === 0 ? (
              <p className="text-xs font-mono text-amber-300">
                No attack path is recorded. Exploitability has not been reasoned about
                here — which is not the same as this being unexploitable.
              </p>
            ) : (
              <ol className="space-y-2">
                {finding.attackPath.map((node) => (
                  <li
                    key={node.id}
                    className={`rounded border p-2 ${node.inferred ? "border-dashed border-slate-700" : "border-slate-800"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-500">
                        {node.step_index}
                      </span>
                      <Badge variant="neutral">{node.node_type}</Badge>
                      <span className="text-xs text-slate-200">
                        {node.node_label ?? node.node_ref}
                      </span>
                      {node.inferred && (
                        <span className="font-mono text-[11px] text-amber-300">
                          inferred
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      {node.relation} · confidence {node.confidence.toFixed(2)} · source{" "}
                      {node.source}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section
            title="Remediation"
            requirement="What is being done, by whom, and whether the fix was verified."
          >
            {finding.remediations.length === 0 ? (
              <p className="text-xs font-mono text-amber-300">
                No remediation has been proposed for this finding.
              </p>
            ) : (
              <div className="space-y-2">
                {finding.remediations.map((remediation) => (
                  <div
                    key={remediation.id}
                    className="rounded border border-slate-800 p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          remediation.status === "COMPLETE"
                            ? "healthy"
                            : remediation.status === "BLOCKED"
                              ? "critical"
                              : "pending"
                        }
                      >
                        {remediation.status}
                      </Badge>
                      <span className="text-xs text-slate-200">
                        {remediation.action}
                      </span>
                    </div>
                    {remediation.guidance && (
                      <p className="mt-1 text-xs text-slate-400">
                        {remediation.guidance}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      owner {remediation.owner_id ?? "unassigned"} · due{" "}
                      {remediation.due_at
                        ? formatTimestamp(remediation.due_at)
                        : "no date"}
                      {remediation.completed_at &&
                        ` · completed ${formatTimestamp(remediation.completed_at)}`}
                    </p>
                    {remediation.status === "COMPLETE" &&
                      (remediation.verification_ref ? (
                        <p className="font-mono text-[11px] text-emerald-300">
                          verified: {remediation.verification_ref}
                        </p>
                      ) : (
                        <p className="font-mono text-[11px] text-amber-300">
                          Marked complete with no verification reference — this is an
                          assertion that it was fixed, not evidence.
                        </p>
                      ))}
                    {remediation.blocked_reason && (
                      <p className="font-mono text-[11px] text-rose-300">
                        blocked: {remediation.blocked_reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Acceptance"
            requirement="Any decision to live with this, on whose authority, and until when."
          >
            {!finding.acceptance ? (
              <p className="text-xs font-mono text-slate-400">
                This finding has not been accepted.
              </p>
            ) : (
              <div
                className={`rounded border p-3 ${acceptanceExpired || finding.acceptance.status !== "ACTIVE" ? "border-amber-500/40 bg-amber-500/5" : "border-slate-800"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      finding.acceptance.status === "ACTIVE" && !acceptanceExpired
                        ? "pass"
                        : "medium"
                    }
                  >
                    {acceptanceExpired && finding.acceptance.status === "ACTIVE"
                      ? "LAPSED"
                      : finding.acceptance.status}
                  </Badge>
                  <span className="font-mono text-[11px] text-slate-500">
                    accepted by {finding.acceptance.accepted_by} on authority{" "}
                    {finding.acceptance.authority}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-300">
                  {finding.acceptance.rationale}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Field
                    label="Accepted"
                    value={formatTimestamp(finding.acceptance.accepted_at)}
                  />
                  <Field
                    label="Expires"
                    value={
                      <span
                        className={acceptanceExpired ? "text-amber-300" : "text-slate-200"}
                      >
                        {formatTimestamp(finding.acceptance.expires_at)}
                      </span>
                    }
                  />
                  <Field
                    label="Review"
                    value={
                      finding.acceptance.review_at
                        ? formatTimestamp(finding.acceptance.review_at)
                        : "no review date"
                    }
                  />
                  <Field
                    label="Linked risk"
                    value={finding.acceptance.risk_ref ?? "none"}
                  />
                </div>
                {parseJsonArray(finding.acceptance.compensating_controls).length > 0 && (
                  <p className="mt-2 font-mono text-[11px] text-slate-400">
                    compensating controls:{" "}
                    {parseJsonArray(finding.acceptance.compensating_controls).join(", ")}
                  </p>
                )}
                {acceptanceExpired && finding.acceptance.status === "ACTIVE" && (
                  <p className="mt-2 font-mono text-[11px] text-amber-300">
                    This acceptance has passed its expiry but has not yet been swept.
                    Until it is, the finding still reads as ACCEPTED while nothing
                    currently authorises that.
                  </p>
                )}
                {finding.acceptance.revoked_at && (
                  <p className="mt-2 font-mono text-[11px] text-slate-400">
                    revoked {formatTimestamp(finding.acceptance.revoked_at)} —{" "}
                    {finding.acceptance.revoke_reason ?? "no reason recorded"}
                  </p>
                )}
              </div>
            )}
          </Section>
        </div>
      )}
    </ContractSurface>
  );
}
