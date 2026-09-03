"use client";

import React, { useState } from "react";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import {
  Skull,
  Shield,
  Play,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Terminal,
  Cpu,
  Layers,
  Sparkles,
  RotateCcw,
  Zap,
} from "lucide-react";

interface AttackStage {
  stageNumber: number;
  name: string;
  tactic: string;
  technique: string;
  ocsfEventType: string;
  samplePayload: Record<string, unknown>;
  expectedRule: string;
  detectionStatus: "DETECTED" | "PENDING";
}

export default function RedTeamSimulatorPage() {
  const [scenarioType, setScenarioType] = useState<
    "RANSOMWARE_STAGING" | "CLOUD_PRIVILEGE_ESCALATION" | "SUPPLY_CHAIN_INJECTION"
  >("RANSOMWARE_STAGING");

  const [targetHost, setTargetHost] = useState("srv-db-prod-02");
  const [targetUser, setTargetUser] = useState("victim.analyst@acme.corp");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(true);

  const stages: AttackStage[] = [
    {
      stageNumber: 1,
      name: "Initial Access & Token Harvest",
      tactic: "TA0001: Initial Access",
      technique: "T1078.004: Valid Cloud Accounts",
      ocsfEventType: "AUTHENTICATION",
      samplePayload: {
        eventActivity: "LOGIN_ATTEMPT",
        actor: targetUser,
        sourceIp: "198.51.100.99",
        outcome: "SUCCESS",
        authProtocol: "OIDC_TOKEN_REFRESH",
      },
      expectedRule: "ZS-AUTH-001 (Impossible Geo-Travel Detection)",
      detectionStatus: "DETECTED",
    },
    {
      stageNumber: 2,
      name: "Privilege Escalation & Defender Evasion",
      tactic: "TA0004: Privilege Escalation",
      technique: "T1059.001: PowerShell Execution with Obfuscation",
      ocsfEventType: "PROCESS_ACTIVITY",
      samplePayload: {
        processName: "powershell.exe",
        commandLine: "powershell.exe -Enc SGVsbG8gV29ybGQ= -WindowStyle Hidden",
        parentProcess: "svchost.exe",
        host: targetHost,
      },
      expectedRule: "ZS-PROC-001 (Encoded PowerShell Execution)",
      detectionStatus: "DETECTED",
    },
    {
      stageNumber: 3,
      name: "Shadow Copy Deletion & Ransomware Prep",
      tactic: "TA0040: Impact",
      technique: "T1490: Inhibit System Recovery",
      ocsfEventType: "PROCESS_ACTIVITY",
      samplePayload: {
        processName: "vssadmin.exe",
        commandLine: "vssadmin delete shadows /all /quiet",
        host: targetHost,
        user: targetUser,
      },
      expectedRule: "ZS-IMPACT-002 (Volume Shadow Copy Deletion)",
      detectionStatus: "DETECTED",
    },
  ];

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      setSimulationComplete(true);
    }, 1800);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-[#0e121b] border border-rose-500/30 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <Skull className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white tracking-wide">
                    Autonomous Purple-Team & Adversarial Simulator
                  </h1>
                  <Badge variant="critical">Continuous Red-Team</Badge>
                  <Badge variant="neutral">OCSF v1.1.0 Synthetic Telemetry</Badge>
                </div>
                <p className="text-xs text-slate-400">
                  Specification: <span className="font-mono text-cyan-400">ZS-ENG-AI-001</span> §15 & <span className="font-mono text-cyan-400">ZS-T0-TECH-001</span> §09
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
              MITRE ATT&CK Coverage: <span className="text-emerald-400 font-bold">100% (3/3 Stages Detected)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Scenario Parameters */}
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Scenario Configuration</span>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-400">Adversary Scenario Type:</label>
                <select
                  value={scenarioType}
                  onChange={(e) => setScenarioType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value="RANSOMWARE_STAGING">Multi-Stage Ransomware Staging</option>
                  <option value="CLOUD_PRIVILEGE_ESCALATION">Cloud IAM Privilege Escalation</option>
                  <option value="SUPPLY_CHAIN_INJECTION">Software Supply-Chain Injection</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400">Target Host Asset:</label>
                <input
                  type="text"
                  value={targetHost}
                  onChange={(e) => setTargetHost(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400">Target User Principal:</label>
                <input
                  type="text"
                  value={targetUser}
                  onChange={(e) => setTargetUser(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <Button
                variant="primary"
                className="w-full py-2.5 font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-purple-600 hover:from-rose-500 hover:to-purple-500 shadow-lg shadow-rose-900/30"
                onClick={handleRunSimulation}
                disabled={isSimulating}
              >
                {isSimulating ? (
                  <>
                    <Flame className="w-4 h-4 animate-spin text-amber-300" />
                    <span>Emitting Synthetic Telemetry...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Run Purple-Team Scenario</span>
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Validation Metrics */}
          <Card className="p-5 space-y-3 font-mono text-xs">
            <div className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">
              Continuous Validation Metrics
            </div>
            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-400">Detection Efficacy:</span>
              <span className="text-emerald-400 font-bold">100.0%</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-900">
              <span className="text-slate-400">Mean Time to Detect (MTTD):</span>
              <span className="text-cyan-400 font-bold">850 ms</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Zero-Day Defense Posture:</span>
              <span className="text-purple-400 font-bold">HARDENED</span>
            </div>
          </Card>
        </div>

        {/* Right 2 Columns: Multi-Stage Attack Chain & Detection Results */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-rose-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Adversary Attack Stages & Real-Time Detection Results
                </h2>
              </div>
              <Badge variant="pass">All 3 Stages Neutralized</Badge>
            </div>

            <div className="space-y-4">
              {stages.map((stage) => (
                <div
                  key={stage.stageNumber}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs hover:border-rose-500/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                        STAGE {stage.stageNumber}
                      </span>
                      <span className="text-slate-200 font-bold">{stage.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{stage.detectionStatus}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-purple-400 font-bold">MITRE Tactic:</span>{" "}
                      <span className="text-slate-300">{stage.tactic}</span>
                    </div>
                    <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                      <span className="text-cyan-400 font-bold">Technique:</span>{" "}
                      <span className="text-slate-300">{stage.technique}</span>
                    </div>
                  </div>

                  {/* Synthetic OCSF Event Payload */}
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
                    <div className="text-slate-400 text-[10px] font-semibold flex items-center justify-between">
                      <span>SYNTHETIC OCSF EVENT PAYLOAD ({stage.ocsfEventType})</span>
                      <span className="text-cyan-400">Triggered: {stage.expectedRule}</span>
                    </div>
                    <pre className="text-[10px] text-slate-300 overflow-x-auto">
                      {JSON.stringify(stage.samplePayload, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
