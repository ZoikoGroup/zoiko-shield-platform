"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Play,
  CheckCircle2,
  RotateCcw,
  Terminal,
  Activity,
  Clock,
  UserCheck,
  FileCheck2,
} from "lucide-react";

interface PlaybookStep {
  stepNumber: number;
  name: string;
  action: string;
  provider: string;
  status: "COMPLETED" | "RUNNING" | "WAITING_APPROVAL" | "PENDING" | "ROLLED_BACK";
  durationMs: number;
  outputLog: string;
  blastScore: number;
  compensatingAction?: string;
}

interface PlaybookRun {
  id: string;
  name: string;
  caseId: string;
  triggeredBy: string;
  startedAt: string;
  status: "COMPLETED" | "RUNNING" | "PAUSED_4_EYES" | "ROLLED_BACK";
  blastRadiusTotal: number;
  steps: PlaybookStep[];
  merkleReceiptHash: string;
}

const PLAYBOOK_RUNS: PlaybookRun[] = [
  {
    id: "run-pb-2026-0924-001",
    name: "Automated Ransomware Containment & Forensics",
    caseId: "CASE-2026-09-8812",
    triggeredBy: "Detection: DET-EDR-RANSOMWARE-DETECTED",
    startedAt: "2026-09-24 19:14:02 UTC",
    status: "PAUSED_4_EYES",
    blastRadiusTotal: 0.08,
    merkleReceiptHash: "0x8f19e4a3b8c27d119e5f4a6b2c8901fe7a6d89ef",
    steps: [
      {
        stepNumber: 1,
        name: "Capture Ephemeral Volatile Memory",
        action: "MEMORY_FORENSIC_ACQUISITION",
        provider: "CrowdStrike LiveResponse",
        status: "COMPLETED",
        durationMs: 420,
        outputLog: "Memory dump 4.2GB captured to encrypted WORM GCS vault gs://zs-evidence-vault-eu-west3/forensics/dump-srv-db-02.raw.enc",
        blastScore: 0.0,
      },
      {
        stepNumber: 2,
        name: "Isolate Compromised Server from Subnet",
        action: "NETWORK_ISOLATE_HOST",
        provider: "CrowdStrike Falcon EDR",
        status: "COMPLETED",
        durationMs: 180,
        outputLog: "Host srv-db-prod-02.internal isolated from 10.10.0.0/20. Tunnel maintained on port 443 for agent telemetry.",
        blastScore: 0.05,
        compensatingAction: "NETWORK_UNISOLATE_HOST",
      },
      {
        stepNumber: 3,
        name: "Revoke Active Kerberos & IAM Service Tokens",
        action: "REVOKE_IAM_SESSION",
        provider: "Microsoft Entra ID Connector",
        status: "COMPLETED",
        durationMs: 310,
        outputLog: "Session tokens for principal svc-backup-worker revoked across all tenant resource groups.",
        blastScore: 0.03,
        compensatingAction: "RESTORE_IAM_SESSION",
      },
      {
        stepNumber: 4,
        name: "Enforce Perimeter WAF Edge Block on C2 IP",
        action: "APPLY_WAF_BLOCK",
        provider: "Cloud Perimeter WAF",
        status: "WAITING_APPROVAL",
        durationMs: 0,
        outputLog: "Action requires 4-eyes approval quorum (R3 tier). Waiting for secondary operator passkey validation.",
        blastScore: 0.02,
        compensatingAction: "REMOVE_WAF_BLOCK",
      },
      {
        stepNumber: 5,
        name: "Generate Cryptographic Merkle Attestation",
        action: "ANCHOR_EVIDENCE_RECEIPT",
        provider: "shield-anchor (Cloud KMS P-256)",
        status: "PENDING",
        durationMs: 0,
        outputLog: "Pending prior action step resolution.",
        blastScore: 0.0,
      },
    ],
  },
  {
    id: "run-pb-2026-0923-002",
    name: "Credential Compromise Blast Mitigation",
    caseId: "CASE-2026-09-8809",
    triggeredBy: "Detection: DET-IAM-IMPOSSIBLE-TRAVEL",
    startedAt: "2026-09-23 11:22:15 UTC",
    status: "COMPLETED",
    blastRadiusTotal: 0.03,
    merkleReceiptHash: "0x3b91a742c0f1882d9a10bcfe81992ad301824ef1",
    steps: [
      {
        stepNumber: 1,
        name: "Invalidate OAuth Refresh Tokens",
        action: "REVOKE_OAUTH_GRANTS",
        provider: "ZoikoID OIDC Provider",
        status: "COMPLETED",
        durationMs: 140,
        outputLog: "All refresh tokens for dev-user@zoiko.example invalidated.",
        blastScore: 0.01,
      },
      {
        stepNumber: 2,
        name: "Trigger Forced Step-Up WebAuthn Challenge",
        action: "FORCE_WEBAUTHN_CHALLENGE",
        provider: "ZoikoShield Identity Adapter",
        status: "COMPLETED",
        durationMs: 95,
        outputLog: "Step-up challenge delivered via passkey prompt.",
        blastScore: 0.02,
      },
    ],
  },
];

export default function PlaybooksRunPage() {
  const [runs, setRuns] = useState<PlaybookRun[]>(PLAYBOOK_RUNS);
  const [selectedRun, setSelectedRun] = useState<PlaybookRun>(PLAYBOOK_RUNS[0]);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleApproveStep = (runId: string, stepNumber: number) => {
    setRuns((prev) =>
      prev.map((r) => {
        if (r.id !== runId) return r;
        const updatedSteps = r.steps.map((s) =>
          s.stepNumber === stepNumber
            ? {
                ...s,
                status: "COMPLETED" as const,
                durationMs: 240,
                outputLog: "4-eyes approval granted by secondary operator. WAF block 198.51.100.42/32 applied to perimeter.",
              }
            : s.stepNumber === stepNumber + 1
            ? {
                ...s,
                status: "COMPLETED" as const,
                durationMs: 120,
                outputLog: "Merkle root anchored to Cloud KMS & GCS WORM store.",
              }
            : s
        );
        return {
          ...r,
          status: "COMPLETED" as const,
          steps: updatedSteps,
        };
      })
    );

    setSelectedRun((prev) => ({
      ...prev,
      status: "COMPLETED",
      steps: prev.steps.map((s) =>
        s.stepNumber === stepNumber
          ? {
              ...s,
              status: "COMPLETED",
              durationMs: 240,
              outputLog: "4-eyes approval granted by secondary operator. WAF block applied.",
            }
          : s.stepNumber === stepNumber + 1
          ? {
              ...s,
              status: "COMPLETED",
              durationMs: 120,
              outputLog: "Merkle root anchored to Cloud KMS.",
            }
          : s
      ),
    }));

    setActionNotice("Playbook step approved via Dual-Custody. Execution completed and cryptographically signed.");
    setTimeout(() => setActionNotice(null), 6000);
  };

  const handleEmergencyHalt = (runId: string) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: "ROLLED_BACK",
              steps: r.steps.map((s) =>
                s.status === "COMPLETED" && s.compensatingAction
                  ? { ...s, status: "ROLLED_BACK", outputLog: `Compensating command executed: ${s.compensatingAction}` }
                  : s
              ),
            }
          : r
      )
    );
    setSelectedRun((prev) => ({
      ...prev,
      status: "ROLLED_BACK",
      steps: prev.steps.map((s) =>
        s.status === "COMPLETED" && s.compensatingAction
          ? { ...s, status: "ROLLED_BACK", outputLog: `Compensating command executed: ${s.compensatingAction}` }
          : s
      ),
    }));
    setActionNotice("Emergency Kill-Switch triggered. Compensating actions executed across all affected endpoints.");
    setTimeout(() => setActionNotice(null), 6000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="neutral" className="bg-indigo-950/60 text-indigo-400 border-indigo-800 text-xs">
              Contract W18 • SOAR Playbook Engine
            </Badge>
            <Badge variant="active" className="bg-emerald-950/60 text-emerald-400 border-emerald-800 text-xs">
              Bounded Sandboxing
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="h-6 w-6 text-indigo-400" />
            Active SOAR Playbook Execution Cockpit
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time DAG execution tracking, step-by-step forensic logging, 4-eyes approval pauses, and compensating rollback execution.
          </p>
        </div>

        <div className="mt-4 md:mt-0 flex gap-3">
          <Button
            variant="secondary"
            className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            onClick={() => setActionNotice("Refreshed playbook runtime telemetry from shield-action.")}
          >
            <Clock className="h-4 w-4 mr-2" />
            Execution History
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
            onClick={() => setActionNotice("Select a case from the Case Workspace to launch a new Playbook Run.")}
          >
            <Play className="h-4 w-4 mr-2" />
            Launch Playbook
          </Button>
        </div>
      </div>

      {actionNotice && (
        <div className="mt-4 p-4 rounded-lg bg-indigo-950/80 border border-indigo-700 text-indigo-200 text-sm flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-indigo-400 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Main Layout */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Active Runs */}
        <div className="lg:col-span-4 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-400" />
            Recent Playbook Executions
          </h2>

          <div className="space-y-3">
            {runs.map((run) => {
              const isSelected = selectedRun.id === run.id;
              return (
                <Card
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={`p-4 cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-slate-900/90 border-indigo-500 shadow-lg shadow-indigo-500/10"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono text-indigo-400">{run.caseId}</span>
                      <h3 className="font-semibold text-slate-100 text-sm mt-0.5">{run.name}</h3>
                    </div>
                    <Badge
                      variant={
                        run.status === "COMPLETED"
                          ? "pass"
                          : run.status === "PAUSED_4_EYES"
                          ? "pending"
                          : run.status === "RUNNING"
                          ? "active"
                          : "fail"
                      }
                    >
                      {run.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-400 mt-2">{run.triggeredBy}</p>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[11px] text-slate-500">{run.startedAt}</span>
                    <span className="text-slate-300 font-medium">Blast Score: {run.blastRadiusTotal}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Right Column: Execution Step Timeline & Logs */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="p-6 bg-slate-900/60 border-slate-800">
            {/* Header of Run */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" className="text-xs border-slate-700 text-slate-300">
                    {selectedRun.id}
                  </Badge>
                  <span className="text-xs text-slate-400 font-mono">Case: {selectedRun.caseId}</span>
                </div>
                <h2 className="text-xl font-bold text-white mt-1">{selectedRun.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Started {selectedRun.startedAt}</p>
              </div>

              <div className="flex gap-2">
                {selectedRun.status !== "ROLLED_BACK" && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="border-red-800 bg-red-950/30 text-red-400 hover:bg-red-900/50"
                    onClick={() => handleEmergencyHalt(selectedRun.id)}
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Emergency Kill-Switch
                  </Button>
                )}
              </div>
            </div>

            {/* Steps Visualizer */}
            <div className="mt-6 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-slate-400" />
                Playbook Execution Flow & Action DAG
              </h3>

              <div className="space-y-3">
                {selectedRun.steps.map((step) => (
                  <div
                    key={step.stepNumber}
                    className={`p-4 rounded-lg border transition-all ${
                      step.status === "WAITING_APPROVAL"
                        ? "bg-amber-950/20 border-amber-800/80 shadow-md shadow-amber-900/20"
                        : step.status === "COMPLETED"
                        ? "bg-slate-950/60 border-slate-800"
                        : step.status === "ROLLED_BACK"
                        ? "bg-red-950/20 border-red-900/40"
                        : "bg-slate-950/30 border-slate-800/50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                            step.status === "COMPLETED"
                              ? "bg-emerald-900/60 text-emerald-400 border border-emerald-700"
                              : step.status === "WAITING_APPROVAL"
                              ? "bg-amber-900/60 text-amber-400 border border-amber-700 animate-pulse"
                              : step.status === "ROLLED_BACK"
                              ? "bg-red-900/60 text-red-400 border border-red-700"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {step.stepNumber}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-100">{step.name}</span>
                            <span className="text-xs font-mono text-slate-400 font-medium">({step.provider})</span>
                          </div>
                          <span className="text-xs font-mono text-indigo-400">{step.action}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {step.status === "WAITING_APPROVAL" && (
                          <Button
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs"
                            onClick={() => handleApproveStep(selectedRun.id, step.stepNumber)}
                          >
                            <UserCheck className="h-3.5 w-3.5 mr-1" />
                            Provide 4-Eyes Approval
                          </Button>
                        )}
                        <Badge
                          variant={
                            step.status === "COMPLETED"
                              ? "pass"
                              : step.status === "WAITING_APPROVAL"
                              ? "pending"
                              : step.status === "ROLLED_BACK"
                              ? "fail"
                              : "neutral"
                          }
                        >
                          {step.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Output Log Console Box */}
                    <div className="mt-3 p-2.5 rounded bg-black/70 border border-slate-800 font-mono text-xs text-slate-300">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pb-1 mb-1 border-b border-slate-900">
                        <span>Output / Telemetry Stream</span>
                        <span>{step.durationMs > 0 ? `${step.durationMs}ms` : "Pending"}</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed break-all">{step.outputLog}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cryptographic Receipt Root */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col md:flex-row md:items-center justify-between text-xs text-slate-400 gap-2">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-emerald-400" />
                <span>Merkle Checkpoint Receipt:</span>
                <span className="font-mono text-slate-200">{selectedRun.merkleReceiptHash}</span>
              </div>
              <div className="font-mono text-[11px] text-slate-500">
                Signer: <span className="text-indigo-400">shield-action / Cloud KMS</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
