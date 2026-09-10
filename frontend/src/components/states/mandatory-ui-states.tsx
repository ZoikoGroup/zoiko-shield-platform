'use client';

import React from 'react';
import {
  Loader2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Lock,
  ServerCrash,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

export type MandatoryUIStateType =
  | 'LOADING'
  | 'PARTIAL'
  | 'STALE'
  | 'DEGRADED'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE'
  | 'RECOVERY';

interface StateProps {
  title?: string;
  message?: string;
  timestamp?: string;
  retryAction?: () => void;
  regionalCell?: string;
}

/**
 * 1. Loading State: Skeleton shimmer & regional latency indicator (WCAG aria-live, role="status")
 */
export const LoadingState: React.FC<StateProps> = ({
  title = 'Loading Sovereign Telemetry...',
  message = 'Fetching authenticated records from regional cell.',
  regionalCell = 'eu-west-1',
}) => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    className="flex flex-col items-center justify-center p-12 rounded-xl border border-slate-800 bg-slate-950/60 backdrop-blur-md text-center space-y-4"
  >
    <div className="relative">
      <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin flex items-center justify-center" />
      <Loader2 className="w-6 h-6 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
    </div>
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="text-xs text-slate-400 max-w-sm">{message}</p>
    </div>
    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-slate-900 border border-slate-800 text-slate-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Cell: {regionalCell} [sovereign]
    </div>
  </div>
);

/**
 * 2. Partial State: Multi-connector ingestion completeness indicators
 */
export const PartialState: React.FC<
  StateProps & { connectorsActive?: number; connectorsTotal?: number }
> = ({
  title = 'Partial Telemetry Stream Active',
  message = 'Some connector feeds are still synchronizing. Ingestion data shown is partial.',
  connectorsActive = 5,
  connectorsTotal = 7,
  retryAction,
}) => (
  <div
    role="status"
    aria-live="polite"
    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 gap-4"
  >
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div>
        <h4 className="text-xs font-semibold">{title}</h4>
        <p className="text-[11px] text-amber-300/80">{message}</p>
        <span className="text-[10px] font-mono text-amber-400">
          Sync Status: {connectorsActive}/{connectorsTotal} P0 Connectors Connected
        </span>
      </div>
    </div>
    {retryAction && (
      <button
        onClick={() => retryAction()}
        className="px-3 py-1.5 rounded text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 flex items-center gap-1.5 transition-colors shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Sync Feeds
      </button>
    )}
  </div>
);

/**
 * 3. Stale State: Cache age banner with manual sync trigger
 */
export const StaleState: React.FC<StateProps> = ({
  title = 'Cached View (Stale Data)',
  message = 'Showing last verified snapshot. Network latency or background re-indexing in progress.',
  timestamp = '2026-09-10T08:00:00.000Z',
  retryAction,
}) => (
  <div
    role="status"
    aria-live="polite"
    className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 bg-slate-900/80 text-slate-300"
  >
    <div className="flex items-center gap-2.5">
      <Clock className="w-4 h-4 text-slate-400 shrink-0" />
      <div>
        <span className="text-xs font-medium text-slate-200">{title} — </span>
        <span className="text-[11px] text-slate-400">Last Verified: {timestamp}</span>
      </div>
    </div>
    {retryAction && (
      <button
        onClick={() => retryAction()}
        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
      >
        <RefreshCw className="w-3 h-3" /> Refresh
      </button>
    )}
  </div>
);

/**
 * 4. Degraded State: Controlled deterministic fallback (SafeDegradationService)
 */
export const DegradedState: React.FC<StateProps & { fallbackReason?: string }> = ({
  title = 'Operating in Deterministic Fallback Mode',
  message = 'AI Copilot / Advanced enrichment temporarily degraded. Deterministic rule evaluation active.',
  fallbackReason = 'UPSTREAM_AI_SAFETY_GATEWAY_THROTTLED',
}) => (
  <div
    role="alert"
    aria-live="polite"
    className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-950/30 text-yellow-200 space-y-1.5"
  >
    <div className="flex items-center gap-2">
      <ShieldAlert className="w-4 h-4 text-yellow-400 shrink-0" />
      <h4 className="text-xs font-semibold">{title}</h4>
    </div>
    <p className="text-[11px] text-yellow-300/80">{message}</p>
    <div className="text-[10px] font-mono text-yellow-400/90">
      Degradation Guardrail: {fallbackReason} [SafeDegradationService Active]
    </div>
  </div>
);

/**
 * 5. Unauthorized State: FIDO2 step-up challenge / Cedar rejection alert
 */
export const UnauthorizedState: React.FC<
  StateProps & {
    cedarPolicyDenialReason?: string;
    stepupChallengeRequired?: boolean;
    onStepUpAuth?: () => void;
  }
> = ({
  title = 'Step-Up Authentication Required (FIDO2 / WebAuthn)',
  message = 'Access to this action is restricted by Cedar Policy. High-privilege mutation requires hardware token attestation.',
  cedarPolicyDenialReason = 'CEDAR_POLICY_DENY: Insufficient authorization tier for live modification',
  stepupChallengeRequired = true,
  onStepUpAuth,
}) => (
  <div
    role="alert"
    aria-live="polite"
    className="flex flex-col items-center justify-center p-8 rounded-xl border border-rose-900/40 bg-rose-950/20 text-center space-y-3"
  >
    <div className="p-3 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400">
      <Lock className="w-6 h-6" />
    </div>
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-rose-200">{title}</h3>
      <p className="text-xs text-rose-300/70 max-w-md">{message}</p>
      {cedarPolicyDenialReason && (
        <div className="text-[10px] font-mono text-rose-400/80 pt-1">
          Policy Evaluation: {cedarPolicyDenialReason}
        </div>
      )}
    </div>
    {stepupChallengeRequired && onStepUpAuth && (
      <button
        onClick={() => onStepUpAuth()}
        className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/50 transition-all flex items-center gap-2"
      >
        <Lock className="w-3.5 h-3.5" /> Authenticate with Hardware Security Key
      </button>
    )}
  </div>
);

/**
 * 6. Unavailable State: Regional partition / failover status display
 */
export const UnavailableState: React.FC<
  StateProps & {
    rtoTargetMinutes?: number;
    rpoTargetMinutes?: number;
    failoverRegion?: string;
  }
> = ({
  title = 'Regional Ingestion Partition Detected',
  message = 'Primary regional cell unavailable. Automated failover to pre-warmed regional standby in progress.',
  rtoTargetMinutes = 0.5,
  rpoTargetMinutes = 0,
  failoverRegion = 'europe-west3',
  retryAction,
}) => (
  <div
    role="alert"
    aria-live="polite"
    className="flex flex-col items-center justify-center p-8 rounded-xl border border-red-900/50 bg-red-950/30 text-center space-y-3"
  >
    <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
      <ServerCrash className="w-6 h-6" />
    </div>
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-red-200">{title}</h3>
      <p className="text-xs text-red-300/80 max-w-md">{message}</p>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-mono text-slate-400">
      <span>RTO Target: &lt; {rtoTargetMinutes * 60}s</span>
      <span>•</span>
      <span>RPO Target: {rpoTargetMinutes}s (Zero Data Loss)</span>
      <span>•</span>
      <span>Standby Cell: {failoverRegion}</span>
    </div>
    {retryAction && (
      <button
        onClick={() => retryAction()}
        className="px-3 py-1.5 rounded text-xs font-medium bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 flex items-center gap-1.5 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Check Standby Status
      </button>
    )}
  </div>
);

/**
 * 7. Recovery State: In-flight compensation action & rollback progression
 */
export const RecoveryState: React.FC<
  StateProps & {
    rollbackStage?: string;
    progressPercent?: number;
    rollbackToken?: string;
    isReverted?: boolean;
  }
> = ({
  title = 'Automated Rollback Orchestration in Progress',
  message = 'Executing compensating action across certified provider adapters.',
  rollbackStage = 'Reverting modified OAuth credentials & unfreezing tenant partition',
  progressPercent = 65,
  rollbackToken,
  isReverted = false,
}) => (
  <div
    role="status"
    aria-live="polite"
    className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/30 text-blue-200 space-y-3"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {isReverted ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : (
          <RotateCcw className="w-4 h-4 text-blue-400 animate-spin" />
        )}
        <h4 className="text-xs font-semibold">{title}</h4>
      </div>
      <span className="text-[10px] font-mono text-blue-400">{progressPercent}%</span>
    </div>
    <p className="text-[11px] text-blue-300/80">{message}</p>
    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
      <div
        className="bg-blue-500 h-full rounded-full transition-all duration-500"
        style={{ width: `${progressPercent}%` }}
      />
    </div>
    <div className="flex items-center justify-between text-[10px] font-mono text-blue-400/80">
      <span>Stage: {rollbackStage}</span>
      {rollbackToken && <span>Token: {rollbackToken}</span>}
    </div>
  </div>
);
