"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import type { AuditPackage } from "@/lib/types";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { VerifierTerminal } from "@/components/audit/VerifierTerminal";
import {
  FileCheck2,
  Download,
  Lock,
  CheckCircle2,
  Sparkles,
  Shield,
  KeyRound,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import {
  LoadingState,
  StaleState,
  UnavailableState,
  DegradedState,
} from "@/components/states/mandatory-ui-states";

export default function AuditPage() {
  const router = useRouter();
  const [auditPackages, setAuditPackages] = useState<AuditPackage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    ZoikoShieldApiClient.getAuditPackages()
      .then((pkgs) => {
        setAuditPackages(pkgs);
        setIsStale(false);
        setLoadError(null);
      })
      .catch((err) => {
        setIsStale(true);
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const refreshAuditPackages = async () => {
    setIsLoading(true);
    try {
      const pkgs = await ZoikoShieldApiClient.getAuditPackages();
      setAuditPackages(pkgs);
      setIsStale(false);
      setLoadError(null);
    } catch (err) {
      setIsStale(true);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const latestPackage = auditPackages[0];
  const manifest: Partial<NonNullable<AuditPackage["manifest"]>> =
    (latestPackage && typeof latestPackage === "object" && (latestPackage.manifest || (latestPackage as any)?.data?.manifest)) || {};
  // A package that exists but has not been built/sealed yet has no manifest
  // (AuditPackageManifest? is nullable). That is a real, honest state worth
  // showing as pending - never papered over with fabricated "_verified"
  // strings or placeholder counts, since this page is the evidence a
  // customer or auditor reads as proof of cryptographic integrity.
  const isSealed = Boolean(latestPackage?.manifest);
  const packageSizeKB = (((latestPackage?.sizeBytes ?? 0) / 1024)).toFixed(1);
  const generatedDate = latestPackage?.generatedAt || new Date().toISOString();

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const pkg = await ZoikoShieldApiClient.generateAuditPackage();
      setAuditPackages((prev) => [pkg, ...prev.filter((p) => p.id !== pkg.id)]);
    } catch (err) {
      console.error("Generate Audit Package Error:", err);
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header Banner */}
      <div className="surface-card rounded-2xl p-6 border border-slate-800/80 bg-gradient-to-b from-[#0c111e] to-[#070b14] shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="anchored" className="text-[10px] font-mono">ERB-01 STEP 10</Badge>
              <span className="text-xs font-mono text-cyan-400 font-bold tracking-wider">
                POST-QUANTUM AUDIT EXPORT
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Audit Package Export &amp; Offline Verifier
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
              Export hybrid ECDSA-P256 + ML-DSA-65 (FIPS 204) sealed packages and execute standalone zero-dependency verification.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Button
              variant="primary"
              onClick={() => handleGenerate()}
              isLoading={isGenerating}
              className="shadow-[0_0_15px_rgba(59,130,246,0.25)]"
            >
              <Lock className="w-4 h-4" />
              <span>Generate Sealed Audit Package</span>
            </Button>
            <Button
              variant="cyan"
              onClick={() => router.push("/admin/jit")}
              className="shadow-[0_0_15px_rgba(0,240,255,0.25)]"
            >
              <span>JIT Elevation Center</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mandatory UI States */}
      {isLoading && (
        <LoadingState
          title="Loading Audit Packages..."
          message="Retrieving Merkle epoch manifests and quantum-safe signatures."
          regionalCell="us-east-1"
        />
      )}

      {isStale && !isLoading && auditPackages.length > 0 && (
        <StaleState
          title="Cached Audit Export View"
          message="Showing last verified package manifest. Could not reach the backend for a fresh copy."
          retryAction={refreshAuditPackages}
        />
      )}

      {isStale && !isLoading && auditPackages.length === 0 && (
        <UnavailableState
          title="Audit Packages Unavailable"
          message={loadError || "Could not load audit packages from the backend."}
          retryAction={refreshAuditPackages}
        />
      )}

      {generateError && !isGenerating && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono shadow-[0_0_15px_rgba(244,63,94,0.15)]">
          Failed to generate audit package: {generateError}
        </div>
      )}

      {/* Package Details Card */}
      {latestPackage ? (
        <Card variant="cyber" className="p-6 bg-gradient-to-b from-[#0c111e] to-[#070b14] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.15)]">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">
                  {latestPackage.packageName || latestPackage.id || "ZoikoShield Audit Package"}
                </h3>
                <p className="text-xs font-mono text-cyan-400 mt-0.5">
                  Size: {packageSizeKB} KB • Generated: {formatTimestamp(generatedDate)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isSealed ? (
                <>
                  <Badge variant="anchored" className="text-[10px] font-mono">ML-DSA-65 Sealed</Badge>
                  <Badge variant="pass" className="text-[10px] font-mono">ECDSA-P256 Valid</Badge>
                </>
              ) : (
                <Badge variant="pending" className="text-[10px] font-mono">Awaiting Seal</Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs text-slate-300">
            <div className="p-4 rounded-xl bg-[#060a12] border border-slate-800/80 space-y-2.5">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                Hybrid Cryptographic Seals:
              </span>
              <div>
                <span className="text-slate-500 text-[11px]">PQC ML-DSA-65 (FIPS 204):</span>
                <p className="text-emerald-400 truncate text-[11px] mt-0.5">
                  {latestPackage.dilithiumSignature || (
                    <em className="text-slate-500 not-italic">Not yet generated</em>
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-500 text-[11px]">CLASSICAL ECDSA-P256:</span>
                <p className="text-cyan-300 truncate text-[11px] mt-0.5">
                  {latestPackage.ecdsaP256Signature || latestPackage.ed25519Signature || (
                    <em className="text-slate-500 not-italic">Not yet generated</em>
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-500 text-[11px]">PACKAGE SHA-256:</span>
                <p className="text-slate-200 truncate text-[11px] mt-0.5">
                  {latestPackage.packageHash || (
                    <em className="text-slate-500 not-italic">Not yet generated</em>
                  )}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#060a12] border border-slate-800/80 space-y-2.5">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                Manifest Contents &amp; Proofs:
              </span>
              {isSealed ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-[11px]">EVIDENCE COUNT:</span>
                    <span className="text-slate-200">{manifest.evidenceCount ?? "—"} Records</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-[11px]">INCIDENT CASES:</span>
                    <span className="text-slate-200">{manifest.casesCount ?? "—"} Cases</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-[11px]">CONTROL TESTS:</span>
                    <span className="text-emerald-400 font-semibold">{manifest.controlEvaluationsCount ?? "—"} / 4 Passed</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-[11px]">TSA TOKEN:</span>
                    <span className="text-cyan-300 font-semibold truncate max-w-[180px]">{manifest.tsaTimestampProof || "—"}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Manifest not yet built — this package has not been sealed.
                </p>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card variant="cyber" className="py-12 text-center text-slate-400 space-y-3 font-mono text-xs bg-gradient-to-b from-[#0c111e] to-[#070b14]">
          <p>No audit package generated yet.</p>
          <Button variant="primary" onClick={() => handleGenerate()} isLoading={isGenerating}>
            Generate Sealed Audit Package
          </Button>
        </Card>
      )}

      {/* Embedded Verifier Terminal Component */}
      <VerifierTerminal auditPackage={latestPackage} />

      {/* Evidence Freshness & Honest Governance Disclosures Panel */}
      <Card variant="cyber" className="p-6 bg-gradient-to-b from-[#0c111e] to-[#070b14] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">
              Evidence Freshness SLA &amp; Honest Governance Disclosures
            </h3>
          </div>
          <Badge variant="pass" className="font-mono text-[10px]">AUDITOR TRANSPARENCY</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Freshness breakdown */}
          <div className="p-4 rounded-xl bg-[#060a12] border border-slate-800/80 space-y-2.5 font-mono text-xs">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
              Evidence Telemetry Cadence SLA:
            </span>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-[11px]">FRESHNESS THRESHOLD:</span>
              <span className="text-emerald-400 font-semibold">72 Hours Maximum SLA</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-[11px]">LATEST PACKAGE AGE:</span>
              <span className="text-slate-200">
                {latestPackage
                  ? `${(() => {
                      const t = new Date(latestPackage.generatedAt || Date.now()).getTime();
                      return !isNaN(t) ? Math.max(0, (Date.now() - t) / 3600000).toFixed(1) : "0.0";
                    })()}h since generation`
                  : "No package generated"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-[11px]">PER-RECORD EVIDENCE FRESHNESS:</span>
              <span className="text-amber-300">Not computed on this view</span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-900">
              <span className="text-slate-500 text-[11px]">MERKLE LEAF ANCHORS:</span>
              <span className="text-cyan-300">RFC 6962 Domain-Separated</span>
            </div>
          </div>

          {/* Honest disclosures */}
          <div className="p-4 rounded-xl bg-[#060a12] border border-slate-800/80 space-y-2.5 font-mono text-xs">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              Statutory Disclaimers &amp; Framework Posture:
            </span>
            <div className="text-[11px] text-slate-300 space-y-2 font-sans leading-relaxed">
              <p>
                • <strong className="text-cyan-300">SOC 2 Type II &amp; ISO/IEC 27001:2022:</strong> Active certification baseline targets with continuous control evaluation.
              </p>
              <p>
                • <strong className="text-cyan-300">NIST CSF (v2.0):</strong> Voluntary reference alignment framework; not a commercial certification scheme.
              </p>
              <p>
                • <strong className="text-amber-300">Regional Cell Status:</strong> Synthetic In-Process Simulation (no live cloud OpenTofu infra deployed locally).
              </p>
              <p>
                • <strong className="text-amber-300">G1 Release Gate:</strong> PENDING MULTI-APPROVER SIGN-OFF (awaiting human executive ratification).
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
