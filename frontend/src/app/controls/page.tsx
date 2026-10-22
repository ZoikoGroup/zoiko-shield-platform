"use client";

import React, { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { ControlTest } from "@/lib/types";
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
  const [controlTests, setControlTests] = useState<ControlTest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await ZoikoShieldApiClient.getControlTests();
      setControlTests(data);
      setIsStale(false);
    } catch {
      setIsStale(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshControls = () => load();

  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);

  const handleEvaluate = async (controlId: string) => {
    setEvaluatingId(controlId);
    try {
      const updated = await ZoikoShieldApiClient.evaluateControl(controlId);
      setControlTests((prev) =>
        prev.map((c) =>
          c.id === controlId || c.controlId === controlId ? updated : c,
        ),
      );
    } catch (err) {
      console.error("Evaluate Control Error:", err);
      setIsStale(true);
    } finally {
      setEvaluatingId(null);
    }
  };

  const handleEvaluateAll = async () => {
    for (const ctrl of controlTests) {
      await handleEvaluate(ctrl.id);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="surface-card rounded-2xl p-6 border border-slate-800/80 bg-gradient-to-b from-raised to-canvas shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="pass" className="text-[10px] font-mono">ERB-01 STEP 10</Badge>
              <span className="text-xs font-mono text-cyan-400 font-bold tracking-wider">
                CONTINUOUS COMPLIANCE
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Continuous Security Controls Matrix
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
              Real-time automated control evaluation across certified SOC 2 Type II and ISO 27001:2022 frameworks on shield-ingest (:3002). Sector overlays (DORA, NIS2) deferred to Phase 2 midpoint per ADR-08.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="cyan"
              onClick={() => handleEvaluateAll()}
              className="shadow-[0_0_15px_rgba(0,240,255,0.25)]"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Evaluate All Controls</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/sector-packs")}
              className="border-purple-500/40 hover:border-purple-400 text-purple-300 hover:bg-purple-950/30"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>Sector Overlays (DORA / NIS2)</span>
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push("/audit")}
              className="shadow-[0_0_15px_rgba(59,130,246,0.25)]"
            >
              <span>Proceed to Audit Package</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/pricing")}
              className="border-slate-800 hover:border-cyan-500/40 text-slate-300"
            >
              <span>Commercial Sizing (Step 14)</span>
              <ArrowRight className="w-4 h-4 text-cyan-400" />
            </Button>
          </div>
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
        controlTests.forEach((ctrl) => {
          const evalTimestamp = ctrl.lastEvaluatedAt ? new Date(ctrl.lastEvaluatedAt).getTime() : Date.now();
          const ageHours = Math.max(0, Math.floor((Date.now() - evalTimestamp) / (1000 * 60 * 60)));
          if (ageHours < 24) freshCount++;
          else if (ageHours <= 72) agingCount++;
          else staleCount++;
        });

        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-gradient-to-b from-raised to-canvas border border-emerald-500/30 flex items-center justify-between shadow-lg">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">FRESH EVIDENCE (&lt;24H)</span>
                <p className="text-2xl font-black text-white font-mono">{freshCount} Controls</p>
              </div>
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-b from-raised to-canvas border border-amber-500/30 flex items-center justify-between shadow-lg">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">AGING EVIDENCE (24–72H)</span>
                <p className="text-2xl font-black text-white font-mono">{agingCount} Controls</p>
              </div>
              <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.6)]" />
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-b from-raised to-canvas border border-rose-500/30 flex items-center justify-between shadow-lg">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-rose-400 font-bold uppercase tracking-wider">STALE EVIDENCE (&gt;72H SLA)</span>
                <p className="text-2xl font-black text-white font-mono">{staleCount} Controls</p>
              </div>
              <span className="w-3 h-3 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.6)]" />
            </div>
          </div>
        );
      })()}

      {/* Controls Grid */}
      {!isLoading && controlTests.length === 0 ? (
        <Card variant="cyber" className="p-8 text-center bg-gradient-to-b from-raised to-canvas">
          <p className="text-sm text-slate-300">
            No controls have been evaluated for this tenant yet.
          </p>
        </Card>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {controlTests.map((ctrl, idx) => {
          const evalTimestamp = ctrl.lastEvaluatedAt ? new Date(ctrl.lastEvaluatedAt).getTime() : Date.now();
          const ageHours = Math.max(0, Math.floor((Date.now() - evalTimestamp) / (1000 * 60 * 60)));
          const freshnessTag =
            ageHours < 24
              ? { text: `FRESH (${ageHours}h ago)`, color: "text-emerald-400 bg-emerald-950/60 border-emerald-500/30" }
              : ageHours <= 72
                ? { text: `AGING (${ageHours}h ago)`, color: "text-amber-400 bg-amber-950/60 border-amber-500/30" }
                : { text: `STALE (${ageHours}h ago)`, color: "text-rose-400 bg-rose-950/60 border-rose-500/30" };

          return (
            <Card key={ctrl.id || idx} variant="cyber" className="space-y-4 bg-gradient-to-b from-raised to-canvas hover:border-cyan-500/40 transition-all p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-cyan-400">
                      {ctrl.controlId}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                      {ctrl.framework}
                    </span>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded border font-semibold ${freshnessTag.color}`}>
                      {freshnessTag.text}
                    </span>
                  </div>
                  <button
                    className="font-bold text-sm text-white text-left hover:text-cyan-300 underline-offset-2 hover:underline transition-colors block"
                    onClick={() => router.push(`/controls/${ctrl.id || ctrl.controlId}`)}
                  >
                    {ctrl.controlName}
                  </button>
                </div>
                <Badge
                  variant={
                    ctrl.result === "PASS"
                      ? "pass"
                      : ctrl.result === "PENDING"
                        ? "pending"
                        : "fail"
                  }
                  className="font-mono text-[10px]"
                >
                  {ctrl.result}
                </Badge>
              </div>

              <div className="p-3.5 rounded-xl bg-canvas border border-slate-800/80 space-y-2 font-mono text-xs text-slate-300">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-[11px]">EVALUATED EVENTS:</span>
                  <span className="text-cyan-300 font-semibold">{ctrl.evaluatedEventsCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-[11px]">LAST EVALUATION:</span>
                  <span className="text-slate-400">{formatTimestamp(ctrl.lastEvaluatedAt)}</span>
                </div>
                {ctrl.evidenceSampleHash && (
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-900">
                    <span className="text-slate-500 text-[11px]">EVIDENCE SAMPLE HASH:</span>
                    <span className="text-emerald-400 truncate max-w-[180px]">
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
                  className="border-slate-800 hover:border-cyan-500/40 text-slate-300"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Re-Evaluate</span>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}
