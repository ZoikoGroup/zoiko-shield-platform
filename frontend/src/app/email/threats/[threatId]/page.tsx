"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink, FolderPlus, Lock, Sparkles } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailThreatFindingRecord } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  EmailWorkspaceHeader,
  ProviderBadge,
} from "@/components/email/EmailSecurityUi";

export default function EmailThreatDetailPage() {
  const params = useParams<{ threatId: string }>();
  const threatId = params?.threatId || "";

  const [detail, setDetail] = useState<EmailThreatFindingRecord | null>(null);
  const [decision, setDecision] = useState<
    "CONFIRMED" | "BENIGN" | "FALSE_POSITIVE" | "INSUFFICIENT_EVIDENCE"
  >("CONFIRMED");
  const [rationale, setRationale] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDetail = useCallback(async () => {
    if (!threatId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.getEmailThreatDetail(threatId);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load threat detail.");
    } finally {
      setLoading(false);
    }
  }, [threatId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handlePromoteToCase = async () => {
    setError(null);
    setMessage(null);
    try {
      const res = await ZoikoShieldApiClient.promoteEmailThreatToCase(threatId, {});
      setMessage(`Linked to ZoikoShield Case ${res?.caseId}`);
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote threat to case.");
    }
  };

  const handleEvaluateAi = async () => {
    setError(null);
    setMessage(null);
    try {
      const res = await ZoikoShieldApiClient.evaluateEmailThreatWithAi(threatId, {
        lookalikeDomainDetected: detail?.threat_class === "BEC",
        authMisalignment: true,
      });
      setMessage(
        `AI evaluation recorded (Tier: ${res?.decision?.detector_tier || "DETERMINISTIC"}, Abstained: ${String(Boolean(res?.decision?.abstained))})`,
      );
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI evaluation failed.");
    }
  };

  const handleAdjudicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rationale.trim()) return;
    setError(null);
    setMessage(null);
    try {
      await ZoikoShieldApiClient.recordEmailAdjudication(threatId, {
        decision,
        rationale: rationale.trim(),
        idempotencyKey: `adj-${threatId}-${decision}`,
      });
      setMessage(`Recorded adjudication '${decision}'.`);
      setRationale("");
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save adjudication.");
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Threat Investigation Detail"
        subtitle="Strict separation between verified provider source facts and guarded AI inferences. Promotion delegates directly to ZoikoShield Case Management."
        activeHref="/email/threats"
        actions={
          <>
            <Button variant="secondary" onClick={handleEvaluateAi} disabled={!detail}>
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Run 3-Stage AI Evaluation</span>
            </Button>
            {detail?.case_id ? (
              <Link
                href={`/cases/${detail.case_id}`}
                className="min-h-[40px] inline-flex items-center px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold"
              >
                Open Linked Case ({detail.case_id}) →
              </Link>
            ) : (
              <Button variant="cyan" onClick={handlePromoteToCase} disabled={!detail}>
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Promote to Case</span>
              </Button>
            )}
          </>
        }
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

      {loading && !detail ? (
        <div className="p-8 rounded-xl bg-raised border border-line text-center text-xs text-slate-400">
          Loading finding telemetry...
        </div>
      ) : (
        detail && (
          <div className="space-y-6 text-xs">
            {detail.roleScopedRedacted && (
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  Sensitive subject and metadata fields are masked under SECURITY_AUDITOR least-privilege policy (E06).
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="p-5 rounded-xl bg-raised border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-100">
                    Verified Source Facts
                  </h2>
                  <ProviderBadge provider={detail.provider} />
                </div>
                <dl className="grid grid-cols-2 gap-2 font-mono text-[11px] bg-surface p-3 rounded-lg border border-line">
                  <div>
                    <dt className="text-slate-500">Threat Class</dt>
                    <dd className="text-slate-100 font-bold">{detail.threat_class}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Provider Verdict</dt>
                    <dd className="text-cyan-300 font-bold">{detail.provider_verdict}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Severity / Status</dt>
                    <dd className="text-slate-200">
                      {detail.severity} · {detail.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Observed At</dt>
                    <dd className="text-slate-200">{formatTimestamp(detail.observed_at)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Pseudonymized Subject Ref</dt>
                    <dd className="text-slate-100 break-all">{detail.subject_ref}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Source Event Reference</dt>
                    <dd className="text-slate-300">{detail.source_event_ref}</dd>
                  </div>
                </dl>
                {detail.deep_link_url && (
                  <a
                    href={detail.deep_link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-cyan-400 hover:underline font-mono"
                  >
                    <span>Open Provider Console Evidence</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </section>

              <section className="p-5 rounded-xl bg-raised border border-line space-y-3">
                <h2 className="text-sm font-bold text-slate-100">
                  AI Inferences &amp; Uncertainty (Non-Authoritative)
                </h2>
                {!detail.detectionDecisions?.length ? (
                  <div className="p-4 rounded-lg bg-surface border border-line text-slate-400">
                    No AI evaluation has been generated for this finding yet.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {detail.detectionDecisions.map((d: any) => (
                      <li
                        key={d.id}
                        className="p-3 rounded-lg bg-surface border border-line space-y-1.5"
                      >
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-bold text-cyan-300">
                            {d.detector_tier} ({d.detector_version})
                          </span>
                          <span
                            className={
                              d.abstained ? "text-amber-300 font-bold" : "text-slate-300"
                            }
                          >
                            {d.abstained
                              ? "ABSTAINED (Insufficient Evidence)"
                              : `Confidence ${(Number(d.confidence_score || 0) * 100).toFixed(0)}%`}
                          </span>
                        </div>
                        {d.alternative_hypothesis && (
                          <div className="text-slate-400">
                            Alternative hypothesis: {d.alternative_hypothesis}
                          </div>
                        )}
                        <Link
                          href={`/email/analyses/${d.id}`}
                          className="text-cyan-400 hover:underline font-mono inline-block"
                        >
                          Inspect Full AI Decision →
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <form
              onSubmit={handleAdjudicate}
              className="p-5 rounded-xl bg-raised border border-line space-y-3"
            >
              <h2 className="text-sm font-bold text-slate-100">
                Record Analyst Adjudication
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select
                  aria-label="Adjudication verdict"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as any)}
                  className="px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
                >
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="BENIGN">BENIGN</option>
                  <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
                  <option value="INSUFFICIENT_EVIDENCE">INSUFFICIENT_EVIDENCE</option>
                </select>
                <input
                  type="text"
                  required
                  placeholder="Document verified evidence supporting disposition..."
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  className="md:col-span-2 px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
                />
                <Button type="submit" variant="primary">
                  Save Adjudication
                </Button>
              </div>
            </form>
          </div>
        )
      )}
    </div>
  );
}
