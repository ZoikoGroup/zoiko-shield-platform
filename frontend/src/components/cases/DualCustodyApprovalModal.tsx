"use client";

import React from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangle, RotateCcw, Users } from "lucide-react";

export interface DualCustodyModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  proposalId: string;
  actionType: string;
  targetResource: string;
  blastRadiusScore?: number;
  reversibilityTier?: string;
  rollbackCommand?: string;
}

/**
 * Shows what a live dual-custody action would require. It cannot collect the
 * quorum itself: two approvals from one browser session prove one person, and
 * the backend quorum is only reachable service-to-service. Approval happens on
 * the response proposal, where each approver acts from their own session.
 */
export const DualCustodyApprovalModal: React.FC<DualCustodyModalProps> = ({
  isOpen,
  onClose,
  caseId,
  proposalId,
  actionType,
  targetResource,
  blastRadiusScore = 0.05,
  reversibilityTier = "R1",
  rollbackCommand = "RESTORE_USER_SESSION_CACHE",
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dual-Custody Approval Required" maxWidth="xl">
      <div className="space-y-5 text-xs text-slate-300">
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3 text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-semibold text-amber-100">Live execution needs two distinct approvers</h4>
            <p className="text-[11px] text-amber-300/80">
              High-impact containment requires two different authorized people, each signing in from their own
              session. This console cannot collect that quorum, so no live action is dispatched from here.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400">Target Action:</span>
            <Badge variant="critical">{actionType}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400">Target Resource:</span>
            <span className="font-mono text-slate-100 font-semibold">{targetResource}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400">Estimated Blast Radius:</span>
            <span className="text-slate-200 font-mono">{(blastRadiusScore * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400">Reversibility Tier:</span>
            <span className="text-slate-200 font-mono">Tier {reversibilityTier}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <span className="font-mono text-slate-400 flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
              Compensating Command:
            </span>
            <span className="font-mono text-blue-300 bg-blue-950/50 px-2 py-0.5 rounded border border-blue-500/30">
              {rollbackCommand}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3">
          <Users className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-300">
            Open the response proposal for case <span className="font-mono text-slate-100">{caseId}</span>{" "}
            (proposal <span className="font-mono text-slate-100">{proposalId}</span>). Each approver records their
            decision there from their own signed-in session.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Link href="/response-proposals">
            <Button variant="primary" size="sm" className="font-mono font-bold">
              Go to Response Proposals
            </Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
};
