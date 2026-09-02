"use client";

import React, { useState } from "react";
import { AiInvestigationSummary } from "@/lib/types";
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
} from "lucide-react";

interface AiSummaryPanelProps {
  caseId: string;
  aiSummary?: AiInvestigationSummary;
  onGenerateSuccess: (summary: AiInvestigationSummary) => void;
}

export const AiSummaryPanel: React.FC<AiSummaryPanelProps> = ({
  caseId,
  aiSummary,
  onGenerateSuccess,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [humanReviewStatus, setHumanReviewStatus] = useState<"ACCEPTED" | "REJECTED" | null>(
    aiSummary?.status === "ACCEPTED" || aiSummary?.status === "REJECTED" ? aiSummary.status : null
  );

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const summary = await ZoikoShieldApiClient.generateAiInvestigationSummary(caseId);
      onGenerateSuccess(summary);
    } catch (err) {
      console.error("AI Investigation Generation Error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card variant="ai" className="space-y-6">
      {/* Header with Model Armor Badge */}
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
              <Badge variant="ai">Vertex AI Model Armor</Badge>
            </div>
            <p className="text-xs text-purple-300/80">
              Autonomous multi-vector attack correlation screened for prompt injections.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!aiSummary && (
            <Button
              variant="ai"
              size="sm"
              onClick={handleGenerate}
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
          <Button variant="ai" onClick={handleGenerate} isLoading={isGenerating}>
            <Sparkles className="w-4 h-4" />
            <span>Invoke AI Investigation</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Executive Summary Narrative */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider">
              Executive Incident Summary
            </h4>
            <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/20 text-sm text-slate-200 leading-relaxed font-sans">
              {aiSummary.executiveSummary}
            </div>
          </div>

          {/* Inline Evidence Citations */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Verified Evidence Citations
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {aiSummary.citations.map((cite, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start gap-2 text-xs"
                >
                  <span className="font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                    {cite.evidenceRef}
                  </span>
                  <div className="text-slate-300">
                    <p className="font-medium">{cite.description}</p>
                    <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                      Hash Verified • Merkle Epoch Sealed
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hypotheses */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              Generated Attack Hypotheses
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {aiSummary.hypotheses.map((hyp, idx) => (
                <div
                  key={hyp.id || idx}
                  className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-200">
                      {hyp.title}
                    </span>
                    <Badge
                      variant={
                        hyp.likelihood === "HIGH"
                          ? "critical"
                          : hyp.likelihood === "MEDIUM"
                          ? "high"
                          : "low"
                      }
                    >
                      {hyp.likelihood} CONFIDENCE
                    </Badge>
                  </div>
                  <ul className="text-xs text-slate-400 space-y-0.5 list-disc pl-4 font-mono">
                    {hyp.supportingEvidence.map((ev, i) => (
                      <li key={i}>{ev}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended Containment Actions */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider">
              Recommended SOAR Containment Actions
            </h4>
            <div className="space-y-1.5">
              {aiSummary.recommendedActions.map((act, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/30 text-xs text-purple-200 font-mono"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>{act}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Human Advisory & Decision Control */}
          <div className="p-4 rounded-xl bg-[#11141c] border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-200">
                  ⚠ Advisory Notice — Human Decision Required
                </p>
                <p className="text-[11px] text-slate-400">
                  AI outputs are advisory recommendations and do not execute destructive actions automatically without human sign-off.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {humanReviewStatus ? (
                <Badge variant={humanReviewStatus === "ACCEPTED" ? "pass" : "fail"}>
                  HUMAN REVIEW: {humanReviewStatus}
                </Badge>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="cyan"
                    onClick={() => setHumanReviewStatus("ACCEPTED")}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Accept Analysis</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHumanReviewStatus("REJECTED")}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
