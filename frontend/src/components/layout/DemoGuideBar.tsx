"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDemoState, saveDemoState, resetDemoState } from "@/lib/demo-state";
import { Button } from "@/ui/Button";
import {
  PlayCircle,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";

export const DEMO_STEPS = [
  { step: 1, title: "1. Authentication", route: "/login", desc: "Authenticate with password fallback & JWT issuance." },
  { step: 2, title: "2. Organization Onboarding", route: "/onboarding", desc: "Provision tenant, legal entity, and environment." },
  { step: 3, title: "3. Analyst Invitation", route: "/team", desc: "Invite Security Analyst and accept role assignment." },
  { step: 4, title: "4. Connector Setup", route: "/connectors", desc: "Configure and activate Webhook Ingestion Connector." },
  { step: 5, title: "5. Telemetry Ingestion", route: "/ingestion", desc: "Send synthetic failed login storm & verify normalization." },
  { step: 6, title: "6. Detection & Alerting", route: "/alerts", desc: "Execute threshold rule and generate P1 alert." },
  { step: 7, title: "7. Case & Evidence Ledger", route: "/cases", desc: "Promote alert to Case & record SHA-256 Merkle evidence." },
  { step: 8, title: "8. AI Investigation Copilot", route: "/cases", desc: "Synthesize attack narrative with Model Armor safety citations." },
  { step: 9, title: "9. Human Decision & Response", route: "/cases", desc: "Record human decision & simulate SOAR session reset." },
  { step: 10, title: "10. Controls & Offline Verifier", route: "/audit", desc: "Evaluate SOC2/ISO controls, generate audit ZIP & verify." },
];

export const DemoGuideBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useDemoState();
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const currentStepObj = DEMO_STEPS.find((s) => s.step === state.currentStep) || DEMO_STEPS[0];

  const handleNextStep = () => {
    const nextStep = Math.min(state.currentStep + 1, DEMO_STEPS.length);
    state.currentStep = nextStep;
    saveDemoState(state);
    const targetRoute = DEMO_STEPS.find((s) => s.step === nextStep)?.route || "/";
    router.push(targetRoute);
  };

  const handlePrevStep = () => {
    const prevStep = Math.max(state.currentStep - 1, 1);
    state.currentStep = prevStep;
    saveDemoState(state);
    const targetRoute = DEMO_STEPS.find((s) => s.step === prevStep)?.route || "/";
    router.push(targetRoute);
  };

  const handleReset = () => {
    if (confirm("Reset demo data to initial state?")) {
      const fresh = resetDemoState();
      setState(fresh);
      router.push("/");
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#11141c] border border-cyan-500/40 text-cyan-300 text-xs font-mono font-semibold shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:scale-105 transition-all"
        >
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>ERB-01 Demo Guide (Step {state.currentStep}/10)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-[#0c0e14]/95 backdrop-blur-md border-t border-cyan-500/30 p-3.5 shadow-[0_-5px_30px_rgba(0,0,0,0.8)]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Step Info */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-mono font-bold text-xs">
            {state.currentStep}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-cyan-400">
                ERB-01 RUNBOOK:
              </span>
              <span className="text-sm font-semibold text-slate-100">
                {currentStepObj.title}
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-xl truncate">
              {currentStepObj.desc}
            </p>
          </div>
        </div>

        {/* Center: Step Selector */}
        <div className="flex items-center gap-1 overflow-x-auto py-1">
          {DEMO_STEPS.map((s) => (
            <button
              key={s.step}
              onClick={() => {
                state.currentStep = s.step;
                saveDemoState(state);
                router.push(s.route);
              }}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                state.currentStep === s.step
                  ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                  : s.step < state.currentStep
                  ? "bg-slate-800 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-900 text-slate-500 hover:text-slate-300"
              }`}
            >
              {s.step}
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrevStep}
            disabled={state.currentStep <= 1}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleNextStep}
            disabled={state.currentStep >= DEMO_STEPS.length}
          >
            <span>Next Stage</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>

          <Button size="sm" variant="ghost" onClick={handleReset} title="Reset Demo Data">
            <RotateCcw className="w-3.5 h-3.5 text-slate-400 hover:text-rose-400" />
          </Button>

          <button
            onClick={() => setIsMinimized(true)}
            className="text-[11px] text-slate-500 hover:text-slate-300 px-1 font-mono"
            title="Minimize Guide"
          >
            _
          </button>
        </div>
      </div>
    </div>
  );
};
