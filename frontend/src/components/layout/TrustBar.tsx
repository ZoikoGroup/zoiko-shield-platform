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
import { ZoikoShieldApiClient } from "@/lib/api-client";

export const TrustBar: React.FC = () => {
  const [state] = useDemoState();
  const [healthStatus, setHealthStatus] = React.useState<{
    healthyCount: number;
    totalCount: number;
    state: string;
  }>({ healthyCount: 5, totalCount: 5, state: "OK" });

  React.useEffect(() => {
    let mounted = true;
    const fetchHealth = async () => {
      try {
        const snap = await ZoikoShieldApiClient.getPlatformReadiness();
        if (mounted && snap) {
          const healthy = snap.healthyServicesCount ?? 5;
          const total = snap.totalServicesCount ?? 5;
          const isDegraded = (snap.degradedServicesCount ?? 0) > 0;
          setHealthStatus({
            healthyCount: healthy,
            totalCount: total,
            state: isDegraded ? "DEGRADED" : "OK",
          });
        }
      } catch {
        // Fallback gracefully if unauthenticated or during offline development
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

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
        {/* Evidence integrity badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs font-mono">
          <Lock className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden md:inline">Evidence:</span> Signed Merkle checkpoints
        </div>

        {/* System Health */}
        <Link
          href="/admin/platform-health"
          title="Inspect Platform Microservices Health"
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-colors hover:brightness-125 ${
            healthStatus.state === "OK"
              ? "bg-cyan-950/30 border-cyan-500/20 text-cyan-300"
              : "bg-amber-950/40 border-amber-500/30 text-amber-300"
          }`}
        >
          <Activity
            className={`w-3.5 h-3.5 ${
              healthStatus.state === "OK" ? "text-cyan-400" : "text-amber-400"
            }`}
          />
          <span>
            Microservices: {healthStatus.healthyCount}/{healthStatus.totalCount}{" "}
            {healthStatus.state}
          </span>
        </Link>

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
