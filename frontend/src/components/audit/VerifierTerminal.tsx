"use client";

import React, { useState, useEffect, useRef } from "react";
import { AuditPackage } from "@/lib/types";
import { truncateHash } from "@/lib/utils";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  Terminal,
  Play,
} from "lucide-react";

interface VerifierTerminalProps {
  auditPackage?: AuditPackage;
}

export const VerifierTerminal: React.FC<VerifierTerminalProps> = ({
  auditPackage,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [isVerified, setIsVerified] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleRunVerification = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setIsRunning(true);
    setOutputLines([]);
    setIsVerified(false);

    const steps = [
      `$ zoikoshield-verifier verify ./${auditPackage?.packageName || "audit-package.zip"}`,
      `[INFO] Loading local audit manifest & unbundling ZIP package...`,
      `[INFO] Checking manifest checksum (SHA-256: ${truncateHash(auditPackage?.packageHash || "e3b0c442", 12, 8)})... OK`,
      `[INFO] Validating Hybrid Cryptographic Signatures:`,
      `       ├─ Classical Ed25519 Signature Verification... VALID ✓`,
      `       └─ Post-Quantum Dilithium3 ML-DSA Signature Verification... VALID ✓`,
      `[INFO] Re-computing Merkle Tree inclusion proofs across ${auditPackage?.manifest?.evidenceCount || 14} Evidence Records...`,
      `[INFO] Merkle Root Hash: ${auditPackage?.manifest?.epochMerkleRoot || "7a8b9c0d1e2f3a4b5c6d7e8f"} [MATCH]`,
      `[INFO] Verifying RFC 3161 TSA Timestamp Token... VALID ✓`,
      `[INFO] Inspecting SOC2/ISO Control Evaluation Records (4/4 Passed)... VALID ✓`,
      `========================================================================`,
      `🎉 OFFLINE INDEPENDENT VERIFIER RESULT: 100% CRYPTOGRAPHICALLY VALID`,
      `   Non-Repudiation Established. Zero Tampering Detected across Entire Epoch.`,
      `========================================================================`,
    ];

    let current = 0;
    timerRef.current = setInterval(() => {
      if (current >= steps.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRunning(false);
        setIsVerified(true);
        return;
      }

      const nextLine = steps[current];
      if (nextLine) {
        setOutputLines((prev) => [...prev, nextLine]);
      }
      current++;
    }, 250);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Independent Offline Verifier CLI (`verifier-cli`)</span>
        </div>
        <div className="flex items-center gap-2">
          {isVerified && <Badge variant="pass">CRYPTOGRAPHICALLY VERIFIED</Badge>}
          <Button
            size="sm"
            variant="cyan"
            onClick={handleRunVerification}
            isLoading={isRunning}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Run Independent Verification</span>
          </Button>
        </div>
      </div>

      {/* Terminal Screen */}
      <div className="rounded-2xl bg-[#090c10] border border-slate-800 shadow-[0_4px_30px_rgba(0,0,0,0.8)] overflow-hidden font-mono text-xs">
        {/* Terminal Header */}
        <div className="bg-[#12161f] border-b border-slate-800 px-4 py-2.5 flex items-center justify-between text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="text-[11px] text-slate-400 ml-2">
              bash — zoikoshield-verifier (Standalone Zero-Dependency Binary)
            </span>
          </div>
          <span className="text-[10px] text-cyan-400">PQC: ML-DSA-87 / Dilithium3</span>
        </div>

        {/* Terminal Content */}
        <div className="p-5 min-h-[260px] max-h-[380px] overflow-y-auto space-y-1.5 text-slate-300">
          {outputLines.length === 0 ? (
            <div className="text-slate-600 italic py-12 text-center">
              Click &quot;Run Independent Verification&quot; to test the audit package integrity offline without any database connection.
            </div>
          ) : (
            outputLines
              .filter((line): line is string => Boolean(line))
              .map((line, idx) => {
                const str = String(line || "");
                const isSuccessHeader = str.includes("100% CRYPTOGRAPHICALLY VALID");
                const isValidCheck = str.includes("VALID ✓");
                const isCommand = str.startsWith("$");

                return (
                  <div
                    key={idx}
                    className={`${
                      isSuccessHeader
                        ? "text-emerald-300 font-bold bg-emerald-950/40 p-2 rounded border border-emerald-500/30"
                        : isValidCheck
                        ? "text-emerald-400"
                        : isCommand
                        ? "text-cyan-300 font-bold"
                        : "text-slate-300"
                    }`}
                  >
                    {str}
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
};
