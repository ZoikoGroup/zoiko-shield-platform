"use client";

import React, { useId, useState } from "react";
import { UserCheck } from "lucide-react";
import { ZoikoShieldApiClient } from "@/lib/api-client";
import { formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  EmailErrorNotice,
  EmailNotice,
  EmailTime,
  classifyEmailError,
  type ClassifiedEmailError,
} from "@/components/email/EmailSecurityUi";

export interface ShareableManifest {
  id: string;
  time_start?: string;
  time_end?: string;
  status?: string;
}

const MAX_MANIFESTS = 50;

/**
 * WF-09 / T09: an external auditor only sees evidence that was expressly
 * shared, for a bounded time. The admin must pick the manifests; there is no
 * "share everything" option.
 */
export function AuditorGrantForm({
  manifests,
  onGranted,
}: {
  manifests: ShareableManifest[];
  onGranted?: () => void;
}) {
  const [auditorPrincipalId, setAuditorPrincipalId] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ClassifiedEmailError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const auditorId = useId();
  const hoursId = useId();
  const legendId = useId();

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, MAX_MANIFESTS),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (selected.length === 0) {
      setError({
        kind: "ERROR",
        status: null,
        message: "Select at least one evidence manifest to share.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await ZoikoShieldApiClient.grantEmailAuditorAccess({
        auditorPrincipalId: auditorPrincipalId.trim(),
        expiresInHours,
        manifestIds: selected,
      });
      setMessage(
        `Auditor access to ${selected.length} manifest(s) granted until ${formatTimestamp(res?.expiresAt)} (T09).`,
      );
      setSelected([]);
      onGranted?.();
    } catch (err) {
      setError(classifyEmailError(err, "Failed to grant auditor access."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="p-5 rounded-xl bg-raised border border-line space-y-3 text-xs"
      aria-label="Share evidence with an external auditor"
    >
      <h2 className="text-sm font-bold text-slate-100">Share Evidence with an External Auditor</h2>
      <p className="text-slate-400">
        Time-limited, least-privilege access to the selected manifests only. This is not a public
        link.
      </p>
      {message && <EmailNotice tone="success">{message}</EmailNotice>}
      <EmailErrorNotice error={error} />

      <fieldset aria-labelledby={legendId} className="space-y-1.5">
        <legend id={legendId} className="font-mono text-slate-400">
          Manifests to share ({selected.length} selected, max {MAX_MANIFESTS})
        </legend>
        {manifests.length === 0 ? (
          <p className="text-slate-400">No evidence manifests exist yet. Build one first.</p>
        ) : (
          <ul className="max-h-48 overflow-auto space-y-1">
            {manifests.map((m) => {
              const inputId = `share-${m.id}`;
              return (
                <li key={m.id}>
                  <label htmlFor={inputId} className="flex items-center gap-2 cursor-pointer">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={() => toggle(m.id)}
                    />
                    <span className="font-mono text-slate-200">
                      {m.id}
                      {m.time_start ? (
                        <>
                          {" "}
                          · <EmailTime iso={m.time_start} /> → <EmailTime iso={m.time_end} />
                        </>
                      ) : null}
                      {m.status ? ` · ${m.status}` : ""}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="space-y-1">
          <label htmlFor={auditorId} className="block font-mono text-slate-400">
            External auditor principal ID
          </label>
          <input
            id={auditorId}
            type="text"
            required
            value={auditorPrincipalId}
            onChange={(e) => setAuditorPrincipalId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={hoursId} className="block font-mono text-slate-400">
            Expiry window (1–168 hours)
          </label>
          <input
            id={hoursId}
            type="number"
            min={1}
            max={168}
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-slate-100 font-mono"
          />
        </div>
        <Button type="submit" variant="cyan" disabled={submitting || manifests.length === 0}>
          <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Grant Bounded Access</span>
        </Button>
      </div>
    </form>
  );
}
