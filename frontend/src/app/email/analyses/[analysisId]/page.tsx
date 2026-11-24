"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { EMAIL_COPY } from "@/lib/email-copy";
import { Button } from "@/components/ui/Button";
import {
  EmailErrorNotice,
  EmailLoadingNotice,
  EmailNotice,
  EmailTime,
  EmailWorkspaceHeader,
  classifyEmailError,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

export default function EmailAnalysisDetailPage() {
  const params = useParams<{ analysisId: string }>();
  const analysisId = params?.analysisId || "";

  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<"CONFIRMED" | "BENIGN" | "INSUFFICIENT_EVIDENCE">(
    "CONFIRMED",
  );
  const [rationale, setRationale] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const decisionId = useId();
  const rationaleId = useId();

  const loadAnalysis = useCallback(async () => {
    if (!analysisId) return;
    setLoading(true);
    try {
      const res = await ZoikoShieldApiClient.getEmailAnalysisDetail(analysisId);
      setAnalysis(res);
      return true;
    } catch (err) {
      setAnalysis(null);
      setError(classifyEmailError(err, "Failed to load AI analysis."));
      return false;
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => {
    setError(null);
    loadAnalysis();
  }, [loadAnalysis]);

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analysis) return;
    setError(null);
    setMessage(null);
    try {
      await ZoikoShieldApiClient.decideEmailAnalysis(analysisId, {
        decision,
        rationale,
        expectedVersion: typeof analysis.version === "number" ? analysis.version : 0,
      });
      setMessage(
        `Reviewer decision '${decision}' recorded. No action was executed and the model was not retrained.`,
      );
      await loadAnalysis();
    } catch (err) {
      const classified = classifyEmailError(err, "Failed to submit decision.");
      if (classified.kind === "STALE_VERSION") await loadAnalysis();
      setError(classified);
    }
  };

  const citations: string[] = Array.isArray(analysis?.citation_refs) ? analysis.citation_refs : [];
  const unknowns: string[] = Array.isArray(analysis?.unknowns) ? analysis.unknowns : [];
  const inferences: string[] = Array.isArray(analysis?.inferences) ? analysis.inferences : [];
  const facts: Array<{ ref?: string; detail?: string }> = Array.isArray(analysis?.source_facts)
    ? analysis.source_facts
    : [];

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Guarded AI Email Analysis Review"
        subtitle="Citation-grounded BEC and account-takeover assessment. Email content is untrusted data and never receives tool execution authority (S04 / T23 / E12)."
        activeHref="/email/intelligence"
      />

      {message && <EmailNotice tone="success">{message}</EmailNotice>}
      <EmailErrorNotice
        error={error}
        onRetry={
          error && error.kind !== "DENIED" && error.kind !== "STALE_VERSION" ? loadAnalysis : undefined
        }
      />

      {loading && !analysis && !error && <EmailLoadingNotice label="Loading AI analysis…" />}

      {analysis && (
        <div className="space-y-5 text-xs">
          <div className="p-4 rounded-xl bg-raised border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-mono text-cyan-300 font-bold">
              <Lock className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>
                Tool execution authority: {analysis.toolExecutionAllowed ? "allowed" : "none"} ·
                Model version: {analysis.model_version || "no model used"} · Reviewing version{" "}
                {analysis.version ?? "unknown"}
              </span>
            </div>
            {analysis.abstained && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono font-bold">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>ABSTAIN</span>
              </span>
            )}
          </div>

          {analysis.abstained && <EmailNotice tone="warning">{EMAIL_COPY.AI_UNCERTAIN}</EmailNotice>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="p-5 rounded-xl bg-raised border border-line space-y-2">
              <h2 className="text-sm font-bold text-slate-100">Observed Facts</h2>
              {facts.length === 0 ? (
                <p className="text-slate-400">No verified source facts.</p>
              ) : (
                <ul className="space-y-1 font-mono text-[11px] text-slate-300">
                  {facts.map((f, idx) => (
                    <li key={idx}>
                      <span className="text-cyan-300">{f.ref || "—"}</span>: {f.detail || ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="p-5 rounded-xl bg-raised border border-line space-y-2">
              <h2 className="text-sm font-bold text-slate-100">Inferences, Alternatives &amp; Unknowns</h2>
              <ul className="space-y-1 text-slate-300">
                {inferences.map((i, idx) => (
                  <li key={`i-${idx}`}>Inference: {i}</li>
                ))}
                {analysis.alternative_hypothesis && (
                  <li>Alternative hypothesis: {analysis.alternative_hypothesis}</li>
                )}
                {unknowns.map((u, idx) => (
                  <li key={`u-${idx}`} className="text-amber-200">
                    Unknown: {u}
                  </li>
                ))}
              </ul>
              <div className="font-mono text-[11px] text-slate-400">
                Cited source events: {citations.length ? citations.join(", ") : "none"}
              </div>
            </section>
          </div>

          {analysis.reviewed_at && (
            <p className="font-mono text-[11px] text-slate-400">
              Last reviewed by {analysis.reviewer_id || "unknown"} at{" "}
              <EmailTime iso={analysis.reviewed_at} /> ({analysis.reviewer_outcome || "—"})
            </p>
          )}

          <form
            onSubmit={handleSubmitDecision}
            className="p-5 rounded-xl bg-raised border border-line space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-100">Human Reviewer Disposition</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label htmlFor={decisionId} className="block font-mono text-slate-400">
                  Decision
                </label>
                <select
                  id={decisionId}
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as typeof decision)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
                >
                  <option value="CONFIRMED">Confirmed threat</option>
                  <option value="BENIGN">Benign</option>
                  <option value="INSUFFICIENT_EVIDENCE">Insufficient evidence</option>
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label htmlFor={rationaleId} className="block font-mono text-slate-400">
                  Rationale (optional)
                </label>
                <input
                  id={rationaleId}
                  type="text"
                  placeholder="Reviewer disposition rationale"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
                />
              </div>
              <Button type="submit" variant="cyan" className="self-end">
                Confirm Human Review
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
