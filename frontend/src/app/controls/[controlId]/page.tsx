"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { backend, asList, BackendError } from "@/lib/backend";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LoadingState, UnavailableState } from "@/components/states/mandatory-ui-states";

/**
 * W22 — Control detail.
 *
 * /controls listed the library; a control could not be opened. So its
 * implementation, owner and evidence state were unreachable, and the only
 * thing visible about a control was its name.
 *
 * The contract is explicit that there is no green without COMPLETE. A control
 * whose evidence is PARTIAL, MISSING or simply never assessed is not passing,
 * and this page will not render it as though it were.
 */

type ControlObjective = {
  id: string;
  code?: string;
  title?: string;
  name?: string;
  description?: string | null;
  framework?: string | null;
  category?: string | null;
};

type ControlImplementation = {
  id: string;
  control_objective_id: string;
  status?: string;
  owner_id?: string | null;
  implementation_notes?: string | null;
  completeness_state?: string;
  created_at?: string;
};

function completenessVariant(state: string | undefined) {
  switch ((state || "UNKNOWN").toUpperCase()) {
    case "COMPLETE":
      return "pass" as const;
    case "PARTIAL":
      return "medium" as const;
    case "MISSING":
      return "fail" as const;
    default:
      return "pending" as const;
  }
}

export default function ControlDetailPage() {
  const router = useRouter();
  const params = useParams<{ controlId: string }>();
  const controlId = params?.controlId;

  const [control, setControl] = useState<ControlObjective | null>(null);
  const [implementations, setImplementations] = useState<ControlImplementation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!controlId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [objective, impls] = await Promise.all([
        backend.get<ControlObjective>(`/api/v1/controls/${controlId}`),
        backend.get("/api/v1/control-implementations").catch(() => []),
      ]);
      setControl(objective);
      setImplementations(
        asList<ControlImplementation>(impls).filter(
          (i) => i.control_objective_id === controlId,
        ),
      );
    } catch (err) {
      setError(err instanceof BackendError ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [controlId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) return <LoadingState message="Loading control…" />;

  if (error || !control) {
    return (
      <div className="space-y-4 p-6">
        <UnavailableState message={error || "Control is unavailable."} />
        <Button variant="secondary" onClick={() => void load()}>
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => router.push("/controls")}>
          <ArrowLeft className="w-4 h-4" />
          <span>Control library</span>
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            {control.title || control.name || control.code || controlId}
          </h1>
          <p className="text-xs font-mono text-slate-500">
            {control.code ? `${control.code} · ` : ""}
            {control.framework || "no framework recorded"}
          </p>
        </div>
      </div>

      {control.description && (
        <Card variant="cyber" className="p-4">
          <p className="text-sm text-slate-300">{control.description}</p>
        </Card>
      )}

      <Card variant="cyber" className="p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Implementation</h2>
        {implementations.length === 0 ? (
          <>
            <p className="text-sm text-amber-300">
              This control has no implementation recorded for this tenant.
            </p>
            <p className="text-xs font-mono text-slate-400 mt-1">
              An objective with no implementation is not satisfied — nothing has
              been claimed for it, let alone evidenced.
            </p>
          </>
        ) : (
          <div className="space-y-3">
            {implementations.map((impl) => (
              <div key={impl.id} className="border border-slate-800 rounded-lg p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs font-mono text-slate-400 break-all">
                    {impl.id}
                  </span>
                  <div className="flex items-center gap-2">
                    {impl.status && <Badge variant="neutral">{impl.status}</Badge>}
                    <Badge variant={completenessVariant(impl.completeness_state)}>
                      evidence {impl.completeness_state || "UNKNOWN"}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono text-slate-400">
                  <span>owner: {impl.owner_id || "unassigned"}</span>
                  <span>
                    {impl.created_at ? `recorded ${impl.created_at}` : "no date recorded"}
                  </span>
                </div>
                {impl.implementation_notes && (
                  <p className="text-xs text-slate-300 mt-2">{impl.implementation_notes}</p>
                )}
                {(impl.completeness_state || "UNKNOWN").toUpperCase() !== "COMPLETE" && (
                  <p className="text-xs font-mono text-amber-300 mt-2">
                    Not passing. The spec requires COMPLETE evidence before a
                    control reads as satisfied.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
