"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatTimestamp } from "@/lib/utils";
import { useContractSources, sourceData, sourceList } from "@/lib/contract-state";
import { ContractSurface } from "@/components/contracts/ContractSurface";

/**
 * W31 — Executive risk command center.
 *
 * "Every number drills to evidence; incomplete inputs visibly degrade" is the
 * whole contract. An executive surface is where a figure gets furthest from
 * the thing it measures, and where a confident-looking number does the most
 * damage, so no metric here renders as a bare value: each one carries the
 * endpoint that produced it, the definition that endpoint stated, and any
 * limitation it declared about itself.
 *
 * The summary services in shield-core already refuse to collapse UNKNOWN into
 * green — getServiceHealthSummary reports AI availability and ledger health
 * as UNKNOWN rather than assuming them, and says so in its limitations. This
 * surface carries that refusal upward instead of rounding it off: a metric
 * with an unknown input is rendered as unknown, and the page cannot reach
 * NOMINAL while any input says so.
 */

type Summary = {
  generatedAt?: string;
  metrics?: Record<string, number | undefined>;
  definition?: string;
  limitations?: string[];
  healthState?: string;
  overallHealth?: string;
  connectorHealth?: { healthy: number | null; total: number | null } | string;
  aiAvailability?: string;
  actionSimulationHealth?: string;
  evidenceLedgerHealth?: string;
  anchorHealth?: string;
};

type Risk = {
  id: string;
  title: string;
  likelihood: string;
  impact: string;
  status?: string;
  owner_id?: string | null;
  factors?: { factor: string; value: string; contribution: number; sourceRef?: string }[];
};

type ReportSnapshot = {
  id: string;
  report_definition_id: string;
  period_start: string;
  period_end: string;
  freshness_state: string;
  completeness_state: string;
  status: string;
  generated_at: string;
  snapshot_hash: string;
  limitations?: string;
};

/**
 * A number with its provenance attached. The definition and source are not
 * decoration — a figure whose derivation is not stated cannot be challenged,
 * and an executive metric that cannot be challenged is just an assertion.
 */
function Metric({
  label,
  value,
  definition,
  source,
  limitation,
  warn,
}: {
  label: string;
  value: number | string | undefined;
  definition?: string;
  source: string;
  limitation?: string;
  warn?: boolean;
}) {
  const unknown = value === undefined || value === null || value === "UNKNOWN";
  return (
    <details className="rounded border border-slate-800 bg-slate-950/40 p-3">
      <summary className="cursor-pointer list-none">
        <p className="text-[11px] font-mono uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p
          className={`font-mono text-2xl ${
            unknown ? "text-slate-500" : warn ? "text-amber-300" : "text-slate-100"
          }`}
        >
          {unknown ? "unknown" : String(value)}
        </p>
        {limitation && (
          <p className="mt-1 text-[11px] font-mono text-amber-300/80">limited</p>
        )}
      </summary>
      <div className="mt-2 space-y-1 border-t border-slate-800 pt-2">
        <p className="text-[11px] text-slate-400">
          {definition ?? "No definition was stated by the source."}
        </p>
        <p className="font-mono text-[11px] text-slate-600 break-all">source: {source}</p>
        {limitation && (
          <p className="font-mono text-[11px] text-amber-300/80">limitation: {limitation}</p>
        )}
        {unknown && (
          <p className="font-mono text-[11px] text-amber-300/80">
            This input is unknown, not zero. It is excluded from any judgement on this
            page rather than counted as healthy.
          </p>
        )}
      </div>
    </details>
  );
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

export default function ExecutiveRiskPage() {
  const router = useRouter();

  const specs = useMemo(
    () => [
      { key: "security", label: "Security summary", path: "/api/v1/reporting/security" },
      { key: "assurance", label: "Assurance summary", path: "/api/v1/reporting/assurance" },
      {
        key: "health",
        label: "Service health",
        path: "/api/v1/reporting/service-health",
      },
      { key: "risks", label: "Risk register", path: "/api/v1/risks" },
      {
        key: "snapshots",
        label: "Report snapshots",
        path: "/api/v1/reporting/snapshots",
        optional: true,
      },
    ],
    [],
  );
  const evidence = useContractSources(specs);

  const security = sourceData<Summary>(evidence, "security");
  const assurance = sourceData<Summary>(evidence, "assurance");
  const health = sourceData<Summary>(evidence, "health");
  const risks = sourceList<Risk>(evidence, "risks");
  const snapshots = sourceList<ReportSnapshot>(evidence, "snapshots");

  const securityLimit = security?.limitations?.[0];
  const healthLimit = health?.limitations?.[0];

  // Residual risk is what is left after treatment — so the register minus
  // anything closed, weighted by what the factor breakdown actually supports.
  const residual = useMemo(() => {
    const open = risks.filter((r) => (r.status ?? "OPEN").toUpperCase() !== "CLOSED");
    const withoutFactors = open.filter((r) => !r.factors || r.factors.length === 0);
    const byImpact = new Map<string, number>();
    for (const risk of open) {
      const key = (risk.impact || "UNSPECIFIED").toUpperCase();
      byImpact.set(key, (byImpact.get(key) ?? 0) + 1);
    }
    return { open, withoutFactors, byImpact: Array.from(byImpact.entries()) };
  }, [risks]);

  // Trend needs more than one comparable snapshot; one point is a reading.
  const trendable = useMemo(
    () =>
      [...snapshots]
        .filter((s) => s.status === "READY" || s.status === "SUPERSEDED")
        .sort(
          (a, b) =>
            new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime(),
        ),
    [snapshots],
  );

  const controlsUnknown = assurance?.metrics?.controlsUnknown ?? 0;
  const controlsIneffective = assurance?.metrics?.controlsIneffective ?? 0;

  return (
    <ContractSurface
      contractId="W31"
      title="Executive risk command center"
      purpose="Trends, incidents, controls and residual risk — every number drilling to its evidence, with incomplete inputs visibly degrading the view."
      evidence={evidence}
    >
      <div className="space-y-4">
        <Section
          title="Incidents"
          requirement="Live security posture, as counted at generation time."
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric
              label="Open alerts"
              value={security?.metrics?.openAlerts}
              definition={security?.definition}
              source="/api/v1/reporting/security"
              limitation={securityLimit}
            />
            <Metric
              label="Critical alerts"
              value={security?.metrics?.criticalAlerts}
              definition={security?.definition}
              source="/api/v1/reporting/security"
              limitation={securityLimit}
              warn={(security?.metrics?.criticalAlerts ?? 0) > 0}
            />
            <Metric
              label="Open cases"
              value={security?.metrics?.openCases}
              definition={security?.definition}
              source="/api/v1/reporting/security"
              limitation={securityLimit}
            />
            <Metric
              label="Awaiting customer"
              value={security?.metrics?.casesAwaitingCustomer}
              definition={security?.definition}
              source="/api/v1/reporting/security"
              limitation={securityLimit}
              warn={(security?.metrics?.casesAwaitingCustomer ?? 0) > 0}
            />
          </div>
          {security?.generatedAt && (
            <p className="mt-2 font-mono text-[11px] text-slate-600">
              counted at {formatTimestamp(security.generatedAt)} — a live count, not a
              frozen snapshot
            </p>
          )}
        </Section>

        <Section
          title="Controls"
          requirement="Control effectiveness, with unknown and ineffective kept visible rather than netted off."
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric
              label="Effective"
              value={assurance?.metrics?.controlsEffective}
              definition={assurance?.definition}
              source="/api/v1/reporting/assurance"
            />
            <Metric
              label="Partial"
              value={assurance?.metrics?.controlsPartiallyEffective}
              definition={assurance?.definition}
              source="/api/v1/reporting/assurance"
              warn={(assurance?.metrics?.controlsPartiallyEffective ?? 0) > 0}
            />
            <Metric
              label="Ineffective"
              value={assurance?.metrics?.controlsIneffective}
              definition={assurance?.definition}
              source="/api/v1/reporting/assurance"
              warn={controlsIneffective > 0}
            />
            <Metric
              label="Unknown"
              value={assurance?.metrics?.controlsUnknown}
              definition={assurance?.definition}
              source="/api/v1/reporting/assurance"
              warn={controlsUnknown > 0}
            />
            <Metric
              label="Open evidence gaps"
              value={assurance?.metrics?.evidenceGapsOpen}
              definition={assurance?.definition}
              source="/api/v1/reporting/assurance"
              warn={(assurance?.metrics?.evidenceGapsOpen ?? 0) > 0}
            />
          </div>
          {assurance?.healthState && (
            <p className="mt-2 font-mono text-[11px] text-slate-500">
              assurance health as reported by the service:{" "}
              <span
                className={
                  assurance.healthState === "HEALTHY" ? "text-slate-300" : "text-amber-300"
                }
              >
                {assurance.healthState}
              </span>
              {controlsUnknown > 0 &&
                ` — ${controlsUnknown} control${controlsUnknown === 1 ? "" : "s"} have never been evaluated, so no aggregate here covers the full estate`}
            </p>
          )}
        </Section>

        <Section
          title="Residual risk"
          requirement="What is left on the register after treatment, and how much of it is defensible."
        >
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric
              label="Open risks"
              value={residual.open.length}
              definition="Risks on the register not in a CLOSED state."
              source="/api/v1/risks"
              warn={residual.open.length > 0}
            />
            <Metric
              label="Without factor breakdown"
              value={residual.withoutFactors.length}
              definition="Open risks whose rating cannot be taken apart, so cannot be challenged."
              source="/api/v1/risks"
              warn={residual.withoutFactors.length > 0}
            />
            <Metric
              label="Expired acceptances"
              value={assurance?.metrics?.expiredRiskAcceptances}
              definition={assurance?.definition}
              source="/api/v1/reporting/assurance"
              warn={(assurance?.metrics?.expiredRiskAcceptances ?? 0) > 0}
            />
            <Metric
              label="Expired exceptions"
              value={assurance?.metrics?.expiredExceptions}
              definition={assurance?.definition}
              source="/api/v1/reporting/assurance"
              warn={(assurance?.metrics?.expiredExceptions ?? 0) > 0}
            />
          </div>

          {residual.byImpact.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {residual.byImpact.map(([impact, count]) => (
                <span
                  key={impact}
                  className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1 font-mono text-xs text-slate-300"
                >
                  {impact} <span className="text-slate-500">· {count}</span>
                </span>
              ))}
            </div>
          )}

          {residual.open.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              Nothing is open on the register. That is an unassessed register, not a low
              risk position — this surface cannot tell the two apart.
            </p>
          ) : (
            <div className="space-y-1">
              {residual.open.slice(0, 10).map((risk) => (
                <button
                  key={risk.id}
                  onClick={() => router.push("/risk")}
                  className="flex w-full items-center justify-between rounded border border-slate-800 px-2 py-1.5 text-left hover:border-slate-700"
                >
                  <span className="text-xs text-slate-200">{risk.title}</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {risk.likelihood}/{risk.impact} ·{" "}
                    {risk.factors?.length
                      ? `${risk.factors.length} factors`
                      : "no factor breakdown"}
                  </span>
                </button>
              ))}
              <p className="pt-1 font-mono text-[11px] text-slate-600">
                every row drills to the risk register at /risk
              </p>
            </div>
          )}
        </Section>

        <Section
          title="Trends"
          requirement="Movement over frozen snapshots — not over live counts, which cannot be compared across time."
        >
          {trendable.length < 2 ? (
            <p className="text-xs font-mono text-amber-300">
              {trendable.length === 0
                ? "No frozen report snapshots exist, so nothing on this page has a history to trend against."
                : "Only one frozen snapshot exists. A single reading is a point, not a trend."}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-slate-500">
                  <th className="py-1">Period</th>
                  <th className="py-1">Status</th>
                  <th className="py-1">Freshness</th>
                  <th className="py-1">Completeness</th>
                  <th className="py-1">Generated</th>
                </tr>
              </thead>
              <tbody>
                {trendable.map((snapshot) => (
                  <tr key={snapshot.id} className="border-b border-slate-900 last:border-0">
                    <td className="py-1.5 font-mono text-slate-300">
                      {formatTimestamp(snapshot.period_start)} →{" "}
                      {formatTimestamp(snapshot.period_end)}
                    </td>
                    <td className="py-1.5">
                      <Badge
                        variant={snapshot.status === "READY" ? "healthy" : "neutral"}
                      >
                        {snapshot.status}
                      </Badge>
                    </td>
                    <td
                      className={`py-1.5 font-mono ${snapshot.freshness_state === "STALE" ? "text-amber-300" : "text-slate-400"}`}
                    >
                      {snapshot.freshness_state}
                    </td>
                    <td
                      className={`py-1.5 font-mono ${snapshot.completeness_state !== "COMPLETE" ? "text-amber-300" : "text-slate-400"}`}
                    >
                      {snapshot.completeness_state}
                    </td>
                    <td className="py-1.5 font-mono text-slate-500">
                      {formatTimestamp(snapshot.generated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Inputs this view depends on"
          requirement="What the platform can and cannot currently see. An unknown input is never counted as healthy."
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric
              label="Connector health"
              value={
                typeof health?.connectorHealth === "object" && health.connectorHealth
                  ? `${health.connectorHealth.healthy ?? "?"}/${health.connectorHealth.total ?? "?"}`
                  : (health?.connectorHealth as string | undefined)
              }
              definition="Healthy connector instances over total configured."
              source="/api/v1/reporting/service-health"
              limitation={healthLimit}
            />
            <Metric
              label="AI availability"
              value={health?.aiAvailability}
              source="/api/v1/reporting/service-health"
              limitation={healthLimit}
            />
            <Metric
              label="Action simulation"
              value={health?.actionSimulationHealth}
              source="/api/v1/reporting/service-health"
              limitation={healthLimit}
            />
            <Metric
              label="Evidence ledger"
              value={health?.evidenceLedgerHealth}
              source="/api/v1/reporting/service-health"
              limitation={healthLimit}
            />
            <Metric
              label="Anchor"
              value={health?.anchorHealth}
              source="/api/v1/reporting/service-health"
              limitation={healthLimit}
            />
          </div>
        </Section>
      </div>
    </ContractSurface>
  );
}
