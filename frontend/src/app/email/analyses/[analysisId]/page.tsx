"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { EmailWorkspaceHeader } from "@/components/email/EmailSecurityUi";

export default function EmailAnalysisDetailPage() {
  const params = useParams<{ analysisId: string }>();
  const analysisId = params?.analysisId || "";

  const [analysis, setAnalysis] = useState<any>(null);
  const [decision, setDecision] = useState<
    "CONFIRMED" | "BENIGN" | "INSUFFICIENT_EVIDENCE"
  >("CONFIRMED");
  const [rationale, setRationale] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAnalysis = useCallback(async () => {
    if (!analysisId) return;
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.getEmailAnalysisDetail(analysisId);
      setAnalysis(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI analysis.");
    }
  }, [analysisId]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await ZoikoShieldApiClient.decideEmailAnalysis(analysisId, {
        decision,
        rationale,
      });
      setMessage(`Human reviewer decision '${decision}' recorded cleanly.`);
      await loadAnalysis();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit decision.");
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Guarded AI Email Analysis Review"
        subtitle="Citation-grounded BEC & Account Takeover assessment. Untrusted email content never receives tool execution authority (S04 / T23 / E12)."
        activeHref="/email/intelligence"
      />

      {message && (
        <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-5 text-xs">
          <div className="p-4 rounded-xl bg-raised border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-mono text-cyan-300 font-bold">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>
                Tool Execution Authority: {String(Boolean(analysis.toolExecutionAllowed))} · Untrusted Prompt Firewall: Active
              </span>
            </div>
            {analysis.abstained && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>ABSTAIN (Evidence Insufficient)</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="p-5 rounded-xl bg-raised border border-line space-y-2">
              <h2 className="text-sm font-bold text-slate-100">Source Facts</h2>
              <pre className="text-[11px] font-mono text-slate-300 bg-surface p-3 rounded-lg overflow-auto">
                {JSON.stringify(analysis.source_facts || [], null, 2)}
              </pre>
            </section>
            <section className="p-5 rounded-xl bg-raised border border-line space-y-2">
              <h2 className="text-sm font-bold text-slate-100">
                Inferences &amp; Unknowns
              </h2>
              <pre className="text-[11px] font-mono text-slate-300 bg-surface p-3 rounded-lg overflow-auto">
                {JSON.stringify(
                  {
                    inferences: analysis.inferences,
                    alternativeHypothesis: analysis.alternative_hypothesis,
                    unknowns: analysis.unknowns,
                    citations: analysis.citation_refs,
                  },
                  null,
                  2,
                )}
              </pre>
            </section>
          </div>

          <form
            onSubmit={handleSubmitDecision}
            className="p-5 rounded-xl bg-raised border border-line space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-100">
              Human Reviewer Disposition
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value as any)}
                className="px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
              >
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="BENIGN">BENIGN</option>
                <option value="INSUFFICIENT_EVIDENCE">INSUFFICIENT_EVIDENCE</option>
              </select>
              <input
                type="text"
                placeholder="Reviewer disposition rationale..."
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                className="md:col-span-2 px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
              />
              <Button type="submit" variant="cyan">
                Confirm Human Review
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
