"use client";

import React from "react";
import { useDemoState } from "@/lib/demo-state";
import {
  ShieldCheck,
  Building2,
  Globe2,
  UserCheck,
  Activity,
  Bell,
  Lock,
} from "lucide-react";
import Link from "next/link";

export const TrustBar: React.FC = () => {
  const [state] = useDemoState();

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0d1017]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-2.5 flex items-center justify-between shadow-lg">
      {/* Brand & Tenancy Title */}
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-slate-950 font-black shadow-[0_0_15px_rgba(6,182,212,0.4)] group-hover:scale-105 transition-transform">
            ZS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-slate-100 text-sm">
                ZoikoShield
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold">
                ENTERPRISE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-cyan-400 inline" />
              <span className="font-medium text-slate-200">
                {state.tenant.organizationName}
              </span>
            </p>
          </div>
        </Link>

        <div className="h-6 w-px bg-slate-800 hidden md:block" />

        {/* Environment Badge */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold">{state.tenant.environmentName}</span>
        </div>

        {/* Region */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono">
          <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Region: {state.tenant.homeRegion}</span>
        </div>
      </div>

      {/* Trust & Identity Context */}
      <div className="flex items-center gap-3">
        {/* Enclave Status Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs font-mono">
          <Lock className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden md:inline">TEE:</span> AWS Nitro Validated
        </div>

        {/* System Health */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950/30 border border-cyan-500/20 text-cyan-300 text-xs font-mono">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Microservices: 5/5 OK</span>
        </div>

        {/* Active User / Role */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-xs text-slate-200">
          <UserCheck className="w-4 h-4 text-cyan-400" />
          <div className="text-right">
            <p className="font-semibold leading-tight text-slate-100">
              {state.session.fullName}
            </p>
            <p className="text-[10px] font-mono text-cyan-400 leading-tight">
              {state.session.role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
