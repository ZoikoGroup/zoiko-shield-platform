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
  Play,
  X,
  Sliders,
  Check,
  ShieldCheck,
  Key,
  RefreshCw,
  Copy,
} from "lucide-react";
import Link from "next/link";

export type SectorControlId =
  | "DORA-ART10-BACKUP-RESILIENCE"
  | "DORA-ART11-ANOMALY-DETECTION-LATENCY"
  | "NIS2-ART21-SUPPLY-CHAIN-EARLY-WARNING"
  | "PCI-DSS-REQ10.2-AUDIT-IMMUTABILITY";

export interface SectorEvaluationResult {
  evaluationId: string;
  controlId: SectorControlId;
  framework: "DORA_EU" | "NIS2_EU" | "PCI_DSS_V4_0_1";
  controlTitle: string;
  result: "PASS" | "FAIL" | "DEGRADED";
  complianceScore: number;
  observedMetrics: Record<string, unknown>;
  evidenceDigests: string[];
  rationale: string;
  evaluatedAt: string;
  attestationDigest: string;
  disclaimer: string;
}

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
    name: "Telecom & MVNO",
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
      "ML-DSA-65 cryptographic evidence logging for carrier peering records",
      "Dual-operator R4 network isolate and route withdraw playbooks",
    ],
    recommendedPlan: "Shield Advanced / Enterprise",
    activeConnectors: ["AWS CloudTrail", "CrowdStrike Falcon EDR", "Generic Webhook Ingestion"],
  },
  {
    id: "fintech",
    name: "Financial Services & FinTech",
    badge: "FINANCIAL RESILIENCE",
    icon: <Landmark className="w-6 h-6 text-emerald-400" />,
    tagline: "Immutable Audit Trails, Anti-Perverse Billing & Access Governance",
    description:
      "Purpose-built for digital banks, payment processors, and crypto custodians demanding mathematical proof of ledger integrity and zero charge variance during market spikes.",
    targetRegimes: ["SOC 2 CC6.1 (Active)", "ISO 27001 (Active)", "EU DORA (Deferred)", "PCI DSS (Deferred)"],
    statutoryCaveat:
      "Formal EU DORA digital resilience and PCI DSS v4.0.1 evaluators are DEFERRED per ADR-08. Active compliance includes real-time SOC 2 Type II CC6.1 and ISO/IEC 27001:2022 A.5.18 continuous assurance.",
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
    name: "Healthcare & Life Sciences",
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
    name: "Legal & Professional Services",
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
    name: "SaaS & Digital Platforms",
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
    name: "Public Sector / Critical-Infrastructure-Aligned",
    badge: "SOVEREIGN PARTITION",
    icon: <Lock className="w-6 h-6 text-amber-400" />,
    tagline: "Dedicated Sovereign Partition, BYOK & Zero External Telemetry Egress",
    description:
      "Designed for national security agencies, public utilities, and sovereign clouds requiring single-tenant isolated cells, customer-managed keys and dual-signed evidence checkpoints.",
    targetRegimes: ["FedRAMP High (Alignment)", "NIST SP 800-53 Rev 5", "FIPS 204 (ML-DSA)"],
    statutoryCaveat:
      "Requires Shield Enterprise plan with dedicated sovereign cell provisioning, customer-managed keys (BYOK), and regional isolation parameters.",
    tailoredFeatures: [
      "Single-Tenant Dedicated Partition with Bring-Your-Own-KMS (BYOK)",
      "Zero telemetry data leaves national geopolitical boundary",
      "Evidence checkpoints dual-signed with ECDSA P-256 + ML-DSA-65",
      "Bespoke statutory compliance auditing and formal source escrow",
    ],
    recommendedPlan: "Shield Enterprise (Contract Only)",
    activeConnectors: ["AWS CloudTrail", "Microsoft Entra ID", "Custom Private Gateways"],
  },
];

export default function SectorPacksPage() {
  const [selectedPack, setSelectedPack] = useState<SectorPack>(SECTOR_PACKS[0]);

  // Sector Control Evaluator State
  const [evaluatorOpen, setEvaluatorOpen] = useState(false);
  const [evaluatorControl, setEvaluatorControl] = useState<SectorControlId>("DORA-ART10-BACKUP-RESILIENCE");
  const [rtoInput, setRtoInput] = useState<number>(42);
  const [rpoInput, setRpoInput] = useState<number>(0);
  const [latencyInput, setLatencyInput] = useState<number>(18);
  const [reportingHoursInput, setReportingHoursInput] = useState<number>(14);
  const [merkleSealed, setMerkleSealed] = useState<boolean>(true);
  const [pipelineRef, setPipelineRef] = useState<string>("REF-EU-FINTECH-2026-DORA-01");
  const [evaluationResult, setEvaluationResult] = useState<SectorEvaluationResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [copiedDigest, setCopiedDigest] = useState(false);

  const openEvaluatorForPack = (packId: string) => {
    if (packId === "telecom") {
      setEvaluatorControl("NIS2-ART21-SUPPLY-CHAIN-EARLY-WARNING");
      setPipelineRef("REF-EU-TELCO-2026-NIS2-01");
    } else if (packId === "fintech") {
      setEvaluatorControl("DORA-ART10-BACKUP-RESILIENCE");
      setPipelineRef("REF-EU-FINTECH-2026-DORA-01");
    } else {
      setEvaluatorControl("PCI-DSS-REQ10.2-AUDIT-IMMUTABILITY");
      setPipelineRef("REF-GLOBAL-PCI-2026-01");
    }
    setEvaluationResult(null);
    setEvaluatorOpen(true);
  };

  const runEvaluation = () => {
    setEvaluating(true);
    setTimeout(() => {
      let result: "PASS" | "FAIL" | "DEGRADED" = "PASS";
      let complianceScore = 100;
      let controlTitle = "";
      let rationale = "";
      let framework: "DORA_EU" | "NIS2_EU" | "PCI_DSS_V4_0_1" = "DORA_EU";

      if (evaluatorControl === "DORA-ART10-BACKUP-RESILIENCE") {
        framework = "DORA_EU";
        controlTitle = "DORA Art 10: ICT Systems Backup & Automated Failover Recovery";
        if (rtoInput > 60 || rpoInput > 0) {
          result = "FAIL";
          complianceScore = 40;
          rationale = `RTO/RPO target violated: Actual RTO=${rtoInput}s (max 60s), RPO=${rpoInput}s (max 0s).`;
        } else {
          result = "PASS";
          complianceScore = 98;
          rationale = `Sovereign standby failover demonstrated: RTO=${rtoInput}s (<60s target), RPO=${rpoInput}s (Zero Data Loss).`;
        }
      } else if (evaluatorControl === "DORA-ART11-ANOMALY-DETECTION-LATENCY") {
        framework = "DORA_EU";
        controlTitle = "DORA Art 11: Anomaly Detection & Incident Response Latency";
        if (latencyInput > 60) {
          result = "FAIL";
          complianceScore = 30;
          rationale = `Detection latency of ${latencyInput}s exceeds DORA 60-second real-time SLA threshold.`;
        } else if (latencyInput > 30) {
          result = "DEGRADED";
          complianceScore = 75;
          rationale = `Detection latency of ${latencyInput}s within grace period (<60s) but exceeds 30s target.`;
        } else {
          result = "PASS";
          complianceScore = 95;
          rationale = `Detection latency of ${latencyInput}s strictly satisfies DORA real-time alerting criteria (<30s).`;
        }
      } else if (evaluatorControl === "NIS2-ART21-SUPPLY-CHAIN-EARLY-WARNING") {
        framework = "NIS2_EU";
        controlTitle = "NIS2 Art 21: Critical Supply Chain Early Warning & Threat Notification";
        if (reportingHoursInput > 24) {
          result = "FAIL";
          complianceScore = 35;
          rationale = `Incident notification of ${reportingHoursInput}h breached NIS2 statutory 24-hour early warning SLA.`;
        } else {
          result = "PASS";
          complianceScore = 92;
          rationale = `Incident notification submitted within NIS2 24-hour early warning window (${reportingHoursInput}h).`;
        }
      } else {
        framework = "PCI_DSS_V4_0_1";
        controlTitle = "PCI-DSS Req 10.2: Audit Log Immutability & Merkle Proof Anchoring";
        if (!merkleSealed) {
          result = "FAIL";
          complianceScore = 20;
          rationale = "Audit records not yet sealed in immutable Merkle epoch.";
        } else {
          result = "PASS";
          complianceScore = 100;
          rationale = "Audit records anchored in RFC 6962 Merkle tree with dual-signer post-quantum signatures (ML-DSA-65).";
        }
      }

      setEvaluationResult({
        evaluationId: `eval-sector-${Math.random().toString(36).substring(2, 10)}`,
        controlId: evaluatorControl,
        framework,
        controlTitle,
        result,
        complianceScore,
        observedMetrics: {
          rtoActualSeconds: rtoInput,
          rpoActualSeconds: rpoInput,
          detectionLatencySeconds: latencyInput,
          incidentReportingHours: reportingHoursInput,
          merkleEpochAnchored: merkleSealed,
        },
        evidenceDigests: ["sha256:7b66e8983b13042126dd93ef2b89012a44bb01c8"],
        rationale,
        evaluatedAt: new Date().toISOString(),
        attestationDigest: "sha256:e04d5c01d3f30f169d455842cb27f59a03a031f19e9a817ae45cf4c45d2d850b",
        disclaimer: "Automated control evaluation is continuous evidence telemetry and does not constitute statutory certification or legal advice.",
      });
      setEvaluating(false);
    }, 350);
  };

  const handleCopyDigest = (digest: string) => {
    navigator.clipboard.writeText(digest);
    setCopiedDigest(true);
    setTimeout(() => setCopiedDigest(false), 2000);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
            <Building2 className="w-3.5 h-3.5" />
            <span>INDUSTRY SPECIALIZATIONS • CONTINUOUS SECTOR ASSURANCE</span>
          </div>
          <button
            onClick={() => openEvaluatorForPack(selectedPack.id)}
            className="px-4 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.15)]"
          >
            <Play className="w-3.5 h-3.5 text-cyan-400" />
            <span>Run Sector Control Evaluation</span>
          </button>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100">
          Tailored Sector Defense Packs
        </h1>
        <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
          Pre-packaged compliance configurations, domain-specific telemetry pipelines, and continuous assurance evaluators (DORA, NIS2, PCI DSS v4.0.1) grounded in Spec §18 and ADR-08.
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
                  ? "bg-gradient-to-b from-overlay to-surface border-2 border-cyan-400/80 shadow-[0_0_30px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400/30"
                  : "bg-surface/90 border border-line hover:border-cyan-500/40 hover:bg-raised hover:shadow-[0_0_20px_rgba(6,182,212,0.1)]"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-canvas border border-line shadow-inner">
                    {pack.icon}
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-canvas text-cyan-300 font-mono text-[10px] font-bold border border-line">
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

              <div className="pt-3 border-t border-line flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500">Plan Alignment:</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEvaluatorForPack(pack.id);
                  }}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold transition-colors"
                >
                  <span>Test Evaluation →</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deep-Dive Pack Inspector */}
      <div className="p-8 rounded-2xl bg-gradient-to-br from-raised via-surface to-canvas border border-cyan-500/40 shadow-[0_0_40px_rgba(6,182,212,0.15)] space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-canvas border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              {selectedPack.icon}
            </div>
            <div>
              <div className="text-[10px] font-mono text-cyan-400 font-bold tracking-wider uppercase">
                ACTIVE SECTOR PACK SPECIFICATION
              </div>
              <h2 className="text-2xl font-bold text-slate-100">{selectedPack.name}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => openEvaluatorForPack(selectedPack.id)}
              className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-mono text-xs font-bold flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)]"
            >
              <Play className="w-3.5 h-3.5 text-cyan-400" />
              <span>Simulate Continuous Evaluation</span>
            </button>
            <div className="px-3.5 py-1.5 rounded-lg bg-canvas border border-cyan-500/30 text-xs font-mono text-cyan-300 font-bold shadow-inner">
              {selectedPack.recommendedPlan}
            </div>
          </div>
        </div>

        {/* Statutory Caveat Alert Box */}
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200/90">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-amber-100">Statutory Disclosure &amp; Scope Boundary:</span>
            <p className="text-amber-200/80 leading-relaxed">{selectedPack.statutoryCaveat}</p>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tailored Capabilities */}
          <div className="space-y-3 p-5 rounded-xl bg-canvas/80 border border-line">
            <div className="text-xs font-mono font-bold text-slate-300 uppercase flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Tailored SecOps &amp; Governance Modules</span>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-300">
              {(selectedPack.tailoredFeatures || []).map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Compliance Regimes & Connectors */}
          <div className="space-y-4 p-5 rounded-xl bg-canvas/80 border border-line">
            <div>
              <div className="text-xs font-mono font-bold text-slate-300 uppercase mb-2 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-cyan-400" />
                <span>Target Regulatory &amp; Framework Alignments</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(selectedPack.targetRegimes || []).map((reg, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded bg-surface border border-line text-slate-200 text-xs font-mono"
                  >
                    {reg}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-line">
              <div className="text-xs font-mono font-bold text-slate-300 uppercase mb-2 flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                <span>Active Certified Connectors</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(selectedPack.activeConnectors || []).map((conn, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-mono"
                  >
                    {conn}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/pricing"
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors"
          >
            <span>View plan tier pricing &amp; allocations</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => openEvaluatorForPack(selectedPack.id)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-canvas hover:bg-raised border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Evaluate Sector Overlay</span>
            </button>
            <Link
              href="/onboarding"
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)]"
            >
              <span>Provision {selectedPack.name.split(" ")[0]} Pack</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Interactive Sector Control Evaluation Modal */}
      {evaluatorOpen && (
        <div
          id="sector-evaluator-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-cyan-500/50 p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 font-mono">
                    Continuous Sector Control Evaluator
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    ADR-08 Sector Registry • Continuous Assurance Specification §18
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEvaluatorOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Control Selector */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-slate-300 uppercase">
                Target Sector Control Definition
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    id: "DORA-ART10-BACKUP-RESILIENCE",
                    label: "DORA Art 10: ICT Backup & Resilience",
                    regime: "EU DORA",
                  },
                  {
                    id: "DORA-ART11-ANOMALY-DETECTION-LATENCY",
                    label: "DORA Art 11: Real-Time Detection Latency",
                    regime: "EU DORA",
                  },
                  {
                    id: "NIS2-ART21-SUPPLY-CHAIN-EARLY-WARNING",
                    label: "NIS2 Art 21: Early Warning SLA",
                    regime: "EU NIS2",
                  },
                  {
                    id: "PCI-DSS-REQ10.2-AUDIT-IMMUTABILITY",
                    label: "PCI-DSS Req 10.2: Audit Merkle Seal",
                    regime: "PCI DSS v4.0.1",
                  },
                ].map((ctrl) => (
                  <button
                    key={ctrl.id}
                    onClick={() => {
                      setEvaluatorControl(ctrl.id as SectorControlId);
                      setEvaluationResult(null);
                    }}
                    className={`p-2.5 rounded-xl text-left border text-xs font-mono transition-all ${
                      evaluatorControl === ctrl.id
                        ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                        : "bg-slate-950/80 text-slate-400 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-[10px] text-cyan-400 font-bold">{ctrl.regime}</div>
                    <div className="font-semibold text-slate-200 line-clamp-1">{ctrl.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Metric Sliders depending on selected control */}
            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-4">
              <div className="text-xs font-mono font-bold text-slate-300 uppercase flex items-center justify-between">
                <span>Observed Telemetry Inputs</span>
                <span className="text-[10px] text-cyan-400 font-normal">Live Parameter Tuning</span>
              </div>

              {evaluatorControl === "DORA-ART10-BACKUP-RESILIENCE" && (
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                      <span>RTO Actual (Target &lt; 60s):</span>
                      <span className={rtoInput <= 60 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {rtoInput}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="120"
                      value={rtoInput}
                      onChange={(e) => setRtoInput(Number(e.target.value))}
                      className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-2"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                      <span>RPO Actual (Target = 0s):</span>
                      <span className={rpoInput === 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {rpoInput}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={rpoInput}
                      onChange={(e) => setRpoInput(Number(e.target.value))}
                      className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-2"
                    />
                  </div>
                </div>
              )}

              {evaluatorControl === "DORA-ART11-ANOMALY-DETECTION-LATENCY" && (
                <div>
                  <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                    <span>Detection Latency (Target &lt; 30s SLA, Max 60s):</span>
                    <span className={latencyInput <= 30 ? "text-emerald-400 font-bold" : latencyInput <= 60 ? "text-amber-400 font-bold" : "text-rose-400 font-bold"}>
                      {latencyInput}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="90"
                    value={latencyInput}
                    onChange={(e) => setLatencyInput(Number(e.target.value))}
                    className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-2"
                  />
                </div>
              )}

              {evaluatorControl === "NIS2-ART21-SUPPLY-CHAIN-EARLY-WARNING" && (
                <div>
                  <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                    <span>Early Warning Notification Latency (Target &lt; 24h):</span>
                    <span className={reportingHoursInput <= 24 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                      {reportingHoursInput}h
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="48"
                    value={reportingHoursInput}
                    onChange={(e) => setReportingHoursInput(Number(e.target.value))}
                    className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-2"
                  />
                </div>
              )}

              {evaluatorControl === "PCI-DSS-REQ10.2-AUDIT-IMMUTABILITY" && (
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-slate-300">
                    <span className="block font-bold">RFC 6962 Merkle Tree Epoch Proof Sealed:</span>
                    <span className="text-[10px] text-slate-500">Requires dual ML-DSA-65 post-quantum signature</span>
                  </div>
                  <button
                    onClick={() => setMerkleSealed(!merkleSealed)}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all border ${
                      merkleSealed
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                    }`}
                  >
                    {merkleSealed ? "SEALED (ACTIVE)" : "UNSEALED (DRIFT)"}
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-slate-800/80">
                <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">
                  ADR-08 Signed Customer Pipeline Reference
                </label>
                <input
                  type="text"
                  value={pipelineRef}
                  onChange={(e) => setPipelineRef(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={runEvaluation}
              disabled={evaluating}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50"
            >
              {evaluating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Evaluating Continuous Assurance Telemetry...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Execute Automated Sector Control Evaluation</span>
                </>
              )}
            </button>

            {/* Evaluation Results Card */}
            {evaluationResult && (
              <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/40 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        evaluationResult.result === "PASS"
                          ? "bg-emerald-950 text-emerald-300 border-emerald-500/40"
                          : evaluationResult.result === "DEGRADED"
                          ? "bg-amber-950 text-amber-300 border-amber-500/40"
                          : "bg-rose-950 text-rose-300 border-rose-500/40"
                      }`}
                    >
                      {evaluationResult.result}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      Score: {evaluationResult.complianceScore}/100
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400">
                    {evaluationResult.framework}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  <div className="text-slate-200 font-semibold">{evaluationResult.controlTitle}</div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    {evaluationResult.rationale}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1 text-[10px] font-mono">
                  <div className="flex justify-between items-center text-slate-400">
                    <span className="text-slate-500 uppercase">Cryptographic Attestation Digest:</span>
                    <button
                      onClick={() => handleCopyDigest(evaluationResult.attestationDigest)}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedDigest ? "Copied" : "Copy Digest"}</span>
                    </button>
                  </div>
                  <div className="text-emerald-400 truncate select-all">
                    {evaluationResult.attestationDigest}
                  </div>
                </div>

                <div className="text-[10px] font-mono text-slate-500 italic border-t border-slate-800 pt-2">
                  {evaluationResult.disclaimer}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

