"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink, FolderPlus, Lock, Sparkles } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailThreatFindingRecord, EmailThreatProvenance } from "@/lib/types";
import { EMAIL_COPY } from "@/lib/email-copy";
import { Button } from "@/components/ui/Button";
import {
  EmailErrorNotice,
  EmailLoadingNotice,
  EmailNotice,
  EmailTime,
  EmailWorkspaceHeader,
  ProtectionStateBadge,
  ProviderBadge,
  classifyEmailError,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

const TIMELINE_LABEL: Record<string, string> = {
  SOURCE_OBSERVED: "Source observation",
  INGESTED: "ZoikoShield ingest",
  CASE_OPENED: "Case opened",
  ANALYST_DECISION: "Analyst decision",
  EVIDENCE_COMMITTED: "Evidence commitment",
};

export default function EmailThreatDetailPage() {
  const params = useParams<{ threatId: string }>();
  const threatId = params?.threatId || "";

  const [detail, setDetail] = useState<EmailThreatFindingRecord | null>(null);
  const [provenance, setProvenance] = useState<EmailThreatProvenance | null>(null);
  const [provenanceError, setProvenanceError] = useState<ClassifiedEmailError | null>(null);
  const [decision, setDecision] = useState<
    "CONFIRMED" | "BENIGN" | "FALSE_POSITIVE" | "INSUFFICIENT_EVIDENCE"
  >("CONFIRMED");
  const [rationale, setRationale] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const [loading, setLoading] = useState(true);
  const verdictId = useId();
  const rationaleId = useId();

  const loadDetail = useCallback(async () => {
    if (!threatId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ZoikoShieldApiClient.getEmailThreatDetail(threatId);
      setDetail(res);
    } catch (err) {
      setDetail(null);
      setError(classifyEmailError(err, "Failed to load threat detail."));
    } finally {
      setLoading(false);
    }
    try {
      setProvenance(await ZoikoShieldApiClient.getEmailThreatProvenance(threatId));
      setProvenanceError(null);
    } catch (err) {
      setProvenance(null);
      setProvenanceError(classifyEmailError(err, "Provenance is unavailable."));
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
      setError(classifyEmailError(err, "Failed to promote threat to case."));
    }
  };

  const handleEvaluateAi = async () => {
    setError(null);
    setMessage(null);
    try {
      const res = await ZoikoShieldApiClient.evaluateEmailThreatWithAi(threatId, {});
      const abstained = Boolean(res?.decision?.abstained);
      setMessage(
        abstained
          ? EMAIL_COPY.AI_UNCERTAIN
          : `AI suggestion recorded (tier: ${res?.decision?.detector_tier || "DETERMINISTIC"}). It is advisory only; an analyst decides the outcome.`,
      );
      await loadDetail();
    } catch (err) {
      setError(classifyEmailError(err, "AI evaluation failed."));
    }
  };

  const handleAdjudicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rationale.trim() || !detail) return;
    setError(null);
    setMessage(null);
    try {
      await ZoikoShieldApiClient.recordEmailAdjudication(threatId, {
        decision,
        rationale: rationale.trim(),
        // Stable for retries of the same decision on the same version, so a
        // double submit cannot record two adjudications.
        idempotencyKey: `adj-${threatId}-v${detail.version ?? 0}-${decision}`,
        expectedVersion: typeof detail.version === "number" ? detail.version : 0,
      });
      setMessage(
        `Recorded adjudication '${decision}'. The customer mailbox was not changed.`,
      );
      setRationale("");
      await loadDetail();
    } catch (err) {
      const classified = classifyEmailError(err, "Failed to save adjudication.");
      setError(classified);
      if (classified.kind === "STALE_VERSION") {
        // Keep the analyst's typed rationale; reload the record they must re-review.
        await loadDetail();
        setError(classified);
      }
    }
  };

  const abstainedDecision = detail?.detectionDecisions?.some((d: any) => d?.abstained);

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Threat Investigation Detail"
        subtitle="What was observed, what was not observed, and where each fact came from. Message bodies are never displayed in Phase 0."
        activeHref="/email/threats"
        actions={
          <>
            <Button variant="secondary" onClick={handleEvaluateAi} disabled={!detail}>
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>Request AI Suggestion</span>
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
                <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Promote to Case</span>
              </Button>
            )}
          </>
        }
      />

      {message && <EmailNotice tone="success">{message}</EmailNotice>}
      <EmailErrorNotice
        error={error}
        onRetry={error?.kind === "DENIED" || error?.kind === "STALE_VERSION" ? undefined : loadDetail}
      />

      {loading && !detail && !error ? (
        <EmailLoadingNotice label="Loading finding telemetry…" />
      ) : (
        detail && (
          <div className="space-y-6 text-xs">
            {detail.roleScopedRedacted && (
              <EmailNotice tone="warning">
                <span className="inline-flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  Sensitive subject and metadata fields are masked for your role (E06).
                </span>
              </EmailNotice>
            )}

            {detail.coverage_state && detail.coverage_state !== "COMPLETE" && (
              <EmailNotice tone="warning" title="Coverage exception">
                {EMAIL_COPY.SOURCE_LAG}
              </EmailNotice>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="p-5 rounded-xl bg-raised border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-100">Verified Source Facts</h2>
                  <ProviderBadge provider={detail.provider} />
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] bg-surface p-3 rounded-lg border border-line">
                  <div>
                    <dt className="text-slate-400">Threat class</dt>
                    <dd className="text-slate-100 font-bold">{detail.threat_class}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Provider verdict</dt>
                    <dd className="text-cyan-300 font-bold">{detail.provider_verdict}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Severity / status</dt>
                    <dd className="text-slate-200">
                      {detail.severity} · {detail.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Observed at</dt>
                    <dd className="text-slate-200">
                      <EmailTime iso={detail.observed_at} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Ingested at</dt>
                    <dd className="text-slate-200">
                      <EmailTime iso={detail.ingested_at} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Policy version</dt>
                    <dd className="text-slate-200">{detail.policy_version || "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-400">Pseudonymized subject ref</dt>
                    <dd className="text-slate-100 break-all">{detail.subject_ref}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-400">Source event reference</dt>
                    <dd className="text-slate-300 break-all">{detail.source_event_ref}</dd>
                  </div>
                </dl>
                {detail.deep_link_url && (
                  <a
                    href={detail.deep_link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-cyan-400 hover:underline font-mono"
                  >
                    <span>Open provider console evidence</span>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                )}
              </section>

              <section
                aria-label="Provenance"
                className="p-5 rounded-xl bg-raised border border-line space-y-3"
              >
                <h2 className="text-sm font-bold text-slate-100">Provenance &amp; Freshness</h2>
                <EmailErrorNotice error={provenanceError} />
                {!provenance && !provenanceError && (
                  <EmailLoadingNotice label="Loading provenance…" />
                )}
                {provenance && (
                  <>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] bg-surface p-3 rounded-lg border border-line">
                      <div>
                        <dt className="text-slate-400">Source permission tier</dt>
                        <dd className="text-slate-200">{provenance.sourcePermissionTier}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Detection policy</dt>
                        <dd className="text-slate-200">
                          {provenance.policyId || "—"} · {provenance.policyVersion}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Last sync</dt>
                        <dd className="text-slate-200">
                          <EmailTime iso={provenance.dataFreshness?.lastSyncAt} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Source health</dt>
                        <dd>
                          <ProtectionStateBadge state={provenance.dataFreshness?.sourceHealth} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Last reconciled</dt>
                        <dd className="text-slate-200">
                          <EmailTime iso={provenance.lastReconciledAt} fallback="Not reconciled" />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Licence assumptions</dt>
                        <dd className="text-slate-200 break-all">
                          {Object.keys(provenance.licenceAssumptions || {}).length === 0
                            ? "None recorded"
                            : JSON.stringify(provenance.licenceAssumptions)}
                        </dd>
                      </div>
                    </dl>

                    {provenance.coverageExceptions?.length > 0 && (
                      <EmailNotice tone="warning" title="Coverage exceptions">
                        <ul className="list-disc pl-4 space-y-0.5">
                          {provenance.coverageExceptions.map((c, idx) => (
                            <li key={idx}>
                              <EmailTime iso={c.windowStart} /> → <EmailTime iso={c.windowEnd} />:{" "}
                              {c.completenessGrade}, {c.missingCount} missing
                            </li>
                          ))}
                        </ul>
                      </EmailNotice>
                    )}

                    <div>
                      <h3 className="text-xs font-bold text-slate-200 mb-1.5">Timeline</h3>
                      {provenance.timeline?.length ? (
                        <ol className="space-y-1.5 border-l border-line pl-3">
                          {provenance.timeline.map((t, idx) => (
                            <li key={`${t.stage}-${idx}`} className="font-mono text-[11px]">
                              <span className="text-cyan-300 font-bold">
                                {TIMELINE_LABEL[t.stage] || t.stage}
                              </span>{" "}
                              · <EmailTime iso={t.at} />
                              {t.ref ? <span className="text-slate-400"> · {t.ref}</span> : null}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-slate-400">No timeline events recorded.</p>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>

            <section className="p-5 rounded-xl bg-raised border border-line space-y-3">
              <h2 className="text-sm font-bold text-slate-100">
                AI Inferences &amp; Uncertainty (Non-Authoritative)
              </h2>
              {abstainedDecision && (
                <EmailNotice tone="warning">{EMAIL_COPY.AI_UNCERTAIN}</EmailNotice>
              )}
              {!detail.detectionDecisions?.length ? (
                <p className="p-4 rounded-lg bg-surface border border-line text-slate-400">
                  No AI evaluation has been generated for this finding yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detail.detectionDecisions.map((d: any) => (
                    <li
                      key={d.id}
                      className="p-3 rounded-lg bg-surface border border-line space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                        <span className="font-bold text-cyan-300">
                          {d.detector_tier} ({d.detector_version})
                        </span>
                        <span className={d.abstained ? "text-amber-300 font-bold" : "text-slate-300"}>
                          {d.abstained
                            ? "ABSTAINED (insufficient evidence)"
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
                        Inspect full AI decision →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <form
              onSubmit={handleAdjudicate}
              className="p-5 rounded-xl bg-raised border border-line space-y-3"
            >
              <h2 className="text-sm font-bold text-slate-100">Record Analyst Adjudication</h2>
              <p className="text-[11px] text-slate-400">
                Reviewing version {detail.version ?? "unknown"}. A decision does not modify the
                customer mailbox.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label htmlFor={verdictId} className="block font-mono text-slate-400">
                    Verdict
                  </label>
                  <select
                    id={verdictId}
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as typeof decision)}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
                  >
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="BENIGN">BENIGN</option>
                    <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
                    <option value="INSUFFICIENT_EVIDENCE">INSUFFICIENT_EVIDENCE</option>
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label htmlFor={rationaleId} className="block font-mono text-slate-400">
                    Rationale
                  </label>
                  <input
                    id={rationaleId}
                    type="text"
                    required
                    placeholder="Document verified evidence supporting the disposition"
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
                  />
                </div>
                <Button type="submit" variant="primary" className="self-end">
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
