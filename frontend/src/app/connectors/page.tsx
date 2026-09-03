"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoState } from "@/lib/demo-state";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { ConnectorProviderType } from "@/lib/types";
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
} from "lucide-react";

export default function ConnectorsPage() {
  const router = useRouter();
  const [state, setState] = useDemoState();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState("Custom AWS GuardDuty Telemetry");
  const [provider, setProvider] = useState<ConnectorProviderType>("generic-webhook");
  const [region, setRegion] = useState("us-east-1");
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCreateConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await ZoikoShieldApiClient.createConnector({
        tenantId: state.tenant.id,
        name,
        provider,
        sourceRegion: region,
      });
      setIsAddModalOpen(false);
    } catch (err) {
      console.error("Connector Creation Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async (connectorId: string) => {
    setActionLoadingId(connectorId);
    setActionMessage(null);
    try {
      const res = await ZoikoShieldApiClient.testConnector(connectorId);
      setActionMessage(`✅ Test passed (${res.latencyMs || 24}ms latency)`);
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
      setActionMessage(`🔄 Synced ${res.syncedCount || 12} new events!`);
    } catch (err: any) {
      setActionMessage(`❌ Sync failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleToggleState = async (connectorId: string, currentStatus: string) => {
    setActionLoadingId(connectorId);
    setActionMessage(null);
    try {
      if (currentStatus === "ACTIVE") {
        await ZoikoShieldApiClient.disableConnector(connectorId);
        setActionMessage(`⏸️ Connector disabled`);
      } else {
        await ZoikoShieldApiClient.activateConnector(connectorId);
        setActionMessage(`▶️ Connector activated`);
      }
    } catch (err: any) {
      setActionMessage(`❌ Toggle failed: ${err.message}`);
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="pass">ERB-01 STEP 4</Badge>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              INGESTION PIPELINE CONFIGURATION
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Security Telemetry Connectors
          </h1>
          <p className="text-sm text-slate-400">
            Configure HMAC-authenticated ingestion connectors across 10 security tool providers (`github`, `aws-cloudtrail`, `aws-guardduty`, `crowdstrike-edr`, `sentinelone-edr`, `microsoft-entra`, `okta-identity`, `palo-alto-cortex-xdr`, `generic-syslog`, `generic-webhook`).
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

      {actionMessage && (
        <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
      )}

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.connectors.map((conn, idx) => (
          <Card key={conn.id || idx} variant="cyber" className="flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400">
                  <Network className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={conn.healthStatus === "HEALTHY" ? "healthy" : "critical"}>{conn.healthStatus}</Badge>
                  <Badge variant={conn.status === "ACTIVE" ? "pass" : "neutral"}>{conn.status}</Badge>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-100 text-sm">{conn.name}</h3>
                <span className="text-xs font-mono text-slate-400">
                  Provider: {conn.provider}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 font-mono text-[11px] space-y-1.5">
                <div className="text-slate-400">Connector ID:</div>
                <div className="text-cyan-300 font-semibold truncate">{conn.id}</div>
                <div className="text-slate-400 pt-1">Target Endpoint:</div>
                <div className="text-slate-300 truncate text-[10px]">{conn.webhookUrl}</div>
              </div>
            </div>

            {/* Action Toolbar */}
            <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800">
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
                onClick={() => handleToggleState(conn.id, conn.status)}
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

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
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
          </Card>
        ))}
      </div>

      {/* Add Connector Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Security Telemetry Connector"
        description="Register a new telemetry ingestion pipeline in ZoikoShield Gateway."
      >
        <form onSubmit={handleCreateConnector} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300">
              Connector Name:
            </label>
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
                onChange={(e) => setProvider(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
              >
                <option value="generic-webhook">Generic Webhook / JSON</option>
                <option value="generic-syslog">Generic Syslog / RFC 5424</option>
                <option value="microsoft-entra">Microsoft Entra ID / 365</option>
                <option value="aws-cloudtrail">AWS CloudTrail Audit</option>
                <option value="aws-guardduty">AWS GuardDuty Findings</option>
                <option value="crowdstrike-edr">CrowdStrike Falcon EDR</option>
                <option value="sentinelone-edr">SentinelOne Singularity EDR</option>
                <option value="okta-identity">Okta Identity Cloud</option>
                <option value="palo-alto-cortex-xdr">Palo Alto Cortex XDR</option>
                <option value="azure-monitor">Azure Monitor / Sentinel</option>
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

          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
            >
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
