"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { Case, AiInvestigationSummary } from "@/lib/types";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Tabs, TabItem } from "@/ui/Tabs";
import { CaseTimeline } from "@/components/cases/CaseTimeline";
import { EvidenceLedger } from "@/components/cases/EvidenceLedger";
import { AiSummaryPanel } from "@/components/cases/AiSummaryPanel";
import { ResponseSimulator } from "@/components/cases/ResponseSimulator";
import { AttackGraphVisualizer } from "@/components/cases/AttackGraphVisualizer";
import {
  LoadingState,
  UnavailableState,
} from "@/components/states/mandatory-ui-states";
import {
  FolderLock,
  Clock,
  Lock,
  Sparkles,
  Server,
  ArrowRight,
  ShieldAlert,
  Radio,
} from "lucide-react";

export default function CaseWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params?.caseId as string;

  const [activeTab, setActiveTab] = useState<string>("overview");

  // The case record is real data fetched from the backend — this used to
  // fire a getCases() call whose result was discarded, with the workspace
  // reading a hardcoded demo-state fixture instead.
  const [cases, setCases] = useState<Case[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);

  const loadCases = useCallback(() => {
    setIsLoading(true);
    ZoikoShieldApiClient.getCases()
      .then((data) => {
        setCases(data);
        setFetchFailed(false);
      })
      .catch(() => {
        setFetchFailed(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const currentCase: Case | undefined = cases?.find((c) => c.id === caseId);

  if (isLoading && !cases) {
    return (
      <div className="py-10">
        <LoadingState
          title="Loading Case Workspace..."
          message="Fetching the case record from shield-core."
        />
      </div>
    );
  }

  if (fetchFailed && !currentCase) {
    return (
      <div className="py-10">
        <UnavailableState
          title="Case Workspace Unavailable"
          message="Unable to load case records from the backend. The case shown may be missing or out of date."
          retryAction={loadCases}
        />
      </div>
    );
  }

  if (!currentCase) {
    return (
      <div className="py-20 text-center space-y-4">
        <FolderLock className="w-12 h-12 text-slate-600 mx-auto" />
        <h2 className="text-xl font-bold text-slate-300">Case Not Found</h2>
        <Button variant="primary" onClick={() => router.push("/alerts")}>
          Return to Alerts
        </Button>
      </div>
    );
  }

  const tabs: TabItem[] = [
    {
      id: "overview",
      label: "Overview & Timeline",
      icon: <Clock className="w-4 h-4" />,
      badge: currentCase.timeline.length,
    },
    {
      id: "graph",
      label: "Attack Path & Graph",
      icon: <Radio className="w-4 h-4" />,
      badge: "MITRE TTP",
    },
    {
      id: "evidence",
      label: "Evidence Ledger",
      icon: <Lock className="w-4 h-4" />,
      badge: currentCase.evidenceList.length,
    },
    {
      id: "ai",
      label: "AI Investigation Copilot",
      icon: <Sparkles className="w-4 h-4" />,
      badge: currentCase.aiSummary ? "READY" : "NEW",
    },
    {
      id: "response",
      label: "SOAR Response Simulator",
      icon: <Server className="w-4 h-4" />,
      badge: currentCase.simulationReceipt ? "SIMULATED" : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Case Header Banner */}
      <div className="p-6 rounded-2xl bg-[#0e121b] border border-cyan-500/30 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  currentCase.severity === "CRITICAL"
                    ? "critical"
                    : currentCase.severity === "HIGH"
                    ? "high"
                    : "medium"
                }
              >
                {currentCase.severity}
              </Badge>
              <span className="text-xs font-mono text-cyan-400 font-bold">
                {currentCase.id}
              </span>
              <Badge variant="pass">{currentCase.status}</Badge>
            </div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              {currentCase.title}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="cyan" onClick={() => router.push("/controls")}>
              <span>Proceed to Controls</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Metadata Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 font-mono text-xs text-slate-400">
          <div>
            <span className="text-slate-500 block text-[10px]">CASE OWNER:</span>
            <span className="text-slate-200">{currentCase.ownerName}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">CREATED:</span>
            <span className="text-slate-200">{formatTimestamp(currentCase.createdAt)}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">EVIDENCE COUNT:</span>
            <span className="text-cyan-300 font-bold">{currentCase.evidenceList.length} Leaves</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">MERKLE EPOCH:</span>
            <span className="text-emerald-400 font-bold">
              {currentCase.evidenceList[0]?.merkleEpoch 
                ? `#${currentCase.evidenceList[0].merkleEpoch} (Sealed)` 
                : "#1043 (Sealed)"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === "overview" && (
          <CaseTimeline timeline={currentCase.timeline} />
        )}

        {activeTab === "graph" && (
          <AttackGraphVisualizer
            currentCase={currentCase}
            onSimulateContainment={() => setActiveTab("response")}
          />
        )}

        {activeTab === "evidence" && (
          <EvidenceLedger evidenceList={currentCase.evidenceList} />
        )}

        {activeTab === "ai" && (
          <AiSummaryPanel
            caseId={currentCase.id}
            aiSummary={currentCase.aiSummary}
            aiReviewEnvelope={currentCase.aiReviewEnvelope}
            onGenerateSuccess={() => loadCases()}
            onDecisionSuccess={() => loadCases()}
          />
        )}

        {activeTab === "response" && (
          <ResponseSimulator
            currentCase={currentCase}
            onUpdateCase={() => loadCases()}
          />
        )}
      </div>
    </div>
  );
}
