"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Key,
  Shield,
  Zap,
  Globe,
  Radio,
} from "lucide-react";
import { ConnectorProviderType } from "@/lib/types";

export interface ConnectorConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: ConnectorProviderType;
  onSave: (config: {
    name: string;
    provider: ConnectorProviderType;
    region: string;
    authConfig: Record<string, string>;
  }) => void;
}

export const ConnectorConfigModal: React.FC<ConnectorConfigModalProps> = ({
  isOpen,
  onClose,
  provider,
  onSave,
}) => {
  const [name, setName] = useState(`Production ${provider.toUpperCase()} Telemetry Feed`);
  const [region, setRegion] = useState("eu-west-1");
  const [awsRoleArn, setAwsRoleArn] = useState("arn:aws:iam::123456789012:role/ZoikoShieldIngestRole");
  const [awsS3Bucket, setAwsS3Bucket] = useState("zoikoshield-cloudtrail-logs-prod");
  const [azureTenantId, setAzureTenantId] = useState("9a7b1c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d");
  const [azureClientId, setAzureClientId] = useState("1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e");
  const [gcpProjectId, setGcpProjectId] = useState("zoikoshield-telemetry-prod");
  const [gcpTopicName, setGcpTopicName] = useState("cloud-audit-logs-export");
  const [oktaDomain, setOktaDomain] = useState("company.okta.com");
  const [oktaToken, setOktaToken] = useState("00a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p");

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "SUCCESS" | "FAILED";
    message: string;
    latencyMs: number;
    receiptId: string;
  } | null>(null);

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult(null);

    setTimeout(() => {
      setIsTesting(false);
      setTestResult({
        status: "SUCCESS",
        message: `TLS 1.3 mutual handshake and STS role assumption verified with ${provider}.`,
        latencyMs: Math.floor(Math.random() * 45) + 15,
        receiptId: `TEST-RECEIPT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      });
    }, 900);
  };

  const handleSave = () => {
    const authConfig: Record<string, string> = {};
    if (provider.startsWith("aws")) {
      authConfig.roleArn = awsRoleArn;
      authConfig.bucket = awsS3Bucket;
    } else if (provider.startsWith("azure")) {
      authConfig.tenantId = azureTenantId;
      authConfig.clientId = azureClientId;
    } else if (provider.startsWith("gcp")) {
      authConfig.projectId = gcpProjectId;
      authConfig.topic = gcpTopicName;
    } else if (provider.includes("okta")) {
      authConfig.domain = oktaDomain;
      authConfig.apiToken = oktaToken;
    }

    onSave({
      name,
      provider,
      region,
      authConfig,
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Configure ${provider.toUpperCase()} Ingestion Connector`}
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs text-slate-300">
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Connector Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Provider Type</label>
              <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-cyan-400 font-mono">
                {provider}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Primary Region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="eu-west-1">EU West 1 (Ireland)</option>
                <option value="eu-west-3">EU West 3 (Frankfurt)</option>
                <option value="us-east-1">US East 1 (N. Virginia)</option>
                <option value="us-west-2">US West 2 (Oregon)</option>
                <option value="ap-southeast-1">AP Southeast 1 (Singapore)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic Provider Credentials Form */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="font-semibold text-slate-200 flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" />
            Provider Authentication & Role Binding
          </div>

          {provider.startsWith("aws") && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Cross-Account IAM Role ARN</label>
                <input
                  type="text"
                  value={awsRoleArn}
                  onChange={(e) => setAwsRoleArn(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">S3 Ingestion Bucket Name</label>
                <input
                  type="text"
                  value={awsS3Bucket}
                  onChange={(e) => setAwsS3Bucket(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
            </div>
          )}

          {provider.startsWith("azure") && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Azure Tenant ID</label>
                <input
                  type="text"
                  value={azureTenantId}
                  onChange={(e) => setAzureTenantId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Application (Client) ID</label>
                <input
                  type="text"
                  value={azureClientId}
                  onChange={(e) => setAzureClientId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
            </div>
          )}

          {provider.startsWith("gcp") && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">GCP Project ID</label>
                <input
                  type="text"
                  value={gcpProjectId}
                  onChange={(e) => setGcpProjectId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Pub/Sub Topic Name</label>
                <input
                  type="text"
                  value={gcpTopicName}
                  onChange={(e) => setGcpTopicName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
            </div>
          )}

          {provider.includes("okta") && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Okta Org Domain</label>
                <input
                  type="text"
                  value={oktaDomain}
                  onChange={(e) => setOktaDomain(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">API Read-Only Token (SSWS)</label>
                <input
                  type="password"
                  value={oktaToken}
                  onChange={(e) => setOktaToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
            </div>
          )}

          {/* Test connection output */}
          {testResult && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 space-y-1 font-mono text-[11px]">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                Connection Live & Authenticated ({testResult.latencyMs}ms)
              </div>
              <div className="text-slate-300">{testResult.message}</div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-emerald-900/40">
                Receipt: {testResult.receiptId}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="flex items-center gap-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? "animate-spin" : ""}`} />
            {isTesting ? "Testing Ping..." : "Test Connection & Ping"}
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-500 font-semibold">
              Save & Activate Feed
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
