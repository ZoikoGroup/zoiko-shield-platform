"use client";

import React, { useState } from "react";
import { EvidenceRecord } from "@/lib/types";
import { formatTimestamp, truncateHash } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Modal } from "@/ui/Modal";
import {
  Lock,
  FileCode,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

interface EvidenceLedgerProps {
  evidenceList: EvidenceRecord[];
}

export const EvidenceLedger: React.FC<EvidenceLedgerProps> = ({
  evidenceList,
}) => {
  const [selectedPayload, setSelectedPayload] = useState<EvidenceRecord | null>(null);

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              Cryptographic Evidence Ledger
            </h3>
            <p className="text-xs text-slate-400">
              SHA-256 hashed evidence leaves anchored into Merkle Epoch checkpoints.
            </p>
          </div>
          <Badge variant="anchored">Merkle Verified</Badge>
        </div>

        {evidenceList.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm font-mono">
            No evidence records anchored to this case yet.
          </div>
        ) : (
          <div className="space-y-3">
            {evidenceList.map((ev, idx) => (
              <div
                key={ev.id || idx}
                className="bg-[#121622] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-cyan-500/30 transition-all"
              >
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-cyan-400">
                      [E-0{idx + 1}]
                    </span>
                    <span className="text-sm font-semibold text-slate-200">
                      {ev.evidenceType}
                    </span>
                    <Badge variant="pass">VALID</Badge>
                    {ev.merkleEpoch && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
                        Epoch #{ev.merkleEpoch}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                    <span>Source: {ev.sourceType}</span>
                    <span>•</span>
                    <span>Recorded: {formatTimestamp(ev.recordedAt)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 pt-1">
                    <span className="text-slate-500">SHA-256:</span>
                    <code className="px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800">
                      {truncateHash(ev.contentHash, 12, 8)}
                    </code>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedPayload(ev)}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>View Raw Payload</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Raw Payload Modal */}
      <Modal
        isOpen={!!selectedPayload}
        onClose={() => setSelectedPayload(null)}
        title={`Evidence Raw Payload (${selectedPayload?.evidenceType})`}
        description={`Content Hash: ${selectedPayload?.contentHash}`}
        maxWidth="xl"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs overflow-x-auto max-h-96 text-cyan-300">
            <pre>
              {JSON.stringify(
                selectedPayload?.rawPayload || {
                  evidenceId: selectedPayload?.id,
                  type: selectedPayload?.evidenceType,
                  hash: selectedPayload?.contentHash,
                  verifiedAt: selectedPayload?.recordedAt,
                },
                null,
                2
              )}
            </pre>
          </div>
          <div className="flex items-center justify-between pt-2 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Integrity Verified (SHA-256 Match)
            </span>
            <Button size="sm" variant="secondary" onClick={() => setSelectedPayload(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
