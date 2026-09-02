"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { formatTimestamp } from "@/lib/utils";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { FolderLock, Plus, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

export default function CasesListPage() {
  const router = useRouter();
  const [state] = useDemoState();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="ai">ERB-01 STEP 7</Badge>
            <span className="text-xs font-mono text-purple-400 font-bold">
              INCIDENT CASES
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Incident Workspace Directory
          </h1>
          <p className="text-sm text-slate-400">
            Cryptographically anchored investigation cases bound to immutable evidence ledgers.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {state.cases.map((c, idx) => (
          <Link key={c.id || idx} href={`/cases/${c.id}`} className="block group">
            <Card
              variant="cyber"
              className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-cyan-500/50 transition-all"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={c.severity === "CRITICAL" ? "critical" : "high"}>
                    {c.severity}
                  </Badge>
                  <h3 className="font-semibold text-slate-100 text-base group-hover:text-cyan-300 transition-colors">
                    {c.title}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                  <span>Case ID: {c.id}</span>
                  <span>•</span>
                  <span>Owner: {c.ownerName}</span>
                  <span>•</span>
                  <span>Created: {formatTimestamp(c.createdAt)}</span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                    {c.evidenceList.length} Evidence Items
                  </span>
                  {c.aiSummary && <Badge variant="ai">AI Analysis Attached</Badge>}
                  {c.simulationReceipt && (
                    <Badge variant="simulated">SOAR Simulated</Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-center">
                <Button size="sm" variant="cyan">
                  <span>Open Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
