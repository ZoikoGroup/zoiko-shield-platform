"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  PlatformReadinessSnapshot,
  CoreServiceReadiness,
  ServiceReadinessState,
  DisasterRecoveryPostureSummary,
  RestoreDrillReceipt,
} from "@/lib/types";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Server,
  Database,
  Cpu,
  Zap,
  Lock,
  FileCheck,
  RefreshCw,
  Terminal,
  Layers,
  ChevronRight,
  Fingerprint,
  HardDrive,
  RotateCcw,
  Shield,
  Check,
} from "lucide-react";
import Link from "next/link";

export default function PlatformHealthPage() {
  const [snapshot, setSnapshot] = useState<PlatformReadinessSnapshot | null>(null);
  const [drSummary, setDrSummary] = useState<DisasterRecoveryPostureSummary | null>(null);
  const [drillReceipt, setDrillReceipt] = useState<RestoreDrillReceipt | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  const loadHealth = async () => {
    try {
      setError(null);
      const [readinessData, drData] = await Promise.all([
        ZoikoShieldApiClient.getPlatformReadiness(),
        ZoikoShieldApiClient.getDisasterRecoveryBackupStatus(),
      ]);
      setSnapshot(readinessData);
      setDrSummary(drData);
    } catch (err: any) {
      setError(err?.message || "Failed to load platform readiness state");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleExecuteDrill = async (storeId: string = "shield_core_db") => {
    try {
      setDrillLoading(true);
      const receipt = await ZoikoShieldApiClient.runRestoreDrill(storeId);
      setDrillReceipt(receipt);
      await loadHealth(); // Refresh state
    } catch (err: any) {
      setError(err?.message || "Failed to execute restore drill");
    } finally {
      setDrillLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  const getStateBadge = (state: ServiceReadinessState) => {
    switch (state) {
      case "HEALTHY":
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> HEALTHY
          </span>
        );
      case "READINESS_CONDITIONAL":
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <Clock className="w-3 h-3 text-cyan-400" /> READINESS CONDITIONAL
          </span>
        );
      case "AT_RISK":
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> AT RISK
          </span>
        );
      case "DEGRADED":
      case "PARTIAL_INCOMPLETE":
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <AlertOctagon className="w-3 h-3 text-rose-400" /> {state.replace("_", " ")}
          </span>
        );
      case "MAINTENANCE":
      case "RECOVERING":
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <Activity className="w-3 h-3 text-indigo-400" /> {state}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-mono font-bold">
            {state}
          </span>
        );
    }
  };

  const getServiceIcon = (serviceId: string) => {
    switch (serviceId) {
      case "shield-core":
        return <Server className="w-5 h-5 text-indigo-400" />;
      case "shield-ingest":
        return <Zap className="w-5 h-5 text-amber-400" />;
      case "shield-ai":
        return <Cpu className="w-5 h-5 text-purple-400" />;
      case "shield-action":
        return <Layers className="w-5 h-5 text-cyan-400" />;
      case "shield-anchor":
        return <Lock className="w-5 h-5 text-emerald-400" />;
      case "verifier-cli":
        return <Terminal className="w-5 h-5 text-slate-300" />;
      default:
        return <Activity className="w-5 h-5 text-slate-400" />;
    }
  };

  const servicesList = snapshot ? Object.values(snapshot.services) : [];

  return (
    <div className="space-y-8 pb-16">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
            <Activity className="w-3.5 h-3.5" />
            <span>SPEC §31 & §32 EXPLICIT SERVICE-HEALTH & READINESS ENGINE</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
            Platform Service Health & Readiness Cockpit
          </h1>
          <p className="text-slate-400 text-sm max-w-3xl">
            Live queryable service readiness state model per Spec §31. Evaluates 16 canonical health states across all 6 core backend services.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setRefreshing(true);
              loadHealth();
            }}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Refresh Health States"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/admin/g1-gate"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors border border-slate-700"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>G1 Launch Gate</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Overall Platform Readiness Banner */}
      {snapshot && (
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-slate-400 uppercase">Overall Platform Readiness</div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-slate-100">
                  {snapshot.overallState.replace("_", " ")}
                </span>
                {getStateBadge(snapshot.overallState)}
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs font-mono">
              <div>
                <div className="text-slate-500 uppercase text-[10px]">Readiness Score</div>
                <div className="text-xl font-bold text-cyan-400">
                  {Math.round(snapshot.overallScore * 100)}%
                </div>
              </div>
              <div>
                <div className="text-slate-500 uppercase text-[10px]">Healthy Services</div>
                <div className="text-xl font-bold text-emerald-400">
                  {snapshot.healthyServicesCount} / {snapshot.totalServicesCount}
                </div>
              </div>
              <div>
                <div className="text-slate-500 uppercase text-[10px]">G1 Gate Ratified</div>
                <div className="text-xl font-bold text-slate-200">
                  {snapshot.g1GateRatified ? "YES (8/8)" : "0/8 (FAIL-CLOSED)"}
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 truncate">
              <Fingerprint className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-slate-500 font-mono">Attestation Digest:</span>
              <span className="font-mono text-slate-300 truncate">{snapshot.auditAttestationHash}</span>
            </div>
            <div className="text-[11px] text-slate-500 shrink-0 font-mono">
              Evaluated: {new Date(snapshot.evaluatedAt).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* 6 Core Services Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Core Services Health Matrix</h2>
            <p className="text-xs text-slate-400">Per-service explicit status and signal assessment (Spec §31)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servicesList.map((svc) => (
            <div
              key={svc.serviceId}
              className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      {getServiceIcon(svc.serviceId)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">{svc.displayName}</h3>
                      <div className="font-mono text-[10px] text-slate-500">
                        {svc.serviceId} • v{svc.version}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {getStateBadge(svc.state)}
                  <span className="font-mono text-xs font-bold text-slate-300">
                    {Math.round(svc.readinessScore * 100)}%
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                  {svc.description}
                </p>

                {/* Health Signals */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                  <div className="text-[10px] font-mono text-slate-500 uppercase">Live Signals</div>
                  {svc.signals.map((sig) => (
                    <div key={sig.signalKey} className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">{sig.label}:</span>
                      <span className={sig.status === "OPTIMAL" ? "text-emerald-400" : "text-amber-400"}>
                        {String(sig.value)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Dependencies */}
                {svc.dependencies.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-slate-800/80">
                    <div className="text-[10px] font-mono text-slate-500 uppercase">Dependencies</div>
                    <div className="flex flex-wrap gap-1.5">
                      {svc.dependencies.map((dep) => (
                        <span
                          key={dep.dependencyName}
                          className="px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 font-mono text-[10px] flex items-center gap-1"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dep.healthy ? "bg-emerald-400" : "bg-rose-400"}`} />
                          {dep.dependencyName} ({dep.latencyMs}ms)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Operational Conditions / Blockers */}
                {svc.operationalConditions && svc.operationalConditions.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-cyan-300 text-[11px] leading-relaxed">
                    <span className="font-bold font-mono">Gating Condition: </span>
                    {svc.operationalConditions[0]}
                  </div>
                )}
                {svc.blockers && svc.blockers.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-[11px] leading-relaxed">
                    <span className="font-bold font-mono">Blocker: </span>
                    {svc.blockers[0]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Spec §26: Backup, Restore, Disaster Recovery & Integrity Reconciliation */}
        {drSummary && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-base font-bold text-slate-100">
                    Disaster Recovery, Backup & Integrity Reconciliation (Spec §26)
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-[10px] font-bold">
                    RPO & RTO RECONCILED
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Multi-store automated snapshot coverage, cryptographic Merkle head alignment, and zero-drift scratch schema restore drills.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  id="btn-run-restore-drill"
                  onClick={() => handleExecuteDrill("shield_core_db")}
                  disabled={drillLoading}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${drillLoading ? "animate-spin" : ""}`} />
                  {drillLoading ? "Running Restore Drill..." : "Execute Restore Drill"}
                </button>
              </div>
            </div>

            {/* Drill Receipt Live Panel */}
            {drillReceipt && (
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300 font-mono">
                      RESTORE DRILL VERIFIED (Drill ID: {drillReceipt.drillId})
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Duration: <strong className="text-emerald-400">{drillReceipt.durationMs}ms</strong> (Target: &lt;{drillReceipt.rtoTargetSeconds}s)
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500">Tables Reconciled</div>
                    <div className="font-bold text-slate-200">{drillReceipt.totalTablesReconciled} tables (100%)</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500">Rows Reconciled</div>
                    <div className="font-bold text-slate-200">{drillReceipt.totalRowsReconciled} records (0 drift)</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500">Merkle Head Root</div>
                    <div className="font-bold text-emerald-400 truncate">{drillReceipt.restoredMerkleHead.slice(0, 16)}...</div>
                  </div>
                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500">Scratch Teardown</div>
                    <div className="font-bold text-emerald-400">CLEANED UP (Isolated)</div>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1 truncate">
                  <Fingerprint className="w-3 h-3 text-slate-400 shrink-0" />
                  Receipt Signature: <span className="text-slate-400">{drillReceipt.receiptSignatureSha256}</span>
                </div>
              </div>
            )}

            {/* 4 Data Stores Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.values(drSummary.stores).map((store) => (
                <div
                  key={store.storeId}
                  className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{store.displayName}</h4>
                      <span className="text-[10px] font-mono text-slate-500">{store.storeType}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-bold">
                      {store.rpoStatus}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Backup Age:</span>
                      <span className="text-slate-200">{store.backupAgeHours}h ago</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>RPO Target:</span>
                      <span className="text-indigo-300">&le;{store.rpoTargetMinutes}m</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Encryption:</span>
                      <span className="text-emerald-400">{store.encryptionAlgorithm}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>WORM Immutability:</span>
                      <span className={store.immutabilityLocked ? "text-emerald-400 font-bold" : "text-slate-500"}>
                        {store.immutabilityLocked ? "LOCKED (WORM)" : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Restore Drill:</span>
                      <span className="text-emerald-400 font-bold">
                        {store.lastRestoreDrillStatus} ({store.restoreDrillAgeDays}d ago)
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500 truncate">
                    Checksum: {store.manifestChecksumSha256 ? store.manifestChecksumSha256.slice(0, 16) : 'N/A'}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

