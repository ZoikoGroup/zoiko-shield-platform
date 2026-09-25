"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  RotateCcw,
  CheckCircle2,
  FileCode2,
  Lock,
  Layers,
  History,
  Sliders,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface PolicyVersion {
  id: string;
  policyName: string;
  domain: "IAM" | "DETECTION" | "RESPONSE" | "RESIDENCY" | "RATE_LIMIT";
  version: string;
  status: "ACTIVE" | "PENDING_APPROVAL" | "STAGED" | "ROLLED_BACK";
  stagedEnvironment: string;
  canaryPercentage: number;
  author: string;
  approvers: string[];
  createdAt: string;
  commitHash: string;
  diffSummary: string;
  diffContent: {
    previous: string;
    proposed: string;
  };
}

const POLICIES: PolicyVersion[] = [
  {
    id: "pol-2026-09-001",
    policyName: "Zero-Trust JIT Admin Escalation Policy",
    domain: "IAM",
    version: "v2.4.1",
    status: "PENDING_APPROVAL",
    stagedEnvironment: "staging-eu-west3",
    canaryPercentage: 10,
    author: "security-architect@zoikoshield.corp",
    approvers: ["soc-lead@zoikoshield.corp"],
    createdAt: "2026-09-24 18:32:00 UTC",
    commitHash: "7f9a2c14e0b",
    diffSummary: "Enforces 4-eyes approval on R3 actions and caps JIT session TTL to 30 minutes in regional cells.",
    diffContent: {
      previous: `version: 2.4.0
jit_elevation:
  max_session_ttl_minutes: 60
  auto_approval_roles: ["SOC_ANALYST_L3"]
  mfa_required: true
  passkey_stepup: optional
response_governance:
  r3_autonomous_allowed: false`,
      proposed: `version: 2.4.1
jit_elevation:
  max_session_ttl_minutes: 30
  auto_approval_roles: [] # Deprecated auto-approval
  mfa_required: true
  passkey_stepup: strict_webauthn
response_governance:
  r3_autonomous_allowed: false
  four_eyes_quorum: 2`,
    },
  },
  {
    id: "pol-2026-09-002",
    policyName: "Regional EU Cell Sovereignty & Residency Fence",
    domain: "RESIDENCY",
    version: "v3.1.0",
    status: "ACTIVE",
    stagedEnvironment: "production-eu-west3",
    canaryPercentage: 100,
    author: "dpo-compliance@zoikoshield.corp",
    approvers: ["ciso@zoikoshield.corp", "lead-sre@zoikoshield.corp"],
    createdAt: "2026-09-22 10:15:00 UTC",
    diffSummary: "Strict fail-closed cross-border route dropping for EU tenant evidence objects.",
    commitHash: "3a88d72e911",
    diffContent: {
      previous: `data_residency:
  region: europe-west3
  fail_open_on_outage: true`,
      proposed: `data_residency:
  region: europe-west3
  fail_open_on_outage: false # Strict fail-closed
  immutable_retention_locked: true`,
    },
  },
  {
    id: "pol-2026-09-003",
    policyName: "Autonomous EDR Action Blast-Radius Governor",
    domain: "RESPONSE",
    version: "v1.8.4",
    status: "STAGED",
    stagedEnvironment: "staging-eu-west3",
    canaryPercentage: 25,
    author: "soar-eng@zoikoshield.corp",
    approvers: ["soc-lead@zoikoshield.corp"],
    createdAt: "2026-09-24 14:00:00 UTC",
    commitHash: "9c14bc2178a",
    diffSummary: "Allows automated endpoint isolation on high-confidence ransomware detections under 0.05 blast score.",
    diffContent: {
      previous: `autonomous_isolation:
  enabled: false
  allowed_providers: []`,
      proposed: `autonomous_isolation:
  enabled: true
  max_blast_score: 0.05
  allowed_providers: ["CrowdStrike", "SentinelOne"]
  require_compensating_command: true`,
    },
  },
];

export default function PolicyManagementPage() {
  const [policies, setPolicies] = useState<PolicyVersion[]>(POLICIES);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyVersion>(POLICIES[0]);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const handleApprove = (id: string) => {
    setPolicies((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              status: "ACTIVE",
              canaryPercentage: 100,
              approvers: [...p.approvers, "ciso-approver@zoikoshield.corp"],
            }
          : p
      )
    );
    setSelectedPolicy((prev) => ({
      ...prev,
      status: "ACTIVE",
      canaryPercentage: 100,
      approvers: [...prev.approvers, "ciso-approver@zoikoshield.corp"],
    }));
    setActionSuccessMessage(`Policy ${id} successfully dual-signed & promoted to 100% production rollout.`);
    setTimeout(() => setActionSuccessMessage(null), 6000);
  };

  const handleRollback = (id: string) => {
    setPolicies((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              status: "ROLLED_BACK",
              canaryPercentage: 0,
            }
          : p
      )
    );
    setSelectedPolicy((prev) => ({
      ...prev,
      status: "ROLLED_BACK",
      canaryPercentage: 0,
    }));
    setActionSuccessMessage(`Policy ${id} instantly rolled back to previous stable baseline. Merkle receipt anchored.`);
    setTimeout(() => setActionSuccessMessage(null), 6000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="neutral" className="bg-blue-950/60 text-blue-400 border-blue-800 text-xs">
              Contract W12 • Policy Governance
            </Badge>
            <Badge variant="active" className="bg-emerald-950/60 text-emerald-400 border-emerald-800 text-xs">
              4-Eyes Signed
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sliders className="h-6 w-6 text-blue-400" />
            Policy & Configuration Lifecycle Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Auditable policy definitions, YAML diff evaluation, staged canary rollout, dual-custody authorization, and atomic rollback.
          </p>
        </div>

        <div className="mt-4 md:mt-0 flex gap-3">
          <Button
            variant="secondary"
            className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            onClick={() => setActionSuccessMessage("Refreshed policy catalog against Cloud KMS state.")}
          >
            <History className="h-4 w-4 mr-2" />
            Audit Ledger
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-500 text-white"
            onClick={() => setActionSuccessMessage("Opening Policy Proposal Editor...")}
          >
            <FileCode2 className="h-4 w-4 mr-2" />
            Propose New Policy
          </Button>
        </div>
      </div>

      {actionSuccessMessage && (
        <div className="mt-4 p-4 rounded-lg bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-sm flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Policy List */}
        <div className="lg:col-span-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-400" />
            Governed Policy Catalog
          </h2>

          <div className="space-y-3">
            {policies.map((policy) => {
              const isSelected = selectedPolicy.id === policy.id;
              return (
                <Card
                  key={policy.id}
                  onClick={() => setSelectedPolicy(policy)}
                  className={`p-4 cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-slate-900/90 border-blue-500 shadow-lg shadow-blue-500/10"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-blue-400 font-bold">{policy.domain}</span>
                        <span className="text-xs font-mono text-slate-500">• {policy.version}</span>
                      </div>
                      <h3 className="font-semibold text-slate-100 text-sm mt-1">{policy.policyName}</h3>
                    </div>
                    <Badge
                      variant={
                        policy.status === "ACTIVE"
                          ? "pass"
                          : policy.status === "PENDING_APPROVAL"
                          ? "pending"
                          : policy.status === "STAGED"
                          ? "simulated"
                          : "fail"
                      }
                    >
                      {policy.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-400 mt-2 line-clamp-2">{policy.diffSummary}</p>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[11px] text-slate-500">Commit: {policy.commitHash}</span>
                    <span className="flex items-center gap-1 font-medium">
                      Rollout: <span className="text-slate-200">{policy.canaryPercentage}%</span>
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Right Column: Policy Detail & Diff Viewer */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="p-6 bg-slate-900/60 border-slate-800">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" className="text-xs border-slate-700 text-slate-300">
                    {selectedPolicy.id}
                  </Badge>
                  <span className="text-xs text-slate-400">Target: {selectedPolicy.stagedEnvironment}</span>
                </div>
                <h2 className="text-xl font-bold text-white mt-1">{selectedPolicy.policyName}</h2>
                <p className="text-xs text-slate-400 mt-1">Authored by {selectedPolicy.author} on {selectedPolicy.createdAt}</p>
              </div>

              <div className="flex gap-2">
                {selectedPolicy.status === "PENDING_APPROVAL" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    onClick={() => handleApprove(selectedPolicy.id)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Dual-Sign & Promote
                  </Button>
                )}
                {selectedPolicy.status === "ACTIVE" && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="border-red-800 bg-red-950/30 text-red-400 hover:bg-red-900/50"
                    onClick={() => handleRollback(selectedPolicy.id)}
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Atomic Rollback
                  </Button>
                )}
              </div>
            </div>

            {/* Staged Rollout Progress Bar */}
            <div className="mt-4 p-4 rounded-lg bg-slate-950/60 border border-slate-800">
              <div className="flex justify-between items-center text-xs font-semibold mb-2">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-blue-400" />
                  Staged Regional Canary Rollout Ring
                </span>
                <span className="text-blue-400 font-mono">{selectedPolicy.canaryPercentage}% Live Enforced</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 transition-all duration-500 ${
                    selectedPolicy.status === "ROLLED_BACK" ? "bg-red-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${selectedPolicy.canaryPercentage}%` }}
                />
              </div>
            </div>

            {/* Side-by-Side YAML Diff Viewer */}
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-slate-400" />
                Immutable Policy Specification Diff (Previous vs Proposed)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                {/* Previous */}
                <div className="p-4 rounded-lg bg-slate-950 border border-red-900/40">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-red-900/30 text-red-400 text-[11px] font-bold">
                    <span>BASELINE (Previous Active)</span>
                    <XCircle className="h-3.5 w-3.5" />
                  </div>
                  <pre className="text-slate-400 whitespace-pre-wrap leading-relaxed">{selectedPolicy.diffContent.previous}</pre>
                </div>

                {/* Proposed */}
                <div className="p-4 rounded-lg bg-slate-950 border border-emerald-900/40">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-900/30 text-emerald-400 text-[11px] font-bold">
                    <span>PROPOSED (New Version)</span>
                    <CheckCircle className="h-3.5 w-3.5" />
                  </div>
                  <pre className="text-emerald-300 whitespace-pre-wrap leading-relaxed">{selectedPolicy.diffContent.proposed}</pre>
                </div>
              </div>
            </div>

            {/* Signatures and Cryptographic Chain */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col md:flex-row md:items-center justify-between text-xs text-slate-400 gap-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-400" />
                <span>Dual-Custody Approvers:</span>
                <span className="text-slate-200 font-mono">{selectedPolicy.approvers.join(", ")}</span>
              </div>
              <div className="font-mono text-[11px] text-slate-500">
                KMS DER Signature: <span className="text-blue-400">EC_SIGN_P256_SHA256 (Cloud KMS)</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
