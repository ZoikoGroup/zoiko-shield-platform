"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { AlertTriangle, FileCheck2, ShieldCheck, ShieldX } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { EMAIL_COPY } from "@/lib/email-copy";
import { Button } from "@/components/ui/Button";
import { AuditorGrantForm } from "@/components/email/AuditorGrantForm";
import {
  EmailErrorNotice,
  EmailLoadingNotice,
  EmailNotice,
  EmailTime,
  EmailWorkspaceHeader,
  classifyEmailError,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

interface VerificationView {
  manifestId: string;
  verified: boolean;
  hasKnownGaps: boolean;
  statement?: string;
}

/** `datetime-local` gives local wall time; convert to an explicit UTC ISO value for the API. */
function toUtcIso(local: string): string {
  return new Date(local).toISOString();
}

export default function EmailEvidencePage() {
  const [manifests, setManifests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeStart, setTimeStart] = useState(
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 16),
  );
  const [timeEnd, setTimeEnd] = useState(new Date().toISOString().slice(0, 16));
  const [jurisdiction, setJurisdiction] = useState("eu-west-1");
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationView | null>(null);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const startId = useId();
  const endId = useId();
  const jurisdictionId = useId();

  const loadManifests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await ZoikoShieldApiClient.listEmailEvidenceManifests();
      setManifests(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(classifyEmailError(err, "Failed to load manifests."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadManifests();
  }, [loadManifests]);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExportMsg(null);
    try {
      const res = await ZoikoShieldApiClient.buildEmailEvidenceExport({
        timeStart: toUtcIso(timeStart),
        timeEnd: toUtcIso(timeEnd),
        jurisdiction,
      });
      setExportMsg(
        res?.assuranceStatement ||
          "Evidence manifest queued. Cryptographic integrity does not establish completeness or detection accuracy.",
      );
      await loadManifests();
    } catch (err) {
      setError(classifyEmailError(err, "Evidence export failed."));
    }
  };

  const handleVerify = async (manifestId: string) => {
    setError(null);
    setVerification(null);
    try {
      const res = await ZoikoShieldApiClient.verifyEmailEvidenceManifest(manifestId);
      const v = res?.verification ?? res ?? {};
      setVerification({
        manifestId,
        verified: Boolean(v.verified),
        hasKnownGaps: Boolean(v.hasKnownGaps),
        statement: v.statement,
      });
      await loadManifests();
    } catch (err) {
      setError(classifyEmailError(err, "Manifest verification failed."));
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Evidence Pack & Independent Verification"
        subtitle="Merkle-anchored (RFC 6962) email assurance packages. Cryptographic integrity is reported separately from completeness: missing windows stay visible as gaps."
        activeHref="/email/evidence"
      />

      {exportMsg && <EmailNotice tone="info">{exportMsg}</EmailNotice>}

      {verification && (
        <EmailNotice
          tone={verification.verified ? (verification.hasKnownGaps ? "warning" : "success") : "danger"}
          title={
            verification.verified
              ? `Manifest ${verification.manifestId}: integrity verified`
              : `Manifest ${verification.manifestId}: verification failed`
          }
        >
          <span className="inline-flex items-start gap-2">
            {verification.verified ? (
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5" aria-hidden="true" />
            ) : (
              <ShieldX className="w-3.5 h-3.5 mt-0.5" aria-hidden="true" />
            )}
            <span>
              {verification.verified
                ? verification.hasKnownGaps
                  ? EMAIL_COPY.VALID_PROOF_WITH_GAP
                  : "The captured evidence is intact for the recorded scope."
                : EMAIL_COPY.UNVERIFIED_PROOF}
              {verification.statement ? ` ${verification.statement}` : ""}
            </span>
          </span>
        </EmailNotice>
      )}

      <EmailErrorNotice
        error={error}
        onRetry={error?.kind === "DENIED" ? undefined : loadManifests}
      />

      <form
        onSubmit={handleExport}
        className="p-5 rounded-xl bg-raised border border-line grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-xs"
        aria-label="Build evidence pack"
      >
        <div className="space-y-1">
          <label htmlFor={startId} className="block font-mono text-slate-400">
            Period start (local input, sent as UTC)
          </label>
          <input
            id={startId}
            type="datetime-local"
            value={timeStart}
            onChange={(e) => setTimeStart(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={endId} className="block font-mono text-slate-400">
            Period end (local input, sent as UTC)
          </label>
          <input
            id={endId}
            type="datetime-local"
            value={timeEnd}
            onChange={(e) => setTimeEnd(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={jurisdictionId} className="block font-mono text-slate-400">
            Jurisdiction filter
          </label>
          <input
            id={jurisdictionId}
            type="text"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono"
          />
        </div>
        <Button type="submit" variant="cyan">
          <FileCheck2 className="w-4 h-4" aria-hidden="true" />
          <span>Build Evidence Pack</span>
        </Button>
      </form>

      {loading && manifests.length === 0 && !error ? (
        <EmailLoadingNotice label="Loading evidence manifests…" />
      ) : manifests.length === 0 && !error ? (
        <EmailNotice tone="info">No evidence manifests have been built yet.</EmailNotice>
      ) : (
        <ul className="space-y-3 text-xs">
          {manifests.map((m) => {
            const gapCount = Array.isArray(m.coverage_gaps) ? m.coverage_gaps.length : 0;
            const verified = m.status === "VERIFIED";
            return (
              <li key={m.id} className="p-5 rounded-xl bg-raised border border-line space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-mono font-bold text-slate-100">Manifest {m.id}</h2>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-surface border border-line font-mono text-cyan-300">
                      {m.status}
                    </span>
                    <Button variant="secondary" onClick={() => handleVerify(m.id)}>
                      Verify Pack
                    </Button>
                  </div>
                </div>
                <div className="font-mono text-[11px] text-slate-400 break-all">
                  Window: <EmailTime iso={m.time_start} /> → <EmailTime iso={m.time_end} /> · Root:{" "}
                  <span className="text-slate-200">{m.merkle_root || "—"}</span>
                </div>
                {!verified && (
                  <p className="text-slate-300">{EMAIL_COPY.UNVERIFIED_PROOF}</p>
                )}
                {gapCount > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      {EMAIL_COPY.VALID_PROOF_WITH_GAP} ({gapCount} gap window(s))
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AuditorGrantForm manifests={manifests} />
    </div>
  );
}
