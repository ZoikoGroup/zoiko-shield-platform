"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  HelpCircle, Search, ShieldCheck, Check, Lock, MessageSquare, Rocket, Zap, FileCheck2, Code2,
  ChevronRight, BookOpen, Flame, Clock, AlertTriangle, Network, KeyRound,
} from "lucide-react";
import { Pill, TabBar } from "@/components/mockup/kit";

type Guide = { title: string; area: string; href: string; icon: React.ReactNode; tab: string };

// Every guide points at the screen that actually performs the task, so a help
// link never leads to a page that does not exist.
const GUIDES: Guide[] = [
  { title: "Set up sign-in with passkeys", area: "Identity & Access", href: "/team", icon: <BookOpen className="w-4 h-4" />, tab: "guides" },
  { title: "Investigate failed sign-in without leaking account details", area: "Authentication", href: "/alerts", icon: <ShieldCheck className="w-4 h-4" />, tab: "runbooks" },
  { title: "Validate OCSF-normalized connector data", area: "Data Ingestion", href: "/ingestion", icon: <Network className="w-4 h-4" />, tab: "api" },
  { title: "Review AI-assisted response proposals before approval", area: "SOAR Governance", href: "/response-proposals", icon: <Lock className="w-4 h-4" />, tab: "runbooks" },
  { title: "Verify a sealed audit package offline", area: "Evidence & Audit", href: "/audit", icon: <FileCheck2 className="w-4 h-4" />, tab: "guides" },
  { title: "Configure and test a new connector", area: "Data Ingestion", href: "/connectors", icon: <Network className="w-4 h-4" />, tab: "api" },
  { title: "Request time-bound privileged elevation", area: "Identity & Access", href: "/admin/jit-elevation", icon: <KeyRound className="w-4 h-4" />, tab: "troubleshooting" },
];

const WORKFLOWS = [
  { title: "Getting Started", sub: "Tenant onboarding, login and passkeys", href: "/onboarding", icon: <Rocket className="w-5 h-5" /> },
  { title: "Detect & Investigate", sub: "Alert triage, cases and threat hunting", href: "/alerts", icon: <Search className="w-5 h-5" /> },
  { title: "Response & SOAR", sub: "Playbooks, approvals and action freeze", href: "/actions", icon: <Zap className="w-5 h-5" /> },
  { title: "Evidence & Verification", sub: "Merkle packages, audit and offline proofs", href: "/audit", icon: <FileCheck2 className="w-5 h-5" /> },
  { title: "Integrations & APIs", sub: "Connectors, OCSF mapping and ingestion", href: "/connectors", icon: <Code2 className="w-5 h-5" /> },
  { title: "Identity & Tenant Privacy", sub: "Membership, JIT and access boundaries", href: "/tenant-management", icon: <Lock className="w-5 h-5" /> },
];

const TOPICS = ["Passkeys", "Connector setup", "Evidence verification", "Response approvals", "Tenant isolation"];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "guides", label: "Product Guides" },
  { id: "api", label: "API & Integrations" },
  { id: "runbooks", label: "Runbooks" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "support", label: "Support Requests" },
  { id: "releases", label: "Release Notes" },
];

export default function HelpDocumentationPage() {
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");

  const guides = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GUIDES.filter(
      (g) => (tab === "overview" || tab === "support" || tab === "releases" || g.tab === tab) && (!q || `${g.title} ${g.area}`.toLowerCase().includes(q)),
    );
  }, [query, tab]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-8 h-8 text-sky-400 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Help &amp; Documentation</h1>
            <p className="text-xs text-slate-400 mt-1">Find product guidance, resolve issues, and contact support through verified channels.</p>
          </div>
        </div>
        <Pill tone="blue">Design concept</Pill>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-xl border border-[#162238] bg-gradient-to-r from-[#0d1628] to-[#0a101d] p-5 border-l-4 border-l-sky-500">
          <h2 className="text-lg font-bold text-slate-100">Knowledge that moves your investigation forward</h2>
          <p className="text-xs text-slate-400 mt-1">Search documentation, attack-response runbooks, API references and troubleshooting paths.</p>
          <form className="flex gap-2 mt-4" onSubmit={(e) => e.preventDefault()}>
            <label className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-lg bg-[#080c16] border border-[#1e2b44] text-xs">
              <Search className="w-4 h-4 text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search help" placeholder="Search by product, workflow, error message or article..." className="bg-transparent outline-none w-full text-slate-200 placeholder:text-slate-500" />
            </label>
            <button type="submit" className="px-6 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white">Search</button>
          </form>
          <div className="flex flex-wrap gap-2 mt-3">
            {TOPICS.map((t) => (
              <button key={t} type="button" onClick={() => setQuery(t)} className="px-3 py-1 rounded-md border border-sky-500/30 bg-sky-950/30 text-[11px] text-sky-200 hover:bg-sky-900/40">{t}</button>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-[#162238] bg-[#0c111e] p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-100 pb-3 border-b border-[#162238]"><ShieldCheck className="w-5 h-5 text-sky-400" /> Trusted support pathways</h2>
          <ul className="space-y-3 mt-3 text-xs text-slate-300">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Scope help articles to your tenant and role</li>
            <li className="flex gap-2"><Lock className="w-4 h-4 text-amber-400 shrink-0" /> Never paste credentials, tokens or customer secrets</li>
            <li className="flex gap-2"><MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" /> Support availability: verify channel status</li>
          </ul>
        </section>
      </div>

      {tab === "overview" && !query && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-100">Explore by workflow</h2>
            <button type="button" onClick={() => setTab("guides")} className="text-xs text-sky-300 hover:underline">Browse all guides ›</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {WORKFLOWS.map((w) => (
              <Link key={w.title} href={w.href} className="flex items-center gap-4 rounded-xl border border-[#162238] bg-[#0c111e] p-4 hover:border-sky-500/50 transition-colors">
                <span className="w-11 h-11 rounded-lg border border-[#1e2b44] bg-[#080c16] flex items-center justify-center text-sky-300">{w.icon}</span>
                <span className="flex-1"><span className="block text-sm font-bold text-slate-100">{w.title}</span><span className="block text-[11px] text-slate-500">{w.sub}</span></span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-xl border border-[#162238] bg-[#0c111e] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-100">{query ? `Results for "${query}"` : "Recommended guides"}</h2>
            <Pill tone="blue">Curated workflows</Pill>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] font-mono uppercase tracking-wider text-slate-500"><th className="py-2">Guide / workflow</th><th className="py-2">Area</th><th /></tr></thead>
            <tbody>
              {guides.length === 0 ? (
                <tr><td colSpan={3} className="py-6 text-center text-slate-500">No guides match. Try a broader term, or open a support request.</td></tr>
              ) : guides.map((g) => (
                <tr key={g.title} className="border-t border-[#111a2b]">
                  <td className="py-2.5"><span className="flex items-center gap-2.5 text-slate-200"><span className="text-sky-400">{g.icon}</span>{g.title}</span></td>
                  <td className="py-2.5"><span className="px-2 py-1 rounded-md border border-[#1e2b44] bg-[#080c16] text-[10px] text-slate-300">{g.area}</span></td>
                  <td className="py-2.5 text-right"><Link href={g.href} className="text-sky-300 font-semibold hover:underline">Open ›</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-xl border border-[#162238] bg-[#0c111e] p-5">
          <h2 className="text-base font-bold text-slate-100 pb-3 border-b border-[#162238]">Support &amp; escalation</h2>
          <div className="space-y-2.5 mt-3">
            {[
              { title: "Create a support request", sub: "Secure request with redacted diagnostic context", href: "/notifications", icon: <MessageSquare className="w-4 h-4" /> },
              { title: "Security-critical incident", sub: "Use Incident Command and your contracted process", href: "/cases/incidents/command", icon: <Flame className="w-4 h-4" /> },
              { title: "Service availability", sub: "View only measured, current service status", href: "/admin/platform-health", icon: <Clock className="w-4 h-4" /> },
            ].map((s) => (
              <Link key={s.title} href={s.href} className="flex items-center gap-3 rounded-lg border border-[#1e2b44] bg-[#080c16] p-3 hover:border-sky-500/50">
                <span className="text-sky-300">{s.icon}</span>
                <span className="flex-1"><span className="block text-xs font-semibold text-slate-100">{s.title}</span><span className="block text-[10px] text-slate-500">{s.sub}</span></span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-[#162238] bg-[#0c111e] p-5 border-l-4 border-l-amber-500">
        {[
          { icon: <AlertTriangle className="w-6 h-6 text-amber-400" />, title: "Troubleshooting essentials", sub: "Authentication denied? Check the tenant binding and generic sign-in error." },
          { icon: <Network className="w-6 h-6 text-sky-400" />, title: "Connector data delayed?", sub: "Review last-seen time, source auth and normalization." },
          { icon: <Lock className="w-6 h-6 text-emerald-400" />, title: "Response action blocked?", sub: "Inspect approvals, policy gates and freeze state." },
        ].map((t) => (
          <div key={t.title} className="flex items-start gap-3">
            {t.icon}
            <div><div className="text-sm font-bold text-slate-100">{t.title}</div><div className="text-[11px] text-slate-400">{t.sub}</div></div>
          </div>
        ))}
      </section>
      <div className="text-right text-[10px] font-mono text-slate-500">ZOIKOSHIELD · UI CONCEPT · ALL EXAMPLES SIMULATED</div>
    </div>
  );
}
