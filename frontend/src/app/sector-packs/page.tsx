"use client";

import React, { useState } from "react";
import {
  Building2,
  Landmark,
  HeartPulse,
  Scale,
  Cloud,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Server,
  FileCheck2,
  Lock,
} from "lucide-react";
import Link from "next/link";

interface SectorPack {
  id: string;
  name: string;
  badge: string;
  icon: React.ReactNode;
  tagline: string;
  description: string;
  targetRegimes: string[];
  statutoryCaveat: string;
  tailoredFeatures: string[];
  recommendedPlan: string;
  activeConnectors: string[];
}

const SECTOR_PACKS: SectorPack[] = [
  {
    id: "telecom",
    name: "Telecommunications & Critical Carrier Infrastructure",
    badge: "CARRIER GRADE",
    icon: <Server className="w-6 h-6 text-cyan-400" />,
    tagline: "Ultra-High-Throughput Signaling, Core Network & OCSF Ingestion",
    description:
      "Engineered for Tier-1 telcos and ISP backbones processing millions of OCSF v1.1 events per second with zero ingestion buffer loss and sub-second anomaly detection.",
    targetRegimes: ["NIS2 (Deferred Evaluation)", "ITU-T X.805", "ISO 27011"],
    statutoryCaveat:
      "Statutory EU NIS2 supply chain and early warning compliance evaluations remain DEFERRED to Phase 2 midpoint per ADR-08. Telemetry ingestion, OCSF normalization, and core MDR remain fully active.",
    tailoredFeatures: [
      "Multi-region high-throughput webhook pipelines (>500k eps)",
      "BGP route leak and DNS tunnel anomaly detection",
      "Dilithium3 cryptographic evidence logging for carrier peering records",
      "Dual-operator R4 network isolate and route withdraw playbooks",
    ],
    recommendedPlan: "Shield Advanced / Enterprise",
    activeConnectors: ["AWS CloudTrail", "CrowdStrike Falcon EDR", "Generic Webhook Ingestion"],
  },
  {
    id: "fintech",
    name: "FinTech, Banking & High-Frequency Payment Networks",
    badge: "FINANCIAL RESILIENCE",
    icon: <Landmark className="w-6 h-6 text-emerald-400" />,
    tagline: "Immutable Audit Trails, Anti-Perverse Billing & Access Governance",
    description:
      "Purpose-built for digital banks, payment processors, and crypto custodians demanding mathematical proof of ledger integrity and zero charge variance during market spikes.",
    targetRegimes: ["SOC 2 CC6.1 (Active)", "ISO 27001 (Active)", "EU DORA (Deferred)", "PCI DSS (Deferred)"],
    statutoryCaveat:
      "Formal EU DORA digital resilience and PCI DSS v4.0.1 evaluators are DEFERRED per ADR-08. Active compliance includes real-time SOC 2 Type II CC6.1 and ISO 27001 A.9.2 continuous assurance.",
    tailoredFeatures: [
      "Anti-Perverse Billing: Zero surge costs during trading volatility or alert storms",
      "Post-quantum Merkle epoch tree proofs for transaction evidence audits",
      "Cross-tenant JIT elevation controls with dual-approver quorum",
      "Toxic privilege combination elimination across cloud IAM roles",
    ],
    recommendedPlan: "Shield Professional / Advanced",
    activeConnectors: ["AWS CloudTrail", "Microsoft 365 / Entra ID", "Okta"],
  },
  {
    id: "healthcare",
    name: "Healthcare, Life Sciences & Protected Health Data (PHI)",
    badge: "PATIENT PRIVACY",
    icon: <HeartPulse className="w-6 h-6 text-rose-400" />,
    tagline: "Zero-Trust Medical Data Governance & AI Prompt Isolation",
    description:
      "Protects electronic health records, genomic data repositories, and medical AI pipelines against ransomware exfiltration and unauthorized clinician access.",
    targetRegimes: ["HIPAA Security Rule", "HITECH", "NIST AI RMF", "ISO 27799"],
    statutoryCaveat:
      "Provides cryptographically attested audit trails for PHI access. AI safety module classifies diagnostic pipelines under EU AI Act High-Risk profiles with deterministic prompt firewalls.",
    tailoredFeatures: [
      "AI Prompt Injection Circuit Breaker for clinical decision support LLMs",
      "Automated evidence chain of custody for PHI disclosure investigations",
      "Purpose-bound access justification enforcement on sensitive databases",
      "Reversible ransomware containment with zero patient system disruption",
    ],
    recommendedPlan: "Shield Professional / Advanced",
    activeConnectors: ["AWS CloudTrail", "Microsoft 365 / Entra ID", "CrowdStrike Falcon EDR"],
  },
  {
    id: "legal",
    name: "Legal, Counsel-Controlled & Privileged Workflows",
    badge: "LEGAL DEFENSE",
    icon: <Scale className="w-6 h-6 text-purple-400" />,
    tagline: "Attorney-Client Privilege Guard & Independent Verifier Ledger",
    description:
      "Enables external law firms and in-house general counsels to conduct incident response investigations under strict legal privilege protection with verifiable Merkle proofs.",
    targetRegimes: ["ABA Model Rules", "GDPR Art 33/34", "Federal Rules of Evidence Rule 902(13)/(14)"],
    statutoryCaveat:
      "All forensic records generated in this pack require explicit Counsel-Controlled classification to maintain privilege defense. The platform provides no statutory legal advice.",
    tailoredFeatures: [
      "Counsel-Controlled Legal Sensitive Record vault with mandatory access justification",
      "Offline Verifier CLI for independent courtroom proof validation",
      "Mandatory 10-Field AI Review Envelope for forensic draft findings",
      "Retainer hours tracking with emergency surge capacity",
    ],
    recommendedPlan: "Shield Professional / Advanced",
    activeConnectors: ["Microsoft 365 / Entra ID", "Okta", "Generic Webhook Ingestion"],
  },
  {
    id: "saas",
    name: "Enterprise B2B SaaS & Multi-Tenant Platforms",
    badge: "CLOUD NATIVE",
    icon: <Cloud className="w-6 h-6 text-cyan-400" />,
    tagline: "Multi-Tenant Isolation, API Security & Automated SOC 2 Readiness",
    description:
      "Rapidly equips SaaS unicorns with enterprise-grade SecOps, automated continuous compliance packages for enterprise procurement, and attack path graph analysis.",
    targetRegimes: ["SOC 2 Type II", "ISO 27001:2022", "Cloud Security Alliance STAR"],
    statutoryCaveat:
      "Generates continuous auditor-ready evidence packages. Connector coverage covers P0 certified clouds (AWS) and identity providers (Entra, Okta).",
    tailoredFeatures: [
      "Automated continuous control evaluation and weekly auditor export packages",
      "Multi-Hop Attack Path Graph uncovering cross-tenant compromise routes",
      "Threat Hunting Copilot with ReAct autonomous graph queries",
      "Pre-configured SOC 2 CC6.1 access control monitoring",
    ],
    recommendedPlan: "Shield Essential / Professional",
    activeConnectors: ["AWS CloudTrail", "Okta", "CrowdStrike Falcon EDR"],
  },
  {
    id: "public-sector",
    name: "Public Sector, Defense & Sovereign Government Cells",
    badge: "SOVEREIGN PARTITION",
    icon: <Lock className="w-6 h-6 text-amber-400" />,
    tagline: "Dedicated Sovereign Partition, BYOK & Zero External Telemetry Egress",
    description:
      "Designed for national security agencies, public utilities, and sovereign clouds requiring single-tenant isolated cells with customer-held HSM keys and Dilithium3 signatures.",
    targetRegimes: ["FedRAMP High (Alignment)", "NIST SP 800-53 Rev 5", "FIPS 204 (ML-DSA)"],
    statutoryCaveat:
      "Requires Shield Enterprise plan with dedicated sovereign cell provisioning, customer-managed keys (BYOK), and regional isolation parameters.",
    tailoredFeatures: [
      "Single-Tenant Dedicated Partition with Bring-Your-Own-KMS (BYOK)",
      "Zero telemetry data leaves national geopolitical boundary",
      "Post-quantum ML-DSA (Dilithium3) root-of-trust hardware signing",
      "Bespoke statutory compliance auditing and formal source escrow",
    ],
    recommendedPlan: "Shield Enterprise (Contract Only)",
    activeConnectors: ["AWS CloudTrail", "Microsoft Entra ID", "Custom Private Gateways"],
  },
];

export default function SectorPacksPage() {
  const [selectedPack, setSelectedPack] = useState<SectorPack>(SECTOR_PACKS[0]);

  return (
    <div className="space-y-10 pb-16">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
          <Building2 className="w-3.5 h-3.5" />
          <span>INDUSTRY SPECIALIZATIONS</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100">
          Tailored Sector Defense Packs
        </h1>
        <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
          Pre-packaged compliance configurations, domain-specific telemetry pipelines, and specialized governance workflows tailored to the threat models of high-stakes industries.
        </p>
      </div>

      {/* Sector Pack Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SECTOR_PACKS.map((pack) => {
          const isSelected = selectedPack.id === pack.id;
          return (
            <div
              key={pack.id}
              onClick={() => setSelectedPack(pack)}
              className={`cursor-pointer rounded-2xl p-6 transition-all duration-300 flex flex-col justify-between space-y-4 ${
                isSelected
                  ? "bg-gradient-to-b from-cyan-950/40 to-slate-900/90 border-2 border-cyan-500/60 shadow-[0_0_25px_rgba(6,182,212,0.2)]"
                  : "bg-slate-900/60 border border-slate-800/80 hover:border-slate-700"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    {pack.icon}
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono text-[10px] font-bold border border-slate-700">
                    {pack.badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-100">{pack.name}</h3>
                  <p className="text-xs text-cyan-400 font-mono mt-0.5">{pack.tagline}</p>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                  {pack.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500">Plan Alignment:</span>
                <span className="text-slate-200 font-semibold">{pack.recommendedPlan}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deep-Dive Pack Inspector */}
      <div className="p-8 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950 border border-cyan-500/40 shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              {selectedPack.icon}
            </div>
            <div>
              <div className="text-[10px] font-mono text-cyan-400 font-bold tracking-wider uppercase">
                ACTIVE SECTOR PACK SPECIFICATION
              </div>
              <h2 className="text-2xl font-bold text-slate-100">{selectedPack.name}</h2>
            </div>
          </div>
          <div className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400 font-bold">
            {selectedPack.recommendedPlan}
          </div>
        </div>

        {/* Statutory Caveat Alert Box */}
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-amber-100">Statutory Disclosure & Scope Boundary:</span>
            <p className="text-amber-200/90 leading-relaxed">{selectedPack.statutoryCaveat}</p>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tailored Capabilities */}
          <div className="space-y-3 p-5 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-xs font-mono font-bold text-slate-400 uppercase flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Tailored SecOps & Governance Modules</span>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-300">
              {selectedPack.tailoredFeatures.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Compliance Regimes & Connectors */}
          <div className="space-y-4 p-5 rounded-xl bg-slate-950/70 border border-slate-800">
            <div>
              <div className="text-xs font-mono font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-cyan-400" />
                <span>Target Regulatory & Framework Alignments</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedPack.targetRegimes.map((reg, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono"
                  >
                    {reg}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <div className="text-xs font-mono font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                <span>Active Certified Connectors</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedPack.activeConnectors.map((conn, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-mono"
                  >
                    {conn}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="pt-2 flex items-center justify-between">
          <Link
            href="/pricing"
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
          >
            <span>View plan tier pricing & allocations</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/onboarding"
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]"
          >
            <span>Provision {selectedPack.name.split(" ")[0]} Pack</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
