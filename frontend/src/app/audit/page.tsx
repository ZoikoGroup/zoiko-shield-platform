"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
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
} from "lucide-react";

export default function AuditPage() {
  const router = useRouter();
  const [state] = useDemoState();
  const [isGenerating, setIsGenerating] = useState(false);

  const latestPackage = state.auditPackages[0];

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await ZoikoShieldApiClient.generateAuditPackage();
    } catch (err) {
      console.error("Generate Audit Package Error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="anchored">ERB-01 STEP 10</Badge>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              POST-QUANTUM AUDIT EXPORT
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Audit Package Export & Offline Verifier
          </h1>
          <p className="text-sm text-slate-400">
            Export hybrid Ed25519 + Dilithium3 sealed packages and execute standalone zero-dependency verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={handleGenerate}
            isLoading={isGenerating}
          >
            <Lock className="w-4 h-4" />
            <span>Generate Sealed Audit Package</span>
          </Button>
          <Button variant="cyan" onClick={() => router.push("/admin/jit")}>
            <span>JIT & Enclave Center</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Package Details Card */}
      {latestPackage ? (
        <Card variant="cyber" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-cyan-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-sm">
                  {latestPackage.packageName}
                </h3>
                <p className="text-xs font-mono text-cyan-400">
                  Size: {(latestPackage.sizeBytes / 1024).toFixed(1)} KB • Generated: {formatTimestamp(latestPackage.generatedAt)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="anchored">Dilithium3 Sealed</Badge>
              <Badge variant="pass">Ed25519 Valid</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs text-slate-300">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-cyan-400 uppercase">
                Hybrid Cryptographic Seals:
              </span>
              <div>
                <span className="text-slate-500">PQC DILITHIUM3:</span>
                <p className="text-emerald-400 truncate text-[11px]">
                  {latestPackage.dilithiumSignature}
                </p>
              </div>
              <div>
                <span className="text-slate-500">CLASSICAL ED25519:</span>
                <p className="text-cyan-300 truncate text-[11px]">
                  {latestPackage.ed25519Signature}
                </p>
              </div>
              <div>
                <span className="text-slate-500">PACKAGE SHA-256:</span>
                <p className="text-slate-200 truncate text-[11px]">
                  {latestPackage.packageHash}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-cyan-400 uppercase">
                Manifest Contents & Proofs:
              </span>
              <div className="flex justify-between">
                <span className="text-slate-500">EVIDENCE COUNT:</span>
                <span className="text-slate-200">{latestPackage.manifest.evidenceCount} Records</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">INCIDENT CASES:</span>
                <span className="text-slate-200">{latestPackage.manifest.casesCount} Cases</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CONTROL TESTS:</span>
                <span className="text-emerald-400">{latestPackage.manifest.controlEvaluationsCount} / 4 Passed</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">TSA TOKEN:</span>
                <span className="text-cyan-300 font-semibold">{latestPackage.manifest.tsaTimestampProof}</span>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="py-12 text-center text-slate-400 space-y-3 font-mono text-xs">
          <p>No audit package generated yet.</p>
          <Button variant="primary" onClick={handleGenerate} isLoading={isGenerating}>
            Generate Sealed Audit Package
          </Button>
        </Card>
      )}

      {/* Embedded Verifier Terminal Component */}
      <VerifierTerminal auditPackage={latestPackage} />
    </div>
  );
}
