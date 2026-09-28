"use client";

import React, { useState } from "react";
import { Card } from "@/ui/Card";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import {
  Globe,
  Server,
  Zap,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Activity,
  Cpu,
  Layers,
} from "lucide-react";

interface RegionalShard {
  region: string;
  name: string;
  endpoint: string;
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  replicationLagMs: number;
  activeTenantsCount: number;
  ingestEps: number;
  sovereigntyProfile: string;
}

interface TenantRoute {
  tenantId: string;
  organizationName: string;
  primaryRegion: string;
  routedRegion: string;
  isFailover: boolean;
  failoverReason?: string;
}

export function RegionalShardTopology() {
  const [isSimulatingOutage, setIsSimulatingOutage] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);

  const [shards, setShards] = useState<RegionalShard[]>([
    {
      region: "us-east-1",
      name: "US-East-1 (N. Virginia Primary)",
      endpoint: "https://ingest-us.zoikoshield.internal",
      status: "HEALTHY",
      replicationLagMs: 18,
      activeTenantsCount: 420,
      ingestEps: 18450,
      sovereigntyProfile: "NIST 800-53 / SOC 2",
    },
    {
      region: "eu-west-1",
      name: "EU-West-1 (Dublin Sovereign)",
      endpoint: "https://ingest-eu.zoikoshield.internal",
      status: "HEALTHY",
      replicationLagMs: 12,
      activeTenantsCount: 310,
      ingestEps: 12200,
      sovereigntyProfile: "GDPR Art 17 / EU Cloud Code",
    },
    {
      region: "ap-southeast-1",
      name: "AP-Southeast-1 (Singapore Edge)",
      endpoint: "https://ingest-ap.zoikoshield.internal",
      status: "HEALTHY",
      replicationLagMs: 24,
      activeTenantsCount: 190,
      ingestEps: 7600,
      sovereigntyProfile: "MAS TRM / Privacy Shield",
    },
  ]);

  const [tenantRoutes, setTenantRoutes] = useState<TenantRoute[]>([
    {
      tenantId: "tenant-eu-fintech-ltd",
      organizationName: "Apex Global Financial Ltd",
      primaryRegion: "us-east-1",
      routedRegion: "us-east-1",
      isFailover: false,
    },
    {
      tenantId: "tenant-us-healthcare-org",
      organizationName: "Novacare Healthcare Systems",
      primaryRegion: "ap-southeast-1",
      routedRegion: "ap-southeast-1",
      isFailover: false,
    },
    {
      tenantId: "tenant-apac-ecommerce-corp",
      organizationName: "Pacific Retail Global Corp",
      primaryRegion: "us-east-1",
      routedRegion: "us-east-1",
      isFailover: false,
    },
    {
      tenantId: "tenant-global-aerospace-inc",
      organizationName: "AeroDynamics Defense Group",
      primaryRegion: "eu-west-1",
      routedRegion: "eu-west-1",
      isFailover: false,
    },
  ]);

  const handleSimulateOutage = () => {
    setIsSimulatingOutage(true);
    setShards((prev) =>
      prev.map((s) =>
        s.region === "us-east-1"
          ? {
              ...s,
              status: "UNAVAILABLE",
              replicationLagMs: 15400,
              ingestEps: 0,
            }
          : s.region === "eu-west-1"
          ? {
              ...s,
              activeTenantsCount: 730,
              ingestEps: 30650,
            }
          : s
      )
    );

    setTenantRoutes((prev) =>
      prev.map((r) =>
        r.primaryRegion === "us-east-1"
          ? {
              ...r,
              routedRegion: "eu-west-1",
              isFailover: true,
              failoverReason: "Primary region us-east-1 is UNAVAILABLE (Replication lag: 15400ms)",
            }
          : r
      )
    );

    setSimulationLog(
      "⚠️ [INGEST REGION FAILOVER ACTIVATED] Primary 'us-east-1' degraded. Zero-loss telemetry rerouted to 'eu-west-1' in 4.2ms."
    );
  };

  const handleRestoreHealth = () => {
    setIsSimulatingOutage(false);
    setShards((prev) =>
      prev.map((s) =>
        s.region === "us-east-1"
          ? {
              ...s,
              status: "HEALTHY",
              replicationLagMs: 14,
              ingestEps: 18450,
            }
          : s.region === "eu-west-1"
          ? {
              ...s,
              activeTenantsCount: 310,
              ingestEps: 12200,
            }
          : s
      )
    );

    setTenantRoutes((prev) =>
      prev.map((r) => ({
        ...r,
        routedRegion: r.primaryRegion,
        isFailover: false,
        failoverReason: undefined,
      }))
    );

    setSimulationLog(
      "✔ [SELF-HEALING RESTORATION COMPLETE] Region 'us-east-1' healthy (Lag: 14ms). Tenancy routes restored to primary shards."
    );
  };

  return (
    <Card className="p-6 space-y-6 bg-[#0a0e17] border-cyan-500/30">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Globe className="w-5 h-5 animate-pulse" />
            </span>
            <h2 className="text-lg font-bold text-slate-100">
              Active-Active Global Ingest Shard Topology
            </h2>
            <Badge variant="ai">MULTI-REGION v2</Badge>
          </div>
          <p className="text-xs text-slate-400">
            Deterministic tenancy partitioning, cross-region replication lag monitoring, and autonomous zero-loss failover routing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSimulatingOutage ? (
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 font-bold"
              onClick={handleRestoreHealth}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Restore Regional Health</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 font-bold"
              onClick={handleSimulateOutage}
            >
              <Zap className="w-4 h-4 text-rose-400" />
              <span>Simulate US-East-1 Fiber Cut</span>
            </Button>
          )}
        </div>
      </div>

      {simulationLog && (
        <div
          className={`p-3 rounded-lg border font-mono text-xs flex items-center justify-between gap-3 ${
            isSimulatingOutage
              ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
              : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {isSimulatingOutage ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{simulationLog}</span>
          </div>
          <span className="text-[10px] text-slate-400 shrink-0">RPO = 0 / RTO &lt; 5ms</span>
        </div>
      )}

      {/* Shard Nodes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {shards.map((shard) => {
          const isUnavailable = shard.status === "UNAVAILABLE";
          return (
            <div
              key={shard.region}
              className={`p-4 rounded-xl border transition-all space-y-3 ${
                isUnavailable
                  ? "bg-rose-950/20 border-rose-500/50 shadow-lg shadow-rose-950/30"
                  : "bg-slate-950/80 border-slate-800 hover:border-cyan-500/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className={`w-4 h-4 ${isUnavailable ? "text-rose-400" : "text-cyan-400"}`} />
                  <span className="font-bold text-xs text-slate-100">{shard.name}</span>
                </div>
                <Badge variant={isUnavailable ? "critical" : "pass"}>
                  {shard.status}
                </Badge>
              </div>

              <div className="space-y-1.5 font-mono text-[11px] text-slate-400">
                <div className="flex justify-between">
                  <span className="text-slate-500">Replication Lag:</span>
                  <span className={`font-bold ${shard.replicationLagMs > 1000 ? "text-rose-400" : "text-emerald-400"}`}>
                    {shard.replicationLagMs}ms
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Active Tenants:</span>
                  <span className="text-slate-200 font-bold">{shard.activeTenantsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ingestion Throughput:</span>
                  <span className="text-cyan-300 font-bold">{shard.ingestEps.toLocaleString()} EPS</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-800/80 text-[10px]">
                  <span className="text-slate-500">Sovereignty:</span>
                  <span className="text-purple-300 truncate max-w-[140px]">{shard.sovereigntyProfile}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tenancy Partition Routing Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase font-mono">
              Deterministic Tenancy Stream Partitions
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Hash Function: <strong className="text-cyan-400">MurmurHash3-x64-128</strong>
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[11px]">
                <th className="p-3">Tenant Identifier</th>
                <th className="p-3">Organization Entity</th>
                <th className="p-3">Primary Shard</th>
                <th className="p-3">Active Ingestion Route</th>
                <th className="p-3">Routing State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {tenantRoutes.map((route) => (
                <tr key={route.tenantId} className="hover:bg-slate-900/40 transition-colors">
                  <td className="p-3 text-cyan-300 font-bold">{route.tenantId}</td>
                  <td className="p-3 text-slate-200 font-sans">{route.organizationName}</td>
                  <td className="p-3 text-slate-400">{route.primaryRegion}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      route.isFailover
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    }`}>
                      {route.routedRegion}
                    </span>
                  </td>
                  <td className="p-3">
                    {route.isFailover ? (
                      <Badge variant="medium">FAILOVER REROUTED</Badge>
                    ) : (
                      <Badge variant="pass">PRIMARY OPTIMAL</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
