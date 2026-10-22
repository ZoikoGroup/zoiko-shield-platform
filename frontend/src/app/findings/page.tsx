"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatTimestamp } from "@/lib/utils";
import { useContractSources, sourceData, sourceList } from "@/lib/contract-state";
import { ContractSurface } from "@/components/contracts/ContractSurface";

/**
 * Finding list — the way into W30.
 *
 * The columns are chosen so the list cannot be read more confidently than the
 * data supports: alongside severity and status, every row states whether its
 * assertion is still current and whether its priority was scored over
 * complete inputs. Sorting by priority alone would put a confidently-scored
 * low finding above an unscored critical one, so unscored rows say so rather
 * than sorting as zero.
 */

type FindingRow = {
  id: string;
  title: string;
  severity: string;
  status: string;
  finding_type: string;
  vulnerability_ref?: string | null;
  source_system: string;
  asset_id?: string | null;
  priority_score?: number | null;
  last_confirmed_at: string;
  assertion: { state: "CURRENT" | "AGEING" | "STALE"; ageHours: number; reason: string };
  priorityIntegrity: { scored: boolean; computedOverUnknowns: boolean };
};

type Summary = {
  metrics?: {
    total?: number;
    open?: number;
    staleAssertions?: number;
    ageingAssertions?: number;
    unscored?: number;
    scoredOverUnknowns?: number;
    unresolvedAsset?: number;
  };
  limitations?: string[];
};

function severityVariant(severity: string) {
  const value = (severity || "").toUpperCase();
  if (value === "CRITICAL") return "critical" as const;
  if (value === "HIGH") return "high" as const;
  if (value === "MEDIUM") return "medium" as const;
  return "low" as const;
}

export default function FindingsListPage() {
  const router = useRouter();
  const [severityFilter, setSeverityFilter] = useState("ALL");

  const specs = useMemo(
    () => [
      { key: "findings", label: "Findings", path: "/api/v1/findings?limit=200" },
      { key: "summary", label: "Findings summary", path: "/api/v1/findings/summary" },
    ],
    [],
  );
  const evidence = useContractSources(specs);

  const findings = sourceList<FindingRow>(evidence, "findings");
  const summary = sourceData<Summary>(evidence, "summary");

  const filtered = useMemo(
    () =>
      severityFilter === "ALL"
        ? findings
        : findings.filter((f) => (f.severity || "").toUpperCase() === severityFilter),
    [findings, severityFilter],
  );

  const filterControl = (
    <select
      value={severityFilter}
      onChange={(e) => setSeverityFilter(e.target.value)}
      className="rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400 transition-colors"
      aria-label="Filter by severity"
    >
      {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((value) => (
        <option key={value} value={value}>
          {value === "ALL" ? "All severities" : value}
        </option>
      ))}
    </select>
  );

  const tiles = [
    { label: "Open", value: summary?.metrics?.open, warn: false },
    { label: "Stale assertions", value: summary?.metrics?.staleAssertions, warn: true },
    { label: "Ageing", value: summary?.metrics?.ageingAssertions, warn: true },
    { label: "Unscored", value: summary?.metrics?.unscored, warn: true },
    {
      label: "Scored over unknowns",
      value: summary?.metrics?.scoredOverUnknowns,
      warn: true,
    },
    { label: "Unresolved asset", value: summary?.metrics?.unresolvedAsset, warn: true },
  ];

  return (
    <ContractSurface
      contractId="W30"
      title="Findings"
      purpose="The exposure findings population, qualified by how current each assertion is and how complete its priority inputs were."
      evidence={evidence}
      actions={filterControl}
    >
      <div className="space-y-4">
        <Card variant="cyber" className="p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-xl border border-line bg-canvas/80 p-3 shadow-inner">
                <p className="text-[11px] font-mono uppercase text-slate-500">
                  {tile.label}
                </p>
                <p
                  className={`font-mono text-xl font-bold mt-1 ${
                    tile.value === undefined
                      ? "text-slate-500"
                      : tile.warn && tile.value > 0
                        ? "text-amber-300"
                        : "text-slate-100"
                  }`}
                >
                  {tile.value ?? "unknown"}
                </p>
              </div>
            ))}
          </div>
          {summary?.limitations?.map((limitation, index) => (
            <p
              key={`${index}-${limitation}`}
              className="mt-3 font-mono text-[11px] text-amber-300/80"
            >
              — {limitation}
            </p>
          ))}
        </Card>

        <Card variant="cyber" className="p-5">
          {filtered.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No findings match. An empty findings list means no connected scanner has
              reported anything — it is not a clean bill of health for this estate.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-slate-400 bg-canvas/80">
                    <th className="py-2.5 px-3">Finding</th>
                    <th className="py-2.5 px-3">Severity</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Assertion</th>
                    <th className="py-2.5 px-3">Source</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filtered.map((finding) => (
                    <tr
                      key={finding.id}
                      onClick={() => router.push(`/findings/${finding.id}`)}
                      className="cursor-pointer hover:bg-raised transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <span className="text-slate-200 font-medium">{finding.title}</span>
                        {finding.vulnerability_ref && (
                          <span className="ml-2 font-mono text-[11px] text-cyan-300 px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/20">
                            {finding.vulnerability_ref}
                          </span>
                        )}
                        {!finding.asset_id && (
                          <span className="block font-mono text-[11px] text-amber-300 mt-0.5">
                            asset unresolved
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={severityVariant(finding.severity)}>
                          {finding.severity}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        {finding.priorityIntegrity?.scored ? (
                          <span
                            className={
                              finding.priorityIntegrity?.computedOverUnknowns
                                ? "text-amber-300 font-bold"
                                : "text-slate-200 font-bold"
                            }
                          >
                            {finding.priority_score ?? 0}
                            {finding.priorityIntegrity?.computedOverUnknowns && "*"}
                          </span>
                        ) : (
                          <span className="text-slate-500">unscored</span>
                        )}
                      </td>
                      <td
                        className={`py-2.5 px-3 font-mono text-[11px] ${
                          finding.assertion?.state === "STALE"
                            ? "text-rose-300"
                            : finding.assertion?.state === "AGEING"
                              ? "text-amber-300"
                              : "text-slate-400"
                        }`}
                      >
                        <span className="font-bold">{finding.assertion?.state ?? "CURRENT"}</span>
                        <span className="block text-slate-500 text-[10px]">
                          {formatTimestamp(finding.last_confirmed_at)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        {finding.source_system}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        {finding.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 bg-canvas/40 border-t border-line">
                <p className="font-mono text-[11px] text-slate-500">
                  * priority computed over at least one unresolved input, so not comparable
                  with a score derived from complete inputs.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </ContractSurface>
  );
}
