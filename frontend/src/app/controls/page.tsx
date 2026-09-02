"use client";

import React, { useState } from "react";
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
} from "lucide-react";

export default function ControlsPage() {
  const router = useRouter();
  const [state] = useDemoState();
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
          <Button variant="cyan" onClick={handleEvaluateAll}>
            <Play className="w-3.5 h-3.5" />
            <span>Evaluate All Controls</span>
          </Button>
          <Button variant="primary" onClick={() => router.push("/audit")}>
            <span>Proceed to Audit Package</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {state.controlTests.map((ctrl, idx) => (
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
        ))}
      </div>
    </div>
  );
}
