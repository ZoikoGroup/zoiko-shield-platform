"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { useEventStream } from "@/lib/use-event-stream";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { FolderLock, Plus, ArrowRight, ShieldCheck, Sparkles, Wifi, WifiOff } from "lucide-react";
import {
  LoadingState,
  StaleState,
  UnavailableState,
  PartialState,
} from "@/components/states/mandatory-ui-states";

export default function CasesListPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);

  const refreshCases = useCallback(async () => {
    setIsLoading(true);
    try {
      await ZoikoShieldApiClient.getCases();
      setIsStale(false);
    } catch {
      setIsStale(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Real-time Event Stream (SSE) Integration
  const { isConnected, isDegraded } = useEventStream({
    tenantId: state.session?.tenantId || "tenant-bank-01",
    onEvent: (event) => {
      if (event.type === "CASE_UPDATED" || event.type === "ALERT_CREATED") {
        refreshCases();
      }
    },
  });

  // Fetch live cases on mount
  useEffect(() => {
    refreshCases();
  }, [refreshCases]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="ai">ERB-01 STEP 7</Badge>
            <span className="text-xs font-mono text-purple-400 font-bold">
              INCIDENT CASES
            </span>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <Wifi className="w-3 h-3" /> SSE LIVE
              </span>
            ) : isDegraded ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950/60 border border-amber-500/40 text-amber-300">
                <WifiOff className="w-3 h-3" /> POLLING DEGRADED
              </span>
            ) : null}
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Incident Workspace Directory
          </h1>
          <p className="text-sm text-slate-400">
            Cryptographically anchored investigation cases bound to immutable evidence ledgers.
          </p>
        </div>
      </div>

      {/* Mandatory UI States */}
      {isLoading && (
        <LoadingState
          title="Loading Incident Cases..."
          message="Querying authenticated cases bound to Evidence Ledgers."
          regionalCell="us-east-1"
        />
      )}

      {isStale && !isLoading && (
        <StaleState
          title="Cached Cases Directory"
          message="Displaying cached incident workspaces from local state store."
          retryAction={refreshCases}
        />
      )}

      <div className="space-y-3">
        {state.cases.length === 0 && !isLoading ? (
          <UnavailableState
            title="No Open Cases"
            message="No incident cases currently open. Promote a detection alert to open a workspace."
            retryAction={() => router.push("/alerts")}
          />
        ) : (
          state.cases.map((c, idx) => (
            <Link key={c.id || idx} href={`/cases/${c.id}`} className="block group">
              <Card
                variant="cyber"
                className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-cyan-500/50 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={c.severity === "CRITICAL" ? "critical" : "high"}>
                      {c.severity}
                    </Badge>
                    <h3 className="font-semibold text-slate-100 text-base group-hover:text-cyan-300 transition-colors">
                      {c.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                    <span>Case ID: {c.id}</span>
                    <span>•</span>
                    <span>Owner: {c.ownerName}</span>
                    <span>•</span>
                    <span>Created: {formatTimestamp(c.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                      {c.evidenceList.length} Evidence Items
                    </span>
                    {c.aiSummary && <Badge variant="ai">AI Analysis Attached</Badge>}
                    {c.simulationReceipt && (
                      <Badge variant="simulated">SOAR Simulated</Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <Button size="sm" variant="cyan">
                    <span>Open Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
