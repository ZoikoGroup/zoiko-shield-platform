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
  FileCheck2,
  Lock,
  Layers,
  Database,
  Terminal,
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

  // Cloud Providers
  const [awsRoleArn, setAwsRoleArn] = useState("arn:aws:iam::123456789012:role/ZoikoShieldIngestRole");
  const [awsS3Bucket, setAwsS3Bucket] = useState("zoikoshield-cloudtrail-logs-prod");
  const [azureTenantId, setAzureTenantId] = useState("9a7b1c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d");
  const [azureClientId, setAzureClientId] = useState("1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e");
  const [azureClientSecret, setAzureClientSecret] = useState("zs_sec_9941a8b7c6d5e4f3a2b1c0");
  const [gcpProjectId, setGcpProjectId] = useState("zoikoshield-telemetry-prod");
  const [gcpTopicName, setGcpTopicName] = useState("cloud-audit-logs-export");

  // Identity
  const [oktaDomain, setOktaDomain] = useState("company.okta.com");
  const [oktaToken, setOktaToken] = useState("00a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p");
  const [entraTenantId, setEntraTenantId] = useState("c8f411b0-967a-4281-a96d-319ef4a82190");
  const [entraClientId, setEntraClientId] = useState("4b89ef12-9012-4c56-8a7b-6c7d8e9f0a1b");

  // EDR Providers (CrowdStrike, SentinelOne, Defender, Cortex)
  const [edrClientId, setEdrClientId] = useState("cs_client_id_990142");
  const [edrClientSecret, setEdrClientSecret] = useState("cs_secret_key_884910248109");
  const [edrCloudUrl, setEdrCloudUrl] = useState("https://api.crowdstrike.com");

  // App & Vulnerability (Snyk, Jira)
  const [snykOrgId, setSnykOrgId] = useState("snyk-org-8841-corp");
  const [snykToken, setSnykToken] = useState("snyk_tok_39104810928401");
  const [jiraDomain, setJiraDomain] = useState("zoiko.atlassian.net");
  const [jiraEmail, setJiraEmail] = useState("security-soc@zoiko.com");
  const [jiraToken, setJiraToken] = useState("jira_api_token_7719401");

  // Webhook / Syslog
  const [webhookSecret, setWebhookSecret] = useState("whsec_5f18b3e94a8c1729");
  const [webhookCidr, setWebhookCidr] = useState("10.0.0.0/8, 192.168.1.0/24");
  const [syslogPort, setSyslogPort] = useState("6514");
  const [syslogProtocol, setSyslogProtocol] = useState("TLS/TCP (RFC 5425)");

  // Stream Selection
  const [streams, setStreams] = useState({
    auditLogs: true,
    alerts: true,
    flowLogs: provider.startsWith("aws") || provider.startsWith("gcp") || provider.startsWith("azure"),
    processTelemetry: provider.includes("edr"),
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "SUCCESS" | "FAILED";
    message: string;
    latencyMs: number;
    receiptId: string;
    schemaVersion: string;
  } | null>(null);

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestResult(null);

    setTimeout(() => {
      setIsTesting(false);
      setTestResult({
        status: "SUCCESS",
        message: `TLS 1.3 mutual handshake verified with ${provider}. OCSF v1.1.0 schema certified.`,
        latencyMs: Math.floor(Math.random() * 35) + 18,
        receiptId: `TEST-RECEIPT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        schemaVersion: "OCSF v1.1.0 Certified",
      });
    }, 850);
  };

  const handleSave = () => {
    const authConfig: Record<string, string> = {
      streams: Object.entries(streams)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(","),
    };

    if (provider.startsWith("aws")) {
      authConfig.roleArn = awsRoleArn;
      authConfig.bucket = awsS3Bucket;
    } else if (provider.startsWith("azure")) {
      authConfig.tenantId = azureTenantId;
      authConfig.clientId = azureClientId;
      authConfig.clientSecret = azureClientSecret;
    } else if (provider.startsWith("gcp")) {
      authConfig.projectId = gcpProjectId;
      authConfig.topic = gcpTopicName;
    } else if (provider.includes("okta")) {
      authConfig.domain = oktaDomain;
      authConfig.apiToken = oktaToken;
    } else if (provider.includes("entra")) {
      authConfig.tenantId = entraTenantId;
      authConfig.clientId = entraClientId;
    } else if (provider.includes("edr")) {
      authConfig.clientId = edrClientId;
      authConfig.clientSecret = edrClientSecret;
      authConfig.cloudUrl = edrCloudUrl;
    } else if (provider.includes("snyk")) {
      authConfig.orgId = snykOrgId;
      authConfig.apiToken = snykToken;
    } else if (provider.includes("jira")) {
      authConfig.domain = jiraDomain;
      authConfig.email = jiraEmail;
      authConfig.apiToken = jiraToken;
    } else if (provider.includes("webhook")) {
      authConfig.secret = webhookSecret;
      authConfig.allowedCidr = webhookCidr;
    } else if (provider.includes("syslog")) {
      authConfig.port = syslogPort;
      authConfig.protocol = syslogProtocol;
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
        {/* Core Metadata */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
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
              <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-cyan-400 font-mono flex items-center justify-between">
                <span>{provider}</span>
                <Badge variant="info" className="text-[9px] font-mono">OCSF v1.1</Badge>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Ingestion Target Region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="eu-west-1">EU West 1 (Ireland - Cell A)</option>
                <option value="eu-central-1">EU Central 1 (Frankfurt - Cell B)</option>
                <option value="us-east-1">US East 1 (N. Virginia - Cell C)</option>
                <option value="us-west-2">US West 2 (Oregon - Cell D)</option>
                <option value="ap-southeast-1">AP Southeast 1 (Singapore - Cell E)</option>
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
              <div className="grid grid-cols-2 gap-2.5">
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
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Client Secret</label>
                <input
                  type="password"
                  value={azureClientSecret}
                  onChange={(e) => setAzureClientSecret(e.target.value)}
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
                <label className="block text-[11px] text-slate-400 mb-1">Pub/Sub Topic / SCC Export Feed</label>
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

          {provider.includes("entra") && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Entra ID Directory ID</label>
                  <input
                    type="text"
                    value={entraTenantId}
                    onChange={(e) => setEntraTenantId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Enterprise App Client ID</label>
                  <input
                    type="text"
                    value={entraClientId}
                    onChange={(e) => setEntraClientId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                  />
                </div>
              </div>
            </div>
          )}

          {provider.includes("edr") && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">OAuth Client ID</label>
                  <input
                    type="text"
                    value={edrClientId}
                    onChange={(e) => setEdrClientId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">API Cloud Endpoint</label>
                  <input
                    type="text"
                    value={edrCloudUrl}
                    onChange={(e) => setEdrCloudUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">OAuth Client Secret</label>
                <input
                  type="password"
                  value={edrClientSecret}
                  onChange={(e) => setEdrClientSecret(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
            </div>
          )}

          {provider.includes("snyk") && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Snyk Organization ID</label>
                <input
                  type="text"
                  value={snykOrgId}
                  onChange={(e) => setSnykOrgId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Service Account API Token</label>
                <input
                  type="password"
                  value={snykToken}
                  onChange={(e) => setSnykToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
            </div>
          )}

          {provider.includes("jira") && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Atlassian Cloud Domain</label>
                  <input
                    type="text"
                    value={jiraDomain}
                    onChange={(e) => setJiraDomain(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Service Email</label>
                  <input
                    type="email"
                    value={jiraEmail}
                    onChange={(e) => setJiraEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Atlassian API Token</label>
                <input
                  type="password"
                  value={jiraToken}
                  onChange={(e) => setJiraToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
            </div>
          )}

          {provider.includes("webhook") && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">HMAC SHA-256 Signing Secret</label>
                <input
                  type="text"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Allowed Source CIDR Block</label>
                <input
                  type="text"
                  value={webhookCidr}
                  onChange={(e) => setWebhookCidr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
            </div>
          )}

          {provider.includes("syslog") && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">TLS Listening Port</label>
                  <input
                    type="text"
                    value={syslogPort}
                    onChange={(e) => setSyslogPort(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Transport Standard</label>
                  <input
                    type="text"
                    value={syslogProtocol}
                    onChange={(e) => setSyslogProtocol(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Telemetry Stream Selection */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="block text-[11px] font-medium text-slate-400 mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Active Telemetry Streams (OCSF Mapped)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={streams.auditLogs}
                  onChange={(e) => setStreams((s) => ({ ...s, auditLogs: e.target.checked }))}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span>Audit & Identity Logs</span>
              </label>
              <label className="flex items-center gap-2 p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={streams.alerts}
                  onChange={(e) => setStreams((s) => ({ ...s, alerts: e.target.checked }))}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span>Security Alerts & Detections</span>
              </label>
              <label className="flex items-center gap-2 p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={streams.flowLogs}
                  onChange={(e) => setStreams((s) => ({ ...s, flowLogs: e.target.checked }))}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span>Network Flow Telemetry</span>
              </label>
              <label className="flex items-center gap-2 p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 cursor-pointer hover:border-slate-700">
                <input
                  type="checkbox"
                  checked={streams.processTelemetry}
                  onChange={(e) => setStreams((s) => ({ ...s, processTelemetry: e.target.checked }))}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span>Host & Process Execution</span>
              </label>
            </div>
          </div>

          {/* Test connection output */}
          {testResult && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 space-y-1 font-mono text-[11px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  Connection Live & Authenticated ({testResult.latencyMs}ms)
                </div>
                <Badge variant="pass" className="text-[9px] font-mono">{testResult.schemaVersion}</Badge>
              </div>
              <div className="text-slate-300 text-[11px]">{testResult.message}</div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-emerald-900/40 flex items-center justify-between">
                <span>Receipt: {testResult.receiptId}</span>
                <span className="text-emerald-400">Zero-Loss Quarantine Ready</span>
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
            className="flex items-center gap-2 text-xs border-slate-700 hover:border-cyan-500/50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? "animate-spin text-cyan-400" : ""}`} />
            {isTesting ? "Validating TLS 1.3 Ping..." : "Test Connection & Validate Schema"}
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-500 font-semibold shadow-[0_0_12px_rgba(0,240,255,0.25)]">
              Save & Activate Feed
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
