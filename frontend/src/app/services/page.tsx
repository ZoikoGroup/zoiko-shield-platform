"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  PublicServiceDefinition,
  CapabilityDomainSummary,
  GovernanceStatus,
} from "@/lib/types";
import {
  Layers,
  ShieldCheck,
  Lock,
  Flame,
  Radio,
  Clock,
  Compass,
  FileCheck2,
  AlertOctagon,
  CheckCircle2,
  Filter,
  Search,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Server,
  Zap,
} from "lucide-react";
import Link from "next/link";

export default function CommercialServicesPage() {
  const [services, setServices] = useState<PublicServiceDefinition[]>([]);
  const [domains, setDomains] = useState<CapabilityDomainSummary[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Evaluator Probe State
  const [selectedFramework, setSelectedFramework] = useState("EU_DORA");
  const [probeResult, setProbeResult] = useState<{ framework: string; active: boolean } | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [servicesData, domainsData] = await Promise.all([
          ZoikoShieldApiClient.getPublicServices(),
          ZoikoShieldApiClient.getCapabilityDomains(),
        ]);
        setServices(Array.isArray(servicesData) ? servicesData : []);
        setDomains(Array.isArray(domainsData) ? domainsData : []);
      } catch (err) {
        console.error("Failed to load commercial services", err);
        setServices([]);
        setDomains([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const runProbe = async (fw: string) => {
    setProbing(true);
    try {
      const res = await ZoikoShieldApiClient.checkFrameworkEvaluator(fw);
      setProbeResult(res);
    } catch {
      // Fallback
      const isDeferred = ["EU_DORA", "EU_NIS2", "PCI_DSS"].some((d) => fw.includes(d));
      setProbeResult({ framework: fw, active: !isDeferred });
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    runProbe(selectedFramework);
  }, [selectedFramework]);

  const filteredServices = (Array.isArray(services) ? services : []).filter((s) => {
    const matchesFilter =
      activeFilter === "ALL" ||
      s.status === activeFilter ||
      s.category === activeFilter;
    const q = (searchQuery || "").toLowerCase();
    const matchesSearch =
      (s.serviceName || "").toLowerCase().includes(q) ||
      (s.publicOutcomeDescription || "").toLowerCase().includes(q) ||
      (s.category || "").toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const getStatusBadge = (status: GovernanceStatus) => {
    switch (status) {
      case "CORE":
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-bold shadow-[0_0_10px_rgba(16,185,129,0.15)]">
            ● CORE ACTIVE
          </span>
        );
      case "CONTROLLED":
        return (
          <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 font-mono text-[10px] font-bold shadow-[0_0_10px_rgba(168,85,247,0.15)]">
            ◆ DUAL-CONTROLLED
          </span>
        );
      case "GATED":
        return (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-bold shadow-[0_0_10px_rgba(245,158,11,0.15)]">
            ▲ GATED / ADMIN
          </span>
        );
      case "DEFERRED":
        return (
          <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30 font-mono text-[10px] font-bold shadow-[0_0_10px_rgba(244,63,94,0.15)]">
            ✕ DEFERRED (ADR-08)
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header Banner */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
          <Layers className="w-3.5 h-3.5" />
          <span>OUTCOME-CENTRIC SERVICES CATALOGUE</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100">
          Commercial Security Services &amp; Capabilities
        </h1>
        <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
          ZoikoShield delivers customer-visible security outcomes across threat operations, cryptographic trust, continuous compliance, and AI defense.
          Internal execution satellites substantiating these outcomes operate under fail-closed governance.
        </p>
      </div>

      {/* Fail-Closed Governance Rule Callout */}
      <div className="p-5 rounded-2xl bg-[#0a0f1d] border border-[#162238] shadow-[0_0_20px_rgba(6,182,212,0.06)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-xs">
            <span className="font-semibold text-slate-200">
              Taxonomy &amp; Governance Integrity (Rule CAT-01 &amp; ADR-08)
            </span>
            <p className="text-slate-400">
              Internal microservices (<code className="text-cyan-400">shield-core</code>, <code className="text-cyan-400">shield-anchor</code>, etc.) substantiate customer outcomes but are never sold as raw components.
              Experimental frameworks (EU DORA, NIS2, PCI DSS v4.0.1) remain fail-closed until Phase 2 midpoint triggers.
            </p>
          </div>
        </div>

        {/* Live Evaluator Probe Tool */}
        <div className="shrink-0 flex items-center gap-3 p-2.5 rounded-xl bg-[#060911] border border-[#162238] shadow-inner">
          <span className="text-[11px] font-mono text-slate-400">Status Probe:</span>
          <select
            value={selectedFramework}
            onChange={(e) => setSelectedFramework(e.target.value)}
            className="bg-[#0a0f1d] border border-[#162238] text-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-cyan-400 transition-colors"
          >
            <option value="SOC2_CC6_1">SOC 2 CC6.1</option>
            <option value="ISO27001_A5_18">ISO/IEC 27001:2022 A.5.18</option>
            <option value="EU_DORA">EU DORA</option>
            <option value="EU_NIS2">EU NIS2</option>
            <option value="PCI_DSS">PCI DSS v4.0.1</option>
          </select>
          <div className="text-xs font-mono">
            {probeResult?.active ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">● ACTIVE</span>
            ) : (
              <span className="text-rose-400 font-bold flex items-center gap-1">✕ DEFERRED</span>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Status Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {["ALL", "CORE", "CONTROLLED", "GATED", "DEFERRED"].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all ${
                activeFilter === filter
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                  : "bg-[#0a0f1d] text-slate-400 border border-[#162238] hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search catalogue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0a0f1d] border border-[#162238] rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
          />
        </div>
      </div>

      {/* Services Grid (12 Customer-Facing Services) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map((svc) => (
          <div
            key={svc.serviceId}
            className="rounded-2xl p-6 bg-[#0a0f1d] border border-[#162238] hover:border-cyan-500/40 hover:bg-[#0c1322] hover:shadow-[0_0_25px_rgba(6,182,212,0.15)] transition-all flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-mono font-bold tracking-wider text-cyan-400 uppercase">
                  {svc.category}
                </span>
                {getStatusBadge(svc.status)}
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                  {svc.serviceName}
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {svc.publicOutcomeDescription}
                </p>
              </div>

              {/* Substantiating Microservices Architecture */}
              <div className="p-3 rounded-xl bg-[#060911] border border-[#162238] space-y-1.5 shadow-inner">
                <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                  <Server className="w-3 h-3 text-cyan-400" />
                  <span>Substantiating Architecture Components:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(svc.substantiatingComponents || []).map((comp) => (
                    <span
                      key={comp}
                      className="px-2 py-0.5 rounded bg-[#0a0f1d] text-slate-300 font-mono text-[10px] border border-[#162238]"
                    >
                      {comp}
                    </span>
                  ))}
                </div>
              </div>

              {/* Included Capability Keys */}
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-slate-500 uppercase">
                  Verified Capabilities:
                </div>
                <div className="flex flex-wrap gap-1">
                  {(svc.includedCapabilities || []).map((cap) => (
                    <span
                      key={cap}
                      className="px-2 py-0.5 rounded bg-cyan-950/30 text-cyan-300/90 font-mono text-[9px] border border-cyan-500/20"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#162238] flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500">Min. Plan Tier:</span>
              <span className="text-cyan-400 font-semibold">{svc.pricingTierMinimum || 'ESSENTIAL'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Capability Domains Drill-Down Table */}
      <div className="p-6 rounded-2xl bg-[#0a0f1d] border border-[#162238] space-y-4 shadow-[0_0_20px_rgba(6,182,212,0.06)]">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-100">
            Capability Domains &amp; Status Matrix
          </h2>
          <p className="text-xs text-slate-400">
            Comprehensive audit breakdown across 7 capability domains with fail-closed status governance.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#162238]">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            <thead>
              <tr className="border-b border-[#162238] text-[11px] font-mono text-slate-400 uppercase bg-[#060911]/80">
                <th className="py-3 px-3.5">Domain</th>
                <th className="py-3 px-3.5">Capability Item</th>
                <th className="py-3 px-3.5">Associated Outcome Service</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5">Governance Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#162238]">
              {(Array.isArray(domains) ? domains : []).flatMap((domain) =>
                (Array.isArray(domain.items) ? domain.items : []).map((item, idx) => (
                  <tr key={item.id} className="hover:bg-[#0c1424] transition-colors">
                    {idx === 0 && (
                      <td
                        rowSpan={domain.items.length}
                        className="py-3 px-3.5 font-semibold text-slate-200 align-top border-r border-[#162238] font-mono bg-[#060911]/30"
                      >
                        {domain.domainName}
                        <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                          {domain.description}
                        </p>
                      </td>
                    )}
                    <td className="py-2.5 px-3.5 font-medium text-slate-200">
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">{item.id}</div>
                    </td>
                    <td className="py-2.5 px-3.5 text-cyan-300 text-[11px] font-mono">
                      {item.customerService}
                    </td>
                    <td className="py-2.5 px-3.5">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-400 text-[11px]">
                      {item.governanceRationale}
                      {item.statutoryReference && (
                        <span className="block text-[10px] font-mono text-slate-500 mt-0.5">
                          Ref: {item.statutoryReference}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
