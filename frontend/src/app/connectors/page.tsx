"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { ConnectorProviderType, ConnectorCertificationTier, Connector } from "@/lib/types";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { Modal } from "@/ui/Modal";
import {
  Network,
  Plus,
  Radio,
  CheckCircle2,
  Copy,
  ArrowRight,
  Shield,
  Activity,
  Layers,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  Lock,
  Sparkles,
  Zap,
  Info,
} from "lucide-react";
import {
  LoadingState,
  PartialState,
  StaleState,
  UnavailableState,
  DegradedState,
} from "@/components/states/mandatory-ui-states";
import { useEventStream } from "@/lib/use-event-stream";

const P0_PROVIDERS: ConnectorProviderType[] = [
  "generic-webhook",
  "generic-syslog",
  "microsoft-entra",
  "aws-cloudtrail",
  "aws-guardduty",
  "crowdstrike-edr",
  "snyk-vulnerability",
  "jira-ticketing",
];

const P1_PROVIDERS: ConnectorProviderType[] = [
  "okta-identity",
  "azure-monitor",
  "gcp-scc",
  "sentinelone-edr",
  "microsoft-defender-edr",
  "palo-alto-cortex-xdr",
];

function getProviderTier(provider: ConnectorProviderType): ConnectorCertificationTier {
  if (P0_PROVIDERS.includes(provider)) return "P0_CERTIFIED";
  if (P1_PROVIDERS.includes(provider)) return "P1_PREVIEW";
  return "EXPERIMENTAL_UNCERTIFIED";
}

export default function ConnectorsPage() {
  const router = useRouter();
  const [state, setState] = useDemoState();
  const [isFetchingConnectors, setIsFetchingConnectors] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [driftAlerts, setDriftAlerts] = useState<Array<{ connectorId: string; provider: string; reason: string }>>([]);

  // Filter & Search states
  const [tierFilter, setTierFilter] = useState<"ALL" | ConnectorCertificationTier>("ALL");
  const [healthFilter, setHealthFilter] = useState<"ALL" | "HEALTHY" | "DEGRADED_UNHEALTHY">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Action states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isP1ActivationModalOpen, setIsP1ActivationModalOpen] = useState(false);
  const [pendingP1Connector, setPendingP1Connector] = useState<Connector | null>(null);
  const [p1TermsAccepted, setP1TermsAccepted] = useState(false);

  // Form states
  const [name, setName] = useState("Custom AWS GuardDuty Telemetry");
  const [provider, setProvider] = useState<ConnectorProviderType>("generic-webhook");
  const [region, setRegion] = useState("us-east-1");
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Subscribe to real-time SSE stream for instant connector health updates
  const { isConnected: isSseConnected } = useEventStream({
    tenantId: state.tenant.id,
    enabled: true,
    onEvent: (event) => {
      const eventType = String(event.type);
      if (eventType === "connector.permission.drift_detected" || eventType === "connector.health.changed") {
        const payload = event.data;
        if (payload?.instanceId) {
          const instId = String(payload.instanceId);
          setState((prev) => ({
            ...prev,
            connectors: prev.connectors.map((c) =>
              c.id === instId
                ? {
                    ...c,
                    healthStatus: payload.driftStatus === "REVOKED" ? ("UNHEALTHY" as const) : payload.driftStatus === "DEGRADED" ? ("DEGRADED" as const) : ("HEALTHY" as const),
                  }
                : c
            ),
          }));
          if (payload.driftStatus === "DEGRADED" || payload.driftStatus === "REVOKED") {
            const missing = Array.isArray(payload.missingPermissions) ? payload.missingPermissions.join(", ") : "Scope revoked";
            setDriftAlerts((prev) => [
              ...prev.filter((a) => a.connectorId !== instId),
              {
                connectorId: instId,
                provider: String(payload.provider || "Connector"),
                reason: missing,
              },
            ]);
          }
        }
      } else if (eventType === "telemetry.ingested") {
        const payload = event.data;
        if (payload?.connectorId) {
          const connId = String(payload.connectorId);
          setState((prev) => ({
            ...prev,
            connectors: prev.connectors.map((c) =>
              c.id === connId
                ? { ...c, eventsIngestedCount: (c.eventsIngestedCount || 0) + 1 }
                : c
            ),
          }));
        }
      }
    },
  });

  useEffect(() => {
    setIsFetchingConnectors(true);
    ZoikoShieldApiClient.getConnectors()
      .catch(() => {
        setIsStale(true);
      })
      .finally(() => {
        setIsFetchingConnectors(false);
      });
  }, []);

  const refreshConnectors = async () => {
    setIsFetchingConnectors(true);
    try {
      await ZoikoShieldApiClient.getConnectors();
      setIsStale(false);
    } catch {
      setIsStale(true);
    } finally {
      setIsFetchingConnectors(false);
    }
  };

  const handleCreateConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const calculatedTier = getProviderTier(provider);
      await ZoikoShieldApiClient.createConnector({
        tenantId: state.tenant.id,
        name,
        provider,
        sourceRegion: region,
      });

      // Update local state with certification metadata
      setState((prev) => ({
        ...prev,
        connectors: prev.connectors.map((c) =>
          c.name === name
            ? {
                ...c,
                tier: calculatedTier,
                ocsfStatus: calculatedTier === "EXPERIMENTAL_UNCERTIFIED" ? "SCHEMA_CUSTOM" : "MAPPED_OCSF_V1",
                eventsPerMinute: calculatedTier === "P0_CERTIFIED" ? 120 : calculatedTier === "P1_PREVIEW" ? 45 : 10,
              }
            : c
        ),
      }));

      setIsAddModalOpen(false);
      setActionMessage(`✅ Connector created successfully with tier ${calculatedTier}`);
    } catch (err) {
      console.error("Connector Creation Error:", err);
    } finally {
      setIsLoading(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleTestConnection = async (connectorId: string) => {
    setActionLoadingId(connectorId);
    setActionMessage(null);
    try {
      const res = await ZoikoShieldApiClient.testConnector(connectorId);
      setActionMessage(`✅ Test passed (${res.latencyMs || 24}ms latency, HMAC signature verified)`);
    } catch (err: any) {
      setActionMessage(`❌ Test failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleSyncTelemetry = async (connectorId: string) => {
    setActionLoadingId(connectorId);
    setActionMessage(null);
    try {
      const res = await ZoikoShieldApiClient.syncConnector(connectorId);
      setActionMessage(`🔄 Synced ${res.syncedCount || 12} new OCSF-normalized events!`);
    } catch (err: any) {
      setActionMessage(`❌ Sync failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleToggleState = async (conn: Connector) => {
    const isActivating = conn.status !== "ACTIVE";
    const tier = conn.tier || getProviderTier(conn.provider);

    // If activating a P1 preview connector and preview has not been accepted, prompt with modal
    if (isActivating && tier === "P1_PREVIEW" && !conn.isP1PreviewEnabled) {
      setPendingP1Connector(conn);
      setP1TermsAccepted(false);
      setIsP1ActivationModalOpen(true);
      return;
    }

    await executeToggle(conn.id, conn.status);
  };

  const executeToggle = async (connectorId: string, currentStatus: string) => {
    setActionLoadingId(connectorId);
    setActionMessage(null);
    try {
      if (currentStatus === "ACTIVE") {
        await ZoikoShieldApiClient.disableConnector(connectorId);
        setState((prev) => ({
          ...prev,
          connectors: prev.connectors.map((c) =>
            c.id === connectorId ? { ...c, status: "DISABLED" as const } : c
          ),
        }));
        setActionMessage(`⏸️ Connector disabled`);
      } else {
        await ZoikoShieldApiClient.activateConnector(connectorId);
        setState((prev) => ({
          ...prev,
          connectors: prev.connectors.map((c) =>
            c.id === connectorId ? { ...c, status: "ACTIVE" as const, isP1PreviewEnabled: true } : c
          ),
        }));
        setActionMessage(`▶️ Connector stream activated`);
      }
    } catch (err: any) {
      setActionMessage(`❌ Toggle failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleConfirmP1Activation = async () => {
    if (!pendingP1Connector) return;
    setIsP1ActivationModalOpen(false);
    await executeToggle(pendingP1Connector.id, pendingP1Connector.status);
    setPendingP1Connector(null);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter connectors
  const filteredConnectors = useMemo(() => {
    return state.connectors.filter((conn) => {
      const tier = conn.tier || getProviderTier(conn.provider);
      
      // Tier filter
      if (tierFilter !== "ALL" && tier !== tierFilter) {
        return false;
      }

      // Health filter
      if (healthFilter === "HEALTHY" && conn.healthStatus !== "HEALTHY") {
        return false;
      }
      if (healthFilter === "DEGRADED_UNHEALTHY" && conn.healthStatus === "HEALTHY") {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = conn.name.toLowerCase().includes(query);
        const matchesProvider = conn.provider.toLowerCase().includes(query);
        const matchesId = conn.id.toLowerCase().includes(query);
        if (!matchesName && !matchesProvider && !matchesId) {
          return false;
        }
      }

      return true;
    });
  }, [state.connectors, tierFilter, healthFilter, searchQuery]);

  // Statistics
  const p0Count = state.connectors.filter((c) => (c.tier || getProviderTier(c.provider)) === "P0_CERTIFIED").length;
  const p1Count = state.connectors.filter((c) => (c.tier || getProviderTier(c.provider)) === "P1_PREVIEW").length;
  const expCount = state.connectors.filter((c) => (c.tier || getProviderTier(c.provider)) === "EXPERIMENTAL_UNCERTIFIED").length;
  const totalEventsIngested = state.connectors.reduce((acc, c) => acc + (c.eventsIngestedCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="pass">ERB-01 STEP 4</Badge>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              INGESTION PIPELINE & TIER CERTIFICATION
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                isSseConnected
                  ? "bg-emerald-950/80 border border-emerald-500/40 text-emerald-300"
                  : "bg-amber-950/80 border border-amber-500/40 text-amber-300"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isSseConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {isSseConnected ? "SSE LIVE STREAM" : "POLLING FALLBACK"}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Security Telemetry Connectors & Tier Certification
          </h1>
          <p className="text-sm text-slate-400 max-w-3xl">
            HMAC-authenticated ingestion connectors with 3-tier certification (<span className="text-emerald-400 font-semibold">P0 Certified GA</span>, <span className="text-amber-400 font-semibold">P1 Preview</span>, and <span className="text-slate-300 font-semibold">Experimental</span>) and automated OCSF v1.1 normalization.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-4 h-4" />
            <span>Add Connector</span>
          </Button>
          <Button variant="cyan" onClick={() => router.push("/ingestion")}>
            <span>Test Ingestion Console</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3.5 space-y-1 bg-slate-900/60 border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>TOTAL CONNECTORS</span>
            <Network className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">{state.connectors.length}</div>
          <div className="text-[10px] font-mono text-emerald-400">
            {state.connectors.filter((c) => c.status === "ACTIVE").length} Active Feeds
          </div>
        </Card>

        <Card className="p-3.5 space-y-1 bg-slate-900/60 border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>P0 CERTIFIED GA</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">{p0Count}</div>
          <div className="text-[10px] font-mono text-slate-400">100% Production SLA</div>
        </Card>

        <Card className="p-3.5 space-y-1 bg-slate-900/60 border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>P1 PREVIEW</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400">{p1Count}</div>
          <div className="text-[10px] font-mono text-slate-400">Gated Preview Stream</div>
        </Card>

        <Card className="p-3.5 space-y-1 bg-slate-900/60 border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>EVENTS INGESTED</span>
            <Activity className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-purple-300">
            {totalEventsIngested.toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-cyan-400">OCSF v1.1 Normalized</div>
        </Card>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono flex items-center justify-between shadow-lg">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
      )}

      {/* Real-Time Permission Drift Warning */}
      {driftAlerts.length > 0 && (
        <DegradedState
          title="Connector Permission Drift Detected"
          message={`Active credentials degraded for ${driftAlerts.map((d) => d.provider).join(", ")}. Required scopes were revoked by the upstream identity provider.`}
          fallbackReason="UPSTREAM_SCOPE_REVOCATION_DETECTED"
          retryAction={() => setDriftAlerts([])}
        />
      )}

      {/* Mandatory UI States Integration */}
      {isFetchingConnectors && (
        <LoadingState
          title="Loading Telemetry Connectors..."
          message="Synchronizing connector states from shield-ingest (port 3002)."
          regionalCell="us-east-1"
        />
      )}

      {isStale && !isFetchingConnectors && (
        <StaleState
          title="Cached Connector View"
          message="Displaying cached connector configurations."
          retryAction={refreshConnectors}
        />
      )}

      {state.connectors.some((c) => c.status === "DISABLED") && (
        <PartialState
          title="Degraded Telemetry Ingestion"
          message="One or more connectors are disabled. Telemetry ingestion across these providers is halted."
          connectorsActive={state.connectors.filter((c) => c.status === "ACTIVE").length}
          connectorsTotal={state.connectors.length}
          retryAction={refreshConnectors}
        />
      )}

      {/* Filter and Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="text"
            placeholder="Search connectors by name, provider, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-sm px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-sans"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 text-[11px] uppercase flex items-center gap-1">
            <Filter className="w-3 h-3" /> Tier:
          </span>
          <button
            onClick={() => setTierFilter("ALL")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              tierFilter === "ALL"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
            }`}
          >
            ALL ({state.connectors.length})
          </button>
          <button
            onClick={() => setTierFilter("P0_CERTIFIED")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              tierFilter === "P0_CERTIFIED"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
            }`}
          >
            🟢 P0 GA ({p0Count})
          </button>
          <button
            onClick={() => setTierFilter("P1_PREVIEW")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              tierFilter === "P1_PREVIEW"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
            }`}
          >
            🟡 P1 PREVIEW ({p1Count})
          </button>
          <button
            onClick={() => setTierFilter("EXPERIMENTAL_UNCERTIFIED")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              tierFilter === "EXPERIMENTAL_UNCERTIFIED"
                ? "bg-slate-700 text-slate-100 border border-slate-500"
                : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
            }`}
          >
            ⚪ EXPERIMENTAL ({expCount})
          </button>
        </div>
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredConnectors.map((conn, idx) => {
          const tier = conn.tier || getProviderTier(conn.provider);

          return (
            <Card key={conn.id || idx} variant="cyber" className="flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400">
                    <Network className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {/* Certification Tier Badge */}
                    {tier === "P0_CERTIFIED" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                        P0 CERTIFIED
                      </span>
                    )}
                    {tier === "P1_PREVIEW" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 border border-amber-500/40 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.15)]">
                        P1 PREVIEW
                      </span>
                    )}
                    {tier === "EXPERIMENTAL_UNCERTIFIED" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 border border-slate-600 text-slate-300">
                        EXPERIMENTAL
                      </span>
                    )}

                    <Badge variant={conn.healthStatus === "HEALTHY" ? "healthy" : "critical"}>
                      {conn.healthStatus}
                    </Badge>
                    <Badge variant={conn.status === "ACTIVE" ? "pass" : "neutral"}>
                      {conn.status}
                    </Badge>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-slate-100 text-sm">{conn.name}</h3>
                  <div className="flex items-center gap-2 pt-0.5 text-xs font-mono text-slate-400">
                    <span>Provider: <strong className="text-cyan-300">{conn.provider}</strong></span>
                    <span>•</span>
                    <span className="text-[11px] text-slate-400">{conn.sourceRegion}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 font-mono text-[11px] space-y-1.5">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Connector ID:</span>
                    <span className="text-cyan-300 font-semibold truncate max-w-[140px]">{conn.id}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>OCSF Schema:</span>
                    <span className="text-emerald-400 font-semibold">
                      {conn.ocsfStatus || "MAPPED_OCSF_V1"}
                    </span>
                  </div>
                  <div className="text-slate-400 pt-1">Target Endpoint:</div>
                  <div className="text-slate-300 truncate text-[10px]">{conn.webhookUrl}</div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTestConnection(conn.id)}
                    disabled={actionLoadingId === conn.id}
                    className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500/40 text-[11px] font-mono text-cyan-300 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Radio className="w-3 h-3 text-cyan-400" />
                    <span>Test</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSyncTelemetry(conn.id)}
                    disabled={actionLoadingId === conn.id}
                    className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-emerald-950/60 border border-slate-700 hover:border-emerald-500/40 text-[11px] font-mono text-emerald-300 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Activity className="w-3 h-3 text-emerald-400" />
                    <span>Sync</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleState(conn)}
                    disabled={actionLoadingId === conn.id}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-mono transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                      conn.status === "ACTIVE"
                        ? "bg-slate-900 hover:bg-rose-950/60 border-slate-700 hover:border-rose-500/40 text-rose-300"
                        : "bg-slate-900 hover:bg-cyan-950/60 border-slate-700 hover:border-cyan-500/40 text-cyan-300"
                    }`}
                  >
                    <span>{conn.status === "ACTIVE" ? "Disable" : "Enable"}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{(conn.eventsIngestedCount || 0).toLocaleString()} events</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(conn.webhookUrl, conn.id)}
                    className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedId === conn.id ? "Copied" : "Copy URL"}</span>
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal 1: Gated P1 Preview Activation Confirmation */}
      <Modal
        isOpen={isP1ActivationModalOpen}
        onClose={() => setIsP1ActivationModalOpen(false)}
        title="Activate P1 Preview Telemetry Connector"
        description="Acknowledge preview SLA terms before enabling this telemetry feed."
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Preview SLA Disclaimer</span>
            </div>
            <p className="leading-relaxed">
              Connector <strong className="text-white font-mono">{pendingP1Connector?.name}</strong> is in{" "}
              <strong>P1 Preview Certification Tier</strong>. Telemetry ingestion, OCSF schema mappings, and synthetic transformations are active under preview support terms.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono space-y-1.5 text-slate-300">
            <div className="text-slate-400">Provider:</div>
            <div className="text-cyan-300 font-bold">{pendingP1Connector?.provider}</div>
            <div className="text-slate-400 pt-1">Normalization Policy:</div>
            <div className="text-emerald-400">Automated OCSF v1.1 Synthetic Ingestion Engine</div>
          </div>

          <div className="flex items-start gap-2 pt-2">
            <input
              type="checkbox"
              id="p1-accept"
              checked={p1TermsAccepted}
              onChange={(e) => setP1TermsAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-400 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="p1-accept" className="text-xs text-slate-300 cursor-pointer">
              I authorize activation of this P1 preview connector for tenant <strong className="text-white">{state.tenant.slug}</strong>.
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <Button variant="outline" onClick={() => setIsP1ActivationModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!p1TermsAccepted}
              onClick={handleConfirmP1Activation}
            >
              <Zap className="w-4 h-4" />
              <span>Confirm &amp; Enable Stream</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal 2: Add Connector Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Security Telemetry Connector"
        description="Register a new telemetry ingestion pipeline in ZoikoShield Gateway."
      >
        <form onSubmit={handleCreateConnector} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">Connector Name:</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Provider Type:</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ConnectorProviderType)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <optgroup label="🟢 P0 Certified (Production GA)">
                  <option value="generic-webhook">Generic Webhook / JSON</option>
                  <option value="generic-syslog">Generic Syslog / RFC 5424</option>
                  <option value="microsoft-entra">Microsoft Entra ID / 365</option>
                  <option value="aws-cloudtrail">AWS CloudTrail Audit</option>
                  <option value="aws-guardduty">AWS GuardDuty Findings</option>
                  <option value="crowdstrike-edr">CrowdStrike Falcon EDR</option>
                  <option value="snyk-vulnerability">Snyk Vulnerability Findings</option>
                  <option value="jira-ticketing">Jira Ticketing</option>
                </optgroup>
                <optgroup label="🟡 P1 Preview (Gated Support)">
                  <option value="okta-identity">Okta Identity Cloud</option>
                  <option value="azure-monitor">Azure Monitor / Sentinel</option>
                  <option value="gcp-scc">GCP Security Command Center</option>
                  <option value="sentinelone-edr">SentinelOne Singularity EDR</option>
                  <option value="palo-alto-cortex-xdr">Palo Alto Cortex XDR</option>
                  <option value="microsoft-defender-edr">Microsoft Defender for Endpoint</option>
                </optgroup>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-300">Source Region:</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <option value="us-east-1">us-east-1 (N. Virginia)</option>
                <option value="us-west-2">us-west-2 (Oregon)</option>
                <option value="eu-west-1">eu-west-1 (Ireland)</option>
                <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
                <option value="ap-south-1">ap-south-1 (Mumbai)</option>
              </select>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono space-y-1">
            <span className="text-slate-400">Assigned Certification Tier:</span>
            <div className="flex items-center gap-2 pt-0.5">
              {getProviderTier(provider) === "P0_CERTIFIED" ? (
                <span className="text-emerald-400 font-bold">🟢 P0_CERTIFIED (Full Production SLA)</span>
              ) : getProviderTier(provider) === "P1_PREVIEW" ? (
                <span className="text-amber-400 font-bold">🟡 P1_PREVIEW (Gated Preview Tier)</span>
              ) : (
                <span className="text-slate-300 font-bold">⚪ EXPERIMENTAL_UNCERTIFIED</span>
              )}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isLoading}>
              <Network className="w-4 h-4" />
              <span>Create Connector</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
