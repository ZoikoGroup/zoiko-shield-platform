"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Bot,
  ShieldAlert,
  Send,
  CheckCircle2,
  FileText,
  Search,
  Zap,
  Lock,
  Compass,
  ArrowRight,
  Code,
  Scale,
  Sliders,
  Check,
  AlertOctagon,
  RefreshCw,
} from "lucide-react";

type CopilotMode =
  | "INVESTIGATE"
  | "ASSURE"
  | "RESPOND"
  | "REPORT"
  | "DEVELOP"
  | "NAVIGATE";

interface CopilotPreset {
  mode: CopilotMode;
  title: string;
  query: string;
  response: {
    summary: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    confidenceScore: number;
    calibrationBasis: string;
    sources: Array<{ name: string; type: string; span: string }>;
    uncertaintyFactors: string[];
    alternativeAction: string;
    blastRadius: string;
    reversibility: string;
    requiredAuthority: "R0" | "R1" | "R2" | "R3" | "R4";
    suggestedTransitions: string[];
  };
}

const PRESETS: Record<CopilotMode, CopilotPreset> = {
  INVESTIGATE: {
    mode: "INVESTIGATE",
    title: "Investigate Suspicious Lateral Movement",
    query: "Analyze alert ALT-0921 on bastion host ec2-jump-01 and map downstream DB access attempts.",
    response: {
      summary:
        "Correlated 14 OCSF v1.1.0 authentication events spanning 22 minutes. Identity 'marcus.vance' established SMB session on bastion host (T1021.002) followed by attempted privilege escalation toward crown-jewel RDS instance 'srv-db-prod-01'.",
      confidence: "HIGH",
      confidenceScore: 0.94,
      calibrationBasis: "Multi-sensor alignment across Entra ID audit log & AWS VPC Flow logs.",
      sources: [
        { name: "aws-cloudtrail-stream", type: "OCSF_AUTH_EVENT", span: "EventId: e-98124 | PrincipalId: AROA45881..." },
        { name: "crowdstrike-fdr", type: "PROCESS_INJECTION", span: "Process: powershell.exe -Enc SGVsbG8..." },
      ],
      uncertaintyFactors: ["Network tap packet payload was TLS encrypted; derived from TLS metadata."],
      alternativeAction: "Quarantine host immediately vs. monitoring for 10 minutes to capture secondary C2 addresses.",
      blastRadius: "1 Bastion Host (ec2-jump-01), 0 Customer-Facing Services impacted.",
      reversibility: "Fully Reversible (Security Group Rule Update)",
      requiredAuthority: "R2",
      suggestedTransitions: ["ACCEPT_CONTAINMENT", "MODIFY_SCOPE", "ESCALATE_TO_T3"],
    },
  },
  ASSURE: {
    mode: "ASSURE",
    title: "Verify SOC 2 CC6.1 Access Evidence",
    query: "Generate cryptographic verification proof for JIT elevation sessions over the last 30 days.",
    response: {
      summary:
        "Evaluated 48 JIT elevation requests against SOC 2 CC6.1 and ISO 27001 A.9.2 controls. All 48 sessions satisfied dual-approver quorum and terminated within maximum 60-minute duration. Merkle epoch roots verified against Hardware HSM Dilithium3 signature.",
      confidence: "HIGH",
      confidenceScore: 0.99,
      calibrationBasis: "Mathematical inclusion proof in Merkle Tree Epoch #1043.",
      sources: [
        { name: "merkle-tree-epoch-1043", type: "DILITHIUM3_PROOF", span: "MerkleRoot: 0x9f88c... | Root-of-Trust: Verified" },
        { name: "jit-session-ledger", type: "AUDIT_PACKAGE", span: "48 Sessions logged with unalterable timestamps" },
      ],
      uncertaintyFactors: ["None; deterministic cryptographic verification complete."],
      alternativeAction: "Export sealed audit package as standalone verifier ZIP.",
      blastRadius: "Zero operational impact (Read-Only Evidence Probe).",
      reversibility: "Not Applicable (Evidence Record)",
      requiredAuthority: "R0",
      suggestedTransitions: ["GENERATE_AUDIT_REPORT", "DOWNLOAD_PROOF_BUNDLE"],
    },
  },
  RESPOND: {
    mode: "RESPOND",
    title: "Formulate Containment Action Proposal",
    query: "Propose network isolation and credential revoke for compromised IAM role arn:aws:iam::123456789012:role/DeployBot.",
    response: {
      summary:
        "Drafted R3 Containment Action: (1) Attach inline deny policy `AWSRevokeOlderSessions` to DeployBot, (2) Invalidate active STS session tokens, (3) Rotate KMS data keys accessed in past 4 hours. Automated rollback script prepared.",
      confidence: "HIGH",
      confidenceScore: 0.91,
      calibrationBasis: "MITRE ATT&CK T1078 remediation playbook with automated rollback snapshot.",
      sources: [
        { name: "soar-playbook-iam-04", type: "ACTION_TEMPLATE", span: "ActionId: ACT-IAM-FREEZE-R3" },
        { name: "aws-iam-metadata", type: "ROLE_DEFINITION", span: "Role: DeployBot | AttachedPolicies: 3" },
      ],
      uncertaintyFactors: ["CI/CD deploy pipeline will halt until new credential rotation completes."],
      alternativeAction: "Scope isolation strictly to production VPC without revoking dev/staging permissions.",
      blastRadius: "Automated deployment pipeline paused. No customer runtime downtime.",
      reversibility: "Fully Reversible (Rollback script: `rb-act-deploybot-2026.json`)",
      requiredAuthority: "R3",
      suggestedTransitions: ["EXECUTE_WITH_QUORUM", "SIMULATE_BLAST_RADIUS", "REJECT"],
    },
  },
  REPORT: {
    mode: "REPORT",
    title: "Draft Executive & Regulatory Disclosure",
    query: "Draft preliminary incident timeline and customer-affecting notice for Case CAS-1082.",
    response: {
      summary:
        "Generated statutory timeline for Case CAS-1082: Initial breach detection at 08:14 UTC, containment achieved at 08:32 UTC (18 min). Zero customer PII exfiltration detected across S3 access logs. Draft marked 'Privileged & Confidential - Counsel Controlled'.",
      confidence: "MEDIUM",
      confidenceScore: 0.85,
      calibrationBasis: "Normalized case evidence records and data classification labels.",
      sources: [
        { name: "case-cas-1082-evidence", type: "TIMELINE_LEDGER", span: "18 Evidence items correlated" },
        { name: "legal-sensitive-vault", type: "PRIVILEGE_DISCLOSURE", span: "Notice template GDPR/SEC compliant" },
      ],
      uncertaintyFactors: ["Final forensic disk image verification pending; summary based on live telemetry."],
      alternativeAction: "Wait for Tier-3 memory forensics completion before issuing draft.",
      blastRadius: "Legal & Regulatory Communication Draft.",
      reversibility: "Fully Modifiable by Legal Counsel",
      requiredAuthority: "R1",
      suggestedTransitions: ["SUBMIT_FOR_LEGAL_REVIEW", "EXPORT_MARKDOWN", "MODIFY_TEXT"],
    },
  },
  DEVELOP: {
    mode: "DEVELOP",
    title: "Generate Least-Privilege IAM & Sigma Rule",
    query: "Generate Sigma detection rule for unauthenticated Kerberos AS-REP roasting attempts.",
    response: {
      summary:
        "Generated Sigma rule `win_security_kerberos_asrep_roasting.yml` mapped to MITRE T1558.004 with high-fidelity filter on EventID 4768 and Ticket Encryption Type 0x17 (RC4-HMAC). Tested against past 90-day event baseline with 0 false positives.",
      confidence: "HIGH",
      confidenceScore: 0.96,
      calibrationBasis: "Historical telemetry backtesting against 1.2M AD security events.",
      sources: [
        { name: "sigma-specification-v1.1", type: "RULE_SYNTAX", span: "Category: Windows Security Event Log" },
        { name: "historical-baseline-90d", type: "BACKTEST_RESULT", span: "0 False Positives across 1.2M events" },
      ],
      uncertaintyFactors: ["Legacy service accounts using RC4 encryption must be explicitly allowlisted."],
      alternativeAction: "Generate Elastic query DSL instead of Sigma standard.",
      blastRadius: "Zero runtime impact (Detection Rule Definition).",
      reversibility: "Fully Reversible",
      requiredAuthority: "R0",
      suggestedTransitions: ["DEPLOY_TO_DETECTION_ENGINE", "DOWNLOAD_SIGMA_YAML"],
    },
  },
  NAVIGATE: {
    mode: "NAVIGATE",
    title: "Platform Tour & Governance Navigation",
    query: "What is the operational difference between Shield Professional and Shield Advanced?",
    response: {
      summary:
        "Shield Professional ($4,000/mo) includes 1,000 assets, 100 GB/day telemetry, AI Copilot, attack graphs, and 1-hour response SLA. Shield Advanced ($8,000/mo) expands to 5,000 assets, 500 GB/day, Rule SVC-01 certified 24/7/365 continuous MDR with 15-minute containment SLAs, and automated Purple-Team adversary emulation.",
      confidence: "HIGH",
      confidenceScore: 1.0,
      calibrationBasis: "ZoikoShield Commercial Plan-Tier Engine & Operational Standards.",
      sources: [
        { name: "plan-tier-registry", type: "PRICING_SPEC", span: "Band specifications & allocation limits" },
        { name: "mdr-service-obligation", type: "OPERATIONAL_STANDARD", span: "Rule SVC-01 24/7 staffing proofs" },
      ],
      uncertaintyFactors: ["None; official specification reference."],
      alternativeAction: "Open the live /pricing ladder comparison.",
      blastRadius: "Informational Navigation.",
      reversibility: "Not Applicable",
      requiredAuthority: "R0",
      suggestedTransitions: ["NAVIGATE_TO_PRICING", "VIEW_SECTOR_PACKS"],
    },
  },
};

export default function CopilotPage() {
  const [activeMode, setActiveMode] = useState<CopilotMode>("INVESTIGATE");
  const [customInput, setCustomInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ sender: "user" | "copilot"; text: string; data?: any }>>([
    {
      sender: "copilot",
      text: "ZoikoShield AI Security Copilot ready. Operating under deterministic dual-review protocol with source grounding.",
      data: PRESETS["INVESTIGATE"].response,
    },
  ]);
  const [generating, setGenerating] = useState(false);

  const activePreset = PRESETS[activeMode];

  const handleSend = (queryText?: string) => {
    const text = queryText || customInput;
    if (!text.trim()) return;

    setChatHistory((prev) => [...prev, { sender: "user", text }]);
    setGenerating(true);

    setTimeout(() => {
      const responseData = PRESETS[activeMode].response;
      setChatHistory((prev) => [
        ...prev,
        {
          sender: "copilot",
          text: responseData.summary,
          data: responseData,
        },
      ]);
      setGenerating(false);
      setCustomInput("");
    }, 600);
  };

  const handleModeChange = (mode: CopilotMode) => {
    setActiveMode(mode);
    setChatHistory((prev) => [
      ...prev,
      {
        sender: "copilot",
        text: `Switched to mode [${mode}]: ${PRESETS[mode].title}. Ask a question or run the sample query.`,
        data: PRESETS[mode].response,
      },
    ]);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
            <Bot className="w-3.5 h-3.5" />
            <span>DETERMINISTIC AI COPILOT</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
            ZoikoShield AI Security Copilot
          </h1>
          <p className="text-slate-400 text-xs max-w-2xl">
            Dual-review conversational security copilot providing grounded source spans, confidence calibration bands, and reversible blast-radius proposals across 6 operational patterns.
          </p>
        </div>

        {/* Brand Neutrality Badge */}
        <div className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-right shrink-0">
          <div className="text-[10px] font-mono text-slate-500 uppercase">Governance Rule CAT-02</div>
          <div className="text-xs font-mono text-cyan-400 font-bold">Unbranded AI Architecture</div>
        </div>
      </div>

      {/* 6 Operational Modes Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {(
          [
            { mode: "INVESTIGATE", label: "1. Investigate", icon: <Search className="w-4 h-4" /> },
            { mode: "ASSURE", label: "2. Assure", icon: <ShieldAlert className="w-4 h-4" /> },
            { mode: "RESPOND", label: "3. Respond", icon: <Zap className="w-4 h-4" /> },
            { mode: "REPORT", label: "4. Report", icon: <FileText className="w-4 h-4" /> },
            { mode: "DEVELOP", label: "5. Develop", icon: <Code className="w-4 h-4" /> },
            { mode: "NAVIGATE", label: "6. Navigate", icon: <Compass className="w-4 h-4" /> },
          ] as const
        ).map((item) => {
          const isActive = activeMode === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => handleModeChange(item.mode)}
              className={`p-3 rounded-xl flex items-center gap-2 text-xs font-mono font-medium transition-all ${
                isActive
                  ? "bg-cyan-500/20 text-cyan-300 border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                  : "bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Interactive Chat & Decision Envelope View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Chat History & Input */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-5 space-y-4 min-h-[420px] max-h-[560px] overflow-y-auto flex flex-col justify-between">
            <div className="space-y-4">
              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.sender === "copilot" && (
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed max-w-[85%] ${
                      msg.sender === "user"
                        ? "bg-cyan-600 text-slate-950 font-medium"
                        : "bg-slate-950/80 border border-slate-800 text-slate-200"
                    }`}
                  >
                    <p>{msg.text}</p>
                    {msg.data && (
                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>Confidence: {(msg.data.confidenceScore * 100).toFixed(0)}%</span>
                        <span className="text-cyan-400 font-semibold">{msg.data.requiredAuthority} Authority</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {generating && (
                <div className="flex gap-3 items-center text-xs font-mono text-cyan-400 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing multi-source review envelope...</span>
                </div>
              )}
            </div>

            {/* Quick Prompt Suggester */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="text-[10px] font-mono text-slate-500 uppercase">
                Suggested Query for [{activeMode}]:
              </div>
              <button
                onClick={() => handleSend(activePreset.query)}
                className="w-full text-left p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-cyan-500/40 text-xs text-slate-300 font-mono transition-colors flex items-center justify-between group"
              >
                <span className="line-clamp-1">{activePreset.query}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
              </button>
            </div>
          </div>

          {/* Input Bar */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={`Ask AI Security Copilot in [${activeMode}] mode...`}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => handleSend()}
              disabled={!customInput.trim() || generating}
              className="px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
            >
              <span>Execute</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 10-Field Mandatory Decision Review Envelope Display */}
        <div className="lg:col-span-5 rounded-2xl bg-slate-950 border border-cyan-500/40 p-6 space-y-4 shadow-[0_0_25px_rgba(6,182,212,0.1)]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-100">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>10-FIELD DECISION REVIEW ENVELOPE</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 text-[10px] font-mono border border-cyan-500/30">
              Spec §16.1 Compliant
            </span>
          </div>

          <div className="space-y-3.5 text-xs text-slate-300">
            {/* Field 1 & 2: UseCase and Grounded Sources */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">
                1. Grounded Source Spans (Zero Hallucination)
              </span>
              <div className="space-y-1">
                {activePreset.response.sources.map((s, i) => (
                  <div key={i} className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono">
                    <div className="text-cyan-400 font-semibold">{s.name} ({s.type})</div>
                    <div className="text-slate-400 text-[10px] truncate">{s.span}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Field 3: Calibrated Confidence & Basis */}
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-400">2. Calibrated Confidence:</span>
                <span className="text-emerald-400 font-bold">
                  {activePreset.response.confidence} ({(activePreset.response.confidenceScore * 100).toFixed(0)}%)
                </span>
              </div>
              <p className="text-[10px] text-slate-400">{activePreset.response.calibrationBasis}</p>
            </div>

            {/* Field 4: Uncertainty Factors */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">
                3. Known Uncertainty Factors
              </span>
              <ul className="list-disc list-inside text-[11px] text-slate-400">
                {activePreset.response.uncertaintyFactors.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>

            {/* Field 5 & 6: Impact, Blast Radius & Reversibility */}
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">BLAST RADIUS:</span>
                <span className="text-slate-200">{activePreset.response.blastRadius}</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">REVERSIBILITY:</span>
                <span className="text-emerald-400">{activePreset.response.reversibility}</span>
              </div>
            </div>

            {/* Field 7: Required Authority & Human Decision Controls */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-400">Required Role Authority:</span>
                <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 font-bold border border-purple-500/30">
                  {activePreset.response.requiredAuthority} Authority Tier
                </span>
              </div>

              <div className="text-[10px] font-mono text-slate-500 uppercase pt-1">
                Human Operator Decision Actions:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activePreset.response.suggestedTransitions.map((t, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-200 hover:border-cyan-400 cursor-pointer"
                  >
                    ✓ {t.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
