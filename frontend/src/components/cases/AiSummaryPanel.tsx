"use client";

import React, { useState } from "react";
import { AiInvestigationSummary, AiReviewEnvelope, DecisionTransition } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  FileText,
  CheckCircle,
  XCircle,
  Lightbulb,
  ArrowRight,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Edit3,
  CornerUpRight,
  HelpCircle,
  Activity,
  Layers,
  Link as LinkIcon,
} from "lucide-react";

interface AiSummaryPanelProps {
  caseId: string;
  aiSummary?: AiInvestigationSummary;
  aiReviewEnvelope?: AiReviewEnvelope;
  onGenerateSuccess?: (summary: AiInvestigationSummary) => void;
  onDecisionSuccess?: (envelope: AiReviewEnvelope) => void;
}

export const AiSummaryPanel: React.FC<AiSummaryPanelProps> = ({
  caseId,
  aiSummary,
  aiReviewEnvelope,
  onGenerateSuccess,
  onDecisionSuccess,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [activeModalAction, setActiveModalAction] = useState<DecisionTransition | null>(null);
  const [decisionRationale, setDecisionRationale] = useState("");
  const [modifiedText, setModifiedText] = useState(aiSummary?.executiveSummary || "");
  const [escalateRole, setEscalateRole] = useState("INCIDENT_COMMANDER");

  const [currentEnvelope, setCurrentEnvelope] = useState<AiReviewEnvelope | undefined>(aiReviewEnvelope);

  // Generate AI Investigation
  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const summary = await ZoikoShieldApiClient.generateAiInvestigationSummary(caseId);
      if (onGenerateSuccess) {
        onGenerateSuccess(summary);
      }
    } catch (err) {
      console.error("AI Investigation Generation Error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Execute Decision Rights Action (ACCEPT / MODIFY / REJECT / ESCALATE)
  const handleExecuteDecision = async (action: DecisionTransition) => {
    if (!currentEnvelope && !aiSummary) return;
    const envelopeId = currentEnvelope?.envelopeId || `env-${caseId}`;
    setIsSubmittingDecision(true);

    try {
      const updated = await ZoikoShieldApiClient.recordDecisionRightsAction(envelopeId, action, {
        decidedBy: "Sarah Chen (Lead Analyst)",
        rationale: decisionRationale || `Analyst executed ${action} for investigation synthesis`,
        modifiedContent: action === "MODIFY" ? modifiedText : undefined,
        escalatedToRole: action === "ESCALATE" ? escalateRole : undefined,
        caseId,
      });

      setCurrentEnvelope(updated);
      setActiveModalAction(null);
      setDecisionRationale("");
      if (onDecisionSuccess) {
        onDecisionSuccess(updated);
      }
    } catch (err) {
      console.error("Error executing decision-rights action:", err);
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const humanDecision = currentEnvelope?.humanDecisionAndRationale || (aiSummary?.status === "ACCEPTED" || aiSummary?.status === "REJECTED" ? {
    decision: (aiSummary.status === "ACCEPTED" ? "ACCEPT" : "REJECT") as DecisionTransition,
    decidedBy: "Sarah Chen (Lead Analyst)",
    rationale: aiSummary.rationale || "Verified against cryptographic Merkle evidence",
    evidenceRef: "ev-ai-dec-legacy",
  } : undefined);

  return (
    <Card variant="ai" className="space-y-6">
      {/* ── Field 1: Prominent AI Label & Model Route (Spec §16.1 #1) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-purple-500/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-100 text-sm">
                AI Investigation Copilot & RCA
              </h3>
              <Badge variant="ai">AI Generated - Human Oversight Mandatory</Badge>
            </div>
            <p className="text-xs text-purple-300/80">
              Model: {currentEnvelope?.aiLabelAndUseCaseName?.modelRoute || "vertex-ai/gemini-1.5-pro"} (
              {currentEnvelope?.aiLabelAndUseCaseName?.version || "v2.4.0"}) • Use Case:{" "}
              {currentEnvelope?.aiLabelAndUseCaseName?.useCaseName || "Threat-Investigation-Copilot"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!aiSummary && (
            <Button
              variant="ai"
              size="sm"
              onClick={() => handleGenerate()}
              isLoading={isGenerating}
            >
              <Sparkles className="w-4 h-4" />
              <span>Generate AI Investigation</span>
            </Button>
          )}
          {aiSummary && (
            <span className="text-[11px] font-mono text-slate-400">
              Generated: {formatTimestamp(aiSummary.generatedAt)}
            </span>
          )}
        </div>
      </div>

      {!aiSummary ? (
        <div className="py-12 text-center space-y-3">
          <Sparkles className="w-10 h-10 text-purple-400 mx-auto animate-pulse" />
          <p className="text-sm font-semibold text-slate-200">
            No AI Investigation Summary Generated Yet
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click below to invoke the Model Armor-protected AI Copilot to analyze all telemetry, hypothesize attack vectors, and cite immutable evidence.
          </p>
          <Button variant="ai" onClick={() => handleGenerate()} isLoading={isGenerating}>
            <Sparkles className="w-4 h-4" />
            <span>Invoke AI Investigation</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Executive Summary Narrative */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Executive Incident Summary
            </h4>
            <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 text-sm text-slate-200 leading-relaxed font-sans">
              {aiSummary.executiveSummary}
            </div>
          </div>

          {/* ── Field 2: Sources and Exact Supporting Spans (Spec §16.1 #2) ── */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Field 2: Sources & Exact Supporting Spans
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {(currentEnvelope?.sourcesAndSpans || [
                {
                  sourceId: "ev-telemetry-01",
                  sourceType: "OCSF_AUTH_LOG",
                  exactSpan: "5 consecutive failed logins within 4.2s from IP 198.51.100.42 targeting victim.engineer@acme.com",
                  confidence: 0.96,
                },
                {
                  sourceId: "ev-merkle-anchor-1043",
                  sourceType: "MERKLE_TREE_WITNESS",
                  exactSpan: "Leaf 0x4f9a... verified against Epoch #1043 root with 0x00 domain separator",
                  confidence: 1.0,
                },
              ]).map((span, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded text-[10px]">
                      {span.sourceId} ({span.sourceType})
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      Span Conf: {(span.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-slate-300 font-mono text-[11px] leading-snug bg-slate-950 p-2 rounded border border-slate-800/80">
                    &ldquo;{span.exactSpan}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Field 3 & 4: Completeness & Calibrated Confidence Grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Field 3: Missing, Stale or Conflicting Evidence */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <h4 className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Field 3: Evidence Completeness State
              </h4>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400 text-[11px] block font-medium">Missing Feeds:</span>
                  <p className="text-amber-200/90 font-mono text-[11px]">
                    {currentEnvelope?.knownMissingStaleOrConflictingEvidence?.missingEvidence?.join(", ") ||
                      "Egress firewall flow telemetry for attacking ASN"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block font-medium">Stale Caches:</span>
                  <p className="text-slate-300 font-mono text-[11px]">
                    {currentEnvelope?.knownMissingStaleOrConflictingEvidence?.staleEvidence?.join(", ") ||
                      "GeoIP database cached 18h ago"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block font-medium">Conflicting Records:</span>
                  <p className="text-slate-400 font-mono text-[11px]">
                    {currentEnvelope?.knownMissingStaleOrConflictingEvidence?.conflictingEvidence?.length
                      ? currentEnvelope.knownMissingStaleOrConflictingEvidence.conflictingEvidence.join(", ")
                      : "None detected (Clean alignment)"}
                  </p>
                </div>
              </div>
            </div>

            {/* Field 4: Calibrated Confidence & Uncertainty Interval */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Field 4: Calibrated Confidence
                </h4>
                <Badge variant="pass">
                  {currentEnvelope?.calibratedConfidenceAndUncertainty?.qualitativeBand || "HIGH"} BAND (
                  {((currentEnvelope?.calibratedConfidenceAndUncertainty?.score || 0.94) * 100).toFixed(0)}%)
                </Badge>
              </div>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400 text-[11px] block font-medium">Calibration Basis:</span>
                  <p className="text-slate-300 text-[11px]">
                    {currentEnvelope?.calibratedConfidenceAndUncertainty?.calibrationBasis ||
                      "Brier-calibrated ensemble over 1,400 historical credential stuffing incidents"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block font-medium">Uncertainty Factors:</span>
                  <p className="text-amber-300/80 font-mono text-[11px]">
                    {currentEnvelope?.calibratedConfidenceAndUncertainty?.uncertaintyFactors?.join(", ") ||
                      "Residential proxy rotation risk (<6% false attribution)"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Field 5: Alternative Hypotheses or Actions (Spec §16.1 #5) ── */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              Field 5: Alternative Hypotheses & Trade-Offs
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(currentEnvelope?.alternativeHypothesesOrActions?.length
                ? currentEnvelope.alternativeHypothesesOrActions
                : [
                    {
                      title: "Automated Distributed Credential Stuffing Botnet",
                      rationale: "Cadence matches Mirai/DarkGate brute-force cluster signatures",
                      tradeOffs: "High confidence match with MITRE T1110.001 technique",
                    },
                    {
                      title: "Legitimate user forgot corporate VPN password rotation",
                      rationale: "User password changed 24h prior, possible stale credential cache",
                      tradeOffs: "Lower risk but does not explain sub-second 5x burst cadence",
                    },
                  ]
              ).map((hyp, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5 text-xs"
                >
                  <span className="font-semibold text-slate-200 block">{hyp.title}</span>
                  <p className="text-slate-400 text-[11px]">{hyp.rationale}</p>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-purple-300">
                    Trade-off: {hyp.tradeOffs}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Field 6 & 7: Impact & Authority Grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Field 6: Expected Impact and Reversibility */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2 text-xs">
              <h4 className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Field 6: Expected Impact & Reversibility
              </h4>
              <div className="space-y-1 text-[11px]">
                <p>
                  <span className="text-slate-400">Blast Radius: </span>
                  <span className="text-slate-200">
                    {currentEnvelope?.expectedImpactAndReversibility?.blastRadius ||
                      "Low (single user identity & 3 active session tokens)"}
                  </span>
                </p>
                <p>
                  <span className="text-slate-400">Reversible: </span>
                  <span className="text-emerald-400 font-bold">
                    {currentEnvelope?.expectedImpactAndReversibility?.isReversible !== false ? "YES (Safe Rollback)" : "NO (Destructive)"}
                  </span>{" "}
                  • Tier: {currentEnvelope?.expectedImpactAndReversibility?.reversibilityTier || "R1"}
                </p>
                <p>
                  <span className="text-slate-400">Compensation Plan: </span>
                  <span className="font-mono text-blue-300">
                    {currentEnvelope?.expectedImpactAndReversibility?.compensationPlan ||
                      "RESTORE_USER_SESSION_CACHE via SOAR adapter"}
                  </span>
                </p>
              </div>
            </div>

            {/* Field 7: Required Authority and Approvals */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2 text-xs">
              <h4 className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Field 7: Required Authority & Approvals
              </h4>
              <div className="space-y-1 text-[11px]">
                <p>
                  <span className="text-slate-400">Required Role: </span>
                  <span className="text-indigo-300 font-mono font-bold">
                    {currentEnvelope?.requiredAuthorityAndApprovals?.requiredRole || "SECURITY_ANALYST"}
                  </span>
                </p>
                <p>
                  <span className="text-slate-400">Response Tier: </span>
                  <span className="text-indigo-300 font-mono">
                    Tier {currentEnvelope?.requiredAuthorityAndApprovals?.responseAuthorityTier || "R1"} (Recommended)
                  </span>
                </p>
                <p>
                  <span className="text-slate-400">Dual Approver: </span>
                  <span className="text-slate-300">
                    {currentEnvelope?.requiredAuthorityAndApprovals?.dualApproverRequired
                      ? "MANDATORY (Two SOC Approvals Required)"
                      : "NOT REQUIRED (Single Analyst Authorized)"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* ── Field 8 & 9: Human Decision Controls & Recorded Evidence (Spec §16.1 #8 & #9) ── */}
          <div className="p-5 rounded-xl bg-[#11141c] border border-amber-500/30 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <h4 className="text-xs font-bold text-amber-200">
                  Field 8 & 9: Human Oversight Decision Controls
                </h4>
              </div>
              {humanDecision?.decision ? (
                <Badge variant={humanDecision.decision === "ACCEPT" ? "pass" : humanDecision.decision === "REJECT" ? "fail" : "medium"}>
                  DECISION: {humanDecision.decision}
                </Badge>
              ) : (
                <span className="text-[11px] font-mono text-amber-400 animate-pulse">
                  DECISION STATE: PENDING_HUMAN_REVIEW
                </span>
              )}
            </div>

            {/* Recorded Decision Summary if already decided */}
            {humanDecision?.decision && (
              <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">
                    Decided by <span className="text-slate-200 font-bold">{humanDecision.decidedBy || "Sarah Chen"}</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    Anchored Ref: {humanDecision.evidenceRef || "ev-ai-dec-01"}
                  </span>
                </div>
                <p className="text-slate-300 italic">&ldquo;{humanDecision.rationale}&rdquo;</p>
                {humanDecision.modifiedContent && (
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-purple-300">
                    Modified Content: {humanDecision.modifiedContent}
                  </div>
                )}
                {humanDecision.escalatedToRole && (
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-amber-300">
                    Escalated to: {humanDecision.escalatedToRole}
                  </div>
                )}
              </div>
            )}

            {/* 4 Action Buttons: ACCEPT, MODIFY, REJECT, ESCALATE */}
            {!activeModalAction && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="cyan"
                  onClick={() => {
                    setActiveModalAction("ACCEPT");
                    setDecisionRationale("Verified against cryptographic Merkle evidence & brute-force attack signatures.");
                  }}
                  disabled={isSubmittingDecision}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Accept Analysis (ACCEPT)</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActiveModalAction("MODIFY");
                    setModifiedText(aiSummary.executiveSummary);
                    setDecisionRationale("Modified threat assessment scope prior to authorizing response.");
                  }}
                  disabled={isSubmittingDecision}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Modify Content (MODIFY)</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="text-rose-400 hover:text-rose-300 border-rose-500/30 hover:bg-rose-500/10"
                  onClick={() => {
                    setActiveModalAction("REJECT");
                    setDecisionRationale("Determined benign password sync discrepancy; false positive.");
                  }}
                  disabled={isSubmittingDecision}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject (REJECT)</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="text-amber-400 hover:text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
                  onClick={() => {
                    setActiveModalAction("ESCALATE");
                    setDecisionRationale("Escalated for Incident Commander review due to potential campaign spread.");
                  }}
                  disabled={isSubmittingDecision}
                >
                  <CornerUpRight className="w-3.5 h-3.5" />
                  <span>Escalate (ESCALATE)</span>
                </Button>
              </div>
            )}

            {/* Interactive Decision Form Modal */}
            {activeModalAction && (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    Confirm Action: <span className="text-cyan-400 font-mono">{activeModalAction}</span>
                  </span>
                  <button
                    onClick={() => setActiveModalAction(null)}
                    className="text-slate-400 hover:text-slate-200 text-xs"
                  >
                    Cancel
                  </button>
                </div>

                {activeModalAction === "MODIFY" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300 block">
                      Edited Incident Assessment Narrative:
                    </label>
                    <textarea
                      value={modifiedText}
                      onChange={(e) => setModifiedText(e.target.value)}
                      rows={3}
                      className="w-full text-xs p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                )}

                {activeModalAction === "ESCALATE" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-300 block">
                      Target Escalation Role / Authority:
                    </label>
                    <select
                      value={escalateRole}
                      onChange={(e) => setEscalateRole(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="INCIDENT_COMMANDER">Incident Commander (Tier-2)</option>
                      <option value="SOC_LEAD">SOC Lead (Global Operations)</option>
                      <option value="SECURITY_DIRECTOR">Director of Information Security</option>
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300 block">
                    Mandatory Decision Rationale (Written to Evidence Ledger):
                  </label>
                  <textarea
                    value={decisionRationale}
                    onChange={(e) => setDecisionRationale(e.target.value)}
                    rows={2}
                    placeholder="Provide justification for this oversight action..."
                    className="w-full text-xs p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleExecuteDecision(activeModalAction)}
                    isLoading={isSubmittingDecision}
                  >
                    Commit {activeModalAction} to Ledger
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveModalAction(null)}
                    disabled={isSubmittingDecision}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Field 10: Appeal / Feedback Route (Spec §16.1 #10) ── */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
              <div>
                <span className="font-semibold text-slate-300 block">
                  Field 10: Formal AI Contest & Appeal Route
                </span>
                <span className="text-[11px] text-slate-400">
                  Oversight Feedback Channel:{" "}
                  <span className="font-mono text-slate-300">
                    {currentEnvelope?.appealOrFeedbackRoute?.feedbackChannel || "secops-ai-oversight@acme.com"}
                  </span>
                </span>
              </div>
            </div>
            <a
              href={
                currentEnvelope?.appealOrFeedbackRoute?.appealUrl ||
                `https://trust.zoikoshield.io/appeals/cases/${caseId}`
              }
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium shrink-0 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20"
            >
              <span>Contest / Appeal Decision</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </Card>
  );
};
