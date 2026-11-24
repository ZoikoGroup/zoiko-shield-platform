"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Globe2,
  Hourglass,
  Info,
  Loader2,
  Lock,
  Mail,
  PauseCircle,
  PencilLine,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { ZoikoShieldApiError } from "@/lib/api-client";
import { EMAIL_COPY, EMAIL_STATE_COPY } from "@/lib/email-copy";
import {
  TIMEZONE_CHANGE_EVENT,
  TIMEZONE_STORAGE_KEY,
  formatTimestamp,
  readStoredTimezoneMode,
  storeTimezoneMode,
} from "@/lib/utils";

export type EmailProtectionState =
  | "NO_COVERAGE"
  | "HEALTHY_SYNCED"
  | "DEGRADED"
  | "STALE"
  | "RECOVERY_IN_PROGRESS"
  | "UNAVAILABLE";

export type EmailConnectorStatus =
  | "DRAFT"
  | "CONSENT_PENDING"
  | "VALIDATING"
  | "ACTIVE"
  | "DEGRADED"
  | "SUSPENDED"
  | "REVOKED";

export const EMAIL_SUBNAV = [
  { href: "/email", label: "Overview" },
  { href: "/email/connectors", label: "Connectors" },
  { href: "/email/connectors/health", label: "Health & Gaps" },
  { href: "/email/threats", label: "Threat Queue" },
  { href: "/email/coverage", label: "Control Coverage" },
  { href: "/email/evidence", label: "Evidence Exports" },
  { href: "/email/policies", label: "Policies" },
  { href: "/email/intelligence", label: "AI Intelligence" },
  { href: "/email/actions", label: "Actions (Phase 2)" },
  { href: "/email/settings", label: "Governance" },
];

// ---------------------------------------------------------------------------
// Time zone display (T19): display-only switch; evidence values never change.
// ---------------------------------------------------------------------------

export type TimezoneMode = "UTC" | "LOCAL";

export function useTimezoneMode(): [TimezoneMode, (mode: TimezoneMode) => void] {
  const [mode, setModeState] = useState<TimezoneMode>("LOCAL");

  useEffect(() => {
    setModeState(readStoredTimezoneMode());
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setModeState(detail === "UTC" ? "UTC" : "LOCAL");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === TIMEZONE_STORAGE_KEY) setModeState(readStoredTimezoneMode());
    };
    window.addEventListener(TIMEZONE_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TIMEZONE_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setMode = useCallback((next: TimezoneMode) => {
    setModeState(next);
    storeTimezoneMode(next);
  }, []);

  return [mode, setMode];
}

export function TimezoneToggle() {
  const [mode, setMode] = useTimezoneMode();
  const next: TimezoneMode = mode === "UTC" ? "LOCAL" : "UTC";
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-pressed={mode === "UTC"}
      aria-label={`Show times in ${next === "UTC" ? "UTC" : "local time"}. Currently showing ${mode === "UTC" ? "UTC" : "local time"}; source timestamps are recorded in UTC.`}
      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-raised border border-line text-xs font-mono text-slate-200 hover:border-cyan-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <Globe2 className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
      <span>Times: {mode === "UTC" ? "UTC" : "Local"}</span>
      <span className="text-slate-400">(source UTC)</span>
    </button>
  );
}

/**
 * Renders a timestamp in the viewer's chosen zone while keeping the canonical
 * UTC value machine-readable (`dateTime`) and visible on hover (`title`).
 */
export function EmailTime({ iso, fallback = "Never" }: { iso?: string | null; fallback?: string }) {
  const [mode] = useTimezoneMode();
  if (!iso) return <span>{fallback}</span>;
  return (
    <time dateTime={iso} title={`UTC source value: ${iso}`}>
      {formatTimestamp(iso, mode)}
    </time>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function EmailWorkspaceHeader({
  title,
  subtitle,
  activeHref,
  actions,
}: {
  title: string;
  subtitle: string;
  activeHref: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400">
            <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>ZOIKOSHIELD EMAIL THREAT INTELLIGENCE &amp; ASSURANCE</span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            {title}
          </h1>
          <p className="text-xs text-slate-400 max-w-3xl">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <TimezoneToggle />
          {actions}
        </div>
      </div>

      <nav
        aria-label="Email security sub-navigation"
        className="flex flex-wrap gap-1.5 border-b border-line pb-3"
      >
        {EMAIL_SUBNAV.map((tab) => {
          const active = activeHref === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`min-h-[36px] inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                active
                  ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-bold"
                  : "bg-raised border border-line text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges — every state carries an icon AND a text label (colour is never the
// only signal).
// ---------------------------------------------------------------------------

const BADGE_BASE =
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono font-bold";

export function ProtectionStateBadge({
  state,
}: {
  state: EmailProtectionState | string;
}) {
  switch (state) {
    case "HEALTHY_SYNCED":
      return (
        <span className={`${BADGE_BASE} bg-emerald-500/15 border-emerald-500/40 text-emerald-300`}>
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Healthy (Synced)</span>
        </span>
      );
    case "RECOVERY_IN_PROGRESS":
      return (
        <span className={`${BADGE_BASE} bg-cyan-500/15 border-cyan-500/40 text-cyan-300`}>
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Recovery in Progress</span>
        </span>
      );
    case "STALE":
      return (
        <span className={`${BADGE_BASE} bg-amber-500/15 border-amber-500/40 text-amber-300`}>
          <Hourglass className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Stale Telemetry</span>
        </span>
      );
    case "DEGRADED":
      return (
        <span className={`${BADGE_BASE} bg-amber-500/15 border-amber-500/40 text-amber-300`}>
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Degraded Coverage</span>
        </span>
      );
    case "UNAVAILABLE":
      return (
        <span className={`${BADGE_BASE} bg-rose-500/15 border-rose-500/40 text-rose-300`}>
          <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Source Unavailable</span>
        </span>
      );
    default:
      return (
        <span className={`${BADGE_BASE} bg-slate-800 border-amber-500/40 text-amber-300`}>
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>No Coverage</span>
        </span>
      );
  }
}

const STATUS_REASON_LABEL: Record<string, string> = {
  CONSENT_EXPIRED: "consent expired",
  LIMITED_CAPABILITY: "limited capability",
  PERMISSION_REVOKED: "permission revoked",
  AWAITING_FIRST_EVENT: "awaiting first signed event",
};

/**
 * Connector lifecycle (18.1): DRAFT → CONSENT_PENDING → VALIDATING → ACTIVE →
 * DEGRADED | SUSPENDED | REVOKED. An expired consent is never rendered ACTIVE,
 * even if a stale row still says so.
 */
export function effectiveConnectorStatus(
  status: string | null | undefined,
  statusReason?: string | null,
  consentExpiresAt?: string | null,
): { status: string; reason: string | null } {
  const expired =
    statusReason === "CONSENT_EXPIRED" ||
    (consentExpiresAt ? Date.parse(consentExpiresAt) <= Date.now() : false);
  if (expired && status !== "REVOKED") {
    return { status: "SUSPENDED", reason: "CONSENT_EXPIRED" };
  }
  return { status: status || "DRAFT", reason: statusReason ?? null };
}

export function ConnectorStatusBadge({
  status,
  statusReason,
  consentExpiresAt,
}: {
  status: string;
  statusReason?: string | null;
  consentExpiresAt?: string | null;
}) {
  const eff = effectiveConnectorStatus(status, statusReason, consentExpiresAt);
  const reason = eff.reason ? STATUS_REASON_LABEL[eff.reason] || eff.reason : null;
  const suffix = reason ? ` — ${reason}` : "";

  let cls = "bg-slate-800 border-slate-600 text-slate-300";
  let Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }> = PencilLine;
  let label = eff.status;
  switch (eff.status) {
    case "DRAFT":
      label = "Draft";
      break;
    case "CONSENT_PENDING":
      cls = "bg-slate-800 border-cyan-500/40 text-cyan-300";
      Icon = Hourglass;
      label = "Consent pending";
      break;
    case "VALIDATING":
      cls = "bg-cyan-500/10 border-cyan-500/40 text-cyan-300";
      Icon = Loader2;
      label = "Validating (not active)";
      break;
    case "ACTIVE":
      cls = "bg-emerald-500/15 border-emerald-500/40 text-emerald-300";
      Icon = CheckCircle2;
      label = "Active";
      break;
    case "DEGRADED":
      cls = "bg-amber-500/15 border-amber-500/40 text-amber-300";
      Icon = AlertTriangle;
      label = "Degraded";
      break;
    case "SUSPENDED":
      cls = "bg-amber-500/15 border-amber-500/40 text-amber-300";
      Icon = PauseCircle;
      label = "Suspended";
      break;
    case "REVOKED":
      cls = "bg-rose-500/15 border-rose-500/40 text-rose-300";
      Icon = Ban;
      label = "Revoked";
      break;
  }
  return (
    <span className={`${BADGE_BASE} ${cls}`} data-connector-status={eff.status}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span>
        {label}
        {suffix}
      </span>
    </span>
  );
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case "MICROSOFT_365":
      return "Microsoft 365 Defender";
    case "GOOGLE_WORKSPACE":
      return "Google Workspace Alert Center";
    case "ZOIKO_MAIL":
      return "Zoiko Mail";
    default:
      return provider;
  }
}

export function ProviderBadge({ provider }: { provider: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface border border-line text-[11px] font-mono text-cyan-300">
      <ShieldCheck className="w-3 h-3 text-cyan-400" aria-hidden="true" />
      <span>{providerLabel(provider)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Notices and load states
// ---------------------------------------------------------------------------

type NoticeTone = "info" | "warning" | "danger" | "success";

const TONE_CLASS: Record<NoticeTone, string> = {
  info: "bg-surface border-cyan-500/40 text-cyan-100",
  warning: "bg-amber-950/30 border-amber-500/40 text-amber-200",
  danger: "bg-rose-950/30 border-rose-500/40 text-rose-200",
  success: "bg-emerald-950/30 border-emerald-500/40 text-emerald-200",
};

const TONE_ICON: Record<NoticeTone, React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>> = {
  info: Info,
  warning: AlertTriangle,
  danger: ShieldAlert,
  success: CheckCircle2,
};

export function EmailNotice({
  tone = "info",
  title,
  children,
  role = "status",
  action,
}: {
  tone?: NoticeTone;
  title?: string;
  children: React.ReactNode;
  role?: "status" | "alert" | "note";
  action?: React.ReactNode;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      role={role}
      className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${TONE_CLASS[tone]}`}
    >
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-0.5">
          {title && <div className="font-mono font-bold">{title}</div>}
          <div className="leading-relaxed">{children}</div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export type EmailErrorKind = "DENIED" | "STALE_VERSION" | "CONFLICT" | "NOT_FOUND" | "ERROR";

export interface ClassifiedEmailError {
  kind: EmailErrorKind;
  message: string;
  status: number | null;
}

/** Maps backend failures onto the states the spec requires distinct copy for. */
export function classifyEmailError(err: unknown, fallback = "Request failed."): ClassifiedEmailError {
  const status = err instanceof ZoikoShieldApiError ? err.status : null;
  const raw = err instanceof Error ? err.message : fallback;
  if (status === 401 || status === 403) {
    return { kind: "DENIED", message: EMAIL_COPY.PERMISSION_DENIAL, status };
  }
  if (status === 409 && /STALE_VERSION/i.test(raw)) {
    return { kind: "STALE_VERSION", message: EMAIL_STATE_COPY.STALE_VERSION, status };
  }
  if (status === 409) return { kind: "CONFLICT", message: raw, status };
  if (status === 404) return { kind: "NOT_FOUND", message: raw, status };
  return { kind: "ERROR", message: raw || fallback, status };
}

export function EmailErrorNotice({
  error,
  onRetry,
}: {
  error: ClassifiedEmailError | null;
  onRetry?: () => void;
}) {
  if (!error) return null;
  if (error.kind === "DENIED") {
    return (
      <EmailNotice tone="warning" role="alert" title="Permission required">
        <span className="inline-flex items-center gap-1.5">
          <ShieldOff className="w-3.5 h-3.5" aria-hidden="true" />
          {EMAIL_COPY.PERMISSION_DENIAL}
        </span>
      </EmailNotice>
    );
  }
  return (
    <EmailNotice
      tone={error.kind === "STALE_VERSION" ? "warning" : "danger"}
      role="alert"
      action={
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-raised border border-line text-xs font-mono text-slate-200 hover:border-cyan-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        ) : undefined
      }
    >
      {error.message}
    </EmailNotice>
  );
}

export function EmailLoadingNotice({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="p-6 rounded-xl bg-raised border border-line text-center text-xs text-slate-400 inline-flex w-full items-center justify-center gap-2"
    >
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Source-health copy for any non-healthy state (T06/T07). */
export function SourceHealthNotice({ health }: { health: string | null | undefined }) {
  if (!health || health === "HEALTHY_SYNCED") return null;
  if (health === "NO_COVERAGE") {
    return (
      <EmailNotice tone="warning" title="No coverage">
        {EMAIL_COPY.NO_CONNECTED_SOURCE}
      </EmailNotice>
    );
  }
  if (health === "UNAVAILABLE") {
    return (
      <EmailNotice tone="danger" title="Source unavailable">
        {EMAIL_STATE_COPY.DISCONNECTED_SOURCE} {EMAIL_COPY.SOURCE_LAG}
      </EmailNotice>
    );
  }
  const title =
    health === "STALE"
      ? "Stale telemetry"
      : health === "RECOVERY_IN_PROGRESS"
        ? "Recovery in progress"
        : "Degraded coverage";
  return (
    <EmailNotice tone="warning" title={title}>
      {EMAIL_COPY.SOURCE_LAG}
    </EmailNotice>
  );
}

export function EmailTruthBanner({
  state,
  message,
  phase2Locked,
}: {
  state: EmailProtectionState | string;
  message?: string;
  phase2Locked?: boolean;
}) {
  const isNoCoverage = state === "NO_COVERAGE";
  const isDegraded =
    state === "DEGRADED" ||
    state === "STALE" ||
    state === "UNAVAILABLE" ||
    state === "RECOVERY_IN_PROGRESS";

  const primary = isNoCoverage
    ? EMAIL_COPY.NO_CONNECTED_SOURCE
    : isDegraded
      ? EMAIL_COPY.SOURCE_LAG
      : message ||
        "ZoikoShield displays coverage bounded by active connector windows and retention settings.";
  const detail = (isNoCoverage || isDegraded) && message && message !== primary ? message : null;

  return (
    <div
      role="status"
      className={`p-4 rounded-xl border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
        isNoCoverage
          ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
          : isDegraded
            ? "bg-rose-950/25 border-amber-500/40 text-amber-200"
            : "bg-raised border-cyan-500/30 text-slate-300"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {isNoCoverage || isDegraded ? (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div className="space-y-1">
          <div className="font-mono font-bold">
            {isNoCoverage
              ? "No Email Telemetry Coverage Configured"
              : isDegraded
                ? "Partial or Delayed Email Coverage Detected"
                : "Read-Only Email Telemetry Verified"}
          </div>
          <p className="text-slate-200 leading-relaxed">{primary}</p>
          {detail && <p className="text-slate-300 leading-relaxed">{detail}</p>}
        </div>
      </div>

      {phase2Locked && (
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-300 shrink-0"
          title={EMAIL_COPY.RESPONSE_GATE}
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          <span>Phase 2 Mailbox Actions Locked</span>
        </div>
      )}
    </div>
  );
}

/** Provider-reported capability inventory (WF-02 drawer, WF-03 test step). */
export function CapabilityReportView({
  report,
}: {
  report: {
    availableEventTypes?: string[];
    unavailableEventTypes?: string[];
    limitedCapability?: boolean;
    reason?: string;
  };
}) {
  const available = report.availableEventTypes || [];
  const unavailable = report.unavailableEventTypes || [];
  return (
    <div className="space-y-2 text-[11px] font-mono">
      <div>
        <div className="text-slate-400 uppercase">Available event types</div>
        {available.length === 0 ? (
          <div className="text-amber-200">None confirmed by the provider.</div>
        ) : (
          <ul className="list-disc pl-4 text-slate-200">
            {available.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>
      {unavailable.length > 0 && (
        <div>
          <div className="text-slate-400 uppercase">Unavailable event types</div>
          <ul className="list-disc pl-4 text-amber-200">
            {unavailable.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {(report.limitedCapability || unavailable.length > 0) && (
        <p className="text-amber-200 font-sans">{EMAIL_COPY.SCOPE_UNAVAILABLE}</p>
      )}
      {report.reason && <p className="text-slate-300 font-sans">{report.reason}</p>}
    </div>
  );
}
