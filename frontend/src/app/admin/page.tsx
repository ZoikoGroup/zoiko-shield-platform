"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useDemoState } from "@/lib/demo-state";
import { CommercialOfferType, Tenant } from "@/lib/types";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Modal } from "@/ui/Modal";
import {
  KeyRound,
  Lock,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ShieldAlert,
  Server,
  Activity,
  Layers,
  ArrowRight,
  RefreshCw,
  PlusCircle,
  TrendingUp,
  Cpu,
  Radio,
  Building,
  Users,
} from "lucide-react";

const ALL_COMMERCIAL_OFFERS: Array<{ key: CommercialOfferType; name: string; description: string; badgeVariant: "active" | "anchored" | "ai" | "critical" | "high" }> = [
  {
    key: "MANAGED_DEFENSE",
    name: "Managed Defense",
    description: "24x7 SOC threat triage, automated SOAR playbooks, and EDR containment.",
    badgeVariant: "active",
  },
  {
    key: "CONTINUOUS_ASSURANCE",
    name: "Continuous Assurance",
    description: "Automated SOC 2 & ISO 27001 control evaluation and cryptographic audit packages.",
    badgeVariant: "anchored",
  },
  {
    key: "INCIDENT_RESPONSE_RETAINER",
    name: "Incident Response Retainer",
    description: "24x7 emergency SLA response capacity and purpose-bound legal-sensitive records (§16.4).",
    badgeVariant: "high",
  },
  {
    key: "EXPOSURE_MANAGEMENT",
    name: "Exposure Management",
    description: "Continuous attack surface mapping and multi-hop attack path discovery.",
    badgeVariant: "critical",
  },
  {
    key: "AI_SECURITY",
    name: "AI Security & Governance",
    description: "NIST/EU AI Act model inventory, PSI drift monitoring, and anti-hallucination circuit breakers.",
    badgeVariant: "ai",
  },
];

export default function PlatformAdminPage() {
  const [state, setState] = useDemoState();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Kill Switch states
  const [isAiKillSwitchEngaged, setIsAiKillSwitchEngaged] = useState(
    (state.aiIncidents || []).some((i) => i.killSwitchEngaged)
  );
  const [isIngestThrottled, setIsIngestThrottled] = useState(false);
  const [isSoarFrozen, setIsSoarFrozen] = useState(false);

  // Break-glass modal
  const [isBreakGlassModalOpen, setIsBreakGlassModalOpen] = useState(false);
  const [breakGlassTarget, setBreakGlassTarget] = useState<"AI_KILL_SWITCH" | "INGEST_THROTTLE" | "SOAR_FREEZE" | null>(null);
  const [breakGlassReason, setBreakGlassReason] = useState("Emergency platform operator intervention");

  // Tenant offer toggling
  const activeOffers: CommercialOfferType[] = state.tenant.activeOffers || [
    "MANAGED_DEFENSE",
    "CONTINUOUS_ASSURANCE",
    "INCIDENT_RESPONSE_RETAINER",
    "EXPOSURE_MANAGEMENT",
    "AI_SECURITY",
  ];

  const handleToggleOffer = (offerKey: CommercialOfferType) => {
    const isCurrentlyActive = activeOffers.includes(offerKey);
    const updatedOffers: CommercialOfferType[] = isCurrentlyActive
      ? activeOffers.filter((o) => o !== offerKey)
      : [...activeOffers, offerKey];

    setState((prev) => ({
      ...prev,
      tenant: {
        ...prev.tenant,
        activeOffers: updatedOffers,
      },
    }));

    setActionMessage(
      isCurrentlyActive
        ? `🔒 Revoked commercial capability: ${offerKey}`
        : `✅ Provisioned commercial capability: ${offerKey}`
    );
    setTimeout(() => setActionMessage(null), 3500);
  };

  const handleTriggerBreakGlass = (target: "AI_KILL_SWITCH" | "INGEST_THROTTLE" | "SOAR_FREEZE") => {
    setBreakGlassTarget(target);
    setIsBreakGlassModalOpen(true);
  };

  const handleConfirmBreakGlass = () => {
    if (!breakGlassTarget) return;

    if (breakGlassTarget === "AI_KILL_SWITCH") {
      const newState = !isAiKillSwitchEngaged;
      setIsAiKillSwitchEngaged(newState);
      setState((prev) => ({
        ...prev,
        aiIncidents: (prev.aiIncidents || []).map((i) => ({
          ...i,
          killSwitchEngaged: newState,
        })),
      }));
      setActionMessage(newState ? "🚨 Global AI Inference Kill-Switch ENGAGED" : "✅ Global AI Kill-Switch DISENGAGED");
    } else if (breakGlassTarget === "INGEST_THROTTLE") {
      setIsIngestThrottled(!isIngestThrottled);
      setActionMessage(!isIngestThrottled ? "⚠️ Telemetry Ingestion Throttled to 50%" : "✅ Telemetry Ingestion Restored to 100%");
    } else if (breakGlassTarget === "SOAR_FREEZE") {
      setIsSoarFrozen(!isSoarFrozen);
      setActionMessage(!isSoarFrozen ? "🛑 Autonomous SOAR Containment Playbooks FROZEN" : "✅ SOAR Playbooks Resumed");
    }

    setIsBreakGlassModalOpen(false);
    setBreakGlassTarget(null);
    setTimeout(() => setActionMessage(null), 4000);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-6">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#141226] via-[#10141f] to-[#111f26] border border-cyan-500/30 shadow-[0_0_35px_rgba(6,182,212,0.12)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-purple-300 tracking-wider uppercase">
              SUPER-ADMIN OPERATIONS CENTER
            </span>
            <Badge variant="ai">PLATFORM_ROLE_MANAGE</Badge>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Multi-Tenant Administration &amp; Platform Controls
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            Provision commercial capability offers, execute emergency circuit breakers, monitor live ingestion quotas, and manage JIT support access elevations.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/admin/jit">
            <Button variant="cyan" size="md">
              <KeyRound className="w-4 h-4" />
              <span>JIT Elevation Center</span>
            </Button>
          </Link>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono flex items-center justify-between shadow-lg">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
      )}

      {/* Grid 1: Emergency Kill-Switches & Platform Circuit Breakers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            Emergency Platform Circuit Breakers &amp; Kill-Switches
          </h2>
          <span className="text-xs font-mono text-slate-400">Simulation Sandbox Guarded</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          {/* Circuit Breaker 1: AI Inference Kill-Switch */}
          <Card className={`p-5 space-y-3 border transition-all ${
            isAiKillSwitchEngaged
              ? "bg-rose-950/40 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
              : "bg-slate-900/60 border-slate-800"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold">AI INFERENCE CIRCUIT BREAKER</span>
              <Flame className={`w-4 h-4 ${isAiKillSwitchEngaged ? "text-rose-400 animate-pulse" : "text-slate-500"}`} />
            </div>
            <p className="text-slate-400 font-sans text-xs">
              Halts all foundation model inference queries globally and forces instant fallback to Tier-1 deterministic rule engines.
            </p>
            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <span className={`text-[11px] font-bold ${isAiKillSwitchEngaged ? "text-rose-400" : "text-emerald-400"}`}>
                STATUS: {isAiKillSwitchEngaged ? "CONTAINED / ENGAGED" : "NOMINAL / ACTIVE"}
              </span>
              <Button
                variant={isAiKillSwitchEngaged ? "primary" : "danger"}
                size="sm"
                onClick={() => handleTriggerBreakGlass("AI_KILL_SWITCH")}
              >
                {isAiKillSwitchEngaged ? "Disengage Switch" : "Break-Glass Freeze"}
              </Button>
            </div>
          </Card>

          {/* Circuit Breaker 2: Ingestion Throttling */}
          <Card className={`p-5 space-y-3 border transition-all ${
            isIngestThrottled
              ? "bg-amber-950/40 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
              : "bg-slate-900/60 border-slate-800"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold">INGESTION PIPELINE THROTTLER</span>
              <Radio className={`w-4 h-4 ${isIngestThrottled ? "text-amber-400 animate-pulse" : "text-slate-500"}`} />
            </div>
            <p className="text-slate-400 font-sans text-xs">
              Buffers incoming webhooks and throttles connector ingestion during high-volume DDoS or upstream provider storms.
            </p>
            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <span className={`text-[11px] font-bold ${isIngestThrottled ? "text-amber-400" : "text-emerald-400"}`}>
                STATUS: {isIngestThrottled ? "50% THROTTLED" : "100% NOMINAL"}
              </span>
              <Button
                variant={isIngestThrottled ? "primary" : "outline"}
                size="sm"
                onClick={() => handleTriggerBreakGlass("INGEST_THROTTLE")}
              >
                {isIngestThrottled ? "Restore Full Speed" : "Throttle 50%"}
              </Button>
            </div>
          </Card>

          {/* Circuit Breaker 3: SOAR Containment Freeze */}
          <Card className={`p-5 space-y-3 border transition-all ${
            isSoarFrozen
              ? "bg-purple-950/40 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)]"
              : "bg-slate-900/60 border-slate-800"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold">SOAR PLAYBOOK AUTONOMOUS FREEZE</span>
              <Lock className={`w-4 h-4 ${isSoarFrozen ? "text-purple-400 animate-pulse" : "text-slate-500"}`} />
            </div>
            <p className="text-slate-400 font-sans text-xs">
              Freezes autonomous R2/R3 remediation containment actions across cloud IAM, firewalls, and EDR agents.
            </p>
            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <span className={`text-[11px] font-bold ${isSoarFrozen ? "text-purple-400" : "text-emerald-400"}`}>
                STATUS: {isSoarFrozen ? "FROZEN (R0 ONLY)" : "NOMINAL (R0-R3)"}
              </span>
              <Button
                variant={isSoarFrozen ? "primary" : "outline"}
                size="sm"
                onClick={() => handleTriggerBreakGlass("SOAR_FREEZE")}
              >
                {isSoarFrozen ? "Unfreeze SOAR" : "Freeze Containment"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Grid 2: Commercial Offer Entitlement Matrix (Tenant Provisioning) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Building className="w-5 h-5 text-cyan-400" />
              Tenant Commercial Offer Entitlement Matrix
            </h2>
            <p className="text-xs text-slate-400">
              Tenant: <strong className="text-white font-mono">{state.tenant.organizationName}</strong> ({state.tenant.slug}) | Plan Tier: <strong className="text-cyan-300 font-mono">{state.tenant.planTier || "ENTERPRISE_PREMIUM"}</strong>
            </p>
          </div>
          <Badge variant="pass">5/5 Capabilities Configurable</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALL_COMMERCIAL_OFFERS.map((offer) => {
            const isEnrolled = activeOffers.includes(offer.key);

            return (
              <Card
                key={offer.key}
                className={`p-5 space-y-3 border transition-all ${
                  isEnrolled
                    ? "bg-slate-900/80 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                    : "bg-slate-950/60 border-slate-800 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Badge variant={offer.badgeVariant}>{offer.name}</Badge>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    isEnrolled ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30" : "bg-slate-800 text-slate-500"
                  }`}>
                    {isEnrolled ? "ACTIVE" : "REVOKED"}
                  </span>
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-100 font-sans">{offer.name}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans">{offer.description}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">Spec Key: {offer.key}</span>
                  <Button
                    variant={isEnrolled ? "outline" : "primary"}
                    size="sm"
                    onClick={() => handleToggleOffer(offer.key)}
                  >
                    {isEnrolled ? "Revoke Offer" : "Grant Offer"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Grid 3: Real-Time Resource Quotas & Ingestion Metering */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Real-Time Resource Quotas &amp; Metering Telemetry
          </h2>
          <span className="text-xs font-mono text-slate-400">Monthly Rolling Period</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
          <Card className="p-4 space-y-2 bg-slate-900/60 border-slate-800">
            <div className="flex items-center justify-between text-slate-400">
              <span>TELEMETRY INGESTION</span>
              <Radio className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl font-bold text-white">42.8 GB / 500 GB</div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className="bg-cyan-500 h-full" style={{ width: "8.5%" }} />
            </div>
            <span className="text-[10px] text-slate-500">8.5% of Monthly Limit Consumed</span>
          </Card>

          <Card className="p-4 space-y-2 bg-slate-900/60 border-slate-800">
            <div className="flex items-center justify-between text-slate-400">
              <span>NORMALIZED EVENTS</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white">2.84M / 10M</div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className="bg-emerald-500 h-full" style={{ width: "28.4%" }} />
            </div>
            <span className="text-[10px] text-slate-500">28.4% of OCSF Pipeline Throughput</span>
          </Card>

          <Card className="p-4 space-y-2 bg-slate-900/60 border-slate-800">
            <div className="flex items-center justify-between text-slate-400">
              <span>ACTIVE CONNECTORS</span>
              <Server className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl font-bold text-white">
              {state.connectors.filter((c) => c.status === "ACTIVE").length} / 50 Max
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className="bg-purple-500 h-full" style={{ width: "14%" }} />
            </div>
            <span className="text-[10px] text-slate-500">P0 GA &amp; P1 Preview Streams</span>
          </Card>

          <Card className="p-4 space-y-2 bg-slate-900/60 border-slate-800">
            <div className="flex items-center justify-between text-slate-400">
              <span>MONITORED IDENTITIES</span>
              <Users className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white">1,240 / 5,000</div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className="bg-amber-500 h-full" style={{ width: "24.8%" }} />
            </div>
            <span className="text-[10px] text-slate-500">Entra ID &amp; Okta Cloud Synced</span>
          </Card>
        </div>
      </div>

      {/* Break-Glass Emergency Confirmation Modal */}
      <Modal
        isOpen={isBreakGlassModalOpen}
        onClose={() => setIsBreakGlassModalOpen(false)}
        title="Execute Break-Glass Circuit Breaker"
        description="Emergency administrative action. All modifications are logged to the immutable ledger."
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-300 text-sm">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Break-Glass Target: {breakGlassTarget}</span>
            </div>
            <p>
              Executing this circuit breaker will instantly modify platform behavior across all connected tenant systems.
            </p>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="text-slate-300 font-mono">Mandatory Operator Justification:</label>
            <textarea
              rows={3}
              value={breakGlassReason}
              onChange={(e) => setBreakGlassReason(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-sans"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="outline" onClick={() => setIsBreakGlassModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmBreakGlass}>
              <ShieldAlert className="w-4 h-4" />
              <span>Confirm &amp; Execute</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
