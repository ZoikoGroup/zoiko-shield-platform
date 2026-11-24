"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSearch, ShieldCheck } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { EmailControlEvidence } from "@/lib/types";
import { EMAIL_COPY } from "@/lib/email-copy";
import { Button } from "@/components/ui/Button";
import {
  EmailErrorNotice,
  EmailLoadingNotice,
  EmailNotice,
  EmailTime,
  EmailWorkspaceHeader,
  classifyEmailError,
  providerLabel,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

interface CoverageControl {
  controlId: string;
  framework?: string;
  title?: string;
  status?: string;
  missingPrerequisites?: string[];
  numerator?: number | null;
  denominator?: number | null;
  excluded?: Array<{ connectionId?: string; provider?: string; reason: string }>;
}

const GAP_STATES = new Set(["NO_COVERAGE", "GAP_DETECTED", "DEGRADED", "UNKNOWN", "PARTIAL"]);

function CoverageFraction({ control }: { control: CoverageControl }) {
  const hasFraction =
    typeof control.numerator === "number" && typeof control.denominator === "number";
  return (
    <dl className="grid grid-cols-2 gap-2 font-mono text-[11px] bg-surface p-3 rounded-lg border border-line">
      <div>
        <dt className="text-slate-400">Numerator (monitored)</dt>
        <dd className="text-slate-100">{control.numerator ?? "Unknown"}</dd>
      </div>
      <div>
        <dt className="text-slate-400">Denominator (eligible)</dt>
        <dd className="text-slate-100">{control.denominator ?? "Unknown"}</dd>
      </div>
      <div className="col-span-2">
        <dt className="text-slate-400">Coverage</dt>
        <dd className="text-slate-100">
          {hasFraction && control.denominator! > 0
            ? `${control.numerator} of ${control.denominator} (${(
                (control.numerator! / control.denominator!) *
                100
              ).toFixed(1)}%)`
            : "Not computable: denominator unknown or zero"}
        </dd>
      </div>
      <div className="col-span-2">
        <dt className="text-slate-400">Excluded eligible systems</dt>
        <dd className="text-slate-200">
          {control.excluded?.length ? (
            <ul className="list-disc pl-4">
              {control.excluded.map((x, idx) => (
                <li key={idx}>
                  {x.provider ? providerLabel(x.provider) : "Source"}
                  {x.connectionId ? ` (${x.connectionId})` : ""}: {x.reason}
                </li>
              ))}
            </ul>
          ) : (
            "None reported"
          )}
        </dd>
      </div>
    </dl>
  );
}

export default function EmailControlCoveragePage() {
  const [data, setData] = useState<{ disclaimer?: string; controls?: CoverageControl[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const [evidence, setEvidence] = useState<{
    controlId: string;
    data: EmailControlEvidence | null;
    error: ClassifiedEmailError | null;
  } | null>(null);
  const evidenceHeadingId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await ZoikoShieldApiClient.getEmailControlsCoverage());
    } catch (err) {
      setData(null);
      setError(classifyEmailError(err, "Failed to load control coverage."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const viewEvidence = async (controlId: string) => {
    setEvidence({ controlId, data: null, error: null });
    try {
      const res = await ZoikoShieldApiClient.getEmailControlEvidence(controlId);
      setEvidence({ controlId, data: res, error: null });
    } catch (err) {
      setEvidence({
        controlId,
        data: null,
        error: classifyEmailError(err, "Failed to load control evidence."),
      });
    }
  };

  const controls = data?.controls || [];

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Control Coverage & Effectiveness"
        subtitle="Monitored-control operation with explicit numerators, denominators and exclusions. Coverage is never inferred from the presence of a scanner."
        activeHref="/email/coverage"
        actions={
          <Link
            href="/email/evidence"
            className="min-h-[40px] inline-flex items-center px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold"
          >
            Export Evidence Package →
          </Link>
        }
      />

      <EmailErrorNotice error={error} onRetry={error?.kind === "DENIED" ? undefined : load} />
      {loading && !data && !error && <EmailLoadingNotice label="Loading control coverage…" />}

      {data && (
        <div className="space-y-4 text-xs">
          {data.disclaimer && (
            <EmailNotice tone="info">
              <span className="inline-flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5" aria-hidden="true" />
                {data.disclaimer}
              </span>
            </EmailNotice>
          )}

          {controls.length === 0 && (
            <EmailNotice tone="warning" title="No coverage">
              {EMAIL_COPY.NO_CONNECTED_SOURCE}
            </EmailNotice>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {controls.map((c) => {
              const gap = !c.status || GAP_STATES.has(c.status);
              return (
                <section
                  key={c.controlId}
                  className="p-5 rounded-xl bg-raised border border-line space-y-3"
                  aria-label={`Control ${c.controlId}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-cyan-300">
                      {c.controlId}
                      {c.framework ? ` · ${c.framework}` : ""}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                        gap
                          ? "bg-amber-500/15 border border-amber-500/40 text-amber-300"
                          : "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300"
                      }`}
                    >
                      {gap ? (
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                      )}
                      {c.status || "UNKNOWN"}
                    </span>
                  </div>
                  {c.title && <h2 className="font-semibold text-sm text-slate-100">{c.title}</h2>}
                  <CoverageFraction control={c} />
                  {Array.isArray(c.missingPrerequisites) && c.missingPrerequisites.length > 0 && (
                    <ul className="list-disc pl-4 text-amber-200 space-y-0.5">
                      {c.missingPrerequisites.map((g, idx) => (
                        <li key={idx}>{g}</li>
                      ))}
                    </ul>
                  )}
                  <Button variant="secondary" onClick={() => viewEvidence(c.controlId)}>
                    <FileSearch className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>View Evidence</span>
                  </Button>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {evidence && (
        <section
          aria-labelledby={evidenceHeadingId}
          className="p-5 rounded-xl bg-raised border border-cyan-500/40 space-y-3 text-xs"
        >
          <h2 id={evidenceHeadingId} className="text-sm font-bold text-slate-100">
            Evidence for {evidence.controlId}
          </h2>
          <EmailErrorNotice error={evidence.error} />
          {!evidence.data && !evidence.error && <EmailLoadingNotice label="Loading evidence…" />}
          {evidence.data && (
            <>
              <p className="font-mono text-[11px] text-slate-400">
                Window <EmailTime iso={evidence.data.windowStart} /> →{" "}
                <EmailTime iso={evidence.data.windowEnd} />
              </p>
              <CoverageFraction control={{ ...evidence.data, controlId: evidence.data.controlId }} />
              <div>
                <h3 className="font-bold text-slate-200 mb-1">Anchored manifests</h3>
                {evidence.data.manifests.length === 0 ? (
                  <p className="text-slate-400">No evidence manifests anchored for this window.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {evidence.data.manifests.map((m) => (
                      <li key={m.id} className="font-mono text-[11px] text-slate-300">
                        {m.id} · root {m.merkleRoot || "—"} · <EmailTime iso={m.createdAt} />
                        {Array.isArray(m.coverageGaps) && m.coverageGaps.length > 0 && (
                          <span className="block font-sans text-amber-200">
                            {EMAIL_COPY.VALID_PROOF_WITH_GAP}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="font-bold text-slate-200 mb-1">Linked findings</h3>
                {evidence.data.findings.length === 0 ? (
                  <p className="text-slate-400">No findings recorded for this control in the window.</p>
                ) : (
                  <ul className="space-y-1">
                    {evidence.data.findings.map((f) => (
                      <li key={f.id} className="font-mono text-[11px]">
                        <Link href={`/email/threats/${f.id}`} className="text-cyan-300 hover:underline">
                          {f.id}
                        </Link>{" "}
                        · <EmailTime iso={f.observedAt} /> · policy {f.policyVersion}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
