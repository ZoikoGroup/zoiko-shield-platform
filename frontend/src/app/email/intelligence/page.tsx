"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { EmailWorkspaceHeader } from "@/components/email/EmailSecurityUi";

export default function EmailAiIntelligencePage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ZoikoShieldApiClient.getEmailBehaviourOverview()
      .then((res) => setData(res))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load AI benchmark."),
      );
  }, []);

  const bench = data?.benchmark;

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="BEC / Account Takeover AI Intelligence & Native Benchmark"
        subtitle="Blinded evaluation separating Microsoft/Google native detections from genuine ZoikoShield incremental detections (S03 / T24 / T25)."
        activeHref="/email/intelligence"
      />

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      {bench && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-raised border border-line">
              <div className="font-mono text-slate-400">Evaluated Decisions</div>
              <div className="text-2xl font-black text-slate-100 tabular-nums mt-1">
                {bench.totalEvaluated}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-raised border border-line">
              <div className="font-mono text-slate-400">
                Incremental (Missed by Native)
              </div>
              <div className="text-2xl font-black text-cyan-300 tabular-nums mt-1">
                {bench.incrementalDetectionsMissedByNative}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-raised border border-line">
              <div className="font-mono text-slate-400">Precision / Abstention</div>
              <div className="text-2xl font-black text-slate-100 tabular-nums mt-1">
                {bench.precision === null
                  ? "—"
                  : `${(bench.precision * 100).toFixed(1)}%`}{" "}
                / {(Number(bench.abstentionRate || 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="p-4 rounded-xl bg-raised border border-line">
              <div className="font-mono text-slate-400">FP Review Cost Impact</div>
              <div className="text-2xl font-black text-amber-300 tabular-nums mt-1">
                ${Number(bench.totalFalsePositiveCostUsd || 0).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-raised border border-line space-y-2">
            <div className="font-mono text-slate-300">{bench.methodologyNote}</div>
            <div className="space-y-2 pt-2">
              {(data?.recentDecisions || []).map((d: any) => (
                <div
                  key={d.id}
                  className="p-3 rounded-lg bg-surface border border-line flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-slate-100">
                      Tier: {d.detector_tier} · Native: {d.native_baseline_verdict || "NONE"}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">
                      Adjudicated label: {d.adjudicated_label || "PENDING"} · Abstained:{" "}
                      {String(Boolean(d.abstained))}
                    </div>
                  </div>
                  <Link
                    href={`/email/analyses/${d.id}`}
                    className="text-cyan-400 font-mono font-bold hover:underline"
                  >
                    Review Analysis →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
