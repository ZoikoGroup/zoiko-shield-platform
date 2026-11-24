"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { EMAIL_COPY } from "@/lib/email-copy";
import {
  EmailErrorNotice,
  EmailLoadingNotice,
  EmailNotice,
  EmailWorkspaceHeader,
  classifyEmailError,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

/** Backend sends a 95% Wilson interval as `precisionCi95 {point, lower, upper, n}` (E11 / S03). */
function formatInterval(ci: unknown): string | null {
  if (!ci || typeof ci !== "object") return null;
  const { lower, upper, n } = ci as { lower?: number | null; upper?: number | null; n?: number };
  if (typeof lower !== "number" || typeof upper !== "number") return null;
  const denom = typeof n === "number" ? ` (n = ${n})` : "";
  return `95% CI ${(lower * 100).toFixed(1)}%–${(upper * 100).toFixed(1)}%${denom}`;
}

export default function EmailAiIntelligencePage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await ZoikoShieldApiClient.getEmailBehaviourOverview());
    } catch (err) {
      setError(classifyEmailError(err, "Failed to load AI benchmark."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bench = data?.benchmark;
  const precisionCi = formatInterval(bench?.precisionCi95);

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="BEC / Account Takeover AI Intelligence & Native Benchmark"
        subtitle="Blinded evaluation separating Microsoft/Google native detections from genuine ZoikoShield incremental detections (S03 / T24 / T25)."
        activeHref="/email/intelligence"
      />

      <EmailErrorNotice error={error} onRetry={error?.kind === "DENIED" ? undefined : load} />
      {loading && !data && !error && <EmailLoadingNotice label="Loading detector benchmark…" />}

      <p className="text-[11px] text-slate-400">
        Supplemental, explainable detection — not a generic AI risk score. No automated inbox
        change is made from these results.
      </p>

      {bench && Number(bench.totalEvaluated || 0) === 0 && (
        <EmailNotice tone="info">
          No adjudicated decisions yet, so precision and incremental value cannot be computed.
        </EmailNotice>
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
                {bench.precision === null || bench.precision === undefined
                  ? "—"
                  : `${(bench.precision * 100).toFixed(1)}%`}{" "}
                / {(Number(bench.abstentionRate || 0) * 100).toFixed(1)}%
              </div>
              <div className="font-mono text-[11px] text-slate-400 mt-1">
                {precisionCi || "Confidence interval not reported"}
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
                      Adjudicated label: {d.adjudicated_label || "PENDING"} ·{" "}
                      {d.abstained ? "Abstained" : "Not abstained"}
                    </div>
                    {d.abstained && (
                      <div className="text-[11px] text-amber-200">{EMAIL_COPY.AI_UNCERTAIN}</div>
                    )}
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
