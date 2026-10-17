"use client";

import React, { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDemoState, resetDemoState } from "@/lib/demo-state";
import { Button } from "@/components/ui/Button";
import {
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export const DEMO_STEPS = [
  { step: 1, title: "1. Platform Health", route: "/admin/platform-health", desc: "6 core microservices topology, storage engines, and non-destructive DR restore drill." },
  { step: 2, title: "2. G1 Launch Gate", route: "/admin/g1-gate", desc: "8-domain multi-signer cryptographic ratification with FIDO2 WebAuthn ceremony." },
  { step: 3, title: "3. Executive Risk", route: "/risk", desc: "Board-level CISO scorecard, financial exposure quantification, and attack path graph." },
  { step: 4, title: "4. Detection & Alerts", route: "/alerts", desc: "OCSF-normalized multi-source telemetry storm & MITRE ATT&CK correlation." },
  { step: 5, title: "5. Incident War Room", route: "/cases/incidents/command", desc: "Major incident orchestration, active host containment, and stakeholder timeline." },
  { step: 6, title: "6. AI Security Copilot", route: "/copilot", desc: "Spec §16.1 10-field decision review envelope, attributable rationale & KMS signing." },
  { step: 7, title: "7. AI Governance", route: "/ai-governance", desc: "EU AI Act & NIST AI RMF compliance, Model Armor filters, and circuit breakers." },
  { step: 8, title: "8. Cedar Policies", route: "/policies", desc: "Immutable Cedar policy lifecycle, side-by-side diff, 4-eyes approval & canary ring." },
  { step: 9, title: "9. JIT Privileged Access", route: "/admin/jit-elevation", desc: "Zero standing privileges, ephemeral break-glass access, and countdown timers." },
  { step: 10, title: "10. Autonomous SOAR", route: "/response-proposals", desc: "WASM sandbox dry-run, 0-blast-radius verification, and Cloud HSM KMS signing." },
  { step: 11, title: "11. Emergency Kill-Switch", route: "/admin", desc: "Tenant super-admin circuit breakers, AI containment, and commercial capability toggles." },
  { step: 12, title: "12. Evidence Ledger", route: "/ledger", desc: "RFC 3161 Merkle tree proof explorer, ML-DSA-65 post-quantum dual-witness signatures." },
  { step: 13, title: "13. Continuous Controls", route: "/controls", desc: "Real-time SOC 2 & ISO 27001 evaluation with cryptographic evidence freshness decay." },
  { step: 14, title: "14. Commercial Pricing", route: "/pricing", desc: "Anti-perverse pricing guarantee (Rule PR-02), band sizing guidance & GTM checklist." },
  { step: 15, title: "15. Notification Center", route: "/notifications", desc: "Audited delivery tracking, backchannel retry ledger, and dead-letter queue resolution." },
  { step: 16, title: "16. Template Studio", route: "/admin/email-templates", desc: "The Grand Finale: 226 production email templates with fail-closed security gating." },
];

export const DemoGuideBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setDemoState] = useDemoState();
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // Derive active step automatically from pathname if matching
  const currentStepFromPath = DEMO_STEPS.find((s) => {
    if (s.route === pathname) return true;
    if (s.step === 3 && pathname.startsWith("/risk")) return true;
    if (s.step === 4 && pathname.startsWith("/alerts")) return true;
    if (s.step === 5 && pathname.startsWith("/cases")) return true;
    if (s.step === 9 && pathname.startsWith("/admin/jit")) return true;
    if (s.step === 12 && (pathname === "/ledger" || pathname === "/evidence-operations")) return true;
    if (s.step === 13 && (pathname === "/controls" || pathname === "/compliance")) return true;
    if (s.step === 14 && (pathname === "/pricing" || pathname === "/admin/gtm-checklist")) return true;
    return false;
  })?.step;

  const activeStep = currentStepFromPath || state.currentStep || 1;
  const currentStepObj = DEMO_STEPS.find((s) => s.step === activeStep) || DEMO_STEPS[0];

  const handleNextStep = () => {
    const nextStep = Math.min(activeStep + 1, DEMO_STEPS.length);
    setDemoState({ ...state, currentStep: nextStep });
    const targetRoute = DEMO_STEPS.find((s) => s.step === nextStep)?.route || "/";
    router.push(targetRoute);
  };

  const handlePrevStep = () => {
    const prevStep = Math.max(activeStep - 1, 1);
    setDemoState({ ...state, currentStep: prevStep });
    const targetRoute = DEMO_STEPS.find((s) => s.step === prevStep)?.route || "/";
    router.push(targetRoute);
  };

  const handleReset = () => {
    if (confirm("Reset demo data to initial state?")) {
      const fresh = resetDemoState();
      setDemoState(fresh);
      router.push("/admin/platform-health");
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#080d19]/90 backdrop-blur-md border border-cyan-500/50 text-cyan-300 text-xs font-mono font-bold shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:scale-105 hover:border-cyan-400 transition-all"
        >
          <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>Walkthrough Guide • Step {activeStep}/16</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-[#080d19]/95 backdrop-blur-md border-t border-cyan-500/30 px-4 py-2.5 shadow-[0_-5px_30px_rgba(0,0,0,0.85)]">
      <div className="max-w-[1720px] mx-auto flex flex-col lg:flex-row items-center justify-between gap-3">
        {/* Left: Step Info */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-mono font-black text-xs shadow-[0_0_12px_rgba(6,182,212,0.25)]">
            {activeStep}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-cyan-400 uppercase tracking-wider">
                LIVE DEMO STAGE:
              </span>
              <span className="text-xs sm:text-sm font-bold text-white tracking-tight">
                {currentStepObj.title}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 max-w-lg truncate hidden sm:block">
              {currentStepObj.desc}
            </p>
          </div>
        </div>

        {/* Center: 16-Step Pill Selector */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none max-w-full">
          {DEMO_STEPS.map((s) => (
            <button
              key={s.step}
              onClick={() => {
                setDemoState({ ...state, currentStep: s.step });
                router.push(s.route);
              }}
              title={s.title}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all shrink-0 ${activeStep === s.step
                  ? "bg-cyan-500 text-slate-950 font-black shadow-[0_0_12px_rgba(6,182,212,0.6)] scale-105"
                  : s.step < activeStep
                    ? "bg-slate-800/80 text-emerald-400 border border-emerald-500/30 hover:bg-slate-700"
                    : "bg-slate-900/90 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
            >
              {s.step}
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrevStep}
            disabled={activeStep <= 1}
            className="border-slate-800 text-slate-300 hover:border-slate-700 px-2.5 h-8"
            title="Previous Step"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleNextStep}
            disabled={activeStep >= DEMO_STEPS.length}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold h-8 text-xs flex items-center gap-1 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
          >
            <span>Next ({activeStep < 16 ? activeStep + 1 : 16})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            title="Reset Demo Data to Initial State"
            className="text-slate-400 hover:text-rose-400 h-8 px-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>

          <button
            onClick={() => setIsMinimized(true)}
            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 font-mono rounded hover:bg-slate-800 transition-colors"
            title="Minimize Guide (Click floating badge to reopen)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};
