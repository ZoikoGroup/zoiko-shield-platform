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
  const [state] = useDemoState();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState("Custom AWS GuardDuty Telemetry");
  const [provider, setProvider] = useState<ConnectorProviderType>("generic-webhook");
  const [region, setRegion] = useState("us-east-1");
  const [isLoading, setIsLoading] = useState(false);
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
            Configure HMAC-authenticated ingestion connectors (`generic-webhook`, `generic-syslog`, `microsoft-entra`, `aws-cloudtrail`, `azure-monitor`, `crowdstrike-edr`).
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
                  <Badge variant="healthy">{conn.healthStatus}</Badge>
                  <Badge variant="pass">{conn.status}</Badge>
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

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>{conn.eventsIngestedCount.toLocaleString()} events</span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(conn.webhookUrl, conn.id)}
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
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
        description="Register a new telemetry ingestion pipeline in shield-ingest (:3002)."
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
                <option value="microsoft-entra">Microsoft Entra ID / Graph</option>
                <option value="aws-cloudtrail">AWS CloudTrail / GuardDuty</option>
                <option value="azure-monitor">Azure Monitor / Sentinel</option>
                <option value="crowdstrike-edr">CrowdStrike Falcon EDR</option>
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
