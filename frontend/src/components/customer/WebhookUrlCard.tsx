"use client";

import React, { useCallback, useEffect, useState } from "react";
import { backend } from "@/lib/backend";

/**
 * Where external tools send events for a webhook connector, and the signing
 * secret they sign them with.
 *
 * The address is the public API host (shield-core), which relays each signed
 * delivery to ingestion. It is the same host the app already talks to, so by
 * default it is NEXT_PUBLIC_API_URL; set NEXT_PUBLIC_INGEST_PUBLIC_URL only to
 * publish webhooks on a different address (a tunnel, in development).
 *
 * Each connector has its own secret. The server keeps it encrypted and hands
 * it over exactly once, either on first reveal or when it is rotated. This
 * component holds it in memory only while it is on screen: it is never put
 * in storage, a URL, or a log, and "Done" discards it.
 */
export const DEFAULT_WEBHOOK_BASE_URL = "http://localhost:3001";

/**
 * The URL, or null when none can be given. In a production build with no
 * public API address configured, falling back to localhost would show a URL
 * no external tool can reach, so say so instead.
 */
export function webhookUrlFor(
  connectorId: string,
  base?: string,
  isProduction: boolean = process.env.NODE_ENV === "production"
): string | null {
  if (!base && isProduction) return null;
  const root = (base || DEFAULT_WEBHOOK_BASE_URL).replace(/\/+$/, "");
  return `${root}/api/v1/ingestion/webhooks/${encodeURIComponent(connectorId)}`;
}

interface SecretStatus {
  configured: boolean;
  version?: number;
  hint?: string;
  createdAt?: string;
  revealed?: boolean;
  previousValidUntil?: string | null;
}

interface IssuedSecret {
  secret: string;
  version: number;
  previousValidUntil?: string | null;
}

const BUTTON =
  "px-3.5 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700/80 text-xs font-semibold text-slate-100 disabled:opacity-50";
const PRIMARY =
  "px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white disabled:opacity-50";

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "");

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the value is selectable in the field */
    }
  };
  return (
    <div className="flex gap-2">
      <input
        readOnly
        aria-label={label}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-[#0c1829] border border-slate-700 text-xs text-white font-mono"
      />
      <button type="button" onClick={copy} className={BUTTON}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

interface TunnelState {
  running: boolean;
  url: string | null;
  managed: boolean;
}

/**
 * Development only. In a production build this is false, so the component below is
 * never rendered and nothing here makes a request: production is untouched.
 */
function tunnelControlAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * One-click temporary public link (ngrok) so a sender such as GitHub can reach the
 * app on a developer machine. The server side starts ngrok and exposes ONLY this
 * webhook route, not the rest of the API. If the endpoint is unavailable (not signed
 * in, or anything other than a dev server) nothing is shown.
 */
function TunnelControl({ connectorId }: { connectorId: string }) {
  const [state, setState] = useState<TunnelState | null>(null);
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = `/api/dev/tunnel?connectorId=${encodeURIComponent(connectorId)}`;

  useEffect(() => {
    let alive = true;
    setState(null);
    setError(null);
    backend
      .get<TunnelState>(path)
      .then((s) => {
        if (alive && s && typeof s.running === "boolean") setState(s);
      })
      .catch(() => {
        /* not a dev server, or not allowed: stay hidden */
      });
    return () => {
      alive = false;
    };
  }, [path]);

  if (!state) return null;

  const change = async (kind: "start" | "stop") => {
    setBusy(kind);
    setError(null);
    try {
      setState(kind === "start" ? await backend.post<TunnelState>(path) : await backend.delete<TunnelState>(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(null);
    }
  };

  const link = state.running && state.url ? `${state.url}/api/v1/ingestion/webhooks/${encodeURIComponent(connectorId)}` : null;

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/50 bg-[#1a1408] p-2.5">
      <div className="flex items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-amber-500/20 text-amber-200">DEV ONLY</span>
        <span className="text-slate-300">Test link (ngrok)</span>
      </div>
      {link ? (
        <>
          <CopyField label="Test webhook URL" value={link} />
          <p className="text-slate-400">
            Temporary public link to this webhook endpoint only; nothing else of the API is exposed. Use it as the Payload URL in GitHub.
          </p>
          {state.managed && (
            <button type="button" disabled={busy !== null} onClick={() => change("stop")} className={BUTTON}>
              {busy === "stop" ? "Stopping…" : "Stop test link"}
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-slate-400">Creates a temporary public link so GitHub can reach the app running on this machine.</p>
          <button type="button" disabled={busy !== null} onClick={() => change("start")} className={PRIMARY}>
            {busy === "start" ? "Starting ngrok…" : "Create test link"}
          </button>
        </>
      )}
      {error && <p className="text-red-300">{error}</p>}
    </div>
  );
}

function SecretSection({ connectorId }: { connectorId: string }) {
  const [status, setStatus] = useState<SecretStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reveal" | "rotate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<IssuedSecret | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [immediate, setImmediate] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await backend.get<SecretStatus>(`/api/v1/connectors/${encodeURIComponent(connectorId)}/webhook-secret`));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the signing secret status.");
    }
  }, [connectorId]);

  // A different connector must never inherit the previous one's secret.
  useEffect(() => {
    setShown(null);
    setConfirming(false);
    setError(null);
    setStatus(null);
    void load();
    return () => setShown(null);
  }, [connectorId, load]);

  const act = async (kind: "reveal" | "rotate") => {
    setBusy(kind);
    setError(null);
    try {
      const base = `/api/v1/connectors/${encodeURIComponent(connectorId)}/webhook-secret`;
      const issued =
        kind === "reveal"
          ? await backend.post<IssuedSecret>(`${base}/reveal`, undefined, { confirmed: true })
          : await backend.post<IssuedSecret>(`${base}/rotate`, { immediate }, { confirmed: true });
      setShown(issued);
      setConfirming(false);
      setImmediate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return <p className="text-red-300">Signing secret unavailable: {loadError}</p>;
  }
  if (!status) return <p className="text-slate-400">Loading signing secret…</p>;

  return (
    <div className="space-y-2">
      <div className="text-slate-400">Signing secret</div>

      {shown && (
        <div role="alert" className="rounded-xl border border-amber-500/50 bg-[#1a1408] p-3 space-y-2">
          <div className="font-semibold text-amber-200">Copy this secret now. It will not be shown again.</div>
          <CopyField label="Signing secret" value={shown.secret} />
          {shown.previousValidUntil && new Date(shown.previousValidUntil) > new Date() && (
            <p className="text-slate-300">
              The previous secret keeps working until {when(shown.previousValidUntil)}.
            </p>
          )}
          <button type="button" onClick={() => setShown(null)} className={BUTTON}>
            Done — I have saved it
          </button>
        </div>
      )}

      {status.configured ? (
        <p className="text-slate-300">
          <span className="font-mono">whsec_••••{status.hint}</span> · version {status.version} · created{" "}
          {when(status.createdAt)}
          {status.previousValidUntil && new Date(status.previousValidUntil) > new Date() && (
            <span className="block text-slate-400">
              Previous secret still accepted until {when(status.previousValidUntil)}.
            </span>
          )}
        </p>
      ) : (
        <p className="text-slate-400">
          This connector has no signing secret of its own yet, so it can only be verified by the shared development
          secret. Generate one to give it its own.
        </p>
      )}

      {error && <p className="text-red-300">{error}</p>}

      {!shown && !confirming && (
        <div className="flex flex-wrap gap-2">
          {status.configured && !status.revealed && (
            <button type="button" disabled={busy !== null} onClick={() => act("reveal")} className={PRIMARY}>
              {busy === "reveal" ? "Revealing…" : "Reveal secret (shown once)"}
            </button>
          )}
          {status.configured ? (
            <button type="button" disabled={busy !== null} onClick={() => setConfirming(true)} className={BUTTON}>
              Rotate secret
            </button>
          ) : (
            <button type="button" disabled={busy !== null} onClick={() => act("rotate")} className={PRIMARY}>
              {busy === "rotate" ? "Generating…" : "Generate secret"}
            </button>
          )}
        </div>
      )}

      {confirming && (
        <div className="rounded-xl border border-slate-700/80 bg-[#0c1829] p-3 space-y-2">
          <p className="text-slate-200">
            Rotating creates a new secret. Every sender must be updated to use it.
          </p>
          <label className="flex items-start gap-2 text-slate-300">
            <input type="checkbox" checked={immediate} onChange={(e) => setImmediate(e.target.checked)} />
            <span>
              End the old secret immediately (use this if it may have leaked). Otherwise it keeps working for a
              grace period so senders can be updated without dropping events.
            </span>
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy !== null} onClick={() => act("rotate")} className={PRIMARY}>
              {busy === "rotate" ? "Rotating…" : "Rotate now"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setConfirming(false);
                setImmediate(false);
              }}
              className={BUTTON}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="text-slate-400">
        Sign each request with HMAC-SHA256 using this secret (for GitHub, paste it into the webhook&apos;s
        Secret field).
      </p>
    </div>
  );
}

export default function WebhookUrlCard({ connectorId }: { connectorId: string }) {
  const url = webhookUrlFor(
    connectorId,
    process.env.NEXT_PUBLIC_INGEST_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL
  );

  return (
    <div className="rounded-xl border border-slate-700/80 bg-[#07101e] p-3 space-y-3">
      {url ? (
        <div className="space-y-2">
          <div className="text-slate-400">Webhook URL</div>
          <CopyField label="Webhook URL" value={url} />
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-amber-300">Webhook URL not available</div>
          <p className="text-slate-400">
            No public API address is configured for this workspace, so external tools cannot reach this
            connector yet. Ask your platform operator to set it.
          </p>
        </div>
      )}
      {tunnelControlAllowed() && <TunnelControl connectorId={connectorId} />}
      <SecretSection connectorId={connectorId} />
    </div>
  );
}
