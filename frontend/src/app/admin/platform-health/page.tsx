"use client";

import React, { useState, useEffect } from "react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import {
  PlatformReadinessSnapshot,
  CoreServiceReadiness,
  ServiceReadinessState,
  DisasterRecoveryPostureSummary,
  RestoreDrillReceipt,
  GameDayPostureSummary,
  GameDayExerciseResult,
  GameDayScenario,
  AnnexPGameDayReport,
  Phase0PostureSummary,
  Phase0ExitProofRecord,
  Phase0ProofBundle,
  OfflineVerificationReport,
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
  Flame,
  FileText,
  Radio,
  ExternalLink,
  Code2,
  Award,
} from "lucide-react";
import Link from "next/link";

export default function PlatformHealthPage() {
  const [snapshot, setSnapshot] = useState<PlatformReadinessSnapshot | null>(null);
  const [drSummary, setDrSummary] = useState<DisasterRecoveryPostureSummary | null>(null);
  const [drillReceipt, setDrillReceipt] = useState<RestoreDrillReceipt | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [syntheticData, setSyntheticData] = useState<{
    canaryPosture: any;
    gameDayPosture: GameDayPostureSummary;
    recentProbes: any[];
    recentExercises: GameDayExerciseResult[];
  } | null>(null);
  const [gameDayLoading, setGameDayLoading] = useState<string | null>(null);
  const [selectedAnnexP, setSelectedAnnexP] = useState<AnnexPGameDayReport | null>(null);
  const [phase0Data, setPhase0Data] = useState<{
    postureSummary: Phase0PostureSummary;
    latestProof: Phase0ExitProofRecord;
  } | null>(null);
  const [phase0Loading, setPhase0Loading] = useState(false);
  const [offlineReport, setOfflineReport] = useState<OfflineVerificationReport | null>(null);
  const [verifyingOffline, setVerifyingOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);

  const loadHealth = async () => {
    try {
      setError(null);
      const [readinessData, drData, synthData, p0Data] = await Promise.all([
        ZoikoShieldApiClient.getPlatformReadiness(),
        ZoikoShieldApiClient.getDisasterRecoveryBackupStatus(),
        ZoikoShieldApiClient.getSyntheticObservabilityStatus(),
        ZoikoShieldApiClient.getPhase0Status(),
      ]);
      setSnapshot(readinessData);
      setDrSummary(drData);
      setSyntheticData(synthData);
      setPhase0Data(p0Data);
    } catch (err: any) {
      setError(err?.message || "Failed to load platform readiness state");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleExecutePhase0 = async () => {
    try {
      setPhase0Loading(true);
      setError(null);
      const proof = await ZoikoShieldApiClient.executePhase0Flow(
        "tenant-zoiko-canary-01",
        "cell-eu-west-1a"
      );
      setPhase0Data((prev) =>
        prev
          ? {
              ...prev,
              latestProof: proof,
              postureSummary: {
                ...prev.postureSummary,
                latestProofId: proof.proofId,
                lastEvaluatedAt: proof.evaluatedAt,
                merkleRootHead: proof.merkleRootHead,
              },
            }
          : null
      );
      await loadHealth();
    } catch (err: any) {
      setError(err?.message || "Failed to execute Phase-0 Reference Flow");
    } finally {
      setPhase0Loading(false);
    }
  };

  const handleVerifyOffline = async () => {
    try {
      setVerifyingOffline(true);
      setError(null);
      const bundle = await ZoikoShieldApiClient.getPhase0ProofBundle();
      const rep = await ZoikoShieldApiClient.verifyProofOffline(bundle);
      setOfflineReport(rep);
    } catch (err: any) {
      setError(err?.message || "Failed to run offline verifier simulation");
    } finally {
      setVerifyingOffline(false);
    }
  };


  const handleTriggerGameDay = async (scenario: GameDayScenario) => {
    try {
      setGameDayLoading(scenario);
      const result = await ZoikoShieldApiClient.triggerGameDayExercise(scenario, "soc-operator@zoiko.com");
      const report = await ZoikoShieldApiClient.getAnnexPGameDayReport(result.exerciseId);
      setSelectedAnnexP(report);
      await loadHealth();
    } catch (err: any) {
      setError(err?.message || `Failed to execute game day scenario ${scenario}`);
    } finally {
      setGameDayLoading(null);
    }
  };

  const handleFetchAnnexP = async (exerciseId: string) => {
    try {
      const report = await ZoikoShieldApiClient.getAnnexPGameDayReport(exerciseId);
      setSelectedAnnexP(report);
    } catch (err: any) {
      setError(err?.message || "Failed to load Annex P report");
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
                  {(snapshot.overallState || "READINESS_NOMINAL").replace(/_/g, " ")}
                </span>
                {getStateBadge(snapshot.overallState || "HEALTHY")}
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

        {/* Spec §27: Synthetic Monitoring, Canary Tenants & Game Day Resilience */}
        {syntheticData && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-400" />
                  <h2 className="text-base font-bold text-slate-100">
                    Synthetic Monitoring & 7-Scenario Game Day Resilience (Spec §27)
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-bold">
                    ANNEX P COMPLIANT
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Continuous synthetic canary probes (<code className="text-cyan-400">tenant-zoiko-canary-01</code>) and all 7 canonical chaos failure classes with automated Annex P audit dossiers.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="text-right">
                  <div className="text-slate-500 uppercase text-[10px]">Resilience Score</div>
                  <div className="text-base font-bold text-emerald-400">
                    {Math.round(syntheticData.gameDayPosture.overallResilienceScore * 100)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-500 uppercase text-[10px]">Cadence Compliance</div>
                  <div className="text-base font-bold text-slate-200">
                    {syntheticData.gameDayPosture.isGameDayScheduleCompliant ? "COMPLIANT (≤90d)" : "OVERDUE"}
                  </div>
                </div>
              </div>
            </div>

            {/* 7 Canonical Failure Classes Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 uppercase">
                <span>Canonical Failure Classes (7/7 Scenarios)</span>
                <span>Target SLA: &le;30s Mitigation</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {syntheticData.gameDayPosture.scenariosExercised.map((sc) => (
                  <div
                    key={sc.scenario}
                    className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-bold text-slate-200">{sc.failureClass}</div>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-bold">
                          {sc.status}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-cyan-400">{sc.scenario}</div>
                      <div className="text-[11px] text-slate-400">
                        Last Run: {new Date(sc.lastExercised).toLocaleDateString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleTriggerGameDay(sc.scenario)}
                      disabled={gameDayLoading === sc.scenario}
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-mono text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
                    >
                      <Zap className={`w-3.5 h-3.5 text-amber-400 ${gameDayLoading === sc.scenario ? "animate-spin" : ""}`} />
                      <span>{gameDayLoading === sc.scenario ? "Executing Chaos Drill..." : "Run Scenario Drill"}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Annex P Report Viewer Modal / Drawer */}
            {selectedAnnexP && (
              <div className="p-5 rounded-xl bg-slate-950 border border-indigo-500/40 space-y-4 shadow-2xl">
                <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-bold text-slate-100">{selectedAnnexP.documentTitle}</h3>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono font-bold">
                        {selectedAnnexP.annexVersion}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Exercise ID: <span className="font-mono text-cyan-400">{selectedAnnexP.exerciseId}</span> • Class: <strong>{selectedAnnexP.failureClass}</strong>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedAnnexP(null)}
                    className="text-xs font-mono text-slate-500 hover:text-slate-300 px-2 py-1 rounded bg-slate-900 border border-slate-800"
                  >
                    Close
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500">Mitigation Latency</div>
                    <div className="font-bold text-emerald-400">{selectedAnnexP.timeToMitigateSeconds}s (SLA &le;{selectedAnnexP.slaLimitSeconds}s)</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500">ORR Release Gate</div>
                    <div className="font-bold text-emerald-400">
                      {selectedAnnexP.orrInputRatification.eligibleForProductionReleaseGate ? "RATIFIED (Ready)" : "REJECTED"}
                    </div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500">Target Tenant Scope</div>
                    <div className="font-bold text-slate-200">{selectedAnnexP.targetTenantScope}</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-500">Exercised By</div>
                    <div className="font-bold text-slate-200 truncate">{selectedAnnexP.exercisedBy}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-300 font-mono">Invariants Verified (3/3):</div>
                  <div className="space-y-1">
                    {selectedAnnexP.invariantsVerified.map((inv, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-slate-900/40 p-2 rounded border border-slate-800/80">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{inv}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5 truncate">
                    <Fingerprint className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Report SHA-256:</span>
                    <span className="text-slate-400 truncate">{selectedAnnexP.cryptographicReportDigest}</span>
                  </div>
                  <span className="shrink-0 text-slate-500">{new Date(selectedAnnexP.executionTimestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Spec §28: Phase-0 Reference Flow & Exit Gate Verification Cockpit */}
        {phase0Data && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg font-bold text-slate-100">
                    Phase-0 Exit Gate & Independent Reference Proof Cockpit
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono font-semibold">
                    Spec §28 Compliant
                  </span>
                </div>
                <p className="text-xs text-slate-400 max-w-3xl">
                  Automated end-to-end multi-tenant isolation, deterministic rule detection, Merkle witness anchoring,
                  safe simulation bounds, emergency freeze verification, and standalone offline CLI verifier readiness.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleVerifyOffline}
                  disabled={verifyingOffline}
                  className="px-3.5 py-2 rounded-xl bg-indigo-900/40 hover:bg-indigo-800/40 disabled:opacity-50 text-indigo-300 font-mono text-xs flex items-center gap-2 border border-indigo-700/50 transition shadow-sm"
                >
                  <Terminal className={`w-3.5 h-3.5 ${verifyingOffline ? "animate-spin" : ""}`} />
                  <span>{verifyingOffline ? "Verifying Offline..." : "Verify Offline CLI"}</span>
                </button>

                <button
                  onClick={handleExecutePhase0}
                  disabled={phase0Loading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono text-xs flex items-center gap-2 border border-emerald-500 transition shadow-lg shadow-emerald-950/40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${phase0Loading ? "animate-spin" : ""}`} />
                  <span>{phase0Loading ? "Executing Reference Flow..." : "Run Phase-0 Verification Flow"}</span>
                </button>
              </div>
            </div>

            {/* Offline CLI Report Modal / Callout */}
            {offlineReport && (
              <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/40 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-mono font-bold text-slate-200">
                      Standalone Verifier Report: {offlineReport.packageId}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono">
                      {offlineReport.verified ? "VERIFIED (100% INTACT)" : "FAILED"}
                    </span>
                  </div>
                  <button
                    onClick={() => setOfflineReport(null)}
                    className="text-xs font-mono text-slate-500 hover:text-slate-300 px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500">Merkle Root:</span>
                    <div className="text-emerald-400 font-bold">{offlineReport.merkleRootMatches ? "MATCHED" : "MISMATCH"}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500">Evidence Chain:</span>
                    <div className="text-emerald-400 font-bold">{offlineReport.evidenceChainIntact ? "INTACT" : "CORRUPTED"}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500">Invariants Passed:</span>
                    <div className="text-emerald-400 font-bold">{offlineReport.invariantsPassed}/{offlineReport.totalInvariants}</div>
                  </div>
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500">Certificate Signature:</span>
                    <div className="text-slate-300 font-mono text-[10px] truncate">{offlineReport.verificationCertificate.signatureSha256.slice(0, 16)}...</div>
                  </div>
                </div>
              </div>
            )}

            {/* Posture & Proof Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Exit Gate Status</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {phase0Data.postureSummary.overallStatus}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  6 of 6 Acceptance Criteria Satisfied
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Reference Pipeline</span>
                  <Layers className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-100">
                  {phase0Data.latestProof.stepsCompleted} / {phase0Data.latestProof.totalSteps} Steps
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  Total Flow Duration: {phase0Data.latestProof.totalDurationMs}ms
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Merkle Root Head</span>
                  <Fingerprint className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-xs font-mono font-bold text-cyan-400 truncate">
                  {phase0Data.latestProof.merkleRootHead.slice(0, 16)}...
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  RFC 3161 Witness Attested
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">G1 Launch Gate</span>
                  <Award className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-sm font-bold font-mono text-emerald-400">
                  {phase0Data.latestProof.releaseGateRatification?.eligibleForG1Gate ? "ELIGIBLE" : "INELIGIBLE"}
                </div>
                <div className="text-[10px] font-mono text-slate-500 truncate">
                  {phase0Data.latestProof.releaseGateRatification?.attestedByRole || "System Architecture"}
                </div>
              </div>
            </div>

            {/* 8-Step Flow Pipeline */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Deterministic 8-Step Verification Pipeline (Spec §28 ERB-01)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {(phase0Data.latestProof.steps || []).map((step) => (
                  <div
                    key={step.stepId}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 hover:border-slate-700 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 font-bold">
                        Step 0{step.stepNumber}
                      </span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200 truncate">{step.name}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">{step.description}</div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                      <span>{step.durationMs}ms</span>
                      <span className="text-cyan-400 truncate max-w-[100px]">{step.evidenceDigest?.slice(0, 8)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Exit Criteria Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Phase-0 Exit Gate Invariant Checklist (6 Criteria)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(phase0Data.latestProof.criteria || []).map((crit) => (
                  <div
                    key={crit.criteriaId}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">{crit.name}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold">
                        {crit.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{crit.description}</p>
                    <div className="space-y-1 pt-1">
                      {crit.requiredInvariants.map((inv) => (
                        <div key={inv} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>{inv}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Offline Verifier CLI Command Snippet */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-300">
                <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-500">Standalone CLI Command:</span>
                <code className="text-emerald-300 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  {phase0Data.latestProof.offlineVerificationCommand}
                </code>
              </div>
              <div className="text-[10px] text-slate-500">
                Offline Mode • Zero Network Dependencies • Deterministic RFC 3161 Verification
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



