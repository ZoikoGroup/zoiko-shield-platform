"use client";

import React, { useMemo, useState } from "react";
import {
  Info,
  Plus,
  Lock,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  LayoutGrid,
  Check,
  KeyRound,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import ConnectorsConsole from "./console";
import {
  WorkspacePage,
  PageHeader,
  NoticeBanner,
  KpiGrid,
  Panel,
  Pill,
  SearchInput,
  StepFlow,
  ActionButton,
  CONSOLE_TAB,
} from "@/components/mockup/kit";

type Conn = {
  code: string;
  name: string;
  sub: string;
  kind: "Cloud" | "Identity" | "Dev tools";
  auth: string;
  idLabel: string;
  appLabel: string;
  operationalState:
    | "DRAFT"
    | "CONFIGURED"
    | "TESTING"
    | "ACTIVE_VERIFIED"
    | "DEGRADED"
    | "PAUSED"
    | "REVOKED";
  certificationTrack:
    | "CATALOG"
    | "IMPLEMENTED"
    | "CUSTOMER_TESTED"
    | "APPROVED_FOR_PRODUCTION"
    | "EXPIRED";
  requiredGrants: string[];
  forbiddenGrants: string[];
};

const CATALOGUE: Conn[] = [
  {
    code: "Az",
    name: "Azure Monitor",
    sub: "Cloud telemetry · Polling",
    kind: "Cloud",
    auth: "Service principal",
    idLabel: "Azure tenant identifier",
    appLabel: "Application (client) identifier",
    operationalState: "ACTIVE_VERIFIED",
    certificationTrack: "APPROVED_FOR_PRODUCTION",
    requiredGrants: [
      "Monitoring Reader",
      "Security Reader",
      "Log Analytics Reader",
    ],
    forbiddenGrants: [
      "Owner",
      "Contributor",
      "User Access Administrator",
      "Directory.ReadWrite.All",
    ],
  },
  {
    code: "GH",
    name: "GitHub",
    sub: "Repository and security events",
    kind: "Dev tools",
    auth: "GitHub App",
    idLabel: "Organization",
    appLabel: "App ID",
    operationalState: "ACTIVE_VERIFIED",
    certificationTrack: "APPROVED_FOR_PRODUCTION",
    requiredGrants: [
      "audit_log:read",
      "security_events:read",
      "metadata:read",
    ],
    forbiddenGrants: ["repo:write", "admin:org", "workflow:write"],
  },
  {
    code: "WH",
    name: "Generic Webhook",
    sub: "HMAC-signed event delivery",
    kind: "Dev tools",
    auth: "HMAC shared secret",
    idLabel: "Source identifier",
    appLabel: "Signing key ID",
    operationalState: "CONFIGURED",
    certificationTrack: "CUSTOMER_TESTED",
    requiredGrants: ["hmac_sha256:verify", "ingest:append_only"],
    forbiddenGrants: ["inbound_admin_exec", "unauthenticated_push"],
  },
  {
    code: "CL",
    name: "Cloud Logs",
    sub: "Structured log collection",
    kind: "Cloud",
    auth: "Workload identity",
    idLabel: "Project / account",
    appLabel: "Service identity",
    operationalState: "TESTING",
    certificationTrack: "IMPLEMENTED",
    requiredGrants: ["logging.views.access", "securitycenter.findings.list"],
    forbiddenGrants: ["iam.serviceAccounts.actAs", "editor"],
  },
  {
    code: "OK",
    name: "Okta Identity",
    sub: "System log and auth events",
    kind: "Identity",
    auth: "OAuth 2.0 service app",
    idLabel: "Okta org URL",
    appLabel: "Client ID",
    operationalState: "ACTIVE_VERIFIED",
    certificationTrack: "APPROVED_FOR_PRODUCTION",
    requiredGrants: ["okta.logs.read", "okta.users.read", "okta.Factors.read"],
    forbiddenGrants: [
      "okta.users.manage",
      "okta.apps.manage",
      "okta.roles.manage",
    ],
  },
];

const GATES = [
  { label: "Source selected", status: "Complete" },
  { label: "Credential test", status: "Pending" },
  { label: "Permission validation (Req vs Forbidden)", status: "Pending" },
  { label: "Sample event inspection", status: "Pending" },
  { label: "OCSF mapping review", status: "Pending" },
  { label: "Authorized activation", status: "Blocked" },
];

function MaskedField({
  id,
  label,
  hint,
}: {
  id: string;
  label: string;
  hint: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold text-slate-300 mb-1"
      >
        {label}
      </label>
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface border border-line-strong text-xs">
        <input
          id={id}
          type="password"
          autoComplete="off"
          placeholder="•••• •••• ••••"
          className="bg-transparent outline-none text-slate-100 placeholder:text-slate-500 w-full"
        />
        <span className="text-[10px] text-slate-500 shrink-0 ml-2">{hint}</span>
      </div>
    </div>
  );
}

export default function ConnectorsWizardPage() {
  const [tab, setTab] = useState("wizard");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"All" | Conn["kind"]>("All");
  const [selectedName, setSelectedName] = useState("Azure Monitor");
  const [displayName, setDisplayName] = useState(
    "Azure Monitor — Security Logs"
  );
  const [collect, setCollect] = useState({
    security: true,
    identity: true,
    resource: true,
    diagnostic: false,
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [vaultDrawerOpen, setVaultDrawerOpen] = useState(false);
  const [runnerModalOpen, setRunnerModalOpen] = useState(false);
  const [secretVersion, setSecretVersion] = useState(4);
  const [rotationReceipt, setRotationReceipt] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOGUE.filter(
      (c) =>
        (kind === "All" || c.kind === kind) &&
        (!q || `${c.name} ${c.sub}`.toLowerCase().includes(q))
    );
  }, [query, kind]);
  const sel = CATALOGUE.find((c) => c.name === selectedName) ?? CATALOGUE[0];

  const choose = (c: Conn) => {
    setSelectedName(c.name);
    setDisplayName(`${c.name} — Security Logs`);
    setSavedAt(null);
  };

  return (
    <WorkspacePage
      header={
        <PageHeader
          title="Connectors Wizard"
          subtitle="Securely configure, test and activate ingestion sources · Dual Operational & Certification tracks (G09)"
          actions={
            <>
              <ActionButton onClick={() => setVaultDrawerOpen((v) => !v)}>
                <KeyRound className="w-3.5 h-3.5" /> Vault Lifecycle (WF-G09-03)
              </ActionButton>
              <ActionButton onClick={() => setRunnerModalOpen((v) => !v)}>
                <Server className="w-3.5 h-3.5" /> Private Runner (WF-G09-04)
              </ActionButton>
              <ActionButton onClick={() => setTab(CONSOLE_TAB)}>
                <Info className="w-3.5 h-3.5" /> Setup guide
              </ActionButton>
              <ActionButton
                primary
                onClick={() => {
                  setSelectedName(CATALOGUE[0].name);
                  setTab("wizard");
                }}
              >
                <Plus className="w-3.5 h-3.5" /> New connector
              </ActionButton>
            </>
          }
        />
      }
      banner={
        <NoticeBanner
          tone="cyan"
          title="Sovereign Multi-Cloud Ingestion Fabric"
          body="Enterprise telemetry connectors with automated OCSF 1.1 mapping, least-privilege scope verification, and write-only Vault custody."
          tag="Ingestion Pipeline Active"
        />
      }
      kpis={
        <>
          <div className="rounded-xl bg-raised border border-line p-4">
            <StepFlow
              steps={[
                {
                  label: "1. Select source",
                  sub: `${sel.name} chosen`,
                  state: "done",
                },
                {
                  label: "2. Configure",
                  sub: "Credentials & scopes",
                  state: "active",
                },
                {
                  label: "3. Test connection",
                  sub: "Live probe verification",
                  state: "pending",
                },
                {
                  label: "4. Review & activate",
                  sub: "Dual-custody authorization",
                  state: "pending",
                },
              ]}
            />
          </div>
          <KpiGrid
            items={[
              {
                label: "Configured sources",
                value: "8",
                hint: "Enterprise sources configured",
                tone: "blue",
                icon: <LayoutGrid className="w-3.5 h-3.5" />,
              },
              {
                label: "Active sources",
                value: "5",
                hint: "Telemetry stream healthy",
                tone: "emerald",
                icon: <CheckCircle2 className="w-3.5 h-3.5" />,
              },
              {
                label: "Degraded sources",
                value: "1",
                hint: "Queue lag monitored",
                tone: "amber",
                icon: <AlertTriangle className="w-3.5 h-3.5" />,
              },
              {
                label: "Awaiting setup",
                value: "2",
                hint: "Ready for activation",
                tone: "rose",
                icon: <Clock className="w-3.5 h-3.5" />,
              },
            ]}
          />
        </>
      }
      tabs={[{ id: "wizard", label: "Setup wizard" }]}
      activeTab={tab}
      onTabChange={setTab}
      console={<ConnectorsConsole />}
      consoleLabel="Connector tiers & live tests"
    >
      {/* WF-G09-03: Write-Only Vault Secret Rotation & External Revocation Receipt Drawer */}
      {vaultDrawerOpen && (
        <div className="mb-4 rounded-xl border border-cyan-500/40 bg-[#0b1628] p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-white">
                Write-Only Vault Credential Lifecycle &amp; Revocation Receipt
                (WF-G09-03) — {sel.name}
              </div>
              <div className="text-slate-400">
                Vault ref:{" "}
                <span className="font-mono text-cyan-300">
                  vault://eu-west-1/connectors/{sel.code.toLowerCase()}/v
                  {secretVersion}
                </span>{" "}
                · Plaintext secrets are never returned by API
              </div>
            </div>
            <button
              type="button"
              onClick={() => setVaultDrawerOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-slate-300 font-mono text-[11px]">
              Active Secret Version: v{secretVersion} · Age: 14 days · Rotation
              SLA: 30 days
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextVer = secretVersion + 1;
                  setSecretVersion(nextVer);
                  setRotationReceipt(
                    `ROTATION COMMITTED: Staged v${nextVer} promoted to active; v${
                      nextVer - 1
                    } scheduled for grace-window retirement.`
                  );
                }}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
              >
                Dual-Stage Rotate Secret
              </button>
              <button
                type="button"
                onClick={() =>
                  setRotationReceipt(
                    `REVOCATION RECEIPT RECORDED: External IdP/Cloud credential revoked (Receipt #REV-${Date.now()
                      .toString(36)
                      .toUpperCase()}) · Connector moved to REVOKED.`
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-200 font-semibold"
              >
                Record External Revocation Receipt
              </button>
            </div>
          </div>
          {rotationReceipt && (
            <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-500/40 font-mono text-emerald-200">
              {rotationReceipt}
            </div>
          )}
        </div>
      )}

      {/* WF-G09-04: Conditional Outbound-Only Read-Only Private Runner Enrollment */}
      {runnerModalOpen && (
        <div className="mb-4 rounded-xl border border-purple-500/40 bg-[#0b1628] p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="font-bold text-white">
              Outbound-Only Read-Only Private Runner Enrollment (WF-G09-04)
            </div>
            <button
              type="button"
              onClick={() => setRunnerModalOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-slate-400">
            For private-network log sources without public endpoints. Runner
            initiates outbound mTLS 1.3 only (no inbound listener ports) and
            executes strictly read-only collection.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px]">
            <div className="p-2.5 rounded bg-surface border border-line">
              Runner ID: runner-eu-west-1-acme-01
            </div>
            <div className="p-2.5 rounded bg-surface border border-line">
              mTLS Fingerprint: SHA256:4a8b...91e2 (Verified)
            </div>
            <div className="p-2.5 rounded bg-surface border border-line text-emerald-400">
              Capabilities: READ_ONLY_TELEMETRY (Write Disabled)
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel
          title="Connector catalogue (WF-G09-01)"
          meta="Operational & Certification tracks"
          metaTone="slate"
          className="xl:col-span-3"
        >
          <div className="mb-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search connectors"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(["All", "Cloud", "Identity", "Dev tools"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-2.5 py-1 rounded-full border text-[11px] ${
                  kind === k
                    ? "bg-sky-600 border-sky-500 text-white"
                    : "border-line-strong text-slate-300"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => choose(c)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-2.5 text-left ${
                    c.name === sel.name
                      ? "border-sky-500 bg-sky-950/40"
                      : "border-line hover:border-slate-600"
                  }`}
                >
                  <span className="w-9 h-9 rounded-lg bg-line text-sm font-bold text-sky-200 flex items-center justify-center">
                    {c.code}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-slate-100">
                      {c.name}
                    </span>
                    <span className="block text-[10px] text-slate-500 truncate">
                      {c.sub}
                    </span>
                    <span className="block text-[9px] font-mono text-cyan-400 mt-0.5">
                      {c.operationalState} · {c.certificationTrack}
                    </span>
                  </span>
                  <Pill tone={c.name === sel.name ? "amber" : "emerald"}>
                    {c.name === sel.name ? "Selected" : "Available"}
                  </Pill>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg border border-line p-3">
            <div className="text-xs font-semibold text-slate-200 mb-1">
              Setup guidance
            </div>
            <p className="text-[11px] text-slate-400">
              Select a source, configure the minimum required permissions, test
              connectivity and verify mapped events before activation.
            </p>
          </div>
          <p className="text-[10px] text-slate-500 mt-3">
            Credential values are never displayed back to users after saving.
          </p>
        </Panel>

        <Panel
          title={`Configuration · ${sel.name}`}
          meta={`${sel.operationalState} · ${sel.certificationTrack}`}
          metaTone="amber"
          className="xl:col-span-6"
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="w-12 h-12 rounded-lg bg-line text-lg font-bold text-sky-200 flex items-center justify-center">
              {sel.code}
            </span>
            <div>
              <div className="text-base font-bold text-slate-100">
                {sel.name}
              </div>
              <div className="text-[11px] text-slate-500">
                {sel.sub} · Demo configuration
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">
            Connection details are tenant-scoped. Configure only authorized read
            permissions.
          </p>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 mb-3">
            Identity &amp; Authentication
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="conn-name"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Connector display name
              </label>
              <input
                id="conn-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line-strong text-xs text-slate-100 outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <span className="block text-[11px] font-semibold text-slate-300 mb-1">
                Authentication method
              </span>
              <div className="px-3 py-2 rounded-lg bg-surface border border-line-strong text-xs text-slate-100">
                {sel.auth}
              </div>
            </div>
            <MaskedField id="conn-tenant" label={sel.idLabel} hint="masked" />
            <MaskedField id="conn-app" label={sel.appLabel} hint="masked" />
            <MaskedField
              id="conn-secret"
              label="Client secret"
              hint="write-only"
            />
            <div>
              <label
                htmlFor="conn-region"
                className="block text-[11px] font-semibold text-slate-300 mb-1"
              >
                Source region
              </label>
              <select
                id="conn-region"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-line-strong text-xs text-slate-100"
              >
                <option>EU Ireland (eu-west-1)</option>
                <option>EU Frankfurt (eu-central-1)</option>
                <option>UK London (eu-west-2)</option>
                <option>US East (us-east-1)</option>
              </select>
            </div>
          </div>

          {/* WF-G09-02: Required Read Grants vs Forbidden Write/Admin Grants Diff */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
              <div className="font-semibold text-emerald-300 flex items-center gap-1.5 mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Required Read-Only
                Grants (WF-G09-02)
              </div>
              <ul className="space-y-1 font-mono text-[11px] text-slate-300">
                {sel.requiredGrants.map((g) => (
                  <li key={g}>✓ {g}</li>
                ))}
              </ul>
            </div>
            <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30">
              <div className="font-semibold text-rose-300 flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5" /> Forbidden Write/Admin Grants
                (Blocked)
              </div>
              <ul className="space-y-1 font-mono text-[11px] text-slate-300">
                {sel.forbiddenGrants.map((g) => (
                  <li key={g}>✕ {g}</li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 mt-2">
            Secret is encrypted at rest; never returned to the UI.
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-[11px] text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Security
            review: verify scoped read-only API permissions and credential
            ownership before testing. Never paste secrets into support messages.
          </div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 mt-5 mb-2">
            Data Collection Settings
          </h3>
          {(
            [
              ["security", "Security events & alerts"],
              ["identity", "Identity-related audit events"],
              ["resource", "Resource activity logs"],
              ["diagnostic", "Optional diagnostic telemetry"],
            ] as const
          ).map(([k, label]) => (
            <label
              key={k}
              className="flex items-center justify-between py-2 border-b border-line text-xs text-slate-200"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={collect[k]}
                  onChange={(e) =>
                    setCollect((c) => ({ ...c, [k]: e.target.checked }))
                  }
                  className="accent-sky-500"
                />
                {label}
              </span>
              <span className="text-[10px] text-slate-500">
                {collect[k] ? "Enabled" : "Off"}
              </span>
            </label>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <span className="text-[10px] text-slate-500">
              {savedAt
                ? `Draft saved ${savedAt} · changes will be audited`
                : "Changes will be audited. Saving a draft does not start collection."}
            </span>
            <div className="flex gap-2">
              <ActionButton
                onClick={() => setSavedAt(new Date().toLocaleTimeString())}
              >
                Save draft
              </ActionButton>
              <ActionButton primary onClick={() => setTab(CONSOLE_TAB)}>
                Test connection →
              </ActionButton>
            </div>
          </div>
        </Panel>

        <Panel
          title="Test & activation readiness"
          meta={`Connector · ${sel.code} · DEMO`}
          metaTone="slate"
          className="xl:col-span-3"
        >
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 mb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
              <Clock className="w-3.5 h-3.5" /> CONNECTION NOT TESTED
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Complete the configuration, then run a signed server-side test. No
              success or health status is assumed before verification.
            </p>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 mb-2">
            Pre-activation gates
          </div>
          <ul className="space-y-1.5">
            {GATES.map((g) => (
              <li
                key={g.label}
                className="flex items-center justify-between rounded-md border border-line px-2.5 py-1.5 text-xs"
              >
                <span className="flex items-center gap-2 text-slate-200">
                  {g.status === "Complete" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  {g.label}
                </span>
                <span className="text-[10px] text-slate-500">{g.status}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mt-4 mb-2">
            <span className="text-cyan-300">Proposed OCSF mapping</span>
            <span className="text-sky-300 normal-case">Preview only</span>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">Source field</th>
                <th>Target</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["TimeGenerated", "time"],
                ["ResourceId", "resource.uid"],
                ["Severity", "severity"],
              ].map(([s, t]) => (
                <tr key={s} className="border-t border-line">
                  <td className="py-1.5 text-slate-300">{s}</td>
                  <td className="text-slate-300">{t}</td>
                  <td className="text-amber-300">Not tested</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 mt-4 mb-2">
            Activation control
          </div>
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-line-strong bg-surface text-xs text-slate-500 cursor-not-allowed"
          >
            <Lock className="w-3.5 h-3.5" /> Activate connector · unavailable
          </button>
        </Panel>
      </div>
    </WorkspacePage>
  );
}
