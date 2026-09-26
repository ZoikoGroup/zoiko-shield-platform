"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/ui/Button";
import { Badge, BadgeVariant } from "@/ui/Badge";
import { formatTimestamp } from "@/lib/utils";
import type { ContractEvidence, ContractStatus } from "@/lib/contract-state";
import {
  LoadingState,
  PartialState,
  StaleState,
  DegradedState,
  UnauthorizedState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";

/**
 * The frame every G2 contract surface renders inside.
 *
 * Three things it guarantees, so no individual page has to be trusted to
 * remember them:
 *
 *  - The status badge reflects derived evidence and cannot be set by the page.
 *  - PARTIAL, STALE and DEGRADED render their banner *above* the content, so
 *    a reader cannot take a number off the page without seeing what is wrong
 *    with it (UX-INV-03).
 *  - Every surface carries its provenance: which endpoint answered, when, and
 *    with what. A figure whose source is not stated is not evidence.
 */

const STATUS_BADGE: Record<ContractStatus, BadgeVariant> = {
  LOADING: "pending",
  PARTIAL: "medium",
  STALE: "medium",
  DEGRADED: "high",
  UNAUTHORIZED: "critical",
  UNAVAILABLE: "critical",
  NOMINAL: "healthy",
};

interface ContractSurfaceProps {
  /** Contract id from the specification, e.g. "W19". */
  contractId: string;
  title: string;
  /** What this surface is accountable for, in one line. */
  purpose: string;
  evidence: ContractEvidence;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function ReasonList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1">
      {reasons.map((reason, index) => (
        <li key={`${index}-${reason}`} className="text-xs font-mono text-amber-300/90">
          — {reason}
        </li>
      ))}
    </ul>
  );
}

function ProvenanceTable({ evidence }: { evidence: ContractEvidence }) {
  if (evidence.sources.length === 0) return null;
  return (
    <details className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40">
      <summary className="cursor-pointer px-4 py-2 text-xs font-mono text-slate-400 hover:text-slate-200">
        provenance — {evidence.sources.filter((s) => s.ok).length}/{evidence.sources.length} sources
        answered · correlation {evidence.correlationId.slice(0, 8) || "—"}
      </summary>
      <div className="overflow-x-auto px-4 pb-3">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-800">
              <th className="py-1 pr-3">Source</th>
              <th className="py-1 pr-3">Endpoint</th>
              <th className="py-1 pr-3">Result</th>
              <th className="py-1 pr-3">Read at</th>
              <th className="py-1">Reported</th>
            </tr>
          </thead>
          <tbody>
            {evidence.sources.map((source) => (
              <tr key={source.key} className="border-b border-slate-900 last:border-0">
                <td className="py-1 pr-3 text-slate-300">
                  {source.label}
                  {source.optional && <span className="text-slate-600"> (optional)</span>}
                </td>
                <td className="py-1 pr-3 text-slate-500 break-all">{source.path}</td>
                <td
                  className={`py-1 pr-3 ${source.ok ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {source.ok ? `ok ${source.httpStatus}` : source.error}
                </td>
                <td className="py-1 pr-3 text-slate-500">
                  {source.fetchedAt ? formatTimestamp(source.fetchedAt) : "—"}
                </td>
                <td className="py-1 text-slate-500">
                  {source.reportedAt ? formatTimestamp(source.reportedAt) : "not stated"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ContractSurface({
  contractId,
  title,
  purpose,
  evidence,
  actions,
  children,
}: ContractSurfaceProps) {
  const { status, reasons } = evidence;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
            <Badge variant="neutral">{contractId}</Badge>
            <Badge variant={STATUS_BADGE[status]}>{status}</Badge>
          </div>
          <p className="mt-1 text-xs font-mono text-slate-500">{purpose}</p>
        </div>
        <div className="flex gap-2">
          {actions}
          <Button variant="ghost" onClick={evidence.reload}>
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {status === "LOADING" && (
        <LoadingState
          title={`Loading ${title}`}
          message="Reading the sources this contract is accountable to."
        />
      )}

      {status === "UNAUTHORIZED" && (
        <div>
          <UnauthorizedState
            title="Not authorised for this surface"
            message="This session was refused by at least one source. Nothing is shown rather than a partial view that could be mistaken for the whole."
          />
          <ReasonList reasons={reasons} />
          <ProvenanceTable evidence={evidence} />
        </div>
      )}

      {status === "UNAVAILABLE" && (
        <div>
          <UnavailableState
            title="No source answered"
            message="Every source behind this contract failed. This is an outage in the view, not a clean result."
            retryAction={evidence.reload}
          />
          <ReasonList reasons={reasons} />
          <ProvenanceTable evidence={evidence} />
        </div>
      )}

      {(status === "PARTIAL" ||
        status === "STALE" ||
        status === "DEGRADED" ||
        status === "NOMINAL") && (
        <>
          {status === "DEGRADED" && (
            <div>
              <DegradedState
                title="Degraded — a required source is missing"
                message="What follows is drawn from the sources that did answer. Treat it as incomplete."
                fallbackReason={reasons[0]}
              />
              <ReasonList reasons={reasons} />
            </div>
          )}
          {status === "STALE" && (
            <div>
              <StaleState
                title="Stale — this is not a current picture"
                message="The newest reading here is older than the freshness budget for this contract."
              />
              <ReasonList reasons={reasons} />
            </div>
          )}
          {status === "PARTIAL" && (
            <div>
              <PartialState
                title="Partial — known gaps in the inputs"
                message="The sources answered, but declared limitations or unknown inputs. Nothing below should be read as complete."
                connectorsActive={evidence.sources.filter((s) => s.ok).length}
                connectorsTotal={evidence.sources.length}
              />
              <ReasonList reasons={reasons} />
            </div>
          )}

          <div>{children}</div>
          <ProvenanceTable evidence={evidence} />
        </>
      )}
    </div>
  );
}

/**
 * A field the contract requires but no source can currently supply.
 *
 * Rendering the requirement and saying it is unmet is the honest option: it
 * keeps the gap in front of whoever needs to close it, where omitting the
 * field would quietly redefine the contract down to whatever happens to be
 * implemented.
 */
export function UnbackedField({
  label,
  requirement,
}: {
  label: string;
  requirement: string;
}) {
  return (
    <div className="rounded border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2">
      <p className="text-xs font-semibold text-amber-200">{label}</p>
      <p className="mt-0.5 text-xs font-mono text-amber-300/70">
        Required by the contract; no source records this. {requirement}
      </p>
    </div>
  );
}
