"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import type { AssistantConfig, Journey, Receipt } from "../types";
import {
  ApiError,
  createSubmissionKey,
  submitIntake,
  type IntakeKey,
  type IntakePayload,
} from "../api";
import { COPY, JOURNEY_COPY, MARKETS } from "../copy";
import { ZoikoShieldMark } from "../ZoikoShieldMark";

type Step = "loading" | "form" | "review" | "receipt" | "disabled";

interface IntakeFlowProps {
  journey: Journey;
  config: AssistantConfig;
  onClose: () => void;
  onBackToChat: () => void;
}

interface Fields {
  work_email: string;
  organization: string;
  contact_name: string;
  market: string;
  topic: string;
  description: string;
  document_id: string;
  purpose: string;
  use_case: string;
  notes: string;
  request_summary: string;
}

const EMPTY_FIELDS: Fields = {
  work_email: "",
  organization: "",
  contact_name: "",
  market: "undecided",
  topic: "",
  description: "",
  document_id: "",
  purpose: "",
  use_case: "",
  notes: "",
  request_summary: "",
};

const FLAG_FOR_JOURNEY: Record<Journey, string> = {
  demo: "assistant_lead_submit",
  support: "assistant_support_submit",
  quote: "assistant_lead_submit",
  trust: "assistant_trust_gated",
  tech: "assistant_lead_submit",
  onboarding: "assistant_lead_submit",
  privacy: "assistant_privacy_write",
};

function routeFor(journey: Journey, config: AssistantConfig) {
  if (journey === "support") return config.routes.WEB_SUPPORT;
  if (journey === "demo") return config.routes.WEB_DEMO;
  if (journey === "quote") return config.routes.WEB_PRICING;
  if (journey === "trust" || journey === "privacy") return config.routes.WEB_PRIVACY;
  if (journey === "onboarding") return config.routes.WEB_ONBOARDING;
  return config.routes.WEB_CAPABILITIES;
}

function looksLikeSecret(value: string) {
  return [
    /(?:password|passwd|pwd|api[_-]?key|secret|access[_-]?token)\s*[:=]\s*\S+/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bsk-[A-Za-z0-9]{20,}\b/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ].some((pattern) => pattern.test(value));
}

export function IntakeFlow({ journey, config, onClose, onBackToChat }: IntakeFlowProps) {
  const meta = JOURNEY_COPY[journey];
  const enabled = Boolean(config.flags[FLAG_FOR_JOURNEY[journey]]) && !config.flags.assistant_kill;
  const [step, setStep] = useState<Step>(enabled ? "loading" : "disabled");
  const [key, setKey] = useState<IntakeKey | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [transcript, setTranscript] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [uncertain, setUncertain] = useState(false);

  const start = useCallback(async () => {
    setStep("loading");
    setError(null);
    try {
      const created = await createSubmissionKey(journey);
      setKey(created);
      setStep("form");
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError?.message ?? "The request could not be started. Please try again.");
      setStep("form");
    }
  }, [journey]);

  useEffect(() => {
    if (enabled) void start();
  }, [enabled, start]);

  const setField = (name: keyof Fields, value: string) => {
    setFields((previous) => ({ ...previous, [name]: value }));
    setFieldErrors((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
  };

  const requiredNames = useMemo(() => {
    const names: Array<keyof Fields> = ["work_email", "organization"];
    if (journey === "support") names.push("topic", "description");
    if (journey === "trust") names.push("document_id", "purpose");
    if (journey === "tech") names.push("use_case");
    return names;
  }, [journey]);

  const validate = () => {
    const errors: Record<string, string[]> = {};
    for (const name of requiredNames) {
      if (!fields[name].trim()) errors[name] = [COPY.intake.required];
    }
    if (fields.work_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.work_email.trim())) {
      errors.work_email = ["Enter a valid email address"];
    }
    if (looksLikeSecret(Object.values(fields).join(" "))) {
      setError(COPY.intake.secretWarning);
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const review = () => {
    setError(null);
    if (!validate()) return;
    setStep("review");
  };

  const submit = async () => {
    if (!key) {
      await start();
      return;
    }
    if (!consent) {
      setError(COPY.intake.requiredFields);
      return;
    }
    setSubmitting(true);
    setError(null);
    setUncertain(false);
    const payload: IntakePayload = {
      idempotency_key: key.idempotency_key,
      notice_version: key.notice_version,
      consent: true,
      work_email: fields.work_email.trim(),
      organization: fields.organization.trim(),
      market: fields.market,
      locale: "en-US",
      marketing_opt_in: marketing,
      transcript_share: transcript,
      ...(fields.contact_name.trim() ? { contact_name: fields.contact_name.trim() } : {}),
      ...(journey === "support"
        ? { topic: fields.topic.trim(), description: fields.description.trim() }
        : {}),
      ...(journey === "trust"
        ? { document_id: fields.document_id.trim(), purpose: fields.purpose.trim() }
        : {}),
      ...(journey === "tech" ? { use_case: fields.use_case.trim() } : {}),
      ...(["demo", "quote", "tech"].includes(journey) && fields.notes.trim()
        ? { notes: fields.notes.trim() }
        : {}),
      ...(journey === "privacy" && fields.request_summary.trim()
        ? { request_summary: fields.request_summary.trim() }
        : {}),
    };

    try {
      const accepted = await submitIntake(journey, payload);
      setReceipt(accepted);
      setStep("receipt");
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setFieldErrors(apiError?.fieldErrors ?? {});
      if (apiError && (apiError.status === 0 || apiError.status === 503 || apiError.status === 429)) {
        setUncertain(true);
        setError(apiError.message);
      } else if (apiError?.status === 409) {
        setError(apiError.message);
        setUncertain(false);
      } else {
        setError(apiError?.message ?? "The request could not be submitted. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFields(EMPTY_FIELDS);
    setConsent(false);
    setMarketing(false);
    setTranscript(false);
    setReceipt(null);
    setError(null);
    setFieldErrors({});
    setUncertain(false);
    void start();
  };

  if (step === "disabled") {
    const route = routeFor(journey, config);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <ZoikoShieldMark className="h-11 w-11 rounded-2xl text-[14px]" />
        <div>
          <h3 className="text-[17px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">{meta.title}</h3>
          <p className="mt-2 text-[13px] leading-5 text-[var(--pa-t-52677A,#52677A)]">
            This request route is not open in chat right now. Use the published route and the team will
            pick it up.
          </p>
        </div>
        <a
          href={route?.href ?? "/help"}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[var(--pa-103848,#103848)] px-4 text-[13px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-0B2C44,#0B2C44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
        >
          {route?.label ?? "Open route"}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={onBackToChat}
          className="min-h-[38px] rounded-lg px-3 text-[12.5px] font-semibold text-[var(--pa-t-52677A,#52677A)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
        >
          {COPY.intake.back}
        </button>
      </div>
    );
  }

  if (step === "receipt" && receipt) {
    return (
      <div className="flex h-full flex-col px-5 py-5">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--pa-E8F5EC,#E8F5EC)] text-[var(--pa-t-1D7A43,#1D7A43)]">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <h3 className="mt-3 text-[19px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">{COPY.intake.acceptedTitle}</h3>
          <p className="mt-2 max-w-[310px] text-[13px] leading-5 text-[var(--pa-t-52677A,#52677A)]">
            {COPY.intake.acceptedBody}
          </p>
          <div className="mt-4 w-full max-w-[300px] rounded-xl border border-[var(--pa-DCE5EE,#DCE5EE)] bg-[var(--pa-F7FAFD,#F7FAFD)] px-4 py-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--pa-t-7B8FA2,#7B8FA2)]">
              {COPY.intake.reference}
            </p>
            <p className="mt-1 font-mono text-[13px] font-semibold text-[var(--pa-t-103848,#103848)]">
              {receipt.public_reference}
            </p>
          </div>
          <p className="mt-3 max-w-[310px] text-[11px] leading-4 text-[var(--pa-t-7B8FA2,#7B8FA2)]">
            {receipt.message}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onBackToChat}
            className="min-h-[42px] rounded-lg bg-[var(--pa-103848,#103848)] px-4 text-[13px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-0B2C44,#0B2C44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
          >
            {COPY.intake.done}
          </button>
          <button
            type="button"
            onClick={reset}
            className="min-h-[38px] rounded-lg px-3 text-[12.5px] font-semibold text-[var(--pa-t-52677A,#52677A)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
          >
            {COPY.intake.newRequest}
          </button>
        </div>
      </div>
    );
  }

  const field = (name: keyof Fields, label: string, options: { type?: string; required?: boolean } = {}) => (
    <div>
      <label htmlFor={`pa-${name}`} className="mb-1 block text-[11.5px] font-semibold text-[var(--pa-t-334E63,#334E63)]">
        {label}
        {options.required && <span className="ml-1 text-[var(--pa-t-A72F34,#A72F34)]">*</span>}
      </label>
      <input
        id={`pa-${name}`}
        type={options.type ?? "text"}
        value={fields[name]}
        onChange={(event) => setField(name, event.target.value)}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={fieldErrors[name] ? `pa-${name}-error` : undefined}
        className="min-h-[40px] w-full rounded-lg border border-[var(--pa-DCE5EE,#DCE5EE)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-2.5 text-[13px] text-[var(--pa-t-0B2C44,#0B2C44)] placeholder:text-[var(--pa-t-8FA2B3,#8FA2B3)] focus:border-[var(--pa-7B9AB5,#7B9AB5)] focus:outline-none focus:ring-2 focus:ring-[rgba(192,64,68,0.2)]"
      />
      {fieldErrors[name] && (
        <p id={`pa-${name}-error`} className="mt-1 text-[10.5px] text-[var(--pa-t-A72F34,#A72F34)]">
          {fieldErrors[name][0]}
        </p>
      )}
    </div>
  );

  const textarea = (name: keyof Fields, label: string, options: { required?: boolean; maxLength?: number } = {}) => (
    <div>
      <label htmlFor={`pa-${name}`} className="mb-1 block text-[11.5px] font-semibold text-[var(--pa-t-334E63,#334E63)]">
        {label}
        {options.required && <span className="ml-1 text-[var(--pa-t-A72F34,#A72F34)]">*</span>}
      </label>
      <textarea
        id={`pa-${name}`}
        rows={3}
        maxLength={options.maxLength ?? 500}
        value={fields[name]}
        onChange={(event) => setField(name, event.target.value)}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={fieldErrors[name] ? `pa-${name}-error` : undefined}
        className="min-h-[76px] w-full resize-y rounded-lg border border-[var(--pa-DCE5EE,#DCE5EE)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-2.5 py-2 text-[13px] leading-5 text-[var(--pa-t-0B2C44,#0B2C44)] placeholder:text-[var(--pa-t-8FA2B3,#8FA2B3)] focus:border-[var(--pa-7B9AB5,#7B9AB5)] focus:outline-none focus:ring-2 focus:ring-[rgba(192,64,68,0.2)]"
      />
      {fieldErrors[name] && (
        <p id={`pa-${name}-error`} className="mt-1 text-[10.5px] text-[var(--pa-t-A72F34,#A72F34)]">
          {fieldErrors[name][0]}
        </p>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--pa-E8EEF4,#E8EEF4)] px-5 py-4">
        <div>
          <h3 className="text-[17px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">{meta.title}</h3>
          <p className="mt-1 text-[12px] leading-[1.45] text-[var(--pa-t-63798C,#63798C)]">{meta.intro}</p>
        </div>
        <button
          type="button"
          onClick={onBackToChat}
          className="mt-0.5 flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-[var(--pa-t-52677A,#52677A)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {COPY.intake.back}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {step === "loading" ? (
          <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-[var(--pa-t-63798C,#63798C)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Starting request…
          </div>
        ) : step === "review" ? (
          <div className="space-y-3">
            <h4 className="text-[13px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">{COPY.intake.reviewTitle}</h4>
            <dl className="space-y-2 rounded-xl border border-[var(--pa-E1E8F0,#E1E8F0)] bg-[var(--pa-F7FAFD,#F7FAFD)] p-3 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--pa-t-63798C,#63798C)]">{COPY.intake.workEmail}</dt>
                <dd className="text-right font-medium text-[var(--pa-t-0B2C44,#0B2C44)]">{fields.work_email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--pa-t-63798C,#63798C)]">{COPY.intake.organization}</dt>
                <dd className="text-right font-medium text-[var(--pa-t-0B2C44,#0B2C44)]">{fields.organization}</dd>
              </div>
              {journey === "support" && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--pa-t-63798C,#63798C)]">{COPY.intake.topic}</dt>
                  <dd className="text-right font-medium text-[var(--pa-t-0B2C44,#0B2C44)]">{fields.topic}</dd>
                </div>
              )}
              {journey === "trust" && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--pa-t-63798C,#63798C)]">{COPY.intake.documentId}</dt>
                  <dd className="text-right font-medium text-[var(--pa-t-0B2C44,#0B2C44)]">{fields.document_id}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--pa-t-63798C,#63798C)]">{COPY.intake.market}</dt>
                <dd className="text-right font-medium text-[var(--pa-t-0B2C44,#0B2C44)]">
                  {MARKETS.find((market) => market.id === fields.market)?.label ?? "Not decided"}
                </dd>
              </div>
            </dl>
            <label className="flex items-start gap-2 text-[11.5px] leading-4 text-[var(--pa-t-52677A,#52677A)]">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--pa-B9C7D5,#B9C7D5)] text-[var(--pa-t-103848,#103848)] focus:ring-[var(--pa-C04044,#C04044)]"
              />
              <span>{COPY.intake.consent}</span>
            </label>
            <label className="flex items-start gap-2 text-[11.5px] leading-4 text-[var(--pa-t-52677A,#52677A)]">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--pa-B9C7D5,#B9C7D5)] text-[var(--pa-t-103848,#103848)] focus:ring-[var(--pa-C04044,#C04044)]"
              />
              <span>{COPY.intake.marketing}</span>
            </label>
            <a
              href={config.routes.WEB_PRIVACY?.href ?? "/trust"}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--pa-t-52677A,#52677A)] underline-offset-2 hover:text-[var(--pa-t-0B2C44,#0B2C44)] hover:underline"
            >
              {COPY.intake.privacyLink}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            {error && (
              <div role="alert" className="rounded-lg border border-[var(--pa-E9C8CA,#E9C8CA)] bg-[var(--pa-FFF8F8,#FFF8F8)] px-3 py-2 text-[11.5px] leading-4 text-[var(--pa-t-8E2F34,#8E2F34)]">
                {error}
                {uncertain && (
                  <button
                    type="button"
                    onClick={() => void submit()}
                    className="ml-2 font-semibold underline underline-offset-2"
                  >
                    {COPY.intake.retrySubmit}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              {field("work_email", COPY.intake.workEmail, { type: "email", required: true })}
              {field("organization", COPY.intake.organization, { required: true })}
              {field("contact_name", COPY.intake.contactName)}
              <div>
                <label htmlFor="pa-market" className="mb-1 block text-[11.5px] font-semibold text-[var(--pa-t-334E63,#334E63)]">
                  {COPY.intake.market}
                </label>
                <select
                  id="pa-market"
                  value={fields.market}
                  onChange={(event) => setField("market", event.target.value)}
                  className="min-h-[40px] w-full rounded-lg border border-[var(--pa-DCE5EE,#DCE5EE)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-2.5 text-[13px] text-[var(--pa-t-0B2C44,#0B2C44)] focus:border-[var(--pa-7B9AB5,#7B9AB5)] focus:outline-none focus:ring-2 focus:ring-[rgba(192,64,68,0.2)]"
                >
                  {MARKETS.map((market) => (
                    <option key={market.id} value={market.id}>
                      {market.label}
                    </option>
                  ))}
                </select>
              </div>
              {journey === "support" && (
                <>
                  {field("topic", COPY.intake.topic, { required: true })}
                  {textarea("description", COPY.intake.description, { required: true, maxLength: 500 })}
                </>
              )}
              {journey === "trust" && (
                <>
                  {field("document_id", COPY.intake.documentId, { required: true })}
                  {textarea("purpose", COPY.intake.purpose, { required: true, maxLength: 240 })}
                </>
              )}
              {journey === "tech" && textarea("use_case", COPY.intake.useCase, { required: true, maxLength: 500 })}
              {["demo", "quote", "tech"].includes(journey) &&
                textarea("notes", COPY.intake.notes, { maxLength: 500 })}
              {journey === "privacy" &&
                textarea("request_summary", COPY.intake.requestSummary, { maxLength: 500 })}
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-[var(--pa-E9C8CA,#E9C8CA)] bg-[var(--pa-FFF8F8,#FFF8F8)] px-3 py-2 text-[11.5px] leading-4 text-[var(--pa-t-8E2F34,#8E2F34)]">
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      {step !== "loading" && (
        <div className="border-t border-[var(--pa-E8EEF4,#E8EEF4)] px-5 py-3">
          {step === "review" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="min-h-[42px] flex-1 rounded-lg border border-[var(--pa-DCE5EE,#DCE5EE)] px-3 text-[12.5px] font-semibold text-[var(--pa-t-334E63,#334E63)] hover:bg-[var(--pa-F7FAFD,#F7FAFD)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
              >
                {COPY.intake.back}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || !consent}
                className="inline-flex min-h-[42px] flex-[2] items-center justify-center gap-1.5 rounded-lg bg-[var(--pa-103848,#103848)] px-3 text-[12.5px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-0B2C44,#0B2C44)] disabled:cursor-not-allowed disabled:bg-[var(--pa-CBD6E1,#CBD6E1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {submitting ? COPY.intake.submitting : COPY.intake.submit}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={review}
              disabled={!key}
              className="min-h-[42px] w-full rounded-lg bg-[var(--pa-103848,#103848)] px-4 text-[12.5px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-0B2C44,#0B2C44)] disabled:cursor-not-allowed disabled:bg-[var(--pa-CBD6E1,#CBD6E1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
            >
              {meta.submitLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
