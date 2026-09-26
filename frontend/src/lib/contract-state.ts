"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDemoState } from "@/lib/demo-state";

/**
 * Evidence-derived experience state for the G2 contracts.
 *
 * UX-INV-03 says PARTIAL, STALE, COLLECTOR_UNHEALTHY, PERMISSION_CHANGED and
 * EVALUATOR_FAILED never render compliant or healthy. That invariant only
 * means anything if the state is *derived* — a page that lets someone pick
 * NOMINAL from a dropdown satisfies the letter of the seven state classes and
 * none of the point. So nothing here is selectable: the status is computed
 * from what the sources actually returned, and NOMINAL is reachable only when
 * every source answered, answered recently, and declared no limitations.
 *
 * The reasons list is the other half. A page that degrades without saying why
 * is as hard to act on as one that lies, so every non-nominal status carries
 * the specific observations that produced it.
 */

export type ContractStatus =
  | "LOADING"
  | "PARTIAL"
  | "STALE"
  | "DEGRADED"
  | "UNAUTHORIZED"
  | "UNAVAILABLE"
  | "NOMINAL";

export interface SourceSpec {
  /** Stable key the page reads its data back by. */
  key: string;
  /** Human name used in the source table and in degradation reasons. */
  label: string;
  /** Path under the API root. */
  path: string;
  /**
   * A source the contract can render without. A missing optional source
   * degrades the view to PARTIAL; a missing required one degrades it to
   * DEGRADED, or to UNAVAILABLE if nothing at all resolved.
   */
  optional?: boolean;
}

export interface SourceResult {
  key: string;
  label: string;
  path: string;
  optional: boolean;
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
  /** Wall-clock time this source was read, for the freshness column. */
  fetchedAt: string | null;
  /** generatedAt / lastSyncedAt the payload declared, when it declares one. */
  reportedAt: string | null;
  data: unknown;
}

export interface ContractEvidence {
  status: ContractStatus;
  /** Why the view is not NOMINAL. Empty exactly when status is NOMINAL. */
  reasons: string[];
  /** Limitations the backend itself declared, carried through verbatim. */
  declaredLimitations: string[];
  sources: SourceResult[];
  correlationId: string;
  tenantId: string;
  reload: () => void;
}

/** Grace period past which a reported generation time counts as stale. */
const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;

function unwrap(body: unknown): unknown {
  // Controllers return either the row/array directly or {statusCode, data}.
  if (body && typeof body === "object" && "data" in (body as Record<string, unknown>)) {
    return (body as { data: unknown }).data;
  }
  return body;
}

function readString(value: unknown, ...keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string") return candidate;
  }
  return null;
}

/** Limitations the payload declares about itself, in any of the shapes used. */
function readLimitations(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ["limitations", "known_limitations", "knownLimitations"]) {
    const raw = record[key];
    if (Array.isArray(raw)) {
      out.push(...raw.filter((entry): entry is string => typeof entry === "string"));
    } else if (typeof raw === "string" && raw.trim() && raw.trim() !== "[]") {
      // Several tables persist these as a JSON string column.
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          out.push(...parsed.filter((e): e is string => typeof e === "string"));
        }
      } catch {
        out.push(raw);
      }
    }
  }
  return out;
}

/**
 * Health/completeness/freshness words the backend uses. These are the
 * projection states from reporting.prisma and the summary services, which
 * already refuse to collapse UNKNOWN into green — this just carries that
 * refusal up to the surface instead of overriding it.
 */
function readDeclaredStates(value: unknown): {
  degraded: string[];
  partial: string[];
  stale: string[];
} {
  const degraded: string[] = [];
  const partial: string[] = [];
  const stale: string[] = [];
  if (!value || typeof value !== "object") return { degraded, partial, stale };
  const record = value as Record<string, unknown>;

  const health = readString(record, "healthState", "health_state", "overallHealth");
  if (health === "DEGRADED" || health === "UNAVAILABLE") degraded.push(health);
  else if (health === "PARTIAL" || health === "UNKNOWN") partial.push(health);
  else if (health === "STALE") stale.push(health);

  const completeness = readString(record, "completenessState", "completeness_state");
  if (completeness && completeness !== "COMPLETE") partial.push(`completeness=${completeness}`);

  const freshness = readString(record, "freshnessState", "freshness_state");
  if (freshness === "STALE") stale.push("freshness=STALE");
  else if (freshness && !["FRESH", "CURRENT"].includes(freshness)) {
    partial.push(`freshness=${freshness}`);
  }

  return { degraded, partial, stale };
}

function reportedTimestamp(value: unknown): string | null {
  return readString(
    value,
    "generatedAt",
    "generated_at",
    "lastSyncedAt",
    "last_synced_at",
    "updated_at",
  );
}

/**
 * Fetch a contract's sources and derive its experience state from them.
 *
 * Sources are fetched together rather than in sequence: a view that shows
 * three panels should not claim to be loading the third because the first was
 * slow, and a partial answer is worth rendering as partial.
 */
export function useContractSources(
  specs: SourceSpec[],
  options: { staleAfterSeconds?: number } = {},
): ContractEvidence {
  const staleAfterSeconds = options.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const [state] = useDemoState();
  const tenantId = state.tenant?.id ?? "";

  const [results, setResults] = useState<SourceResult[] | null>(null);
  const [correlationId, setCorrelationId] = useState("");

  // specs are declared inline at each call site; key on identity, not the array.
  const specKey = useMemo(
    () => specs.map((s) => `${s.key}:${s.path}:${s.optional ? "opt" : "req"}`).join("|"),
    [specs],
  );

  const load = useCallback(async () => {
    const correlation =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `corr-${Date.now()}`;
    setCorrelationId(correlation);
    setResults(null);

    const settled = await Promise.all(
      specs.map(async (spec): Promise<SourceResult> => {
        const base: Omit<SourceResult, "ok" | "httpStatus" | "error" | "data" | "reportedAt"> = {
          key: spec.key,
          label: spec.label,
          path: spec.path,
          optional: Boolean(spec.optional),
          fetchedAt: new Date().toISOString(),
        };
        try {
          const response = await fetch(spec.path, {
            headers: {
              ...(tenantId ? { "x-tenant-id": tenantId } : {}),
              "x-correlation-id": correlation,
            },
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            return {
              ...base,
              ok: false,
              httpStatus: response.status,
              error:
                (body as { message?: string })?.message ||
                `Request failed with ${response.status}`,
              reportedAt: null,
              data: null,
            };
          }
          const payload = unwrap(await response.json());
          return {
            ...base,
            ok: true,
            httpStatus: response.status,
            error: null,
            reportedAt: reportedTimestamp(payload),
            data: payload,
          };
        } catch (err) {
          return {
            ...base,
            ok: false,
            httpStatus: null,
            error: err instanceof Error ? err.message : String(err),
            reportedAt: null,
            data: null,
          };
        }
      }),
    );
    setResults(settled);
    // specKey stands in for specs; tenantId re-reads on tenant switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return useMemo<ContractEvidence>(() => {
    if (results === null) {
      return {
        status: "LOADING",
        reasons: [],
        declaredLimitations: [],
        sources: [],
        correlationId,
        tenantId,
        reload: () => void load(),
      };
    }

    const reasons: string[] = [];
    const declaredLimitations: string[] = [];

    const unauthorized = results.filter((r) => r.httpStatus === 401 || r.httpStatus === 403);
    const failed = results.filter((r) => !r.ok && r.httpStatus !== 401 && r.httpStatus !== 403);
    const requiredFailed = failed.filter((r) => !r.optional);

    for (const result of results) {
      if (!result.ok) continue;
      const limitations = readLimitations(result.data);
      declaredLimitations.push(...limitations.map((l) => `${result.label}: ${l}`));

      const declared = readDeclaredStates(result.data);
      for (const word of declared.degraded) reasons.push(`${result.label} reports ${word}`);
      for (const word of declared.partial) reasons.push(`${result.label} reports ${word}`);
      for (const word of declared.stale) reasons.push(`${result.label} reports ${word}`);

      if (result.reportedAt) {
        const ageSeconds = (Date.now() - new Date(result.reportedAt).getTime()) / 1000;
        if (Number.isFinite(ageSeconds) && ageSeconds > staleAfterSeconds) {
          reasons.push(
            `${result.label} was generated ${Math.round(ageSeconds / 60)} min ago, past the ${Math.round(staleAfterSeconds / 60)} min freshness budget`,
          );
        }
      }
    }

    for (const result of unauthorized) {
      reasons.push(`${result.label} refused this session (${result.httpStatus})`);
    }
    for (const result of failed) {
      reasons.push(`${result.label} did not answer: ${result.error}`);
    }
    reasons.push(...declaredLimitations);

    let status: ContractStatus;
    if (unauthorized.length > 0) {
      status = "UNAUTHORIZED";
    } else if (failed.length === results.length && results.length > 0) {
      status = "UNAVAILABLE";
    } else if (requiredFailed.length > 0) {
      status = "DEGRADED";
    } else if (reasons.some((r) => r.includes("freshness budget") || r.includes("STALE"))) {
      status = "STALE";
    } else if (reasons.length > 0) {
      status = "PARTIAL";
    } else {
      status = "NOMINAL";
    }

    return {
      status,
      reasons,
      declaredLimitations,
      sources: results,
      correlationId,
      tenantId,
      reload: () => void load(),
    };
  }, [results, correlationId, tenantId, staleAfterSeconds, load]);
}

/** Read one source's payload back, typed by the caller. */
export function sourceData<T>(evidence: ContractEvidence, key: string): T | null {
  const found = evidence.sources.find((s) => s.key === key);
  return found && found.ok ? (found.data as T) : null;
}

/** A list-shaped source, normalised to an array so pages need no guards. */
export function sourceList<T>(evidence: ContractEvidence, key: string): T[] {
  const data = sourceData<unknown>(evidence, key);
  return Array.isArray(data) ? (data as T[]) : [];
}
