"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  CheckSquare,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import {
  LoadingState,
  StaleState,
  DegradedState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";

export default function ControlsPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    ZoikoShieldApiClient.getControlTests()
      .catch(() => {
        setIsStale(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const refreshControls = async () => {
    setIsLoading(true);
    try {
      await ZoikoShieldApiClient.getControlTests();
      setIsStale(false);
    } catch {
      setIsStale(true);
    } finally {
      setIsLoading(false);
    }
  };

  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);

  const handleEvaluate = async (controlId: string) => {
    setEvaluatingId(controlId);
    try {
      await ZoikoShieldApiClient.evaluateControl(controlId);
    } catch (err) {
      console.error("Evaluate Control Error:", err);
    } finally {
      setEvaluatingId(null);
    }
  };

  const handleEvaluateAll = async () => {
    for (const ctrl of state.controlTests) {
      await handleEvaluate(ctrl.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="pass">ERB-01 STEP 10</Badge>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              CONTINUOUS COMPLIANCE
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Continuous Security Controls Matrix
          </h1>
          <p className="text-sm text-slate-400">
            Real-time automated control evaluation across `SOC2_TYPE2`, `ISO27001_2022`, `DORA`, `NIS2`, and `HIPAA` frameworks on shield-ingest (:3002).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="cyan" onClick={() => handleEvaluateAll()}>
            <Play className="w-3.5 h-3.5" />
            <span>Evaluate All Controls</span>
          </Button>
          <Button variant="primary" onClick={() => router.push("/audit")}>
            <span>Proceed to Audit Package</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Mandatory UI States */}
      {isLoading && (
        <LoadingState
          title="Loading Security Controls Matrix..."
          message="Evaluating automated compliance controls on shield-ingest (:3002)."
          regionalCell="us-east-1"
        />
      )}

      {isStale && !isLoading && (
        <StaleState
          title="Cached Compliance Controls View"
          message="Showing latest verified control evaluation snapshot."
          retryAction={refreshControls}
        />
      )}

      {/* Evidence Freshness Summary Stats */}
      {(() => {
        let freshCount = 0;
        let agingCount = 0;
        let staleCount = 0;
        state.controlTests.forEach((ctrl) => {
          const evalTimestamp = ctrl.lastEvaluatedAt ? new Date(ctrl.lastEvaluatedAt).getTime() : Date.now();
          const ageHours = Math.max(0, Math.floor((Date.now() - evalTimestamp) / (1000 * 60 * 60)));
          if (ageHours < 24) freshCount++;
          else if (ageHours <= 72) agingCount++;
          else staleCount++;
        });

        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">FRESH EVIDENCE (&lt;24H)</span>
                <p className="text-xl font-black text-slate-100 font-mono">{freshCount} Controls</p>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">AGING EVIDENCE (24–72H)</span>
                <p className="text-xl font-black text-slate-100 font-mono">{agingCount} Controls</p>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-rose-500/30 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono text-rose-400 font-bold uppercase tracking-wider">STALE EVIDENCE (&gt;72H SLA)</span>
                <p className="text-xl font-black text-slate-100 font-mono">{staleCount} Controls</p>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            </div>
          </div>
        );
      })()}

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {state.controlTests.map((ctrl, idx) => {
          const evalTimestamp = ctrl.lastEvaluatedAt ? new Date(ctrl.lastEvaluatedAt).getTime() : Date.now();
          const ageHours = Math.max(0, Math.floor((Date.now() - evalTimestamp) / (1000 * 60 * 60)));
          const freshnessTag =
            ageHours < 24
              ? { text: `FRESH (${ageHours}h ago)`, color: "text-emerald-400 bg-emerald-950/60 border-emerald-500/30" }
              : ageHours <= 72
                ? { text: `AGING (${ageHours}h ago)`, color: "text-amber-400 bg-amber-950/60 border-amber-500/30" }
                : { text: `STALE (${ageHours}h ago)`, color: "text-rose-400 bg-rose-950/60 border-rose-500/30" };

          return (
            <Card key={ctrl.id || idx} variant="cyber" className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-cyan-400">
                      {ctrl.controlId}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {ctrl.framework}
                    </span>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded border font-semibold ${freshnessTag.color}`}>
                      {freshnessTag.text}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-slate-100">
                    {ctrl.controlName}
                  </h3>
                </div>
                <Badge variant={ctrl.result === "PASS" ? "pass" : "fail"}>
                  {ctrl.result}
                </Badge>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5 font-mono text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">EVALUATED EVENTS:</span>
                  <span className="text-cyan-300">{ctrl.evaluatedEventsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">LAST EVALUATION:</span>
                  <span className="text-slate-400">{formatTimestamp(ctrl.lastEvaluatedAt)}</span>
                </div>
                {ctrl.evidenceSampleHash && (
                  <div className="flex justify-between pt-1 border-t border-slate-900">
                    <span className="text-slate-500">EVIDENCE SAMPLE HASH:</span>
                    <span className="text-emerald-400">
                      {truncateHash(ctrl.evidenceSampleHash, 8, 6)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono text-slate-500">
                  Status: Continuous Monitoring Active
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEvaluate(ctrl.id)}
                  isLoading={evaluatingId === ctrl.id}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-Evaluate</span>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
