"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { formatTimestamp } from "@/lib/utils";
import { useContractSources, sourceList } from "@/lib/contract-state";
import { ContractSurface, UnbackedField } from "@/components/contracts/ContractSurface";

/**
 * W29 — Asset inventory.
 *
 * The contract asks for owner, criticality, source authority/reconciliation,
 * coverage, identity confidence and a review queue.
 *
 * An inventory is the one place where a confident-looking list is most
 * dangerous: every downstream severity calculation treats these rows as
 * ground truth. So the columns that matter here are not the asset names but
 * the provenance — which connector asserted this asset, whether two sources
 * agree, how long ago anything confirmed it still exists, and how confident
 * the resolver was when it decided two records were the same thing.
 *
 * Owner is the one requirement with no backing: security_context.Asset has
 * no owner column and nothing else records asset ownership, so it is shown
 * as unmet rather than substituted with the last actor who touched the row.
 */

type AssetAlias = {
  id: string;
  source_system: string;
  source_account_id?: string | null;
  external_type: string;
  external_id: string;
  first_seen_at: string;
  last_seen_at: string;
};

type Asset = {
  id: string;
  external_id?: string | null;
  asset_type: string;
  name: string;
  criticality: string;
  status: string;
  environment_id?: string;
  first_seen_at: string;
  last_seen_at: string;
  aliases?: AssetAlias[];
};

type IdentityEntity = {
  id: string;
  email?: string | null;
  display_name?: string | null;
  identity_type: string;
  status: string;
  confidence: number;
  last_seen_at: string;
};

type ResolutionDecision = {
  id: string;
  entity_type: string;
  source_system: string;
  external_id: string;
  resolved_entity_id?: string | null;
  decision: string;
  confidence: number;
  resolver_version: string;
  reason: string;
  created_at: string;
};

/** Beyond this, "last seen" stops being evidence that the asset still exists. */
const COVERAGE_BUDGET_DAYS = 7;
/** Resolver confidence below which a decision belongs in front of a human. */
const REVIEW_CONFIDENCE_THRESHOLD = 0.85;

function criticalityVariant(criticality: string) {
  const value = (criticality || "").toUpperCase();
  if (value === "CRITICAL") return "critical" as const;
  if (value === "HIGH") return "high" as const;
  if (value === "MEDIUM") return "medium" as const;
  return "low" as const;
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? ms / 86_400_000 : null;
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

export default function AssetInventoryPage() {
  const [criticalityFilter, setCriticalityFilter] = useState<string>("ALL");

  const specs = useMemo(
    () => [
      { key: "assets", label: "Asset inventory", path: "/api/v1/context/assets?limit=200" },
      {
        key: "identities",
        label: "Identity entities",
        path: "/api/v1/context/identities?limit=200",
      },
      {
        key: "decisions",
        label: "Resolution decisions",
        path: "/api/v1/context/assets/resolution-decisions?limit=200",
        optional: true,
      },
    ],
    [],
  );
  const evidence = useContractSources(specs);

  const assets = sourceList<Asset>(evidence, "assets");
  const identities = sourceList<IdentityEntity>(evidence, "identities");
  const decisions = sourceList<ResolutionDecision>(evidence, "decisions");

  const filtered = useMemo(
    () =>
      criticalityFilter === "ALL"
        ? assets
        : assets.filter((a) => (a.criticality || "").toUpperCase() === criticalityFilter),
    [assets, criticalityFilter],
  );

  // Coverage is not "how many assets do we have" — it is how many of them
  // something has confirmed recently enough to still be believable.
  const coverage = useMemo(() => {
    const stale = assets.filter((a) => {
      const days = daysSince(a.last_seen_at);
      return days === null || days > COVERAGE_BUDGET_DAYS;
    });
    const singleSourced = assets.filter((a) => (a.aliases?.length ?? 0) <= 1);
    const unsourced = assets.filter((a) => (a.aliases?.length ?? 0) === 0);
    return { stale, singleSourced, unsourced };
  }, [assets]);

  const sourceSystems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      for (const alias of asset.aliases ?? []) {
        counts.set(alias.source_system, (counts.get(alias.source_system) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const lowConfidenceIdentities = useMemo(
    () => identities.filter((i) => i.confidence < REVIEW_CONFIDENCE_THRESHOLD),
    [identities],
  );

  const reviewQueue = useMemo(
    () =>
      decisions
        .filter(
          (d) =>
            d.confidence < REVIEW_CONFIDENCE_THRESHOLD ||
            !d.resolved_entity_id ||
            d.decision.toUpperCase().includes("CONFLICT"),
        )
        .sort((a, b) => a.confidence - b.confidence),
    [decisions],
  );

  const filterControl = (
    <select
      value={criticalityFilter}
      onChange={(e) => setCriticalityFilter(e.target.value)}
      className="rounded border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
      aria-label="Filter by criticality"
    >
      {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((value) => (
        <option key={value} value={value}>
          {value === "ALL" ? "All criticalities" : value}
        </option>
      ))}
    </select>
  );

  return (
    <ContractSurface
      contractId="W29"
      title="Asset inventory"
      purpose="Owner, criticality, source authority and reconciliation, coverage, identity confidence and the review queue behind the inventory."
      evidence={evidence}
      actions={filterControl}
    >
      <div className="space-y-4">
        <Section
          title="Coverage"
          requirement={`How much of the inventory is still corroborated, against a ${COVERAGE_BUDGET_DAYS}-day confirmation budget.`}
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { label: "Assets", value: assets.length, warn: false },
              {
                label: `Unseen >${COVERAGE_BUDGET_DAYS}d`,
                value: coverage.stale.length,
                warn: coverage.stale.length > 0,
              },
              {
                label: "Single-sourced",
                value: coverage.singleSourced.length,
                warn: coverage.singleSourced.length > 0,
              },
              {
                label: "No source alias",
                value: coverage.unsourced.length,
                warn: coverage.unsourced.length > 0,
              },
            ].map((tile) => (
              <div key={tile.label} className="rounded border border-slate-800 p-2">
                <p className="text-[11px] font-mono uppercase text-slate-500">
                  {tile.label}
                </p>
                <p
                  className={`font-mono text-lg ${tile.warn ? "text-amber-300" : "text-slate-200"}`}
                >
                  {tile.value}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] font-mono text-slate-500">
            An asset corroborated by one connector is that connector&apos;s claim. An
            asset corroborated by none is in the inventory for a reason nothing here
            records.
          </p>
        </Section>

        <Section
          title="Source authority"
          requirement="Which systems assert this population, and how often."
          count={sourceSystems.length}
        >
          {sourceSystems.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No asset carries a source alias, so nothing in this inventory can name the
              system that asserted it.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sourceSystems.map(([system, count]) => (
                <span
                  key={system}
                  className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1 font-mono text-xs text-slate-300"
                >
                  {system} <span className="text-slate-500">· {count}</span>
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Inventory"
          requirement="Each asset with its criticality, asserting sources and last confirmation."
          count={filtered.length}
        >
          <div className="mb-3">
            <UnbackedField
              label="Asset owner"
              requirement="security_context.Asset has no owner column and no ownership record exists elsewhere, so no row below can name an accountable owner."
            />
          </div>
          {filtered.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No assets match. An empty inventory is an uningested estate, not a small
              one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-left font-mono text-slate-500">
                    <th className="py-1 pr-3">Asset</th>
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Criticality</th>
                    <th className="py-1 pr-3">Asserted by</th>
                    <th className="py-1 pr-3">Last seen</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((asset) => {
                    const days = daysSince(asset.last_seen_at);
                    const stale = days === null || days > COVERAGE_BUDGET_DAYS;
                    const aliases = asset.aliases ?? [];
                    return (
                      <tr key={asset.id} className="border-b border-slate-900 last:border-0">
                        <td className="py-1.5 pr-3">
                          <span className="text-slate-200">{asset.name}</span>
                          <span className="block font-mono text-[11px] text-slate-600 break-all">
                            {asset.external_id ?? asset.id}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-slate-400">
                          {asset.asset_type}
                        </td>
                        <td className="py-1.5 pr-3">
                          <Badge variant={criticalityVariant(asset.criticality)}>
                            {asset.criticality}
                          </Badge>
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[11px]">
                          {aliases.length === 0 ? (
                            <span className="text-amber-300">no source</span>
                          ) : (
                            <span
                              className={
                                aliases.length === 1 ? "text-amber-300/80" : "text-slate-300"
                              }
                            >
                              {Array.from(new Set(aliases.map((a) => a.source_system))).join(
                                ", ",
                              )}
                              {aliases.length === 1 ? " (single)" : ""}
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-1.5 pr-3 font-mono text-[11px] ${stale ? "text-amber-300" : "text-slate-500"}`}
                        >
                          {formatTimestamp(asset.last_seen_at)}
                          {days !== null && ` (${Math.round(days)}d)`}
                        </td>
                        <td className="py-1.5 font-mono text-[11px] text-slate-400">
                          {asset.status}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title="Identity confidence"
          requirement={`Identities the resolver was less than ${REVIEW_CONFIDENCE_THRESHOLD} confident about.`}
          count={lowConfidenceIdentities.length}
        >
          {identities.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No identity entities are resolved for this tenant.
            </p>
          ) : lowConfidenceIdentities.length === 0 ? (
            <p className="text-xs font-mono text-slate-400">
              All {identities.length} resolved identities are at or above{" "}
              {REVIEW_CONFIDENCE_THRESHOLD} confidence.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-slate-500">
                  <th className="py-1">Identity</th>
                  <th className="py-1">Type</th>
                  <th className="py-1">Confidence</th>
                  <th className="py-1">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {lowConfidenceIdentities.map((identity) => (
                  <tr key={identity.id} className="border-b border-slate-900 last:border-0">
                    <td className="py-1.5 text-slate-200">
                      {identity.display_name || identity.email || identity.id}
                    </td>
                    <td className="py-1.5 font-mono text-slate-400">
                      {identity.identity_type}
                    </td>
                    <td className="py-1.5 font-mono text-amber-300">
                      {identity.confidence.toFixed(2)}
                    </td>
                    <td className="py-1.5 font-mono text-slate-500">
                      {formatTimestamp(identity.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Reconciliation review queue"
          requirement="Resolution decisions that a human should confirm before downstream logic relies on them."
          count={reviewQueue.length}
        >
          {decisions.length === 0 ? (
            <p className="text-xs font-mono text-amber-300">
              No resolution decisions are recorded, so how this inventory was reconciled
              cannot be reviewed.
            </p>
          ) : reviewQueue.length === 0 ? (
            <p className="text-xs font-mono text-slate-400">
              All {decisions.length} recorded decisions resolved to an entity at or above{" "}
              {REVIEW_CONFIDENCE_THRESHOLD} confidence.
            </p>
          ) : (
            <div className="space-y-2">
              {reviewQueue.map((decision) => (
                <div key={decision.id} className="rounded border border-slate-800 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={decision.confidence < 0.6 ? "high" : "medium"}>
                      {decision.confidence.toFixed(2)}
                    </Badge>
                    <span className="font-mono text-xs text-slate-300">
                      {decision.decision}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 break-all">
                      {decision.source_system}:{decision.external_id}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{decision.reason}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                    resolver {decision.resolver_version} ·{" "}
                    {decision.resolved_entity_id
                      ? `resolved to ${decision.resolved_entity_id}`
                      : "unresolved"}{" "}
                    · {formatTimestamp(decision.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </ContractSurface>
  );
}
