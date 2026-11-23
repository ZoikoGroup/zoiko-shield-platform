"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2 } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { EmailWorkspaceHeader } from "@/components/email/EmailSecurityUi";

export default function EmailEvidencePage() {
  const [manifests, setManifests] = useState<any[]>([]);
  const [timeStart, setTimeStart] = useState(
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 16),
  );
  const [timeEnd, setTimeEnd] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [jurisdiction, setJurisdiction] = useState("eu-west-1");
  const [verificationMsg, setVerificationMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadManifests = useCallback(async () => {
    setError(null);
    try {
      const list = await ZoikoShieldApiClient.listEmailEvidenceManifests();
      setManifests(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manifests.");
    }
  }, []);

  useEffect(() => {
    loadManifests();
  }, [loadManifests]);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVerificationMsg(null);
    try {
      const res = await ZoikoShieldApiClient.buildEmailEvidenceExport({
        timeStart: new Date(timeStart).toISOString(),
        timeEnd: new Date(timeEnd).toISOString(),
        jurisdiction,
      });
      setVerificationMsg(
        res?.assuranceStatement ||
          "Evidence manifest anchored with RFC 6962 TREE_PROFILE_V2.",
      );
      await loadManifests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evidence export failed.");
    }
  };

  const handleVerify = async (manifestId: string) => {
    setError(null);
    setVerificationMsg(null);
    try {
      const res = await ZoikoShieldApiClient.verifyEmailEvidenceManifest(manifestId);
      setVerificationMsg(res?.verification?.statement || "Verification complete.");
      await loadManifests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manifest verification failed.");
    }
  };

  return (
    <div className="space-y-6">
      <EmailWorkspaceHeader
        title="Cryptographic Email Evidence Exports"
        subtitle="Generate Merkle-anchored (RFC 6962 TREE_PROFILE_V2) email assurance packages. Missing windows and exclusions are preserved honestly alongside verification."
        activeHref="/email/evidence"
      />

      {verificationMsg && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-surface border border-cyan-500/40 text-xs text-cyan-200 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{verificationMsg}</span>
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

      <form
        onSubmit={handleExport}
        className="p-5 rounded-xl bg-raised border border-line grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-xs"
      >
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">Period Start</span>
          <input
            type="datetime-local"
            value={timeStart}
            onChange={(e) => setTimeStart(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
          />
        </label>
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">Period End</span>
          <input
            type="datetime-local"
            value={timeEnd}
            onChange={(e) => setTimeEnd(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100"
          />
        </label>
        <label className="space-y-1 block">
          <span className="font-mono text-slate-400">Jurisdiction Filter</span>
          <input
            type="text"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono"
          />
        </label>
        <Button type="submit" variant="cyan">
          <FileCheck2 className="w-4 h-4" />
          <span>Anchor &amp; Export Manifest</span>
        </Button>
      </form>

      <div className="space-y-3 text-xs">
        {manifests.map((m) => {
          const gapCount = Array.isArray(m.coverage_gaps) ? m.coverage_gaps.length : 0;
          return (
            <div
              key={m.id}
              className="p-5 rounded-xl bg-raised border border-line space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono font-bold text-slate-100">
                  Manifest {m.id}
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-surface border border-line font-mono text-cyan-300">
                    {m.status}
                  </span>
                  <Button variant="secondary" onClick={() => handleVerify(m.id)}>
                    Verify Cryptographically
                  </Button>
                </div>
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                Window: {formatTimestamp(m.time_start)} → {formatTimestamp(m.time_end)} · Root:{" "}
                <span className="text-slate-200">{m.merkle_root || "—"}</span>
              </div>
              {gapCount > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    The captured evidence is intact. Some source events may be missing for this period ({gapCount} gap window(s)).
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
