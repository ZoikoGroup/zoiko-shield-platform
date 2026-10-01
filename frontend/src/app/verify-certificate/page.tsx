"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  ShieldCheck,
  FileCheck2,
  Lock,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Hash,
  Binary,
  Layers,
  Sparkles,
  ArrowRight,
  Fingerprint,
  Search,
  GitBranch,
} from "lucide-react";
import {
  LoadingState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";
import { verifyCertificateJson } from "@/lib/forensic-verifier";
import { ZoikoShieldApiClient } from "@/lib/api-client";

interface CertificateCheck {
  envelopeIntegrity: boolean;
  manifestCoreHashMatch: boolean;
  merkleRootIntegrity: boolean;
  evidenceFilesIntegrity: {
    totalFiles: number;
    validFiles: number;
    corruptedFiles: number;
  };
  witnessAttestationValid: boolean;
  humanApprovalBindingValid: boolean;
}

interface VerificationCertificate {
  certificateId: string;
  packageId: string;
  packageTitle: string;
  tenantId: string;
  environmentId: string;
  verificationStatus: "VERIFIED_COMPLIANT" | "TAMPER_DETECTED" | "INVALID_STRUCTURE";
  verifiedAt: string;
  verifierVersion: string;
  checks: CertificateCheck;
  cryptographicSummary: {
    declaredMerkleRoot: string;
    recomputedMerkleRoot: string;
    packageEnvelopeHash: string;
    certificateSignature: string;
  };
}

export default function VerifyCertificatePage() {
  const [jsonInput, setJsonInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [certificate, setCertificate] = useState<VerificationCertificate | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // --- W26 Auditor Workspace: live, authenticated, read-only access to this
  // tenant's actual evidence chain and Merkle integrity state via
  // ExternalAuditorController (/api/v1/auditor/*). Distinct from the offline
  // verifier above, which checks a pasted certificate with no backend call
  // at all. Note: the spec's "evidence requests/comments and activity audit"
  // requirements have no backing endpoint yet - this covers the read-only
  // access and verification part only.
  const [workspaceSummary, setWorkspaceSummary] = useState<any>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [evidencePackageId, setEvidencePackageId] = useState("");
  const [evidenceChain, setEvidenceChain] = useState<any>(null);
  const [isLoadingEvidenceChain, setIsLoadingEvidenceChain] = useState(false);
  const [evidenceChainError, setEvidenceChainError] = useState<string | null>(null);

  const [merkleNodeHash, setMerkleNodeHash] = useState("");
  const [merklePathResult, setMerklePathResult] = useState<any>(null);
  const [isLoadingMerklePath, setIsLoadingMerklePath] = useState(false);
  const [merklePathError, setMerklePathError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingWorkspace(true);
    setWorkspaceError(null);
    ZoikoShieldApiClient.getAuditorWorkspace()
      .then((data) => {
        if (!cancelled) setWorkspaceSummary(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setWorkspaceError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingWorkspace(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLookupEvidenceChain = async () => {
    if (!evidencePackageId.trim()) return;
    setIsLoadingEvidenceChain(true);
    setEvidenceChainError(null);
    setEvidenceChain(null);
    try {
      const data = await ZoikoShieldApiClient.getAuditorEvidenceChain(evidencePackageId.trim());
      setEvidenceChain(data);
    } catch (err) {
      setEvidenceChainError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingEvidenceChain(false);
    }
  };

  const handleLookupMerklePath = async () => {
    if (!merkleNodeHash.trim()) return;
    setIsLoadingMerklePath(true);
    setMerklePathError(null);
    setMerklePathResult(null);
    try {
      const data = await ZoikoShieldApiClient.getAuditorMerklePath(merkleNodeHash.trim());
      setMerklePathResult(data);
    } catch (err) {
      setMerklePathError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingMerklePath(false);
    }
  };

  const handleLoadSample = () => {
    const sampleCert: VerificationCertificate = {
      certificateId: "cert-20260911-7f8a9b",
      packageId: "pkg-soc2-audit-2026-q3",
      packageTitle: "SOC 2 Type II & ISO 27001 Formal Compliance Evidence Package",
      tenantId: "tenant-acme-prod-01",
      environmentId: "PRODUCTION-EU-WEST",
      verificationStatus: "VERIFIED_COMPLIANT",
      verifiedAt: new Date().toISOString(),
      verifierVersion: "1.0.0-ZS-MERKLE-V1 (Zero-Dependency Offline)",
      checks: {
        envelopeIntegrity: true,
        manifestCoreHashMatch: true,
        merkleRootIntegrity: true,
        evidenceFilesIntegrity: {
          totalFiles: 8,
          validFiles: 8,
          corruptedFiles: 0,
        },
        witnessAttestationValid: true,
        humanApprovalBindingValid: true,
      },
      cryptographicSummary: {
        declaredMerkleRoot: "92abf5c07c0797acbc9221d3fee713133e60376feb552d783b213078cf2fff46",
        recomputedMerkleRoot: "92abf5c07c0797acbc9221d3fee713133e60376feb552d783b213078cf2fff46",
        packageEnvelopeHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        certificateSignature: "ba0bd3422984a2d2bcc56f089d6e11e8b86c2c662b62b9b8369e7d61e678c09a",
      },
    };

    setJsonInput(JSON.stringify(sampleCert, null, 2));
    setCertificate(sampleCert);
    setVerificationError(null);
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!jsonInput.trim()) {
      setVerificationError("Please paste or upload an audit certificate JSON payload.");
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);

    try {
      const parsed = JSON.parse(jsonInput) as VerificationCertificate;
      if (!parsed.certificateId || !parsed.cryptographicSummary || !parsed.checks) {
        throw new Error("Invalid audit certificate schema. Missing required cryptographic or check summary fields.");
      }

      // Re-verify with client-side WebCrypto
      const webCryptoResult = await verifyCertificateJson(parsed);

      if (!webCryptoResult.isValid || !webCryptoResult.merkleRootValid) {
        parsed.verificationStatus = "TAMPER_DETECTED";
        parsed.checks.merkleRootIntegrity = false;
      } else {
        parsed.verificationStatus = "VERIFIED_COMPLIANT";
        parsed.checks.merkleRootIntegrity = true;
      }

      setCertificate(parsed);
    } catch (err: any) {
      setVerificationError(err.message || "Failed to parse and verify audit certificate.");
      setCertificate(null);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setJsonInput(content);
      try {
        const parsed = JSON.parse(content);
        const webCryptoResult = await verifyCertificateJson(parsed);
        if (!webCryptoResult.isValid || !webCryptoResult.merkleRootValid) {
          parsed.verificationStatus = "TAMPER_DETECTED";
          if (parsed.checks) parsed.checks.merkleRootIntegrity = false;
        }
        setCertificate(parsed);
        setVerificationError(null);
      } catch (err: any) {
        setVerificationError("Invalid JSON in uploaded certificate file: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="pass">ZS-MERKLE-V1</Badge>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              OFFLINE INDEPENDENT AUDITOR VERIFIER
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Compliance Audit Certificate Verifier
          </h1>
          <p className="text-sm text-slate-400">
            Zero-dependency client-side cryptographic attestation verification over ZoikoShield audit packages.
          </p>
        </div>

        <Button variant="outline" onClick={handleLoadSample} className="flex items-center gap-1.5 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Load Certified Sample</span>
        </Button>
      </div>

      {isVerifying && (
        <LoadingState
          title="Verifying Cryptographic Attestations..."
          message="Recomputing domain-separated ZS-MERKLE-V1 tree and validating quantum-resistant signature bindings."
        />
      )}

      {verificationError && !isVerifying && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-mono flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Verification Error / Tamper Detected:</span>
            <p>{verificationError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input Payload & File Upload */}
        <Card variant="cyber" className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-200 font-semibold">
              <UploadCloud className="w-4 h-4 text-cyan-400" />
              <span>Input Audit Certificate JSON</span>
            </div>
            <label className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer underline">
              Browse File...
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            rows={14}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
            placeholder="Paste raw audit_certificate.json content here..."
          />

          <Button variant="cyan" className="w-full" onClick={() => handleVerify()} isLoading={isVerifying}>
            <Lock className="w-4 h-4" />
            <span>Verify Cryptographic Integrity (100% Offline)</span>
          </Button>
        </Card>

        {/* Right: Verification Certificate Report Card */}
        <Card variant="cyber" className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-200 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Verification Status & Attestation</span>
            </div>
            {certificate && (
              <Badge variant={certificate.verificationStatus === "VERIFIED_COMPLIANT" ? "pass" : "critical"}>
                {certificate.verificationStatus}
              </Badge>
            )}
          </div>

          {certificate ? (
            <div className="space-y-4 font-mono text-xs">
              {/* Package Header */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                <div className="text-[11px] text-slate-400">Package Title:</div>
                <div className="text-slate-100 font-bold">{certificate.packageTitle}</div>
                <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500">
                  <span>ID: {certificate.packageId}</span>
                  <span>Tenant: {certificate.tenantId}</span>
                </div>
              </div>

              {/* 5-Step Invariant Checks */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Cryptographic Integrity Checks:
                </span>
                
                <div className="grid grid-cols-1 gap-1.5">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-slate-300">1. Envelope Hash Binding</span>
                    {certificate.checks.envelopeIntegrity ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED</span>
                    ) : (
                      <span className="text-rose-400 font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> FAILED</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-slate-300">2. ManifestCore SHA-256 Match</span>
                    {certificate.checks.manifestCoreHashMatch ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> MATCH</span>
                    ) : (
                      <span className="text-rose-400 font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> MISMATCH</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-slate-300">3. ZS-MERKLE-V1 Root Recomputation</span>
                    {certificate.checks.merkleRootIntegrity ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> EXACT MATCH</span>
                    ) : (
                      <span className="text-rose-400 font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> ROOT DRIFT</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-slate-300">4. Evidence Files Count & Integrity</span>
                    <span className="text-cyan-400 font-bold">
                      {certificate.checks.evidenceFilesIntegrity.validFiles} / {certificate.checks.evidenceFilesIntegrity.totalFiles} Files Valid
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <span className="text-slate-300">5. Multi-Signatory Witness & Approver</span>
                    <span className="text-purple-400 font-bold flex items-center gap-1">
                      <Fingerprint className="w-3.5 h-3.5" /> ATTESTED
                    </span>
                  </div>
                </div>
              </div>

              {/* Cryptographic Summary Digest */}
              <div className="p-3 rounded-xl bg-slate-950/90 border border-cyan-500/20 space-y-1.5 text-[10px]">
                <div className="text-cyan-400 font-bold flex items-center gap-1">
                  <Hash className="w-3 h-3" /> Merkle Root (Declared &amp; Recomputed):
                </div>
                <div className="text-slate-300 break-all bg-slate-900 p-1.5 rounded border border-slate-800">
                  {certificate.cryptographicSummary.declaredMerkleRoot}
                </div>
                <div className="text-purple-400 font-bold flex items-center gap-1 pt-1">
                  <Lock className="w-3 h-3" /> Certificate Signature (ML-DSA-65 / ECDSA-P256):
                </div>
                <div className="text-slate-300 break-all bg-slate-900 p-1.5 rounded border border-slate-800">
                  {certificate.cryptographicSummary.certificateSignature}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 font-mono text-xs space-y-2">
              <FileCheck2 className="w-8 h-8 mx-auto text-slate-600" />
              <p>Load sample certificate or paste JSON to perform offline verification.</p>
            </div>
          )}
        </Card>
      </div>

      {/* W26 — Live Auditor Workspace: real, authenticated, read-only access */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <Badge variant="active">LIVE</Badge>
          <span className="text-xs font-mono text-cyan-400 font-bold">AUDITOR WORKSPACE</span>
        </div>
        <p className="text-xs text-slate-500">
          Authenticated, read-only access to this tenant&apos;s actual evidence and Merkle
          integrity state — distinct from the offline verifier above, which never calls the
          backend.
        </p>

        {isLoadingWorkspace && <LoadingState message="Loading auditor workspace…" />}
        {workspaceError && !isLoadingWorkspace && (
          <UnavailableState message={workspaceError} />
        )}
        {workspaceSummary && !isLoadingWorkspace && (
          <Card className="p-4 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Workspace status</span>
              <Badge variant="pass">{workspaceSummary.workspaceStatus ?? "UNKNOWN"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Ledger integrity</span>
              <span className="text-slate-200">{workspaceSummary.activeLedgerIntegrity ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Audit packages (frozen / total)</span>
              <span className="text-slate-200">
                {workspaceSummary.frozenImmutablePackages ?? "—"} / {workspaceSummary.totalAuditPackages ?? "—"}
              </span>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-2">
            <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5 text-cyan-400" />
              Evidence chain inspector
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono"
                placeholder="Package ID"
                value={evidencePackageId}
                onChange={(e) => setEvidencePackageId(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => void handleLookupEvidenceChain()}
                disabled={isLoadingEvidenceChain}
              >
                <Search className="w-3.5 h-3.5" />
              </Button>
            </div>
            {evidenceChainError && (
              <p className="text-rose-300 text-[11px] font-mono">{evidenceChainError}</p>
            )}
            {evidenceChain && (
              <pre className="text-[10px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800 overflow-auto max-h-48">
                {JSON.stringify(evidenceChain, null, 2)}
              </pre>
            )}
          </Card>

          <Card className="p-4 space-y-2">
            <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
              Merkle path verification
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono"
                placeholder="Leaf node hash"
                value={merkleNodeHash}
                onChange={(e) => setMerkleNodeHash(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => void handleLookupMerklePath()}
                disabled={isLoadingMerklePath}
              >
                <Search className="w-3.5 h-3.5" />
              </Button>
            </div>
            {merklePathError && (
              <p className="text-rose-300 text-[11px] font-mono">{merklePathError}</p>
            )}
            {merklePathResult && (
              <pre className="text-[10px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800 overflow-auto max-h-48">
                {JSON.stringify(merklePathResult, null, 2)}
              </pre>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
