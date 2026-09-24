"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  ArrowLeft,
  FileSearch,
  FolderOpen,
  HelpCircle,
  Layers,
  ShieldAlert,
} from "lucide-react";
import { LoadingState, UnavailableState } from "@/components/states/mandatory-ui-states";

/**
 * W14 — Alert detail.
 *
 * The alert queue could list alerts and promote them, but an alert could not
 * be opened. An analyst saw a severity and a title and had no route to the
 * reasoning: which rule fired, which version of it, what it actually observed,
 * what it could not determine, and what context was resolved at the time.
 * Disposing of an alert you cannot inspect is not a defensible decision, which
 * is the whole point of this contract.
 *
 * Everything shown here was already persisted. Nothing read it.
 */

type Factor = {
  name: string;
  contribution?: number;
  indeterminate?: boolean;
};

type AlertDetail = {
  alert: Record<string, any>;
  detection: {
    definitionKey: string | null;
    definitionName: string | null;
    category: string | null;
    versionNumber: number | null;
    versionStatus: string | null;
    registered: boolean;
  };
  whyItFired: {
    result: string;
    confidence: number | null;
    factors: Factor[];
    reasonCode: string | null;
    incompleteData: boolean;
    evaluatedAt: string;
    eventPayloadSnapshot: Record<string, any>;
  } | null;
  coverage: {
    state: string;
    incompleteData: boolean;
    contextHealth: string;
  };
  context: {
    identityRisk: string | null;
    assetCriticality: string | null;
    resolverVersion: string | null;
    capturedAt: string;
  } | null;
  identity: { id: string; email: string | null; displayName: string | null; identityType: string } | null;
  asset: { id: string; name: string; assetType: string; criticality: string } | null;
  sourceEventIds: string[];
  linkedCase: { caseId: string; relationship: string; linkedAt: string } | null;
  evidence: Array<{
    id: string;
    evidence_type: string;
    content_hash: string;
    integrity_state: string;
    created_at: string;
  }>;
};

function severityVariant(severity: string) {
  const normalized = (severity || "").toUpperCase();
  if (normalized === "CRITICAL") return "critical" as const;
  if (normalized === "HIGH") return "high" as const;
  if (normalized === "MEDIUM") return "medium" as const;
  return "low" as const;
}

export default function AlertDetailPage() {
  const router = useRouter();
  const params = useParams<{ alertId: string }>();
  const [state] = useDemoState();
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const alertId = params?.alertId;

  const load = useCallback(async () => {
    if (!alertId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/alerts/${alertId}/detail`, {
        headers: state.tenant?.id ? { "x-tenant-id": state.tenant.id } : {},
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || `Request failed with ${response.status}`);
      }
      const body = await response.json();
      setDetail(body.data as AlertDetail);
    } catch (err) {
      // Surfaced, not swapped for plausible-looking data. An alert detail view
      // that invents its reasoning is worse than one that says it is unavailable.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [alertId, state.tenant?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return <LoadingState message="Loading alert detail…" />;
  }

  if (error || !detail) {
    return (
      <div className="space-y-4 p-6">
        <UnavailableState message={error || "Alert detail is unavailable."} />
        <Button variant="secondary" onClick={() => void load()}>
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  const { alert, detection, whyItFired, coverage, context, identity, asset } = detail;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push("/alerts")}>
            <ArrowLeft className="w-4 h-4" />
            <span>Alert queue</span>
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-cyan-400" />
              {alert.title}
            </h1>
            <p className="text-xs font-mono text-slate-500">{alert.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={severityVariant(alert.severity)}>{alert.severity}</Badge>
          <Badge variant="neutral">{alert.status}</Badge>
        </div>
      </div>

      {/* Coverage first: an analyst must know what the platform could not see
          before reading anything it concluded. */}
      <Card variant="cyber" className="p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-400" />
          What was known
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div>
            <p className="text-slate-500">Coverage</p>
            <p className="text-slate-200">{coverage.state}</p>
          </div>
          <div>
            <p className="text-slate-500">Context health</p>
            <p className="text-slate-200">{coverage.contextHealth}</p>
          </div>
          <div>
            <p className="text-slate-500">Incomplete data</p>
            <p className={coverage.incompleteData ? "text-amber-300" : "text-slate-200"}>
              {coverage.incompleteData ? "YES — some factors could not be determined" : "No"}
            </p>
          </div>
        </div>
      </Card>

      <Card variant="cyber" className="p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          Detection
        </h2>
        {detection.registered ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <p className="text-slate-500">Rule</p>
              <p className="text-slate-200">{detection.definitionName}</p>
            </div>
            <div>
              <p className="text-slate-500">Key</p>
              <p className="text-slate-200">{detection.definitionKey}</p>
            </div>
            <div>
              <p className="text-slate-500">Version</p>
              <p className="text-slate-200">
                v{detection.versionNumber} ({detection.versionStatus})
              </p>
            </div>
            <div>
              <p className="text-slate-500">Category</p>
              <p className="text-slate-200">{detection.category}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs font-mono text-amber-300">
            No registered detection definition or published version is on record for
            this alert, so the rule that produced it cannot be identified.
          </p>
        )}
      </Card>

      <Card variant="cyber" className="p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-cyan-400" />
          Why it fired
        </h2>
        {whyItFired ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono mb-4">
              <div>
                <p className="text-slate-500">Result</p>
                <p className="text-slate-200">{whyItFired.result}</p>
              </div>
              <div>
                <p className="text-slate-500">Confidence</p>
                <p className="text-slate-200">
                  {whyItFired.confidence === null ? "not stated" : whyItFired.confidence}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Evaluated</p>
                <p className="text-slate-200">{formatTimestamp(whyItFired.evaluatedAt)}</p>
              </div>
            </div>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-slate-500 text-left border-b border-slate-800">
                  <th className="py-1.5">Factor</th>
                  <th className="py-1.5">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {whyItFired.factors.map((factor) => (
                  <tr key={factor.name} className="border-b border-slate-900">
                    <td className="py-1.5 text-slate-300">{factor.name}</td>
                    <td className="py-1.5">
                      {factor.indeterminate ? (
                        // An indeterminate factor is not a zero. Showing it as
                        // one would make the rule look more certain than it is.
                        <span className="text-amber-300">
                          INDETERMINATE — could not be resolved
                        </span>
                      ) : (
                        <span className="text-slate-200">{factor.contribution ?? 0}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {whyItFired.reasonCode && (
              <p className="mt-3 text-xs font-mono text-slate-400">
                Reason: {whyItFired.reasonCode}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs font-mono text-amber-300">
            No detection evaluation is recorded against this alert, so its reasoning
            cannot be reconstructed.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card variant="cyber" className="p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Resolved context</h2>
          <div className="space-y-2 text-xs font-mono">
            <div>
              <p className="text-slate-500">Identity</p>
              <p className="text-slate-200">
                {identity
                  ? `${identity.displayName || identity.email || identity.id} (${identity.identityType})`
                  : "none resolved"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Asset</p>
              <p className="text-slate-200">
                {asset ? `${asset.name} (${asset.assetType}, ${asset.criticality})` : "none resolved"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Identity risk / asset criticality</p>
              <p className="text-slate-200">
                {context
                  ? `${context.identityRisk ?? "unknown"} / ${context.assetCriticality ?? "unknown"}`
                  : "no context snapshot"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Source events</p>
              <p className="text-slate-200 break-all">
                {detail.sourceEventIds.length > 0
                  ? detail.sourceEventIds.join(", ")
                  : "none recorded"}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="cyber" className="p-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-cyan-400" />
            Case and evidence
          </h2>
          {detail.linkedCase ? (
            <Button
              variant="secondary"
              className="mb-3"
              onClick={() => router.push(`/cases/${detail.linkedCase!.caseId}`)}
            >
              <span>
                Open case ({detail.linkedCase.relationship.toLowerCase()})
              </span>
            </Button>
          ) : (
            <p className="text-xs font-mono text-slate-400 mb-3">
              No case is linked to this alert.
            </p>
          )}
          {detail.evidence.length > 0 ? (
            <ul className="space-y-1.5 text-xs font-mono">
              {detail.evidence.map((record) => (
                <li key={record.id} className="text-slate-300">
                  <span className="text-slate-500">{record.evidence_type}</span>{" "}
                  <span className="text-slate-500">·</span>{" "}
                  <span>{record.integrity_state}</span>{" "}
                  <span className="text-slate-600 break-all">
                    {record.content_hash.slice(0, 16)}…
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs font-mono text-slate-400">
              No evidence records reference this alert.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
