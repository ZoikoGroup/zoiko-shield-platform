"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { EmailWorkspaceHeader } from "@/components/email/EmailSecurityUi";

export default function EmailControlCoveragePage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ZoikoShieldApiClient.getEmailControlsCoverage()
      .then((res) => setData(res))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load control coverage."),
      );
  }, []);

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Email Compliance Control Coverage"
        subtitle="Real-time mapping between verified Microsoft 365 / Google Workspace email connectors, active policies, and cryptographic evidence manifests."
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

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-raised border border-cyan-500/30 text-slate-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>{data.disclaimer}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(data.controls || []).map((c: any) => (
              <div
                key={c.controlId}
                className="p-5 rounded-xl bg-raised border border-line space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-cyan-300">
                    {c.controlId} · {c.framework}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                      c.status === "NO_COVERAGE" || c.status === "GAP_DETECTED"
                        ? "bg-amber-500/15 border border-amber-500/40 text-amber-300"
                        : "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="font-semibold text-sm text-slate-100">{c.title}</div>
                {Array.isArray(c.missingPrerequisites) && c.missingPrerequisites.length > 0 && (
                  <ul className="list-disc pl-4 text-amber-200 space-y-0.5">
                    {c.missingPrerequisites.map((gap: string, idx: number) => (
                      <li key={idx}>{gap}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
