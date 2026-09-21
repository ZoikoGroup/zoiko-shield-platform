"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { PlanTier, PlanRecommendation } from "@/lib/types";
import {
  ShieldCheck,
  Zap,
  Lock,
  Layers,
  Sparkles,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Building,
  Radio,
  Clock,
  ArrowRight,
  Flame,
  Scale,
} from "lucide-react";
import Link from "next/link";

export default function PricingPage() {
  const [plans, setPlans] = useState<PlanTier[]>([]);
  const [isAnnual, setIsAnnual] = useState(true);
  const [loading, setLoading] = useState(true);

  // Calculator State
  const [assets, setAssets] = useState(250);
  const [telemetryGb, setTelemetryGb] = useState(25);
  const [requires24x7, setRequires24x7] = useState(false);
  const [requiresSovereign, setRequiresSovereign] = useState(false);
  const [recommendation, setRecommendation] = useState<PlanRecommendation | null>(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    async function loadPlans() {
      try {
        const data = await ZoikoShieldApiClient.getPlanTiers();
        setPlans(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load plans", err);
        setPlans([]);
      } finally {
        setLoading(false);
      }
    }
    loadPlans();
  }, []);

  useEffect(() => {
    async function updateRecommendation() {
      setCalculating(true);
      try {
        const res = await ZoikoShieldApiClient.recommendPlan({
          protectedAssetCount: assets,
          estimatedDailyGb: telemetryGb,
          requiresContinuous24x7Mdr: requires24x7,
          requiresDedicatedTenantIsolation: requiresSovereign,
        });
        setRecommendation(res);
      } catch (err) {
        console.error("Failed to calculate recommendation", err);
      } finally {
        setCalculating(false);
      }
    }
    updateRecommendation();
  }, [assets, telemetryGb, requires24x7, requiresSovereign]);

  return (
    <div className="space-y-10 pb-16">
      {/* Header Banner */}
      <div className="text-center space-y-4 max-w-3xl mx-auto pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
          <Scale className="w-3.5 h-3.5" />
          <span>TRANSPARENT BAND-BASED SECURITY PRICING</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-100 sm:text-5xl">
          Outcome-Driven Security Plans
        </h1>
        <p className="text-slate-400 text-base leading-relaxed">
          Predictable flat-rate pricing based on asset and telemetry bands. We eliminate perverse security incentives:
          your billing <span className="text-cyan-300 font-semibold">never increases</span> during alert storms, incident surges, or deep forensic investigations.
        </p>

        {/* Annual / Monthly Toggle */}
        <div className="flex items-center justify-center gap-4 pt-4">
          <span className={`text-xs font-medium ${!isAnnual ? "text-cyan-400 font-semibold" : "text-slate-400"}`}>
            Monthly Billed
          </span>
          <button
            type="button"
            onClick={() => setIsAnnual(!isAnnual)}
            className="w-14 h-7 bg-slate-800 rounded-full p-1 border border-slate-700 transition-colors relative"
          >
            <div
              className={`w-5 h-5 bg-cyan-400 rounded-full transition-transform shadow-md ${
                isAnnual ? "translate-x-7" : "translate-x-0"
              }`}
            />
          </button>
          <span className={`text-xs font-medium flex items-center gap-1.5 ${isAnnual ? "text-cyan-400 font-semibold" : "text-slate-400"}`}>
            Annual Commitment
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
              SAVE 10%
            </span>
          </span>
        </div>
      </div>

      {/* Mandatory Source of Truth & Commercial Sizing Disclaimer Banner */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)] flex items-start gap-3 text-xs text-slate-300">
        <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <p className="font-semibold text-slate-100 flex items-center gap-2">
            <span>Commercial Sizing & Anti-Perverse Incentive Notice</span>
            <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-[10px] font-mono text-cyan-300">RULE PR-02</span>
          </p>
          <p className="text-slate-400 leading-relaxed">
            <strong className="text-slate-200">Indicative Operational Baselines:</strong> Asset counts (250 / 1k / 5k nodes), daily telemetry ingestion thresholds (10 / 50 / 250 GB/day), and incident response SLA targets (4h / 2h / 1h) shown below represent baseline engineering sizing models. Final contractual commitments, dedicated surge allowances, and custom SLA penalty terms are formally established in the tailored commercial Statement of Work (SOW).
          </p>
          <p className="text-slate-400 leading-relaxed">
            In accordance with Rule PR-02, invoices strictly reflect contracted band capacity. SOC alert volumes, incident surge frequency, forensic triaging depth, and AI Security Copilot query complexity carry zero surcharge or metered penalty.
          </p>
        </div>
      </div>

      {/* 4-Tier Plan Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {(Array.isArray(plans) ? plans : []).map((plan) => {
          const isPop = plan.isPopular;
          const monthlyRate = isAnnual
            ? plan.pricing.annualBilledMonthlyUsd
            : plan.pricing.monthlyUsd;

          return (
            <div
              key={plan.key}
              className={`relative rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 ${
                isPop
                  ? "bg-gradient-to-b from-cyan-950/40 via-slate-900/90 to-slate-950/90 border-2 border-cyan-500/60 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
                  : "bg-slate-900/60 border border-slate-800/80 hover:border-slate-700"
              }`}
            >
              {isPop && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-500 text-slate-950 font-mono text-[10px] font-bold tracking-wide shadow-md">
                  MOST POPULAR
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-100">{plan.displayName}</h3>
                  <p className="text-xs text-cyan-400 font-mono mt-0.5">{plan.tagline}</p>
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2">{plan.description}</p>
                </div>

                {/* Price Display */}
                <div className="pt-2 pb-3 border-y border-slate-800/80">
                  {plan.pricing.isContractOnly ? (
                    <div>
                      <div className="text-2xl font-black text-slate-100">Contract Only</div>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">Bespoke SLA & Sovereign Cell</p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-slate-100">
                          ${monthlyRate?.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">/ month</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {isAnnual ? "Billed annually ($" + ((monthlyRate || 0) * 12).toLocaleString() + "/yr)" : "Billed monthly"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Allocations Badges */}
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Protected Assets:</span>
                    <span className="font-semibold text-slate-200">
                      {plan.allocations.maxProtectedAssets ? `${plan.allocations.maxProtectedAssets} Nodes` : "Unlimited / Custom"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Telemetry Ingest:</span>
                    <span className="font-semibold text-slate-200">
                      {plan.allocations.includedTelemetryGbPerDay ? `${plan.allocations.includedTelemetryGbPerDay} GB / day` : "Custom Band"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Response SLA:</span>
                    <span className="font-semibold text-emerald-400">
                      {plan.allocations.incidentResponseSlaHours
                        ? `${plan.allocations.incidentResponseSlaHours}h Target (Order Form Bound)`
                        : "Custom / SOW Bound"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Evidence Retention:</span>
                    <span className="font-semibold text-slate-200">
                      {plan.allocations.retentionDays >= 365 ? `${plan.allocations.retentionDays / 365} Years` : `${plan.allocations.retentionDays} Days`}
                    </span>
                  </div>
                </div>

                {/* Highlighted Feature List */}
                <div className="pt-2 space-y-2">
                  <div className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase">
                    Core Capabilities Included
                  </div>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {plan.highlightedFeatures.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Support Model */}
                <div className="pt-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300 block mb-0.5">Support Level:</span>
                  {plan.supportModel}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-6">
                <Link
                  href={plan.pricing.isContractOnly ? "/team" : "/onboarding"}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    isPop
                      ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
                  }`}
                >
                  <span>{plan.pricing.isContractOnly ? "Contact Enterprise Sales" : "Deploy Shield Tier"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dynamic Sizing & Plan Recommendation Engine */}
      <div className="p-8 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400">
              <Calculator className="w-4 h-4" />
              <span>LIVE BAND SIZING CALCULATOR</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100">
              Find Your Optimal Shield Band
            </h2>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Real-time constraint solver per ADR-08
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls */}
          <div className="lg:col-span-7 space-y-6">
            {/* Asset Slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-300">Protected Cloud & Identity Assets:</span>
                <span className="font-bold text-cyan-400 text-sm">{assets.toLocaleString()} Assets</span>
              </div>
              <input
                type="range"
                min="50"
                max="6000"
                step="50"
                value={assets}
                onChange={(e) => setAssets(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>50 (Essential)</span>
                <span>1,000 (Pro)</span>
                <span>5,000 (Advanced)</span>
                <span>6,000+ (Enterprise)</span>
              </div>
            </div>

            {/* Telemetry Slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-300">Estimated Daily Telemetry Ingestion:</span>
                <span className="font-bold text-cyan-400 text-sm">{telemetryGb.toLocaleString()} GB / day</span>
              </div>
              <input
                type="range"
                min="5"
                max="600"
                step="5"
                value={telemetryGb}
                onChange={(e) => setTelemetryGb(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>5 GB</span>
                <span>100 GB</span>
                <span>500 GB</span>
                <span>600+ GB</span>
              </div>
            </div>

            {/* Operational Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <label className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition-colors">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-slate-200 block">Priority Managed Defense (MDR)</span>
                  <span className="text-[11px] text-slate-400">Order-form bound governed response & triage</span>
                </div>
                <input
                  type="checkbox"
                  checked={requires24x7}
                  onChange={(e) => setRequires24x7(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-cyan-400 bg-slate-800"
                />
              </label>

              <label className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition-colors">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-slate-200 block">Sovereign Cell / BYOK</span>
                  <span className="text-[11px] text-slate-400">Dedicated Sovereign Cloud Cell & BYOK</span>
                </div>
                <input
                  type="checkbox"
                  checked={requiresSovereign}
                  onChange={(e) => setRequiresSovereign(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-cyan-400 bg-slate-800"
                />
              </label>
            </div>
          </div>

          {/* Sizing Output Box */}
          <div className="lg:col-span-5 p-6 rounded-xl bg-slate-950 border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.15)] space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-3">
              <span>RECOMMENDED TIER</span>
              <span className="text-cyan-400 font-bold">
                {calculating ? "SOLVING..." : "ENGINE VERIFIED"}
              </span>
            </div>

            {recommendation && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl font-black text-slate-100 flex items-center gap-2">
                    {recommendation.recommendedPlan.displayName}
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                  </h3>
                  <p className="text-xs font-mono text-cyan-400 mt-0.5">
                    {recommendation.recommendedPlan.pricing.isContractOnly
                      ? "Custom Enterprise Agreement"
                      : `$${recommendation.recommendedPlan.pricing.monthlyUsd?.toLocaleString()} / month baseline`}
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                    Solver Sizing Rationale:
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {recommendation.rationale.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <Link
                    href={recommendation.recommendedPlan.pricing.isContractOnly ? "/team" : "/onboarding"}
                    className="w-full py-2 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md"
                  >
                    <span>Proceed with {recommendation.recommendedPlan.displayName}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
