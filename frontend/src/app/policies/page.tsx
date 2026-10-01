"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
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
  AlertTriangle,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type { PolicyVersionRecord } from "@/lib/types";

export default function PolicyManagementPage() {
  const [policies, setPolicies] = useState<PolicyVersionRecord[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyVersionRecord | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>("ALL");
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [isStageModalOpen, setIsStageModalOpen] = useState<boolean>(false);
  const [isRollbackModalOpen, setIsRollbackModalOpen] = useState<boolean>(false);
  const [stagedEnvInput, setStagedEnvInput] = useState<string>("staging-eu-west3");
  const [canaryPercentInput, setCanaryPercentInput] = useState<number>(25);
  const [rollbackReasonInput, setRollbackReasonInput] = useState<string>(
    "Canary anomaly detected: JIT session latency elevated."
  );

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await api.getPolicies(selectedDomain === "ALL" ? undefined : selectedDomain);
      setPolicies(data);
      if (data.length > 0) {
        // If previous selected policy exists, retain or select first
        setSelectedPolicy((prev) => (prev ? data.find((p) => p.id === prev.id) || data[0] : data[0]));
      } else {
        setSelectedPolicy(null);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to load policies from backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, [selectedDomain]);

  const handleApprove = async (id: string) => {
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await api.approvePolicy(id, "Peer review completed per Zero-Trust governance.");
      setPolicies((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setSelectedPolicy(updated);
      setActionSuccessMessage(
        `Policy ${id} signed. Current approvers: [${updated.approvers.join(", ")}]. Status: ${updated.status}`
      );
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to submit approval.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollbackSubmit = async () => {
    if (!selectedPolicy) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await api.rollbackPolicy(selectedPolicy.id, rollbackReasonInput);
      setPolicies((prev) => prev.map((p) => (p.id === selectedPolicy.id ? updated : p)));
      setSelectedPolicy(updated);
      setIsRollbackModalOpen(false);
      setActionSuccessMessage(
        `Policy ${selectedPolicy.id} instantly rolled back to 0% canary. Reason recorded: "${rollbackReasonInput}"`
      );
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to execute rollback.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStageSubmit = async () => {
    if (!selectedPolicy) return;
    try {
      setActionLoading(true);
      setErrorMessage(null);
      const updated = await api.stagePolicy(
        selectedPolicy.id,
        stagedEnvInput,
        canaryPercentInput
      );
      setPolicies((prev) => prev.map((p) => (p.id === selectedPolicy.id ? updated : p)));
      setSelectedPolicy(updated);
      setIsStageModalOpen(false);
      setActionSuccessMessage(
        `Policy ${selectedPolicy.id} staged to ${stagedEnvInput} at ${canaryPercentInput}% canary.`
      );
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to stage policy.");
    } finally {
      setActionLoading(false);
    }
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
              4-Eyes Dual Custody
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
            onClick={fetchPolicies}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-500 text-white"
            onClick={() => {
              if (selectedPolicy) {
                setStagedEnvInput(selectedPolicy.stagedEnvironment);
                setCanaryPercentInput(selectedPolicy.canaryPercentage);
                setIsStageModalOpen(true);
              }
            }}
            disabled={!selectedPolicy}
          >
            <Send className="h-4 w-4 mr-2" />
            Stage Canary Rollout
          </Button>
        </div>
      </div>

      {/* Domain Filters */}
      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
        {["ALL", "IAM", "DETECTION", "RESPONSE", "RESIDENCY"].map((domain) => (
          <button
            key={domain}
            onClick={() => setSelectedDomain(domain)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedDomain === domain
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            {domain === "ALL" ? "All Domains" : domain}
          </button>
        ))}
      </div>

      {actionSuccessMessage && (
        <div className="mt-4 p-4 rounded-lg bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-sm flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 p-4 rounded-lg bg-red-950/80 border border-red-700 text-red-200 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Policy List */}
        <div className="lg:col-span-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-400" />
            Governed Policy Catalog ({policies.length})
          </h2>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm bg-slate-900/30 rounded-xl border border-slate-800">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-400 mb-2" />
              Loading live policies from Shield Core...
            </div>
          ) : policies.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm bg-slate-900/30 rounded-xl border border-slate-800">
              No policies found in domain {selectedDomain}.
            </div>
          ) : (
            <div className="space-y-3">
              {policies.map((policy) => {
                const isSelected = selectedPolicy?.id === policy.id;
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
          )}
        </div>

        {/* Right Column: Policy Detail & Diff Viewer */}
        <div className="lg:col-span-7 space-y-6">
          {selectedPolicy ? (
            <Card className="p-6 bg-slate-900/60 border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-slate-800 pb-4 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="text-xs border-slate-700 text-slate-300">
                      {selectedPolicy.id}
                    </Badge>
                    <span className="text-xs text-slate-400">Target: {selectedPolicy.stagedEnvironment}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white mt-1">{selectedPolicy.policyName}</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Authored by {selectedPolicy.author} • Updated {new Date(selectedPolicy.updatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {selectedPolicy.status === "PENDING_APPROVAL" && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                      onClick={() => handleApprove(selectedPolicy.id)}
                      disabled={actionLoading}
                    >
                      <CheckCircle className="h-4 w-4 mr-1.5" />
                      Dual-Sign & Promote
                    </Button>
                  )}
                  {selectedPolicy.status !== "ROLLED_BACK" && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="border-red-800 bg-red-950/30 text-red-400 hover:bg-red-900/50"
                      onClick={() => setIsRollbackModalOpen(true)}
                      disabled={actionLoading}
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Atomic Rollback
                    </Button>
                  )}
                </div>
              </div>

              {/* Rollback Notification if active */}
              {selectedPolicy.status === "ROLLED_BACK" && (
                <div className="mt-4 p-4 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs">
                  <div className="font-semibold flex items-center gap-1.5 mb-1">
                    <RotateCcw className="h-4 w-4 text-red-400" />
                    Policy Rolled Back to Safe Baseline
                  </div>
                  <p>Reason: {selectedPolicy.reversalReason || "Emergency operational rollback"}</p>
                </div>
              )}

              {/* Staged Rollout Progress Bar */}
              <div className="mt-4 p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="flex justify-between items-center text-xs font-semibold mb-2">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-blue-400" />
                    Staged Regional Canary Rollout Ring ({selectedPolicy.stagedEnvironment})
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
                    <pre className="text-slate-400 whitespace-pre-wrap leading-relaxed">
                      {selectedPolicy.diffContent?.previous || "# No previous configuration"}
                    </pre>
                  </div>

                  {/* Proposed */}
                  <div className="p-4 rounded-lg bg-slate-950 border border-emerald-900/40">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-900/30 text-emerald-400 text-[11px] font-bold">
                      <span>PROPOSED (Current Spec)</span>
                      <CheckCircle className="h-3.5 w-3.5" />
                    </div>
                    <pre className="text-emerald-300 whitespace-pre-wrap leading-relaxed">
                      {selectedPolicy.diffContent?.proposed || "# No proposed specification"}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Signatures and Cryptographic Chain */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col md:flex-row md:items-center justify-between text-xs text-slate-400 gap-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-emerald-400" />
                  <span>Dual-Custody Approvers:</span>
                  <span className="text-slate-200 font-mono">
                    {selectedPolicy.approvers.length > 0
                      ? selectedPolicy.approvers.join(", ")
                      : "Awaiting sign-off (Quorum: 2)"}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-500">
                  KMS DER Signature: <span className="text-blue-400">EC_SIGN_P256_SHA256 (Cloud KMS)</span>
                </div>
              </div>
            </Card>
          ) : (
            <div className="p-12 text-center text-slate-500 text-sm bg-slate-900/20 rounded-xl border border-slate-800/60">
              Select a policy from the catalog to view details and lifecycle controls.
            </div>
          )}
        </div>
      </div>

      {/* Canary Staging Modal */}
      <Modal
        isOpen={isStageModalOpen}
        onClose={() => setIsStageModalOpen(false)}
        title="Stage Canary Policy Rollout"
        description="Configure target deployment ring and traffic canary enforcement percentage."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Target Environment</label>
            <input
              type="text"
              value={stagedEnvInput}
              onChange={(e) => setStagedEnvInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
              <span>Canary Percentage</span>
              <span className="text-blue-400">{canaryPercentInput}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={canaryPercentInput}
              onChange={(e) => setCanaryPercentInput(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-[11px] text-slate-500 mt-1">
              <span>0% (Halted)</span>
              <span>25% (Canary Ring 1)</span>
              <span>50% (Ring 2)</span>
              <span>100% (Full Production)</span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsStageModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-500 text-white"
              onClick={handleStageSubmit}
              disabled={actionLoading}
            >
              {actionLoading ? "Applying..." : "Apply Canary Rollout"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Atomic Rollback Modal */}
      <Modal
        isOpen={isRollbackModalOpen}
        onClose={() => setIsRollbackModalOpen(false)}
        title="Execute Atomic Policy Rollback"
        description="Instantly drops canary enforcement to 0% and logs the auditable reversal reason."
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>This action takes immediate effect across all regional cells.</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Rollback Rationale / Trigger</label>
            <textarea
              rows={3}
              value={rollbackReasonInput}
              onChange={(e) => setRollbackReasonInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500"
              placeholder="State the observed regression, anomaly, or operational justification..."
            />
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsRollbackModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="border-red-800 bg-red-600 hover:bg-red-500 text-white"
              onClick={handleRollbackSubmit}
              disabled={actionLoading || !rollbackReasonInput.trim()}
            >
              {actionLoading ? "Reversing..." : "Confirm Instant Rollback"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
