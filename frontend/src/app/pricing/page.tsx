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
  CreditCard,
  X,
  FileText,
  Check,
  Receipt,
  ShieldAlert,
  DollarSign,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

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

  // Simulated Payment & Checkout State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<PlanTier | null>(null);
  const [cardholderName, setCardholderName] = useState("Acme Corp Security Operations");
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [cardExpiry, setCardExpiry] = useState("12/28");
  const [cardCvc, setCardCvc] = useState("123");
  const [paymentToken, setPaymentToken] = useState("tok_visa_valid");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<any | null>(null);

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

  const openCheckoutForPlan = (plan: PlanTier) => {
    setSelectedPlanForCheckout(plan);
    setPaymentError(null);
    setPaymentReceipt(null);
    setIsCheckoutOpen(true);
  };

  const setTestCardPreset = (presetType: "VISA_VALID" | "MC_VALID" | "DECLINED" | "WIRE") => {
    setPaymentError(null);
    if (presetType === "VISA_VALID") {
      setCardNumber("4242 4242 4242 4242");
      setCardExpiry("12/28");
      setCardCvc("123");
      setPaymentToken("tok_visa_valid");
    } else if (presetType === "MC_VALID") {
      setCardNumber("5555 5555 5555 4444");
      setCardExpiry("08/29");
      setCardCvc("456");
      setPaymentToken("tok_mastercard");
    } else if (presetType === "DECLINED") {
      setCardNumber("4000 0000 0000 0002");
      setCardExpiry("10/27");
      setCardCvc("999");
      setPaymentToken("tok_invalid_charge");
    } else if (presetType === "WIRE") {
      setCardNumber("WIRE-ACH-ESCROW-2026");
      setCardExpiry("12/30");
      setCardCvc("000");
      setPaymentToken("wire_escrow_sovereign");
    }
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanForCheckout) return;

    setIsProcessingPayment(true);
    setPaymentError(null);
    setPaymentReceipt(null);

    const monthlyCost = isAnnual
      ? (selectedPlanForCheckout.pricing?.annualBilledMonthlyUsd || 10000)
      : (selectedPlanForCheckout.pricing?.monthlyUsd || 12000);
    const totalAmount = isAnnual ? monthlyCost * 12 : monthlyCost;

    try {
      const res = await ZoikoShieldApiClient.processPayment({
        amount: totalAmount,
        currency: "USD",
        paymentMethodToken: paymentToken,
        planTier: selectedPlanForCheckout.key,
        billingPeriod: isAnnual ? "ANNUAL" : "MONTHLY",
        cardNumber,
        cardholderName,
      });

      setPaymentReceipt(res.data);
    } catch (err: any) {
      setPaymentError(err.message || "Payment authorization failed. Simulated card was declined.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 p-6 space-y-10">
      {/* Header Banner */}
      <div className="text-center space-y-4 max-w-3xl mx-auto pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
          <Scale className="w-3.5 h-3.5" />
          <span>TRANSPARENT BAND-BASED SECURITY PRICING</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Outcome-Driven Security Plans
        </h1>
        <p className="text-slate-400 text-base leading-relaxed">
          Every plan is quoted per customer while the price book is approved (ADR-06). We eliminate perverse security incentives:
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
            className="w-14 h-7 bg-[#0c111e] rounded-full p-1 border border-[#162238] transition-colors relative"
          >
            <div
              className={`w-5 h-5 bg-cyan-400 rounded-full transition-transform shadow-[0_0_10px_rgba(0,240,255,0.6)] ${
                isAnnual ? "translate-x-7" : "translate-x-0"
              }`}
            />
          </button>
          <span className={`text-xs font-medium flex items-center gap-1.5 ${isAnnual ? "text-cyan-400 font-semibold" : "text-slate-400"}`}>
            Annual Commitment (20% Savings)
          </span>
          <button
            type="button"
            onClick={() => {
              if (plans.length > 0) openCheckoutForPlan(plans[1] || plans[0]);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold hover:bg-cyan-500/25 transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] ml-2"
          >
            <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
            <span>💳 Test Payment Flow</span>
          </button>
        </div>
      </div>

      {/* Mandatory Source of Truth & Commercial Sizing Disclaimer Banner */}
      <div className="surface-card p-5 rounded-xl border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-xs text-slate-300 bg-[#0c111e]">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5 max-w-3xl">
            <p className="font-semibold text-white flex items-center gap-2">
              <span>Commercial Sizing & Anti-Perverse Incentive Notice</span>
              <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-[10px] font-mono text-cyan-300">RULE PR-02</span>
            </p>
            <p className="text-slate-400 leading-relaxed">
              <strong className="text-slate-200">No public prices or SLAs yet:</strong> The price book (ADR-06) and contractual SLAs (ADR-07) are not yet approved, so every plan is quoted per customer and any response commitment is set in the order form. The asset and telemetry bands shown are sizing guidance for a quote, not included quotas.
            </p>
            <p className="text-slate-400 leading-relaxed">
              In accordance with Rule PR-02, invoices strictly reflect contracted band capacity. SOC alert volumes, incident surge frequency, forensic triaging depth, and AI Security Copilot query complexity carry zero surcharge or metered penalty.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <Link
            href="/admin/gtm-checklist"
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors"
          >
            <span>GTM Checklist</span>
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
          </Link>
          <Link
            href="/notifications"
            className="px-3.5 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
          >
            <span>Notification Center (Step 15)</span>
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
          </Link>
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
                  ? "bg-gradient-to-b from-cyan-950/40 via-[#0c111e] to-[#060911] border-2 border-cyan-400/80 shadow-[0_0_30px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400/30"
                  : "surface-card bg-[#0c111e] border border-[#162238] hover:border-cyan-500/40 shadow-lg"
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
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">Pricing by quote (ADR-06)</p>
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
                      {plan.allocations?.maxProtectedAssets ? `${plan.allocations.maxProtectedAssets} Nodes` : "Unlimited / Custom"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Telemetry Ingest:</span>
                    <span className="font-semibold text-slate-200">
                      {plan.allocations?.includedTelemetryGbPerDay ? `${plan.allocations.includedTelemetryGbPerDay} GB / day` : "Custom Band"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Response SLA:</span>
                    <span className="font-semibold text-emerald-400">
                      {plan.allocations?.incidentResponseSlaHours
                        ? `${plan.allocations.incidentResponseSlaHours}h Target (Order Form Bound)`
                        : "Custom / SOW Bound"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Evidence Retention:</span>
                    <span className="font-semibold text-slate-200">
                      {plan.allocations?.retentionDays != null
                        ? plan.allocations.retentionDays >= 365
                          ? `${plan.allocations.retentionDays / 365} Years`
                          : `${plan.allocations.retentionDays} Days`
                        : "90 Days"}
                    </span>
                  </div>
                </div>

                {/* Highlighted Feature List */}
                <div className="pt-2 space-y-2">
                  <div className="text-[10px] font-mono font-bold tracking-wider text-slate-500 uppercase">
                    Core Capabilities Included
                  </div>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {(plan.highlightedFeatures || []).map((feat, i) => (
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
                  {plan.supportModel || "Standard Platform Support"}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-6 space-y-2">
                <button
                  type="button"
                  onClick={() => openCheckoutForPlan(plan)}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isPop
                      ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                      : "bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>💳 Subscribe &amp; Pay (Test Checkout)</span>
                </button>
                <Link
                  href={plan.pricing?.isContractOnly ? "/team" : "/onboarding"}
                  className="w-full py-1 text-center text-[11px] text-slate-500 hover:text-slate-300 flex items-center justify-center gap-1 transition-colors"
                >
                  <span>{plan.pricing?.isContractOnly ? "Contact Enterprise Sales" : "Deploy via Onboarding"}</span>
                  <ArrowRight className="w-3 h-3" />
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

            {(() => {
              const rec = (recommendation as any)?.data || recommendation;
              const plan = rec?.recommendedPlan;
              if (!rec || !plan) return null;
              return (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-2xl font-black text-slate-100 flex items-center gap-2">
                      {plan.displayName || "Shield Essential"}
                      <Sparkles className="w-5 h-5 text-cyan-400" />
                    </h3>
                    <p className="text-xs font-mono text-cyan-400 mt-0.5">
                      {plan.pricing?.isContractOnly
                        ? "Custom Enterprise Agreement"
                        : plan.pricing?.monthlyUsd
                        ? `$${plan.pricing.monthlyUsd.toLocaleString()} / month baseline`
                        : "Custom Enterprise Agreement"}
                    </p>
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                      Solver Sizing Rationale:
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {(rec.rationale || []).map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <button
                      type="button"
                      onClick={() => openCheckoutForPlan(plan)}
                      className="w-full py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>💳 Authorize &amp; Pay for {plan.displayName || "Selected Plan"}</span>
                    </button>
                    <Link
                      href={plan.pricing?.isContractOnly ? "/team" : "/onboarding"}
                      className="w-full py-1 text-center text-[11px] text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1"
                    >
                      <span>Or complete manual enterprise onboarding</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Interactive Commercial Plan Subscription & Payment Checkout Modal */}
      {isCheckoutOpen && selectedPlanForCheckout && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="w-full max-w-2xl my-8 rounded-2xl bg-[#090e1c] border border-cyan-500/40 shadow-[0_0_60px_rgba(6,182,212,0.35)] p-6 md:p-8 space-y-6 text-slate-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg md:text-xl font-black text-slate-100">
                      Commercial Subscription &amp; Payment Gate
                    </h2>
                    <p className="text-xs text-slate-400 font-mono">
                      Stripe-compatible tokenized payment authorization with RFC 3161 proof receipt
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {paymentReceipt ? (
              /* Success Receipt View */
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Payment Successfully Authorized &amp; Plan Provisioned!</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Your sovereign commercial tier has been upgraded to <strong>{selectedPlanForCheckout.displayName}</strong>.
                    Billing adheres strictly to Rule PR-02: zero surcharges for security alert storms.
                  </p>
                </div>

                {/* Cryptographic Transaction Details */}
                <div className="p-4 rounded-xl bg-[#060911] border border-[#162238] space-y-2.5 font-mono text-xs">
                  <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span>Audit Evidence &amp; Receipt Proof</span>
                    <span className="text-emerald-400">STATUS: {paymentReceipt.status}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Transaction ID:</span>
                    <span className="text-slate-200">{paymentReceipt.providerPaymentId}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Amount Charged:</span>
                    <span className="text-emerald-300 font-bold">
                      ${paymentReceipt.amount?.toLocaleString()} {paymentReceipt.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Plan Tier:</span>
                    <span className="text-cyan-300">{paymentReceipt.planTier} ({paymentReceipt.billingPeriod})</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Payment Instrument:</span>
                    <span className="text-slate-200">
                      {paymentReceipt.paymentMethod?.brand} •••• {paymentReceipt.paymentMethod?.last4}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Target Tenant:</span>
                    <span className="text-slate-200">{paymentReceipt.tenantId}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800/80 space-y-1">
                    <span className="text-slate-500 text-[10px] block">RFC 3161 Merkle Hash:</span>
                    <span className="text-cyan-400 text-[10px] break-all block">
                      {paymentReceipt.rfc3161AuditHash}
                    </span>
                  </div>
                </div>

                {/* Receipt Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPaymentReceipt(null);
                      setPaymentError(null);
                    }}
                  >
                    Test Another Card / Payment
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setIsCheckoutOpen(false)}
                  >
                    Done &amp; Return to Platform
                  </Button>
                </div>
              </div>
            ) : (
              /* Checkout Form View */
              <form onSubmit={handleProcessPayment} className="space-y-5">
                {/* Plan Selection Summary Card */}
                <div className="p-4 rounded-xl bg-[#060911] border border-[#162238] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold">
                      Selected Plan Tier:
                    </div>
                    <div className="text-base font-black text-slate-100 mt-0.5">
                      {selectedPlanForCheckout.displayName}
                    </div>
                    <div className="text-xs text-slate-400">
                      {isAnnual ? "Billed annually with 20% commitment discount" : "Billed monthly"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-cyan-400">
                      ${(isAnnual
                        ? (selectedPlanForCheckout.pricing?.annualBilledMonthlyUsd || 10000) * 12
                        : (selectedPlanForCheckout.pricing?.monthlyUsd || 12000)
                      ).toLocaleString()}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {isAnnual ? "/ year total" : "/ month"}
                    </div>
                  </div>
                </div>

                {/* Plan Switcher Pills */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    Switch Plan Tier:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {plans.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setSelectedPlanForCheckout(p)}
                        className={`p-2 rounded-lg text-xs font-mono text-center border transition-all ${
                          selectedPlanForCheckout.key === p.key
                            ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold"
                            : "bg-[#060911] border-[#162238] text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {p.displayName.replace("Shield ", "")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1-Click Tester Card Presets */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                      QA TEST CARDS (1-CLICK FILL):
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400">Simulated Stripe Tokens</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setTestCardPreset("VISA_VALID")}
                      className={`p-2 rounded-lg border text-left text-xs transition-all ${
                        paymentToken === "tok_visa_valid"
                          ? "bg-emerald-950/40 border-emerald-400 text-emerald-300 font-bold"
                          : "bg-[#060911] border-[#162238] text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="text-[10px] text-emerald-400 font-mono">SUCCESS</div>
                      <div>Visa (4242)</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestCardPreset("MC_VALID")}
                      className={`p-2 rounded-lg border text-left text-xs transition-all ${
                        paymentToken === "tok_mastercard"
                          ? "bg-emerald-950/40 border-emerald-400 text-emerald-300 font-bold"
                          : "bg-[#060911] border-[#162238] text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="text-[10px] text-emerald-400 font-mono">SUCCESS</div>
                      <div>Mastercard</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestCardPreset("DECLINED")}
                      className={`p-2 rounded-lg border text-left text-xs transition-all ${
                        paymentToken === "tok_invalid_charge"
                          ? "bg-rose-950/40 border-rose-400 text-rose-300 font-bold"
                          : "bg-[#060911] border-[#162238] text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="text-[10px] text-rose-400 font-mono">TEST ERROR</div>
                      <div>Declined (0002)</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestCardPreset("WIRE")}
                      className={`p-2 rounded-lg border text-left text-xs transition-all ${
                        paymentToken === "wire_escrow_sovereign"
                          ? "bg-cyan-950/40 border-cyan-400 text-cyan-300 font-bold"
                          : "bg-[#060911] border-[#162238] text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="text-[10px] text-cyan-400 font-mono">ENTERPRISE</div>
                      <div>Corporate Wire</div>
                    </button>
                  </div>
                </div>

                {/* Payment Fields */}
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-xs font-mono text-slate-300">Billing Organization / Cardholder Name:</label>
                    <input
                      type="text"
                      required
                      value={cardholderName}
                      onChange={(e) => setCardholderName(e.target.value)}
                      className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-mono text-slate-300 flex items-center justify-between">
                      <span>Card Number / Payment Token:</span>
                      <span className="text-[10px] text-cyan-400 font-normal">Token: {paymentToken}</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                      />
                      <CreditCard className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-mono text-slate-300">Expiration (MM/YY):</label>
                      <input
                        type="text"
                        required
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-mono text-slate-300">Security CVC:</label>
                      <input
                        type="text"
                        required
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        placeholder="123"
                        className="w-full bg-[#060911] border border-[#162238] rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Decline Error Banner */}
                {paymentError && (
                  <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 text-xs font-mono space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Payment Declined (Testing Failure Verification)</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      {paymentError}
                    </p>
                  </div>
                )}

                {/* Authorize & Submit */}
                <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                  <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>256-Bit TLS &amp; Tokenized Card Escrow</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCheckoutOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      isLoading={isProcessingPayment}
                      className="font-bold shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                    >
                      <span>Authorize &amp; Complete Payment</span>
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
