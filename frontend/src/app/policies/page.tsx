"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
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
  ArrowRight,
  KeyRound,
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
        `Policy ${id} signed. Current approvers: [${(updated?.approvers || []).join(", ")}]. Status: ${updated.status}`
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
    <div className="space-y-6 pb-16">
      {/* Header Banner */}
      <div className="surface-card rounded-2xl p-6 border border-slate-800/80 bg-gradient-to-b from-raised to-canvas shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="neutral" className="bg-cyan-950/60 text-cyan-400 border-cyan-800/60 text-xs font-mono">
                Contract W12 • Policy Governance
              </Badge>
              <Badge variant="pass" className="text-xs font-mono">
                4-Eyes Dual Custody
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <Sliders className="h-6 w-6 text-cyan-400" />
              <span>Policy &amp; Configuration Lifecycle Management</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
              Auditable policy definitions, YAML diff evaluation, staged canary rollout, dual-custody authorization, and atomic rollback.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              className="border-slate-800 hover:border-cyan-500/40 text-slate-300"
              onClick={fetchPolicies}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-2 text-cyan-400 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="cyan"
              className="shadow-[0_0_15px_rgba(0,240,255,0.25)]"
              onClick={() => {
                if (selectedPolicy) {
                  setStagedEnvInput(selectedPolicy.stagedEnvironment);
                  setCanaryPercentInput(selectedPolicy.canaryPercentage);
                  setIsStageModalOpen(true);
                }
              }}
              disabled={!selectedPolicy}
            >
              <Send className="h-3.5 w-3.5 mr-2" />
              Stage Canary Rollout
            </Button>
            <Link href="/admin/jit-elevation">
              <Button
                variant="outline"
                className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 font-bold"
              >
                <KeyRound className="h-3.5 w-3.5 mr-2 text-cyan-400" />
                <span>JIT Elevation (Step 9)</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1.5 text-cyan-400" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Domain Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {["ALL", "IAM", "DETECTION", "RESPONSE", "RESIDENCY"].map((domain) => (
          <button
            key={domain}
            onClick={() => setSelectedDomain(domain)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
              selectedDomain === domain
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80"
            }`}
          >
            {domain === "ALL" ? "All Domains" : domain}
          </button>
        ))}
      </div>

      {actionSuccessMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between gap-3 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="font-mono">{actionSuccessMessage}</span>
          </div>
          <button onClick={() => setActionSuccessMessage(null)} className="text-slate-400 hover:text-white text-xs px-2 py-1">
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center justify-between gap-3 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="font-mono">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-slate-400 hover:text-white text-xs px-2 py-1">
            ✕
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Policy List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              <span>Governed Policy Catalog ({policies.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs font-mono bg-slate-900/30 rounded-xl border border-slate-800">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto text-cyan-400 mb-2" />
              Loading live policies from Shield Core...
            </div>
          ) : policies.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-mono bg-slate-900/30 rounded-xl border border-slate-800">
              No policies found in domain {selectedDomain}.
            </div>
          ) : (
            <div className="space-y-3">
              {policies.map((policy) => {
                const isSelected = selectedPolicy?.id === policy.id;
                return (
                  <Card
                    key={policy.id}
                    variant="cyber"
                    onClick={() => setSelectedPolicy(policy)}
                    className={`p-4 cursor-pointer transition-all border ${
                      isSelected
                        ? "bg-gradient-to-b from-overlay to-raised border-cyan-500/60 shadow-[0_0_20px_rgba(0,240,255,0.15)]"
                        : "bg-gradient-to-b from-raised to-canvas border-slate-800/80 hover:border-slate-700 hover:bg-raised"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-cyan-400 font-bold">{policy.domain}</span>
                          <span className="text-xs font-mono text-slate-500">• {policy.version}</span>
                        </div>
                        <h3 className="font-bold text-white text-sm">{policy.policyName}</h3>
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
                        className="text-[10px] font-mono shrink-0"
                      >
                        {policy.status}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">{policy.diffSummary}</p>

                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                      <span className="text-[11px] text-slate-500">Commit: {policy.commitHash}</span>
                      <span className="flex items-center gap-1.5 font-semibold">
                        Rollout: <span className="text-cyan-300">{policy.canaryPercentage}%</span>
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
            <Card variant="cyber" className="p-6 bg-gradient-to-b from-raised to-canvas space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-slate-800/80 pb-4 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="text-xs font-mono border-slate-700 text-slate-300">
                      {selectedPolicy.id}
                    </Badge>
                    <span className="text-xs font-mono text-slate-400">Target: {selectedPolicy.stagedEnvironment}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">{selectedPolicy.policyName}</h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Authored by <strong className="text-slate-300">{selectedPolicy.author}</strong> • Updated {new Date(selectedPolicy.updatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {selectedPolicy.status === "PENDING_APPROVAL" && (
                    <Button
                      size="sm"
                      variant="cyan"
                      className="shadow-[0_0_12px_rgba(0,240,255,0.25)]"
                      onClick={() => handleApprove(selectedPolicy.id)}
                      disabled={actionLoading}
                    >
                      <CheckCircle className="h-4 w-4 mr-1.5" />
                      Dual-Sign &amp; Promote
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 shadow-[0_0_12px_rgba(0,240,255,0.15)] font-mono"
                    onClick={() => {
                      setStagedEnvInput(selectedPolicy.stagedEnvironment);
                      setCanaryPercentInput(selectedPolicy.canaryPercentage);
                      setIsStageModalOpen(true);
                    }}
                    disabled={actionLoading}
                  >
                    <Sliders className="h-4 w-4 mr-1.5 text-cyan-400" />
                    Canary Staging ({selectedPolicy.canaryPercentage}%)
                  </Button>
                  {selectedPolicy.status !== "ROLLED_BACK" && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="border-red-800 bg-red-950/40 text-red-300 hover:bg-red-900/60 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
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
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs space-y-1 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
                  <div className="font-bold flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-red-400" />
                    <span>Policy Rolled Back to Safe Baseline</span>
                  </div>
                  <p className="font-mono text-slate-300">Reason: {selectedPolicy.reversalReason || "Emergency operational rollback"}</p>
                </div>
              )}

              {/* Staged Rollout Progress Bar */}
              <div className="p-4 rounded-xl bg-canvas border border-slate-800/80 space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-slate-300 flex items-center gap-1.5 font-mono">
                    <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                    Staged Regional Canary Rollout Ring ({selectedPolicy.stagedEnvironment})
                  </span>
                  <span className="text-cyan-400 font-mono font-bold">{selectedPolicy.canaryPercentage}% Live Enforced</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className={`h-2 transition-all duration-500 ${
                      selectedPolicy.status === "ROLLED_BACK"
                        ? "bg-red-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                        : "bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_8px_rgba(0,240,255,0.5)]"
                    }`}
                    style={{ width: `${selectedPolicy.canaryPercentage}%` }}
                  />
                </div>
              </div>

              {/* Side-by-Side YAML Diff Viewer */}
              <div className="space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <FileCode2 className="h-4 w-4 text-cyan-400" />
                  <span>Immutable Policy Specification Diff (Previous vs Proposed)</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                  {/* Previous */}
                  <div className="p-4 rounded-xl bg-canvas border border-red-900/40 space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-red-900/30 text-red-400 text-[11px] font-bold">
                      <span>BASELINE (Previous Active)</span>
                      <XCircle className="h-3.5 w-3.5" />
                    </div>
                    <pre className="text-slate-400 whitespace-pre-wrap leading-relaxed text-[11px]">
                      {selectedPolicy.diffContent?.previous || "# No previous configuration"}
                    </pre>
                  </div>

                  {/* Proposed */}
                  <div className="p-4 rounded-xl bg-canvas border border-emerald-900/40 space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b border-emerald-900/30 text-emerald-400 text-[11px] font-bold">
                      <span>PROPOSED (Current Spec)</span>
                      <CheckCircle className="h-3.5 w-3.5" />
                    </div>
                    <pre className="text-emerald-300 whitespace-pre-wrap leading-relaxed text-[11px]">
                      {selectedPolicy.diffContent?.proposed || "# No proposed specification"}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Signatures and Cryptographic Chain */}
              <div className="pt-4 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between text-xs text-slate-400 gap-3 font-mono">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-emerald-400" />
                  <span>Dual-Custody Approvers:</span>
                  <span className="text-slate-200">
                    {Array.isArray(selectedPolicy.approvers) && selectedPolicy.approvers.length > 0
                      ? selectedPolicy.approvers.join(", ")
                      : "Awaiting sign-off (Quorum: 2)"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  KMS DER Signature: <span className="text-cyan-400">EC_SIGN_P256_SHA256 (Cloud KMS)</span>
                </div>
              </div>
            </Card>
          ) : (
            <div className="p-12 text-center text-slate-500 text-xs font-mono bg-slate-900/20 rounded-2xl border border-slate-800/60">
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
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-1.5">Target Environment</label>
            <input
              type="text"
              value={stagedEnvInput}
              onChange={(e) => setStagedEnvInput(e.target.value)}
              className="w-full bg-canvas border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs font-mono font-semibold text-slate-300 mb-1.5">
              <span>Canary Percentage</span>
              <span className="text-cyan-400 font-bold">{canaryPercentInput}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={canaryPercentInput}
              onChange={(e) => setCanaryPercentInput(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1.5">
              <span>0% (Halted)</span>
              <span>25% (Canary Ring 1)</span>
              <span>50% (Ring 2)</span>
              <span>100% (Full Production)</span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setIsStageModalOpen(false)}
              disabled={actionLoading}
              className="border-slate-800 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              variant="cyan"
              onClick={handleStageSubmit}
              disabled={actionLoading}
              className="shadow-[0_0_12px_rgba(0,240,255,0.25)]"
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
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
            <span>This action takes immediate effect across all regional cells.</span>
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-1.5">Rollback Rationale / Trigger</label>
            <textarea
              rows={3}
              value={rollbackReasonInput}
              onChange={(e) => setRollbackReasonInput(e.target.value)}
              className="w-full bg-canvas border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-red-500 font-mono"
              placeholder="State the observed regression, anomaly, or operational justification..."
            />
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setIsRollbackModalOpen(false)}
              disabled={actionLoading}
              className="border-slate-800 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="border-red-800 bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]"
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
