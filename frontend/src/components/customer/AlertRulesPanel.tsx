"use client";

import React, { useCallback, useEffect, useState } from "react";
import { backend } from "@/lib/backend";

/**
 * Alert rules a workspace administrator defines: "when an event matches these
 * conditions, raise an alert". Rules run on every newly received event. Before
 * saving, "Test against recent events" shows how often a rule would have fired,
 * so a rule that is too noisy or matches nothing is caught before it matters.
 */

export const FIELDS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "event_activity", label: "Activity (e.g. GIT_PUSH)" },
  { value: "resource_id", label: "Resource (e.g. repository)" },
  { value: "resource_type", label: "Resource type" },
  { value: "actor_user_id", label: "Actor (user)" },
  { value: "actor_email", label: "Actor email" },
  { value: "outcome", label: "Outcome (SUCCESS / FAILURE)" },
  { value: "event_class", label: "Event class" },
  { value: "event_category", label: "Event category" },
  { value: "action", label: "Action" },
  { value: "source_ip", label: "Source IP" },
  { value: "destination_ip", label: "Destination IP" },
  { value: "severity", label: "Event severity" },
];

export const OPERATORS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "EQUALS", label: "is" },
  { value: "NOT_EQUALS", label: "is not" },
  { value: "CONTAINS", label: "contains" },
  { value: "IN", label: "is one of (comma separated)" },
];

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const MAX_CONDITIONS = 10;

export interface Condition {
  field: string;
  operator: string;
  value: string | string[];
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: string;
  enabled: boolean;
  conditions: Condition[];
  threshold: number | null;
  windowMinutes: number | null;
}

export interface Draft {
  name: string;
  severity: string;
  conditions: Array<{ field: string; operator: string; value: string }>;
  useThreshold: boolean;
  threshold: string;
  windowMinutes: string;
}

export const emptyDraft = (): Draft => ({
  name: "",
  severity: "HIGH",
  conditions: [{ field: "event_activity", operator: "EQUALS", value: "" }],
  useThreshold: false,
  threshold: "5",
  windowMinutes: "10",
});

export function draftFromRule(rule: AlertRule): Draft {
  return {
    name: rule.name,
    severity: rule.severity,
    conditions: rule.conditions.map((c) => ({
      field: c.field,
      operator: c.operator,
      value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? ""),
    })),
    useThreshold: rule.threshold !== null,
    threshold: String(rule.threshold ?? 5),
    windowMinutes: String(rule.windowMinutes ?? 10),
  };
}

/** What the person typed, as the API wants it: IN becomes a list, blanks are dropped. */
export function conditionsForApi(draft: Draft): Condition[] {
  return draft.conditions.map((c) => ({
    field: c.field,
    operator: c.operator,
    value:
      c.operator === "IN"
        ? c.value.split(",").map((v) => v.trim()).filter(Boolean)
        : c.value.trim(),
  }));
}

/** The first thing wrong with a draft, in plain words, or null when it can be saved. */
export function problemWith(draft: Draft, needName = true): string | null {
  if (needName && draft.name.trim().length < 3) return "Give the rule a name (at least 3 characters).";
  if (draft.conditions.length === 0) return "Add at least one condition.";
  for (const c of conditionsForApi(draft)) {
    const empty = Array.isArray(c.value) ? c.value.length === 0 : c.value === "";
    if (empty) return "Every condition needs a value.";
  }
  if (draft.useThreshold) {
    const t = Number(draft.threshold);
    const w = Number(draft.windowMinutes);
    if (!Number.isInteger(t) || t < 2 || t > 1000) return "The number of events must be between 2 and 1000.";
    if (!Number.isInteger(w) || w < 1 || w > 1440) return "The time window must be between 1 and 1440 minutes.";
  }
  return null;
}

export function payloadFromDraft(draft: Draft) {
  return {
    name: draft.name.trim(),
    severity: draft.severity,
    conditions: conditionsForApi(draft),
    ...(draft.useThreshold
      ? { threshold: Number(draft.threshold), windowMinutes: Number(draft.windowMinutes) }
      : {}),
  };
}

/** One line a person can read: "Activity is GIT_PUSH and Resource contains payments". */
export function describeRule(rule: Pick<AlertRule, "conditions" | "threshold" | "windowMinutes">): string {
  const label = (f: string) => (FIELDS.find((x) => x.value === f)?.label ?? f).replace(/ \(.*\)$/, "");
  const op = (o: string) => (OPERATORS.find((x) => x.value === o)?.label ?? o).replace(/ \(.*\)$/, "");
  const text = rule.conditions
    .map((c) => `${label(c.field)} ${op(c.operator)} ${Array.isArray(c.value) ? c.value.join(" / ") : c.value}`)
    .join(" and ");
  return rule.threshold
    ? `${rule.threshold}+ times in ${rule.windowMinutes} min when ${text}`
    : `Every time ${text}`;
}

interface PreviewResult {
  evaluated: number;
  matched: number;
  samples: Array<{ id: string; activity?: string; resource?: string; actor?: string; outcome?: string; at?: string }>;
}

const CARD = "rounded-2xl bg-[#0a1628]/95 border border-slate-800/90 p-5 shadow-xl";
const INPUT =
  "px-3 py-1.5 rounded-xl bg-[#07101e] border border-slate-700 text-xs text-white placeholder:text-slate-500";
const SELECT = "bg-[#0c1829] border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200";
const BTN =
  "px-3.5 py-1.5 rounded-xl bg-[#0c1829] hover:bg-[#12243d] border border-slate-700/80 text-xs font-semibold text-slate-100 disabled:opacity-50";
const PRIMARY =
  "px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#dc2626] to-[#b91c1c] text-xs font-semibold text-white disabled:opacity-50";
const SEV_CLASS: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-300",
  HIGH: "bg-orange-500/20 text-orange-300",
  MEDIUM: "bg-amber-500/20 text-amber-200",
  LOW: "bg-sky-500/20 text-sky-300",
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "The request failed.");

function RuleForm({
  draft,
  setDraft,
  editing,
  onSaved,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  editing: AlertRule | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const change = (patch: Partial<Draft>) => {
    setPreview(null);
    setDraft({ ...draft, ...patch });
  };
  const setCondition = (i: number, patch: Partial<Draft["conditions"][number]>) =>
    change({ conditions: draft.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const test = async () => {
    const problem = problemWith(draft, false);
    if (problem) return setError(problem);
    setBusy("test");
    setError(null);
    try {
      const r = await backend.post<{ data: PreviewResult }>("/api/v1/alert-rules/preview", {
        conditions: conditionsForApi(draft),
      });
      setPreview(r.data);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const problem = problemWith(draft);
    if (problem) return setError(problem);
    setBusy("save");
    setError(null);
    try {
      if (editing) await backend.patch(`/api/v1/alert-rules/${editing.id}`, payloadFromDraft(draft));
      else await backend.post("/api/v1/alert-rules", payloadFromDraft(draft));
      onSaved();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700/80 bg-[#07101e] p-4 space-y-3 text-xs">
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Rule name"
          placeholder="Rule name, e.g. Push to payments repo"
          maxLength={120}
          value={draft.name}
          onChange={(e) => change({ name: e.target.value })}
          className={`${INPUT} flex-1 min-w-[14rem]`}
        />
        <select aria-label="Severity" value={draft.severity} onChange={(e) => change({ severity: e.target.value })} className={SELECT}>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s[0] + s.slice(1).toLowerCase()} severity
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="text-slate-400">Raise an alert when an event matches all of these:</div>
        {draft.conditions.map((c, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <select aria-label={`Condition ${i + 1} field`} value={c.field} onChange={(e) => setCondition(i, { field: e.target.value })} className={SELECT}>
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select aria-label={`Condition ${i + 1} operator`} value={c.operator} onChange={(e) => setCondition(i, { operator: e.target.value })} className={SELECT}>
              {OPERATORS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              aria-label={`Condition ${i + 1} value`}
              placeholder={c.operator === "IN" ? "alice, bob" : "value"}
              maxLength={c.operator === "IN" ? 2000 : 200}
              value={c.value}
              onChange={(e) => setCondition(i, { value: e.target.value })}
              className={`${INPUT} flex-1 min-w-[10rem]`}
            />
            {draft.conditions.length > 1 && (
              <button type="button" aria-label={`Remove condition ${i + 1}`} onClick={() => change({ conditions: draft.conditions.filter((_, j) => j !== i) })} className={BTN}>
                ✕
              </button>
            )}
          </div>
        ))}
        {draft.conditions.length < MAX_CONDITIONS && (
          <button
            type="button"
            onClick={() => change({ conditions: [...draft.conditions, { field: "outcome", operator: "EQUALS", value: "" }] })}
            className={BTN}
          >
            + Add condition
          </button>
        )}
        <p className="text-slate-500">Matching ignores upper/lower case.</p>
      </div>

      <label className="flex items-center gap-2 text-slate-300">
        <input type="checkbox" checked={draft.useThreshold} onChange={(e) => change({ useThreshold: e.target.checked })} />
        Only alert when it happens several times
      </label>
      {draft.useThreshold && (
        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          Alert after
          <input aria-label="Number of events" inputMode="numeric" value={draft.threshold} onChange={(e) => change({ threshold: e.target.value })} className={`${INPUT} w-20`} />
          matching events within
          <input aria-label="Window in minutes" inputMode="numeric" value={draft.windowMinutes} onChange={(e) => change({ windowMinutes: e.target.value })} className={`${INPUT} w-20`} />
          minutes (then stays quiet for the rest of that window)
        </div>
      )}

      {preview && (
        <div role="status" className="rounded-lg border border-slate-700 bg-[#0c1829] p-3 space-y-1">
          <div className="text-slate-100 font-semibold">
            {preview.evaluated === 0
              ? "No events have been received yet, so there is nothing to test against."
              : `Would have matched ${preview.matched} of your last ${preview.evaluated} events.`}
          </div>
          {preview.evaluated > 0 && preview.matched === 0 && (
            <div className="text-amber-300">Nothing matched. Check the spelling of the values.</div>
          )}
          {preview.samples.map((s) => (
            <div key={s.id} className="text-slate-400 font-mono">
              {[s.activity, s.resource, s.actor, s.outcome].filter(Boolean).join(" · ")}
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={test} className={BTN}>
          {busy === "test" ? "Testing…" : "Test against recent events"}
        </button>
        <button type="button" disabled={busy !== null} onClick={save} className={PRIMARY}>
          {busy === "save" ? "Saving…" : editing ? "Save changes" : "Create rule"}
        </button>
        <button type="button" disabled={busy !== null} onClick={onCancel} className={BTN}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AlertRulesPanel() {
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<{ draft: Draft; editing: AlertRule | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await backend.get<{ data: AlertRule[] }>("/api/v1/alert-rules");
      setRules(r.data ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (rule: AlertRule) => {
    setBusyId(rule.id);
    setNotice(null);
    try {
      await backend.post(`/api/v1/alert-rules/${rule.id}/enabled`, { enabled: !rule.enabled });
      await load();
    } catch (e) {
      setNotice(messageOf(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={`${CARD} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-white">My alert rules</h2>
          <p className="text-xs text-slate-400">
            Alerts you define yourself. Each rule is checked against every new event your connectors send.
          </p>
        </div>
        {!form && (
          <button type="button" onClick={() => setForm({ draft: emptyDraft(), editing: null })} className={PRIMARY}>
            + New alert rule
          </button>
        )}
      </div>

      {form && (
        <RuleForm
          draft={form.draft}
          setDraft={(draft) => setForm({ ...form, draft })}
          editing={form.editing}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            setNotice(form.editing ? "Rule updated." : "Rule created. It applies to events received from now on.");
            void load();
          }}
        />
      )}

      {notice && <p role="status" className="text-xs text-emerald-300">{notice}</p>}
      {loadError && <p role="alert" className="text-xs text-red-300">Could not load your alert rules: {loadError}</p>}
      {!loadError && rules === null && <p className="text-xs text-slate-400">Loading…</p>}
      {rules && rules.length === 0 && !form && (
        <p className="text-xs text-slate-400">
          You have not created any alert rules yet. Try one such as “Activity is GIT_PUSH and Resource is your-org/your-repo”.
        </p>
      )}

      <ul className="space-y-2">
        {(rules ?? []).map((rule) => (
          <li key={rule.id} className="rounded-xl border border-slate-800 bg-[#0d1c33]/90 p-3 flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{rule.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${SEV_CLASS[rule.severity] ?? ""}`}>{rule.severity}</span>
                {!rule.enabled && <span className="text-[11px] text-slate-400">Off</span>}
              </div>
              <div className="text-xs text-slate-400 break-words">{describeRule(rule)}</div>
            </div>
            <div className="flex gap-2">
              <button type="button" className={BTN} onClick={() => setForm({ draft: draftFromRule(rule), editing: rule })}>
                Edit
              </button>
              <button type="button" disabled={busyId === rule.id} className={BTN} onClick={() => toggle(rule)}>
                {rule.enabled ? "Turn off" : "Turn on"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
