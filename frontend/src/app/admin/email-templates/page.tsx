"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { backend, asList, BackendError } from "@/lib/backend";
import { Card } from "@/ui/Card";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import { 
  Mail, 
  Send, 
  Search, 
  Eye, 
  Shield, 
  Smartphone, 
  Monitor, 
  Moon, 
  Sun, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw,
  Copy,
  Hash,
  KeyRound,
  ExternalLink
} from "lucide-react";
import { LoadingState } from "@/components/states/mandatory-ui-states";

export interface TemplateDomain {
  id: string;
  code: string;
  name: string;
  count: number;
}

export interface TemplateItem {
  id: string;
  domainId: string;
  domainName: string;
  category: string;
  name: string;
  gate: "P0" | "P1" | "P2" | "C";
  senderClass: string;
  subject: string;
  preheader: string;
  buttonText: string;
  requiredVariables: string[];
}

export interface RenderedEmailOutput {
  templateId: string;
  subject: string;
  preheader: string;
  senderClass: string;
  gate: "P0" | "P1" | "P2" | "C";
  htmlBody: string;
  plainTextBody: string;
  renderHash: string;
  buttonText: string;
  ctaUrl: string;
  securityFooter: string;
  operationalFooter: string;
}

const DOMAINS: TemplateDomain[] = [
  { id: "4.1", code: "IAM", name: "Identity, Auth & Access", count: 23 },
  { id: "4.2", code: "ORG", name: "Organization & Onboarding", count: 13 },
  { id: "4.3", code: "CONN", name: "Connectors & Telemetry", count: 15 },
  { id: "4.4", code: "SEC", name: "Detection, Alerts & Casework", count: 19 },
  { id: "4.5", code: "ACT", name: "Governed Actions & Approvals", count: 13 },
  { id: "4.6", code: "ASSURE", name: "Assurance, Controls & Risk", count: 21 },
  { id: "4.7", code: "EVID", name: "Evidence Ledger & Audits", count: 14 },
  { id: "4.8", code: "AI", name: "AI Governance & Controlled AI", count: 12 },
  { id: "4.9", code: "DEV", name: "API, Webhooks & Dev Ops", count: 11 },
  { id: "4.10", code: "BILL", name: "Commercial, Billing & SLA", count: 18 },
  { id: "4.11", code: "SUP", name: "Support & Customer Success", count: 10 },
  { id: "4.12", code: "PRIV", name: "Privacy, Data Rights & Holds", count: 11 },
  { id: "4.13", code: "OFF", name: "Tenant Offboarding & Deletion", count: 8 },
  { id: "4.14", code: "STAT", name: "Service Status & Reliability", count: 10 },
  { id: "4.15", code: "OPS", name: "Internal Security & SRE Ops", count: 20 },
  { id: "4.16", code: "GOV", name: "Governance & Admin Notices", count: 8 },
];

export default function EmailTemplateStudioPage() {
  const [selectedDomain, setSelectedDomain] = useState<string>("IAM");
  const [searchQuery, setSearchQuery] = useState("");
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("ZS-EML-IAM-001");
  const [previewOutput, setPreviewOutput] = useState<RenderedEmailOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testRecipient, setTestRecipient] = useState("operator@zoikoshield.corp");
  const [testSentMessage, setTestSentMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [colorScheme, setColorScheme] = useState<"dark" | "light">("dark");
  const [formatTab, setFormatTab] = useState<"html" | "plaintext" | "variables">("html");

  // Custom variable state
  const [vars, setVars] = useState({
    recipientFirstName: "Sarah",
    organizationName: "Sovereign Financial Holdings",
    referenceId: "REF-2026-8941",
    statusLabel: "VERIFIED_ACTIVE",
    occurredAtLocal: "2026-10-06 11:30:00",
    timezone: "UTC+0",
    actionUrl: "https://app.zoikoshield.com/actions",
  });

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await backend.get<{ domains: TemplateDomain[]; totalCount: number; templates: TemplateItem[] }>(
        "/api/v1/notifications/templates",
      );
      if (res && res.templates) {
        setTemplates(res.templates);
      }
    } catch {
      // Fallback local bootstrap if network unavailable
      const fallbackList: TemplateItem[] = DOMAINS.flatMap((d) =>
        Array.from({ length: d.count }, (_, i) => {
          const numStr = String(i + 1).padStart(3, "0");
          const code = `ZS-EML-${d.code}-${numStr}`;
          return {
            id: code,
            domainId: d.id,
            domainName: d.name,
            category: d.code,
            name: `${d.name} Event #${i + 1}`,
            gate: i <= 2 || d.code === "SEC" || d.code === "ACT" ? ("P0" as const) : ("P1" as const),
            senderClass: d.code === "OPS" ? "internal_ops_sender" : `${d.code.toLowerCase()}_sender`,
            subject: `Zoiko Shield — ${d.name} Notice`,
            preheader: "A governed state change was recorded in Zoiko Shield.",
            buttonText: "Review action",
            requiredVariables: ["recipientFirstName", "referenceId", "statusLabel"],
          };
        }),
      );
      setTemplates(fallbackList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const loadPreview = useCallback(async (templateId: string, customVars: typeof vars) => {
    setRendering(true);
    setTestSentMessage(null);
    try {
      const res = await backend.post<RenderedEmailOutput>(
        `/api/v1/notifications/templates/${templateId}/preview`,
        customVars,
      );
      if (res) {
        setPreviewOutput(res);
      }
    } catch (err) {
      console.error("Preview error", err);
    } finally {
      setRendering(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      void loadPreview(selectedTemplateId, vars);
    }
  }, [selectedTemplateId, vars, loadPreview]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesDomain = selectedDomain === "ALL" || t.category === selectedDomain;
      const matchesSearch =
        searchQuery === "" ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.subject.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesDomain && matchesSearch;
    });
  }, [templates, selectedDomain, searchQuery]);

  const currentTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || filteredTemplates[0];
  }, [templates, selectedTemplateId, filteredTemplates]);

  const handleSendTest = async () => {
    setSendingTest(true);
    setTestSentMessage(null);
    try {
      const res = await backend.post<{ status: string; renderHash: string; deliveryId: string }>(
        `/api/v1/notifications/templates/${selectedTemplateId}/send-test`,
        {
          recipientEmail: testRecipient,
          variables: vars,
        },
      );
      setTestSentMessage(
        `Dispatched successfully to ${testRecipient}! Delivery ID: ${res?.deliveryId || "del-verified"} (Render Hash: ${res?.renderHash?.slice(0, 16)}...)`,
      );
    } catch (err) {
      setTestSentMessage(
        `Dispatch error: ${err instanceof BackendError ? err.message : String(err)}`,
      );
    } finally {
      setSendingTest(false);
    }
  };

  const handleInjectSecretTest = () => {
    setVars((prev) => ({
      ...prev,
      statusLabel: "FAILED_BEARER_TOKEN_LEAK_TEST bearer eyJhbGciOi...",
    }));
  };

  const handleResetVars = () => {
    setVars({
      recipientFirstName: "Sarah",
      organizationName: "Sovereign Financial Holdings",
      referenceId: "REF-2026-8941",
      statusLabel: "VERIFIED_ACTIVE",
      occurredAtLocal: "2026-10-06 11:30:00",
      timezone: "UTC+0",
      actionUrl: "https://app.zoikoshield.com/actions",
    });
  };

  if (loading) return <LoadingState message="Loading 226 Production Email Templates (ZS-EML-TPL-001)..." />;

  return (
    <div className="space-y-6 p-6 min-h-screen bg-slate-950 text-slate-100">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Production Email Template Studio
                </h1>
                <Badge variant="pass">ZS-EML-TPL-001 v2.0</Badge>
                <Badge variant="neutral">226 Templates</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Engineering Specification Baseline • Fail-Closed Variable Validation • Mandatory Security Footers
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetVars}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset Variables
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleInjectSecretTest}
            className="text-xs flex items-center gap-1.5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            title="Test Security Release Gate: injecting secrets must fail closed"
          >
            <KeyRound className="w-3.5 h-3.5" /> Test Secret Gate
          </Button>
        </div>
      </div>

      {/* Domain Category Selector */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
        <button
          onClick={() => setSelectedDomain("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
            selectedDomain === "ALL"
              ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
              : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
          }`}
        >
          All Domains (226)
        </button>
        {DOMAINS.map((domain) => (
          <button
            key={domain.code}
            onClick={() => setSelectedDomain(domain.code)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
              selectedDomain === domain.code
                ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
                : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <span>{domain.code}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800/80 text-slate-300">
              {domain.count}
            </span>
          </button>
        ))}
      </div>

      {/* Main 3-Column Studio Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Template List (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search 226 templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="space-y-1.5 max-h-[750px] overflow-y-auto pr-1">
            {filteredTemplates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              return (
                <button
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                    isSelected
                      ? "bg-sky-950/40 border-sky-500/50 shadow-sm"
                      : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-[11px] font-semibold text-sky-400">
                      {tpl.id}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        tpl.gate === "P0"
                          ? "bg-red-500/20 text-red-300 border border-red-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {tpl.gate}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-slate-200 line-clamp-1">
                    {tpl.name}
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                    {tpl.subject}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center/Right Column: Live Visualizer & Variable Inspector (9 cols) */}
        <div className="lg:col-span-9 space-y-4">
          {/* Top Bar: Template Metadata & Format Toggle */}
          <Card className="p-4 bg-slate-900/70 border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-sky-400">
                    {currentTemplate?.id}
                  </span>
                  <Badge variant={currentTemplate?.gate === "P0" ? "fail" : "neutral"}>
                    GATE {currentTemplate?.gate}
                  </Badge>
                  <Badge variant="neutral">{currentTemplate?.senderClass}</Badge>
                </div>
                <h3 className="text-sm font-semibold text-slate-100 mt-1">
                  {currentTemplate?.name}
                </h3>
              </div>

              {/* Viewport, Theme & Format Tabs */}
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800">
                  <button
                    onClick={() => setFormatTab("html")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      formatTab === "html" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    HTML
                  </button>
                  <button
                    onClick={() => setFormatTab("plaintext")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      formatTab === "plaintext" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Plain Text
                  </button>
                  <button
                    onClick={() => setFormatTab("variables")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      formatTab === "variables" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Variables Form
                  </button>
                </div>

                {formatTab === "html" && (
                  <>
                    <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800">
                      <button
                        onClick={() => setViewMode("desktop")}
                        className={`p-1.5 rounded transition-all ${
                          viewMode === "desktop" ? "bg-slate-800 text-sky-400" : "text-slate-500"
                        }`}
                        title="Desktop Preview (600px)"
                      >
                        <Monitor className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setViewMode("mobile")}
                        className={`p-1.5 rounded transition-all ${
                          viewMode === "mobile" ? "bg-slate-800 text-sky-400" : "text-slate-500"
                        }`}
                        title="Mobile Preview (380px)"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => setColorScheme((prev) => (prev === "dark" ? "light" : "dark"))}
                      className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                      title="Toggle Dark / Light Simulation"
                    >
                      {colorScheme === "dark" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* Tab 1: HTML Visualizer */}
          {formatTab === "html" && (
            <div className="flex justify-center bg-slate-950/80 p-6 rounded-xl border border-slate-800/80 min-h-[500px]">
              <div
                style={{
                  width: viewMode === "desktop" ? "600px" : "380px",
                  transition: "width 0.2s ease-in-out",
                }}
                className="overflow-hidden rounded-xl shadow-2xl border border-slate-800"
              >
                {previewOutput ? (
                  <iframe
                    title="Email Preview"
                    srcDoc={previewOutput.htmlBody}
                    className="w-full min-h-[620px] bg-transparent border-0"
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 text-xs text-slate-500">
                    Generating rendered HTML...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Plain Text Parity View */}
          {formatTab === "plaintext" && (
            <Card className="p-4 bg-slate-900 border-slate-800">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-sky-400" /> Plain-Text WCAG 2.2 AA Parity Contract
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (previewOutput) {
                      navigator.clipboard.writeText(previewOutput.plainTextBody);
                    }
                  }}
                  className="text-xs flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy Text
                </Button>
              </div>
              <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed max-h-[550px] overflow-y-auto">
                {previewOutput?.plainTextBody || "Generating plaintext..."}
              </pre>
            </Card>
          )}

          {/* Tab 3: Variable Form Inspector */}
          {formatTab === "variables" && (
            <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
              <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Safe Variables Payload Inspector
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Recipient First Name</label>
                  <input
                    type="text"
                    value={vars.recipientFirstName}
                    onChange={(e) => setVars({ ...vars, recipientFirstName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Organization Name</label>
                  <input
                    type="text"
                    value={vars.organizationName}
                    onChange={(e) => setVars({ ...vars, organizationName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Reference ID (e.g. Incident/Case)</label>
                  <input
                    type="text"
                    value={vars.referenceId}
                    onChange={(e) => setVars({ ...vars, referenceId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Status Label (Allowlisted Enum)</label>
                  <input
                    type="text"
                    value={vars.statusLabel}
                    onChange={(e) => setVars({ ...vars, statusLabel: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Occurred At (Local Format)</label>
                  <input
                    type="text"
                    value={vars.occurredAtLocal}
                    onChange={(e) => setVars({ ...vars, occurredAtLocal: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Timezone</label>
                  <input
                    type="text"
                    value={vars.timezone}
                    onChange={(e) => setVars({ ...vars, timezone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-slate-400 mb-1">Target Action CTA URL (Allowlisted HTTPS)</label>
                  <input
                    type="text"
                    value={vars.actionUrl}
                    onChange={(e) => setVars({ ...vars, actionUrl: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Bottom Bar: Test Dispatcher & Audit Hash Fingerprint */}
          <Card className="p-4 bg-slate-900 border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Hash className="w-4 h-4 text-slate-500" />
                <div className="text-xs font-mono text-slate-400">
                  <span className="text-slate-500">Audit Hash:</span>{" "}
                  <span className="text-sky-300">
                    {previewOutput?.renderHash || "SHA-256 (computing...)"}
                  </span>
                </div>
              </div>

              {/* Send Test Dispatch Controls */}
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="operator@zoikoshield.corp"
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 w-56"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSendTest}
                  disabled={sendingTest}
                  className="text-xs flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingTest ? "Dispatching..." : "Send Test"}
                </Button>
              </div>
            </div>

            {testSentMessage && (
              <div
                className={`mt-3 p-2.5 rounded text-xs flex items-center gap-2 ${
                  testSentMessage.startsWith("Dispatched")
                    ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                    : "bg-red-950/40 border border-red-500/30 text-red-300"
                }`}
              >
                {testSentMessage.startsWith("Dispatched") ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{testSentMessage}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
