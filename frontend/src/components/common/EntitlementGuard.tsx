"use client";

import React from "react";
import { useDemoState } from "@/lib/demo-state";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Lock, ShieldAlert, Sparkles, ArrowRight, ExternalLink } from "lucide-react";

export type CommercialOffer =
  | "MANAGED_DEFENSE"
  | "CONTINUOUS_ASSURANCE"
  | "INCIDENT_RESPONSE_RETAINER"
  | "EXPOSURE_MANAGEMENT"
  | "AI_SECURITY";

interface EntitlementGuardProps {
  requiredOffer: CommercialOffer;
  title?: string;
  description?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showCard?: boolean;
}

const OFFER_LABELS: Record<CommercialOffer, { name: string; description: string; badgeVariant: "active" | "anchored" | "ai" | "critical" | "high" }> = {
  MANAGED_DEFENSE: {
    name: "Managed Defense",
    description: "24x7 SOC threat triage, SOAR response playbooks, and EDR containment require an active Managed Defense subscription.",
    badgeVariant: "active",
  },
  CONTINUOUS_ASSURANCE: {
    name: "Continuous Assurance",
    description: "Automated SOC 2 / ISO 27001 control evaluation, evidence decay monitoring, and cryptographic audit packages require a Continuous Assurance subscription.",
    badgeVariant: "anchored",
  },
  INCIDENT_RESPONSE_RETAINER: {
    name: "Incident Response Retainer",
    description: "Dedicated SLA response capacity, crisis coordination, and purpose-bound legal-access controls require an active IR Retainer contract.",
    badgeVariant: "high",
  },
  EXPOSURE_MANAGEMENT: {
    name: "Exposure Management",
    description: "Continuous attack surface mapping and multi-hop attack path discovery require an Exposure Management subscription.",
    badgeVariant: "critical",
  },
  AI_SECURITY: {
    name: "AI Security & Governance",
    description: "High-assurance LLM safety circuit breakers, differential privacy, and prompt injection shields require an AI Security subscription.",
    badgeVariant: "ai",
  },
};

export const EntitlementGuard: React.FC<EntitlementGuardProps> = ({
  requiredOffer,
  title,
  description,
  children,
  fallback,
  showCard = true,
}) => {
  const [state] = useDemoState();

  // In demo / live state, evaluate if tenant holds the required entitlement
  // If planTier is 'ENTERPRISE_PREMIUM' or specific offer is active, allow access
  const activeOffers: string[] = (state.tenant as any)?.activeOffers || [
    "MANAGED_DEFENSE",
    "CONTINUOUS_ASSURANCE",
    "INCIDENT_RESPONSE_RETAINER",
  ];
  
  const isEntitled =
    activeOffers.includes(requiredOffer) ||
    state.tenant.planTier === "ENTERPRISE" ||
    (state.tenant as any)?.isEnterprisePlus === true;

  if (isEntitled) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showCard) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-mono">
        <Lock className="w-3 h-3 text-rose-400" />
        <span>Requires {OFFER_LABELS[requiredOffer].name}</span>
      </div>
    );
  }

  const offerInfo = OFFER_LABELS[requiredOffer];

  return (
    <Card className="relative overflow-hidden border-rose-500/30 bg-gradient-to-b from-slate-900/95 via-rose-950/20 to-slate-950/95 p-8 text-center backdrop-blur-xl shadow-2xl shadow-rose-950/20">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative z-10 max-w-lg mx-auto space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/50">
          <Lock className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Badge variant={offerInfo.badgeVariant}>{offerInfo.name}</Badge>
            <span className="text-xs font-mono text-rose-400 font-bold uppercase tracking-wider">
              Subscription Required
            </span>
          </div>
          <h3 className="text-xl font-black text-slate-100 tracking-tight">
            {title || `${offerInfo.name} Entitlement Required`}
          </h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            {description || offerInfo.description}
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="primary" className="w-full sm:w-auto bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white border-0 shadow-lg shadow-rose-900/40">
            <span>Upgrade Commercial Contract</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
          <Button variant="ghost" className="w-full sm:w-auto text-slate-400 hover:text-slate-200">
            <span>Contact Account Team</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
