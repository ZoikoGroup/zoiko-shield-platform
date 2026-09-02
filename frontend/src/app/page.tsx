"use client";

import React from "react";
import Link from "next/link";
import { useDemoState } from "@/lib/demo-state";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import {
  ShieldAlert,
  FolderLock,
  Radio,
  Network,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Lock,
  Server,
  KeyRound,
  FileCheck2,
} from "lucide-react";

export default function DashboardPage() {
  const [state] = useDemoState();

  const activeAlerts = state.alerts.filter((a) => a.status === "NEW");
  const activeCases = state.cases.filter((c) => c.status !== "CLOSED");

  return (
    <div className="space-y-8">
      {/* Hero Welcome & Quick Start Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#121624] via-[#10141f] to-[#181126] border border-cyan-500/30 shadow-[0_0_40px_rgba(6,182,212,0.15)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-cyan-400 tracking-wider uppercase">
              DEFENSE GRID ACTIVE
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            ZoikoShield SecOps & Cryptographic Command Center
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            Autonomous multi-tenant cloud defense, Cedar ABAC governed SOAR playbooks, Model Armor-screened AI investigation, and Post-Quantum Merkle evidence ledgers.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/ingestion">
            <Button variant="cyan" size="md">
              <Radio className="w-4 h-4" />
              <span>Simulate Attack Telemetry</span>
            </Button>
          </Link>
          <Link href="/audit">
            <Button variant="primary" size="md">
              <FileCheck2 className="w-4 h-4" />
              <span>Inspect Audit Ledger</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>UNRESOLVED ALERTS</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {activeAlerts.length}
          </div>
          <div className="text-[11px] text-rose-400 flex items-center gap-1 font-mono">
            <span>{state.alerts.length} total detected</span>
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ACTIVE CASES</span>
            <FolderLock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {activeCases.length}
          </div>
          <div className="text-[11px] text-purple-400 flex items-center gap-1 font-mono">
            <span>AI Copilot & SOAR linked</span>
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>ACTIVE CONNECTORS</span>
            <Network className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {state.connectors.length}
          </div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
            <span>100% Ingest Health</span>
          </div>
        </Card>

        <Card className="space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>COMPLIANCE POSTURE</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            100% PASS
          </div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
            <span>SOC2, ISO27001, HIPAA</span>
          </div>
        </Card>
      </div>

      {/* 22-Step ERB-01 Demonstration Overview Matrix */}
      <Card className="space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-100 text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              ERB-01 Demonstration Runbook Workflow
            </h3>
            <p className="text-xs text-slate-400">
              Interactive 22-step live narrative across all 5 backend microservices.
            </p>
          </div>
          <Badge variant="pass">All Steps Verified</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <Link href="/login" className="group">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-400">
                  STEP 1 & 2
                </span>
                <Badge variant="pass">AUTH</Badge>
              </div>
              <h4 className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                Authentication & Tenant Onboarding
              </h4>
              <p className="text-xs text-slate-400">
                Password fallback login, legal entity binding, and tenant provisioning.
              </p>
            </div>
          </Link>

          <Link href="/team" className="group">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-400">
                  STEP 3 & 4
                </span>
                <Badge variant="healthy">CONNECTORS</Badge>
              </div>
              <h4 className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                Team Roles & Connector Setup
              </h4>
              <p className="text-xs text-slate-400">
                Analyst invite token flow and Generic Webhook activation wizard.
              </p>
            </div>
          </Link>

          <Link href="/ingestion" className="group">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-400">
                  STEP 5 & 6
                </span>
                <Badge variant="critical">DETECTION</Badge>
              </div>
              <h4 className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                Telemetry Ingest & Tier-A Detection
              </h4>
              <p className="text-xs text-slate-400">
                Synthetic failed login bursts triggering OCSF normalization and P1 alert.
              </p>
            </div>
          </Link>

          <Link href={state.cases[0] ? `/cases/${state.cases[0].id}` : "/cases"} className="group">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-purple-400">
                  STEP 7 & 8
                </span>
                <Badge variant="ai">AI COPILOT</Badge>
              </div>
              <h4 className="text-sm font-semibold text-slate-200 group-hover:text-purple-300 transition-colors">
                Case Workspace & AI Investigation
              </h4>
              <p className="text-xs text-slate-400">
                Evidence Merkle anchoring and Model Armor-screened attack narrative.
              </p>
            </div>
          </Link>

          <Link href={state.cases[0] ? `/cases/${state.cases[0].id}` : "/cases"} className="group">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-violet-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-violet-400">
                  STEP 9
                </span>
                <Badge variant="simulated">SOAR SANDBOX</Badge>
              </div>
              <h4 className="text-sm font-semibold text-slate-200 group-hover:text-violet-300 transition-colors">
                Decision & Response Simulation
              </h4>
              <p className="text-xs text-slate-400">
                Human authorization and SOAR response dry-run simulation receipt.
              </p>
            </div>
          </Link>

          <Link href="/audit" className="group">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-400">
                  STEP 10
                </span>
                <Badge variant="anchored">VERIFIER CLI</Badge>
              </div>
              <h4 className="text-sm font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">
                Control Tests & Offline Verifier
              </h4>
              <p className="text-xs text-slate-400">
                Audit package ZIP export and independent offline cryptographic verifier CLI.
              </p>
            </div>
          </Link>
        </div>
      </Card>
    </div>
  );
}
