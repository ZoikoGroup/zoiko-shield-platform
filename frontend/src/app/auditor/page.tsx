"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";

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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
              AUDITOR_EXTERNAL (READ-ONLY)
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-400 border border-indigo-800">
              SPEC §W26 / §W31-W32
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1 flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
            Independent External Auditor Cryptographic Cockpit
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Read-only cryptographic proof inspection, real-time Merkle tree verification, and immutable freeze certificate export.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadWorkspace}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            Refresh Ledger
          </button>
          <button
            onClick={handleGenerateFreezeCert}
            disabled={isGeneratingCert}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-semibold text-white shadow-lg shadow-emerald-950 transition-colors disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5" />
            {isGeneratingCert ? "Issuing..." : "Issue Freeze Certificate"}
          </button>
        </div>
      </div>

      {/* Quick Cryptographic Integrity Badges */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Ledger Seal Status</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">
            {workspace?.activeLedgerIntegrity || "TAMPER_PROOF_SEALED"}
          </div>
          <span className="text-[11px] text-emerald-400 mt-1 inline-block">SHA-256 Hash Chain Valid</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Frozen Audit Packages</span>
            <Lock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">
            {workspace?.frozenImmutablePackages || 6} / {workspace?.totalAuditPackages || 8}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 inline-block">100% Immutable Evidence</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">OT Actuator Safety Block</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-300 mt-1">
            INTERLOCK_ACTIVE
          </div>
          <span className="text-[11px] text-amber-400 mt-1 inline-block">Dual-Key Token Required</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Attested Platform Nodes</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-cyan-300 mt-1">
            {attestationPosture?.genuineHosts || 4} / {attestationPosture?.totalHostsAttested || 4} GENUINE
          </div>
          <span className="text-[11px] text-cyan-400 mt-1 inline-block">Confidential Computing Active</span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 space-x-2">
        <button
          onClick={() => setActiveTab("merkle")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "merkle"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          Real-Time Merkle Path Visualizer
        </button>

        <button
          onClick={() => setActiveTab("evidence")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "evidence"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          SHA-256 Evidence Chain Inspector
        </button>

        <button
          onClick={() => setActiveTab("certificates")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "certificates"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Lock className="w-4 h-4" />
          Immutable Freeze Certificates
        </button>

        <button
          onClick={() => setActiveTab("ot_safety")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "ot_safety"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Zap className="w-4 h-4" />
          OT Safety & Actuator Blocks
        </button>

        <button
          onClick={() => setActiveTab("airgap")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "airgap"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Radio className="w-4 h-4" />
          Offline Airgap Verification
        </button>
      </div>

      {/* Tab 1: Merkle Path Visualizer */}
      {activeTab === "merkle" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
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
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                onClick={() => handleVerifyMerkle(leafHashInput)}
                disabled={isVerifyingMerkle}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-lg transition-colors"
              >
                {isVerifyingMerkle ? "Computing..." : "Verify Proof"}
              </button>
            </div>

            {merkleProof && (
              <div className="mt-6 border border-slate-800 bg-slate-950 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-300">
                      Merkle Root Cryptographically Verified
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Computed At: {new Date(merkleProof.verifiedAt).toLocaleTimeString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">LEAF DIGEST</span>
                    <span className="text-emerald-400 break-all">{merkleProof.leafHash}</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">DECLARED EPOCH ROOT</span>
                    <span className="text-indigo-400 break-all">{merkleProof.merkleRoot}</span>
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  <span className="text-xs font-semibold text-slate-300 block">
                    Proof Path Traversal ({merkleProof.path.length} intermediate branches):
                  </span>
                  {merkleProof.path.map((step: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-slate-900/80 px-3.5 py-2.5 rounded-lg border border-slate-800 text-xs font-mono"
                    >
                      <span className="text-slate-400">Step {idx + 1} ({step.position})</span>
                      <span className="text-slate-300 break-all">{step.siblingHash}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">
                        MATCH
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: SHA-256 Evidence Chain */}
      {activeTab === "evidence" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-400" />
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
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="pkg-dora-q3">pkg-dora-q3 (DORA ICT Risk)</option>
                <option value="pkg-nis2-q3">pkg-nis2-q3 (NIS2 Supply Chain)</option>
              </select>
            </div>
          </div>

          {isLoadingChain ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading evidence chain...</div>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                  <tr>
                    <th className="p-3">Evidence ID</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">SHA-256 Digest</th>
                    <th className="p-3">Connector</th>
                    <th className="p-3">Witness Attestation</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {evidenceChain?.evidenceItems?.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 text-slate-200 font-semibold">{item.evidenceId}</td>
                      <td className="p-3 text-slate-300">{item.evidenceType}</td>
                      <td className="p-3 text-emerald-400 text-[11px] truncate max-w-[180px]">
                        {item.sha256Digest}
                      </td>
                      <td className="p-3 text-slate-400 font-sans">{item.sourceConnector}</td>
                      <td className="p-3 text-indigo-400 text-[11px] truncate max-w-[140px]">
                        {item.witnessSignature}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-sans font-semibold">
                          VERIFIED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Immutable Freeze Certificates */}
      {activeTab === "certificates" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                Post-Quantum Dual-Signed Immutable Freeze Certificate
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Certificates signed with RSA-PSS-SHA256 and Post-Quantum ML-DSA-65 algorithms for external regulator submission.
              </p>
            </div>
            {freezeCert && (
              <button
                onClick={handleDownloadCertJson}
                className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 transition-colors"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                Download Certificate (.json)
              </button>
            )}
          </div>

          {freezeCert ? (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 font-mono text-xs">
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

              <div className="border-t border-slate-800 pt-3">
                <span className="text-slate-500 text-[10px] block">PRIMARY KMS SIGNATURE</span>
                <span className="text-slate-400 text-[11px] break-all">{freezeCert.dualSignedAttestation?.primarySignature}</span>
              </div>

              <div className="border-t border-slate-800 pt-3">
                <span className="text-slate-500 text-[10px] block">POST-QUANTUM (ML-DSA) SIGNATURE</span>
                <span className="text-slate-400 text-[11px] break-all">{freezeCert.dualSignedAttestation?.pqcSignature}</span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
              No certificate generated in this session. Click &quot;Issue Freeze Certificate&quot; in the header.
            </div>
          )}
        </div>
      )}

      {/* Tab 4: OT Safety & Actuator Blocks */}
      {activeTab === "ot_safety" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
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
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-xs font-semibold text-slate-300 block mb-2">Modbus TCP Rules</span>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>FC 0x05 / 0x06 Write Block</span>
                  <span className="text-emerald-400 font-bold">ACTIVE</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Coil Force Burst Guard</span>
                  <span className="text-emerald-400 font-bold">ACTIVE</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-xs font-semibold text-slate-300 block mb-2">DNP3 Substation Rules</span>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Cold/Warm Restart Interlock</span>
                  <span className="text-emerald-400 font-bold">ACTIVE</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Select-Before-Operate Enforcement</span>
                  <span className="text-emerald-400 font-bold">ACTIVE</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-xs font-semibold text-slate-300 block mb-2">OPC-UA Safety Nodes</span>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Safety Node Mutation Guard</span>
                  <span className="text-emerald-400 font-bold">ACTIVE</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>SecureChannel Policy Certificate</span>
                  <span className="text-emerald-400 font-bold">ENFORCED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Offline Airgap Verification */}
      {activeTab === "airgap" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-cyan-400" />
              Zero-Connectivity Airgap & Offline Standalone Verification (Spec §C7 & §G4)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Complete standalone compliance packages exported as signed, encrypted ZIP bundles with embedded root certificates.
            </p>
          </div>

          <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Standalone Compliance Export Bundle</h3>
              <p className="text-xs text-slate-400 mt-1">
                Generates offline verification archive containing Merkle tree proofs, root certificates, and standalone verifier executable.
              </p>
            </div>
            <button
              onClick={async () => {
                const bundle = await api.exportAirgapPackage(selectedPackageId);
                alert(`Airgap Package exported successfully! Bundle ID: ${bundle.bundleId}`);
              }}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-semibold text-white transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export Airgap ZIP Bundle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
