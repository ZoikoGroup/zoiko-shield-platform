"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { backend, asList, BackendError } from "@/lib/backend";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { CheckCircle2, PlayCircle, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { LoadingState } from "@/components/states/mandatory-ui-states";

/**
 * W34 — Response proposal card, with the human decision recorded.
 *
 * shield-core could create, approve, reject and simulate response proposals,
 * and nothing displayed them. A proposal could be raised against a case and
 * expire unseen, because the only way to act on one was an API call.
 *
 * The card labels where the recommendation came from and whether it is
 * advisory or requires approval, because accepting a machine's suggestion
 * without knowing it was a machine's is exactly what the contract exists to
 * prevent. Reversibility and residual risk sit next to the accept button
 * rather than behind a link: they are what the decision turns on.
 */

type Proposal = {
  id: string;
  case_id: string | null;
  action_type: string;
  target_type: string;
  target_id: string;
  reason: string;
  authority_level: string;
  recommendation_source: string;
  reversible: boolean;
  rollback_action_type: string | null;
  residual_risk: string | null;
  status: string;
  expires_at: string;
  created_at: string;
};

type CaseSummary = { id: string; title: string };

function statusVariant(status: string) {
  switch ((status || "").toUpperCase()) {
    case "APPROVED":
      return "pass" as const;
    case "REJECTED":
    case "EXPIRED":
      return "fail" as const;
    case "SIMULATED":
      return "simulated" as const;
    default:
      return "pending" as const;
  }
}

/** R0/R1 are advisory or simulated; R2 and above change a customer system. */
function requiresApproval(authorityLevel: string): boolean {
  return !["R0", "R1"].includes((authorityLevel || "").toUpperCase());
}

export default function ResponseProposalsPage() {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [cases, setCases] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const caseList = asList<CaseSummary>(await backend.get("/api/v1/cases"));
      setCases(Object.fromEntries(caseList.map((c) => [c.id, c.title])));

      // Proposals are scoped to a case; there is no tenant-wide list endpoint,
      // so they are gathered per case. A case whose proposals cannot be read
      // must not blank the whole page.
      const perCase = await Promise.all(
        caseList.map((c) =>
          backend
            .get(`/api/v1/cases/${c.id}/response-proposals`)
            .then((r) => asList<Proposal>(r))
            .catch(() => [] as Proposal[]),
        ),
      );
      setProposals(perCase.flat());
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    id: string,
    action: "approve" | "reject" | "simulate",
    reason?: string,
  ) => {
    setActing(id);
    setError(null);
    try {
      await backend.post(
        `/api/v1/response-proposals/${id}/${action}`,
        action === "simulate" ? undefined : { reason: reason ?? "" },
      );
      await load();
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setActing(null);
    }
  };

  if (isLoading) return <LoadingState message="Loading response proposals…" />;

  const open = proposals.filter((p) =>
    ["PROPOSED", "PENDING", "SIMULATED"].includes((p.status || "").toUpperCase()),
  );
  const decided = proposals.filter((p) => !open.includes(p));

  const renderCard = (proposal: Proposal) => {
    const isOpen = open.includes(proposal);
    const expired = new Date(proposal.expires_at).getTime() < Date.now();
    return (
      <Card key={proposal.id} variant="cyber" className="p-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">
              {proposal.action_type} on {proposal.target_type} {proposal.target_id}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{proposal.reason}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={statusVariant(proposal.status)}>{proposal.status}</Badge>
            <Badge variant={requiresApproval(proposal.authority_level) ? "high" : "neutral"}>
              {proposal.authority_level}{" "}
              {requiresApproval(proposal.authority_level) ? "APPROVAL REQUIRED" : "ADVISORY"}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs font-mono text-slate-500 mb-3">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            recommended by {proposal.recommendation_source}
          </span>
          {proposal.case_id && (
            <button
              className="underline hover:text-cyan-300"
              onClick={() => router.push(`/cases/${proposal.case_id}`)}
            >
              case {cases[proposal.case_id] || proposal.case_id}
            </button>
          )}
          <span>raised {formatTimestamp(proposal.created_at)}</span>
          <span className={expired ? "text-rose-300" : ""}>
            {expired ? "expired" : "expires"} {formatTimestamp(proposal.expires_at)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono mb-3">
          <div>
            <span className="text-slate-500">reversible: </span>
            <span className={proposal.reversible ? "text-slate-200" : "text-rose-300"}>
              {proposal.reversible
                ? `yes, via ${proposal.rollback_action_type || "an unspecified rollback"}`
                : "NO — this cannot be undone"}
            </span>
          </div>
          <div>
            <span className="text-slate-500">residual risk: </span>
            <span className="text-slate-200">
              {proposal.residual_risk || "not stated"}
            </span>
          </div>
        </div>

        {isOpen && !expired && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              isLoading={acting === proposal.id}
              onClick={() => void act(proposal.id, "simulate")}
            >
              <PlayCircle className="w-4 h-4" />
              <span>Simulate</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={acting === proposal.id}
              onClick={() => void act(proposal.id, "approve", "Approved from proposal queue")}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              isLoading={acting === proposal.id}
              onClick={() => void act(proposal.id, "reject", "Rejected from proposal queue")}
            >
              <XCircle className="w-4 h-4" />
              <span>Reject</span>
            </Button>
          </div>
        )}
        {expired && isOpen && (
          <p className="text-xs font-mono text-rose-300">
            This proposal expired before anyone decided on it.
          </p>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Response proposals</h1>
          <p className="text-xs font-mono text-slate-500">
            Proposed containment awaiting a human decision.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()}>
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-mono">
          {error}
        </div>
      )}

      {proposals.length === 0 ? (
        <Card variant="cyber" className="p-6">
          <p className="text-sm text-slate-300">No response proposals exist for this tenant.</p>
        </Card>
      ) : (
        <>
          {open.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider">
                Awaiting decision ({open.length})
              </h2>
              {open.map(renderCard)}
            </div>
          )}
          {decided.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-mono text-slate-500 uppercase tracking-wider">
                Decided ({decided.length})
              </h2>
              {decided.map(renderCard)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
