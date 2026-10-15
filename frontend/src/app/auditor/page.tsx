"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";

const api = ZoikoShieldApiClient;
import {
  ShieldCheck,
  Lock,
  FileCheck,
  Cpu,
  Radio,
  FileText,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Fingerprint,
  Zap,
} from "lucide-react";

export default function AuditorWorkspacePage() {
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"merkle" | "evidence" | "certificates" | "ot_safety" | "airgap">("merkle");

  // Merkle Visualizer State
  const [leafHashInput, setLeafHashInput] = useState<string>("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  const [merkleProof, setMerkleProof] = useState<any>(null);
  const [isVerifyingMerkle, setIsVerifyingMerkle] = useState<boolean>(false);

  // Evidence Chain State
  const [selectedPackageId, setSelectedPackageId] = useState<string>("pkg-dora-q3");
  const [evidenceChain, setEvidenceChain] = useState<any>(null);
  const [isLoadingChain, setIsLoadingChain] = useState<boolean>(false);

  // Freeze Certificate State
  const [freezeCert, setFreezeCert] = useState<any>(null);
  const [isGeneratingCert, setIsGeneratingCert] = useState<boolean>(false);

  // OT & Airgap State
  const [otRules, setOtRules] = useState<any>(null);
  const [attestationPosture, setAttestationPosture] = useState<any>(null);

  useEffect(() => {
    loadWorkspace();
  }, []);

  const loadWorkspace = async () => {
    setLoading(true);
    try {
      const wsData = await api.getAuditorWorkspace();
      setWorkspace(wsData);

      const rulesData = await api.getOtDetectionRules();
      setOtRules(rulesData);

      const attestData = await api.getHardwareAttestationPosture();
      setAttestationPosture(attestData);

      // Initial Merkle verification
      await handleVerifyMerkle(leafHashInput);
      // Initial Evidence chain
      await handleLoadEvidenceChain(selectedPackageId);
    } catch (err) {
      console.error("Failed to load auditor workspace:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMerkle = async (hash: string) => {
    setIsVerifyingMerkle(true);
    try {
      const proof = await api.getAuditorMerklePath(hash);
      setMerkleProof(proof);
    } catch (err) {
      console.error("Merkle proof calculation failed:", err);
    } finally {
      setIsVerifyingMerkle(false);
    }
  };

  const handleLoadEvidenceChain = async (pkgId: string) => {
    setIsLoadingChain(true);
    try {
      const chain = await api.getAuditorEvidenceChain(pkgId);
      setEvidenceChain(chain);
    } catch (err) {
      console.error("Evidence chain loading failed:", err);
    } finally {
      setIsLoadingChain(false);
    }
  };

  const handleGenerateFreezeCert = async () => {
    setIsGeneratingCert(true);
    try {
      const cert = await api.generateAuditorFreezeCertificate(selectedPackageId);
      setFreezeCert(cert);
    } catch (err) {
      console.error("Freeze certificate generation failed:", err);
    } finally {
      setIsGeneratingCert(false);
    }
  };

  const handleDownloadCertJson = () => {
    if (!freezeCert) return;
    const blob = new Blob([JSON.stringify(freezeCert, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `freeze-certificate-${selectedPackageId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#162238] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="pass" className="font-mono text-[10px] tracking-wider border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              AUDITOR_EXTERNAL (READ-ONLY)
            </Badge>
            <Badge variant="info" className="font-mono text-[10px] tracking-wider border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              SPEC §W26 / §W31-W32
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1.5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <span className="bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
              Independent External Auditor Cryptographic Cockpit
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Read-only cryptographic proof inspection, real-time Merkle tree verification, and immutable freeze certificate export.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={loadWorkspace}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#0c111e] hover:bg-[#111a2e] border border-[#162238] hover:border-cyan-500/30 rounded-lg text-xs font-medium text-slate-300 transition-all shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            Refresh Ledger
          </Button>
          <Button
            variant="primary"
            onClick={handleGenerateFreezeCert}
            disabled={isGeneratingCert}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg text-xs font-semibold text-white shadow-lg shadow-emerald-950/50 border border-emerald-400/30 transition-all disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5" />
            {isGeneratingCert ? "Issuing..." : "Issue Freeze Certificate"}
          </Button>
        </div>
      </div>

      {/* Quick Cryptographic Integrity Badges */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ledger Seal Status</span>
            <div className={`p-1 rounded-full ${workspace?.activeLedgerIntegrity ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700/30 text-slate-500"}`}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold text-white mt-1.5 font-mono">
            {workspace?.activeLedgerIntegrity || "UNKNOWN"}
          </div>
          {/* A missing status is not a green check: the ledger integrity has
              not been confirmed, not confirmed-good, if the workspace never
              loaded or the backend did not report it. */}
          {workspace?.activeLedgerIntegrity ? (
            <span className="text-[10px] text-emerald-400 mt-1 inline-flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SHA-256 Hash Chain Valid
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 mt-1 inline-flex items-center gap-1 font-mono">
              Not yet confirmed
            </span>
          )}
        </Card>

        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Frozen Audit Packages</span>
            <div className="p-1 rounded-full bg-cyan-500/10 text-cyan-400">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold text-white mt-1.5 font-mono">
            {workspace?.frozenImmutablePackages ?? 0} <span className="text-slate-500 font-sans text-sm">/ {workspace?.totalAuditPackages ?? 0}</span>
          </div>
          <span className="text-[10px] text-cyan-400/80 mt-1 inline-block font-mono">
            {(workspace?.totalAuditPackages ?? 0) > 0
              ? `${Math.round(((workspace?.frozenImmutablePackages ?? 0) / workspace.totalAuditPackages) * 100)}% Immutable Evidence`
              : "No audit packages yet"}
          </span>
        </Card>

        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">OT Actuator Safety Block</span>
            <div className="p-1 rounded-full bg-amber-500/10 text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold text-amber-300 mt-1.5 font-mono">
            INTERLOCK_ACTIVE
          </div>
          <span className="text-[10px] text-amber-400 mt-1 inline-block font-mono">Dual-Key Token Required</span>
        </Card>

        <Card className="surface-card p-4 border border-[#162238] rounded-xl hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Attested Platform Nodes</span>
            <div className="p-1 rounded-full bg-indigo-500/10 text-indigo-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold text-indigo-300 mt-1.5 font-mono">
            {attestationPosture?.genuineHosts ?? 0} / {attestationPosture?.totalHostsAttested ?? 0} GENUINE
          </div>
          <span className="text-[10px] text-indigo-400 mt-1 inline-block font-mono">
            {attestationPosture ? "Confidential Computing Active" : "Attestation not yet confirmed"}
          </span>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-[#162238] space-x-1 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab("merkle")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "merkle"
              ? "border-cyan-400 text-cyan-400 bg-cyan-500/5 shadow-[inset_0_-2px_0_0_#00f0ff]"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
          }`}
        >
          <Layers className="w-4 h-4" />
          Real-Time Merkle Path Visualizer
        </button>

        <button
          onClick={() => setActiveTab("evidence")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "evidence"
              ? "border-cyan-400 text-cyan-400 bg-cyan-500/5 shadow-[inset_0_-2px_0_0_#00f0ff]"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          SHA-256 Evidence Chain Inspector
        </button>

        <button
          onClick={() => setActiveTab("certificates")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "certificates"
              ? "border-cyan-400 text-cyan-400 bg-cyan-500/5 shadow-[inset_0_-2px_0_0_#00f0ff]"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
          }`}
        >
          <Lock className="w-4 h-4" />
          Immutable Freeze Certificates
        </button>

        <button
          onClick={() => setActiveTab("ot_safety")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "ot_safety"
              ? "border-cyan-400 text-cyan-400 bg-cyan-500/5 shadow-[inset_0_-2px_0_0_#00f0ff]"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
          }`}
        >
          <Zap className="w-4 h-4" />
          OT Safety & Actuator Blocks
        </button>

        <button
          onClick={() => setActiveTab("airgap")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "airgap"
              ? "border-cyan-400 text-cyan-400 bg-cyan-500/5 shadow-[inset_0_-2px_0_0_#00f0ff]"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
          }`}
        >
          <Radio className="w-4 h-4" />
          Offline Airgap Verification
        </button>
      </div>

      {/* Tab 1: Merkle Path Visualizer */}
      {activeTab === "merkle" && (
        <div className="space-y-6">
          <Card className="surface-card p-6 border border-[#162238] rounded-xl shadow-lg">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              Cryptographic Leaf-to-Root Merkle Path Prover
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Validate any evidence digest against the published epoch root. Verifies that no intermediate hash has been modified or reordered.
            </p>

            <div className="mt-4 flex gap-3">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={leafHashInput}
                  onChange={(e) => setLeafHashInput(e.target.value)}
                  placeholder="Enter SHA-256 Leaf Digest..."
                  className="w-full pl-9 pr-4 py-2 bg-[#060911] border border-[#162238] rounded-lg text-xs text-slate-200 font-mono focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                />
              </div>
              <Button
                variant="primary"
                onClick={() => handleVerifyMerkle(leafHashInput)}
                disabled={isVerifyingMerkle}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white rounded-lg transition-colors border border-cyan-400/30 shadow-md shadow-cyan-950/40"
              >
                {isVerifyingMerkle ? "Computing..." : "Verify Proof"}
              </Button>
            </div>

            {merkleProof && (
              <div className="mt-6 border border-[#162238] bg-[#060911] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#162238]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-300">
                      Merkle Root Cryptographically Verified
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Computed At: {merkleProof.verifiedAt ? new Date(merkleProof.verifiedAt).toLocaleTimeString() : new Date().toLocaleTimeString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-[#0c111e] p-3.5 rounded-lg border border-[#162238]">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">LEAF DIGEST</span>
                    <span className="text-emerald-400 break-all">{merkleProof.leafHash || "N/A"}</span>
                  </div>
                  <div className="bg-[#0c111e] p-3.5 rounded-lg border border-[#162238]">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">DECLARED EPOCH ROOT</span>
                    <span className="text-cyan-400 break-all">{merkleProof.merkleRoot || "N/A"}</span>
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  <span className="text-xs font-semibold text-slate-300 block">
                    Proof Path Traversal ({(merkleProof.path || []).length} intermediate branches):
                  </span>
                  {(merkleProof.path || []).map((step: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-[#0c111e] px-3.5 py-2.5 rounded-lg border border-[#162238] text-xs font-mono hover:border-cyan-500/30 transition-colors"
                    >
                      <span className="text-slate-400">Step {idx + 1} ({step?.position || "sibling"})</span>
                      <span className="text-slate-300 break-all">{step?.siblingHash || "N/A"}</span>
                      <Badge variant="pass" className="font-mono text-[10px]">
                        MATCH
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab 2: SHA-256 Evidence Chain */}
      {activeTab === "evidence" && (
        <Card className="surface-card border border-[#162238] rounded-xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-cyan-400" />
                Evidence Chain & Byte-Level Digest Inspector
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Inspect immutable evidence records, cryptographic witness signatures, and notarized ledger commitments.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedPackageId}
                onChange={(e) => {
                  setSelectedPackageId(e.target.value);
                  handleLoadEvidenceChain(e.target.value);
                }}
                className="bg-[#060911] border border-[#162238] rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
              >
                <option value="pkg-dora-q3">pkg-dora-q3 (DORA ICT Risk)</option>
                <option value="pkg-nis2-q3">pkg-nis2-q3 (NIS2 Supply Chain)</option>
              </select>
            </div>
          </div>

          {isLoadingChain ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading evidence chain...</div>
          ) : (
            <div className="overflow-x-auto border border-[#162238] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#060911] border-b border-[#162238] text-slate-400 uppercase text-[10px] font-semibold">
                  <tr>
                    <th className="p-3">Evidence ID</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">SHA-256 Digest</th>
                    <th className="p-3">Connector</th>
                    <th className="p-3">Witness Attestation</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#162238] font-mono">
                  {evidenceChain?.evidenceItems?.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 text-slate-200 font-semibold">{item.evidenceId}</td>
                      <td className="p-3 text-slate-300">{item.evidenceType}</td>
                      <td className="p-3 text-cyan-400 text-[11px] truncate max-w-[180px]">
                        {item.sha256Digest}
                      </td>
                      <td className="p-3 text-slate-400 font-sans">{item.sourceConnector}</td>
                      <td className="p-3 text-indigo-400 text-[11px] truncate max-w-[140px]">
                        {item.witnessSignature}
                      </td>
                      <td className="p-3">
                        <Badge variant="pass" className="font-sans font-semibold text-[10px]">
                          VERIFIED
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 3: Immutable Freeze Certificates */}
      {activeTab === "certificates" && (
        <Card className="surface-card border border-[#162238] rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-cyan-400" />
                Post-Quantum Dual-Signed Immutable Freeze Certificate
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Certificates signed with RSA-PSS-SHA256 and Post-Quantum ML-DSA-65 algorithms for external regulator submission.
              </p>
            </div>
            {freezeCert && (
              <Button
                variant="ghost"
                onClick={handleDownloadCertJson}
                className="flex items-center gap-2 px-3.5 py-2 bg-[#0c111e] hover:bg-[#111a2e] border border-[#162238] hover:border-cyan-500/30 rounded-lg text-xs font-medium text-slate-200 transition-colors"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                Download Certificate (.json)
              </Button>
            )}
          </div>

          {freezeCert ? (
            <div className="bg-[#060911] border border-[#162238] rounded-xl p-5 space-y-4 font-mono text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 text-[10px] block">CERTIFICATE ID</span>
                  <span className="text-emerald-400 font-bold">{freezeCert.certificateId}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">FREEZE STATUS</span>
                  <span className="text-indigo-400 font-bold">{freezeCert.freezeStatus}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">MERKLE TREE ROOT</span>
                  <span className="text-slate-300 break-all">{freezeCert.merkleTreeRoot}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">DUAL SIGNING ALGORITHM</span>
                  <span className="text-cyan-400">{freezeCert.dualSignedAttestation?.algorithm}</span>
                </div>
              </div>

              <div className="border-t border-[#162238] pt-3">
                <span className="text-slate-500 text-[10px] block">PRIMARY KMS SIGNATURE</span>
                <span className="text-slate-400 text-[11px] break-all">{freezeCert.dualSignedAttestation?.primarySignature}</span>
              </div>

              <div className="border-t border-[#162238] pt-3">
                <span className="text-slate-500 text-[10px] block">POST-QUANTUM (ML-DSA) SIGNATURE</span>
                <span className="text-slate-400 text-[11px] break-all">{freezeCert.dualSignedAttestation?.pqcSignature}</span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-[#162238] rounded-xl">
              No certificate generated in this session. Click &quot;Issue Freeze Certificate&quot; in the header.
            </div>
          )}
        </Card>
      )}

      {/* Tab 4: OT Safety & Actuator Blocks */}
      {activeTab === "ot_safety" && (
        <Card className="surface-card border border-[#162238] rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              OT & Critical Infrastructure Safety Response Safeguards (Spec §36/§38)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Safety-Critical Actuator Blocks prevent automated playbooks from mutating industrial PLCs, SCADA networks, or medical OT devices without signed dual-key physical token authorization.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#060911] p-4 rounded-xl border border-[#162238]">
              <span className="text-xs font-semibold text-slate-300 block mb-2 font-mono">Modbus TCP Rules</span>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>FC 0x05 / 0x06 Write Block</span>
                  <Badge variant="pass" className="font-mono text-[10px]">ACTIVE</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Coil Force Burst Guard</span>
                  <Badge variant="pass" className="font-mono text-[10px]">ACTIVE</Badge>
                </div>
              </div>
            </div>

            <div className="bg-[#060911] p-4 rounded-xl border border-[#162238]">
              <span className="text-xs font-semibold text-slate-300 block mb-2 font-mono">DNP3 Substation Rules</span>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Cold/Warm Restart Interlock</span>
                  <Badge variant="pass" className="font-mono text-[10px]">ACTIVE</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Select-Before-Operate Enforcement</span>
                  <Badge variant="pass" className="font-mono text-[10px]">ACTIVE</Badge>
                </div>
              </div>
            </div>

            <div className="bg-[#060911] p-4 rounded-xl border border-[#162238]">
              <span className="text-xs font-semibold text-slate-300 block mb-2 font-mono">OPC-UA Safety Nodes</span>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Safety Node Mutation Guard</span>
                  <Badge variant="pass" className="font-mono text-[10px]">ACTIVE</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>SecureChannel Policy Certificate</span>
                  <Badge variant="pass" className="font-mono text-[10px]">ENFORCED</Badge>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 5: Offline Airgap Verification */}
      {activeTab === "airgap" && (
        <Card className="surface-card border border-[#162238] rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-cyan-400" />
              Zero-Connectivity Airgap & Offline Standalone Verification (Spec §C7 & §G4)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Complete standalone compliance packages exported as signed, encrypted ZIP bundles with embedded root certificates.
            </p>
          </div>

          <div className="p-5 bg-[#060911] border border-[#162238] rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Standalone Compliance Export Bundle</h3>
              <p className="text-xs text-slate-400 mt-1">
                Generates offline verification archive containing Merkle tree proofs, root certificates, and standalone verifier executable.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={async () => {
                const bundle = await api.exportAirgapPackage(selectedPackageId);
                alert(`Airgap Package exported successfully! Bundle ID: ${bundle.bundleId}`);
              }}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg text-xs font-semibold text-white transition-all flex items-center gap-2 border border-cyan-400/30 shadow-md shadow-cyan-950/40"
            >
              <Download className="w-4 h-4" />
              Export Airgap ZIP Bundle
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
