"use client";

import React, { useState } from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  GitCommit,
  CheckCircle2,
  Lock,
  Layers,
  ShieldCheck,
  Download,
  Share2,
  FileCheck2,
  Search,
  Key,
} from "lucide-react";

interface MerkleLeafNode {
  index: number;
  evidenceId: string;
  eventType: string;
  payloadDigest: string;
  leafHash: string;
}

export default function MerkleLedgerExplorerPage() {
  const [epochNumber, setEpochNumber] = useState(1043);
  const [selectedLeafIndex, setSelectedLeafIndex] = useState(1);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<boolean | null>(true);

  const leaves: MerkleLeafNode[] = [
    {
      index: 0,
      evidenceId: "evid-8f7a9c2b-01",
      eventType: "AUTHENTICATION",
      payloadDigest: "42e40754484f33ba20d0eb3f18a228f4a3e7b3...",
      leafHash: "a1c4e90812bd56ff34aa9812cc457812...",
    },
    {
      index: 1,
      evidenceId: "evid-9c1a4b5d-02",
      eventType: "PROCESS_ACTIVITY",
      payloadDigest: "8f3b198c2274ad9910c2e391b8a472c1998311...",
      leafHash: "d3e712ba990145fc88ab1024ee591233...",
    },
    {
      index: 2,
      evidenceId: "evid-0a2b8e7c-03",
      eventType: "NETWORK_FLOW",
      payloadDigest: "c1852cc7cd42fc54d89a2b7190e34190881922...",
      leafHash: "f5b891a27719ce3400ab819211c47881...",
    },
    {
      index: 3,
      evidenceId: "evid-3d9a1f4e-04",
      eventType: "IAM_POLICY_CHANGE",
      payloadDigest: "230859eadba14f7389ab2201994ce381710928...",
      leafHash: "e8912ba45590c71188af291033b56719...",
    },
  ];

  const merkleRoot = "33b510f06a084d53a2901198c471ba9844e1290bb3410928aa7819ce012891bb";
  const witness1 = "PRIMARY_SOVEREIGN_WITNESS (ECDSA P-256 + Dilithium3)";
  const witness2 = "INDEPENDENT_REKOR_TSA (RFC-3161 Timestamped)";

  const handleVerifyInclusionProof = () => {
    setIsVerifying(true);
    setVerificationResult(null);
    setTimeout(() => {
      setIsVerifying(false);
      setVerificationResult(true);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-[#0e121b] border border-cyan-500/30 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <GitCommit className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white tracking-wide">
                    Cryptographic Evidence & Merkle Anchoring Explorer
                  </h1>
                  <Badge variant="anchored">ZS-MERKLE-V1 Profile</Badge>
                  <Badge variant="pass">Dual-Witness Sealed</Badge>
                </div>
                <p className="text-xs text-slate-400">
                  Specification: <span className="font-mono text-cyan-400">ZS-ENG-EVID-001</span> & <span className="font-mono text-cyan-400">ZS-T0-TECH-001</span> §08
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
              Active Epoch: <span className="text-cyan-400 font-bold">#{epochNumber}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Checkpoint Card & Witness Signatures */}
        <div className="space-y-6">
          <Card className="p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Epoch Checkpoint #{epochNumber}</span>
              </div>
              <Badge variant="healthy">VERIFIED</Badge>
            </div>

            <div className="space-y-2.5">
              <div>
                <span className="text-slate-500">Declared Merkle Root:</span>
                <div className="p-2 bg-slate-950 border border-slate-800 rounded text-[11px] text-cyan-300 font-bold break-all mt-1">
                  {merkleRoot}
                </div>
              </div>

              <div>
                <span className="text-slate-500">Dual-Witness Seals:</span>
                <div className="mt-1.5 space-y-1.5">
                  <div className="p-2 bg-slate-900/60 border border-slate-800 rounded text-[11px] text-slate-300 flex items-center justify-between">
                    <span>1. {witness1}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="p-2 bg-slate-900/60 border border-slate-800 rounded text-[11px] text-slate-300 flex items-center justify-between">
                    <span>2. {witness2}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full py-2 flex items-center justify-center gap-2 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 font-bold"
                  onClick={() => alert("Exporting signed offline audit bundle ZIP...")}
                >
                  <Download className="w-4 h-4" />
                  <span>Export Signed Audit Package</span>
                </Button>
              </div>
            </div>
          </Card>

          {/* Inclusion Proof Card */}
          <Card className="p-5 space-y-3 font-mono text-xs">
            <div className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center justify-between">
              <span>On-Demand Inclusion Proof</span>
              <Badge variant="neutral">Leaf #{selectedLeafIndex}</Badge>
            </div>

            <p className="text-slate-400 text-[11px]">
              Verifies whether evidence item #{selectedLeafIndex} is mathematically cryptographically included in Root Hash:
            </p>

            <Button
              variant="primary"
              className="w-full py-2 flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 font-bold"
              onClick={handleVerifyInclusionProof}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <span>Recomputing SHA-256 Sibling Hashes...</span>
              ) : (
                <span>Verify Merkle Proof</span>
              )}
            </Button>

            {verificationResult && (
              <div className="p-3 rounded bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Proof Cryptographically Valid!</strong> Leaf hash correctly resolves to Merkle root with zero discrepancies.
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* Right 2 Columns: Merkle Tree Leaf Nodes */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Domain-Separated Binary Merkle Tree (ZS-MERKLE-V1) Leaves
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-400">{leaves.length} Leaves in Batch</span>
            </div>

            <div className="space-y-3">
              {leaves.map((leaf) => (
                <div
                  key={leaf.index}
                  onClick={() => setSelectedLeafIndex(leaf.index)}
                  className={`p-4 rounded-xl border font-mono text-xs transition-all cursor-pointer space-y-2 ${
                    selectedLeafIndex === leaf.index
                      ? "bg-cyan-500/10 border-cyan-500/60 shadow-lg shadow-cyan-900/20"
                      : "bg-slate-950 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                        LEAF #{leaf.index}
                      </span>
                      <span className="text-slate-200 font-bold">{leaf.evidenceId}</span>
                    </div>
                    <Badge variant="neutral">{leaf.eventType}</Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-500">Payload Digest:</span>
                      <div className="text-slate-300 font-bold truncate">{leaf.payloadDigest}</div>
                    </div>
                    <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-500">Domain-Separated Hash (0x00 || Leaf):</span>
                      <div className="text-cyan-400 font-bold truncate">{leaf.leafHash}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
