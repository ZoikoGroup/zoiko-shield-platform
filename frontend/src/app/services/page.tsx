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
    const matchesSearch =
      s.serviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.publicOutcomeDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusBadge = (status: GovernanceStatus) => {
    switch (status) {
      case "CORE":
        return (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-bold">
            ● CORE ACTIVE
          </span>
        );
      case "CONTROLLED":
        return (
          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono text-[10px] font-bold">
            ◆ DUAL-CONTROLLED
          </span>
        );
      case "GATED":
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-bold">
            ▲ GATED / ADMIN
          </span>
        );
      case "DEFERRED":
        return (
          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono text-[10px] font-bold">
            ✕ DEFERRED (ADR-08)
          </span>
        );
    }
  };

  return (
    <div className="space-y-10 pb-16">
      {/* Header Banner */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
          <Layers className="w-3.5 h-3.5" />
          <span>OUTCOME-CENTRIC SERVICES CATALOGUE</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100">
          Commercial Security Services & Capabilities
        </h1>
        <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
          ZoikoShield delivers customer-visible security outcomes across threat operations, cryptographic trust, continuous compliance, and AI defense.
          Internal execution satellites substantiating these outcomes operate under fail-closed governance.
        </p>
      </div>

      {/* Fail-Closed Governance Rule Callout */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-xs">
            <span className="font-semibold text-slate-200">
              Taxonomy & Governance Integrity (Rule CAT-01 & ADR-08)
            </span>
            <p className="text-slate-400">
              Internal microservices (<code className="text-cyan-400">shield-core</code>, <code className="text-cyan-400">shield-anchor</code>, etc.) substantiate customer outcomes but are never sold as raw components.
              Experimental frameworks (EU DORA, NIS2, PCI DSS v4.0.1) remain fail-closed until Phase 2 midpoint triggers.
            </p>
          </div>
        </div>

        {/* Live Evaluator Probe Tool */}
        <div className="shrink-0 flex items-center gap-3 p-2 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-[11px] font-mono text-slate-400">Status Probe:</span>
          <select
            value={selectedFramework}
            onChange={(e) => setSelectedFramework(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-cyan-400"
          >
            <option value="SOC2_CC6_1">SOC 2 CC6.1</option>
            <option value="ISO27001_A5_18">ISO/IEC 27001:2022 A.5.18</option>
            <option value="EU_DORA">EU DORA</option>
            <option value="EU_NIS2">EU NIS2</option>
            <option value="PCI_DSS">PCI DSS v4.0.1</option>
          </select>
          <div className="text-xs font-mono">
            {probeResult?.active ? (
              <span className="text-emerald-400 font-bold">● ACTIVE</span>
            ) : (
              <span className="text-rose-400 font-bold">✕ DEFERRED</span>
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
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                activeFilter === filter
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200"
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
            className="w-full bg-slate-900/80 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Services Grid (12 Customer-Facing Services) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map((svc) => (
          <div
            key={svc.serviceId}
            className="rounded-xl p-5 bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 group"
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
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1.5">
                <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                  <Server className="w-3 h-3 text-slate-500" />
                  <span>Substantiating Architecture Components:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(svc.substantiatingComponents || []).map((comp) => (
                    <span
                      key={comp}
                      className="px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-300 font-mono text-[10px] border border-slate-700"
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
                      className="px-1.5 py-0.5 rounded bg-cyan-950/30 text-cyan-300/80 font-mono text-[9px] border border-cyan-500/20"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500">Min. Plan Tier:</span>
              <span className="text-cyan-400 font-semibold">{svc.pricingTierMinimum || 'ESSENTIAL'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Capability Domains Drill-Down Table */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-100">
            Capability Domains & Status Matrix
          </h2>
          <p className="text-xs text-slate-400">
            Comprehensive audit breakdown across 7 capability domains with fail-closed status governance.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase">
                <th className="py-2.5 px-3">Domain</th>
                <th className="py-2.5 px-3">Capability Item</th>
                <th className="py-2.5 px-3">Associated Outcome Service</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Governance Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(Array.isArray(domains) ? domains : []).flatMap((domain) =>
                (Array.isArray(domain.items) ? domain.items : []).map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-900/80 transition-colors">
                    {idx === 0 && (
                      <td
                        rowSpan={domain.items.length}
                        className="py-3 px-3 font-semibold text-slate-200 align-top border-r border-slate-800/60 font-mono"
                      >
                        {domain.domainName}
                        <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                          {domain.description}
                        </p>
                      </td>
                    )}
                    <td className="py-2.5 px-3 font-medium text-slate-200">
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">{item.id}</div>
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300 text-[11px]">
                      {item.customerService}
                    </td>
                    <td className="py-2.5 px-3">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
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
