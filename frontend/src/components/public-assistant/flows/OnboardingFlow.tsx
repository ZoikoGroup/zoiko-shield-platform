"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Loader2 } from "lucide-react";
import type { AssistantConfig } from "../types";
import {
  fetchOnboardingChecklist,
  fetchOnboardingQuestions,
  type OnboardingChecklistStep,
  type OnboardingQuestion,
} from "../api";
import { COPY } from "../copy";

interface OnboardingFlowProps {
  config: AssistantConfig;
  onBackToChat: () => void;
  onRequestContact: () => void;
}

export function OnboardingFlow({ config, onBackToChat, onRequestContact }: OnboardingFlowProps) {
  const [personas, setPersonas] = useState<Array<{ id: string; label: string }>>([]);
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [persona, setPersona] = useState<string>("");
  const [steps, setSteps] = useState<OnboardingChecklistStep[]>([]);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [disclaimer, setDisclaimer] = useState<string>(COPY.onboardingIntro);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchOnboardingQuestions()
      .then((data) => {
        if (!active) return;
        setPersonas(data.personas);
        setQuestions(data.questions);
        setPersona(data.personas[0]?.id ?? "");
      })
      .catch(() => {
        if (active) setError("The onboarding questions could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!persona) return;
    let active = true;
    fetchOnboardingChecklist(persona)
      .then((data) => {
        if (!active) return;
        setSteps(data.steps);
        setDisclaimer(data.disclaimer);
        setError(null);
      })
      .catch(() => {
        if (active) setError("The checklist could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [persona]);

  const personaQuestions = useMemo(
    () => questions.filter((question) => question.persona === persona),
    [questions, persona],
  );
  const completedCount = steps.filter((step) => completed[step.id]).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--pa-E8EEF4,#E8EEF4)] px-5 py-4">
        <div>
          <h3 className="text-[17px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">{COPY.onboarding}</h3>
          <p className="mt-1 text-[12px] leading-[1.45] text-[var(--pa-t-63798C,#63798C)]">{COPY.onboardingIntro}</p>
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
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-[var(--pa-t-63798C,#63798C)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {COPY.onboardingLoading}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pa-t-7B8FA2,#7B8FA2)]">
                Your team
              </p>
              <div className="flex flex-wrap gap-1.5">
                {personas.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={persona === item.id}
                    onClick={() => setPersona(item.id)}
                    className={[
                      "min-h-[34px] rounded-full border px-2.5 text-[11.5px] font-medium transition",
                      persona === item.id
                        ? "border-[var(--pa-103848,#103848)] bg-[var(--pa-103848,#103848)] text-[#FFFFFF]"
                        : "border-[var(--pa-DCE5EE,#DCE5EE)] bg-[var(--pa-FFFFFF,#FFFFFF)] text-[var(--pa-t-334E63,#334E63)] hover:border-[var(--pa-9FB3C8,#9FB3C8)]",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {personaQuestions.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pa-t-7B8FA2,#7B8FA2)]">
                  Questions to answer
                </p>
                <ul className="space-y-1.5">
                  {personaQuestions.map((question) => (
                    <li
                      key={question.id}
                      className="rounded-lg border border-[var(--pa-E1E8F0,#E1E8F0)] bg-[var(--pa-F7FAFD,#F7FAFD)] px-2.5 py-2 text-[12px] leading-4 text-[var(--pa-t-334E63,#334E63)]"
                    >
                      {question.question}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pa-t-7B8FA2,#7B8FA2)]">
                  Checklist
                </p>
                <span className="text-[10.5px] text-[var(--pa-t-7B8FA2,#7B8FA2)]">
                  {completedCount} / {steps.length}
                </span>
              </div>
              <ul className="space-y-1.5">
                {steps.map((step) => {
                  const done = Boolean(completed[step.id]);
                  return (
                    <li key={step.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--pa-E1E8F0,#E1E8F0)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-2.5 py-2 hover:bg-[var(--pa-F9FBFD,#F9FBFD)]">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={(event) =>
                            setCompleted((previous) => ({ ...previous, [step.id]: event.target.checked }))
                          }
                          className="mt-0.5 h-4 w-4 rounded border-[var(--pa-B9C7D5,#B9C7D5)] text-[var(--pa-t-103848,#103848)] focus:ring-[var(--pa-C04044,#C04044)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={[
                              "block text-[12px] leading-4",
                              done ? "text-[var(--pa-t-7B8FA2,#7B8FA2)] line-through" : "text-[var(--pa-t-334E63,#334E63)]",
                            ].join(" ")}
                          >
                            {step.title}
                          </span>
                          {step.source_url && step.source_title && (
                            <a
                              href={step.source_url}
                              className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-[var(--pa-t-52677A,#52677A)] underline-offset-2 hover:text-[var(--pa-t-0B2C44,#0B2C44)] hover:underline"
                            >
                              {step.source_title}
                              <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                            </a>
                          )}
                        </span>
                        {done && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pa-t-1D7A43,#1D7A43)]" aria-hidden="true" />}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="text-[10.5px] leading-4 text-[var(--pa-t-7B8FA2,#7B8FA2)]">{disclaimer}</p>
            {error && (
              <p role="alert" className="rounded-lg border border-[var(--pa-E9C8CA,#E9C8CA)] bg-[var(--pa-FFF8F8,#FFF8F8)] px-3 py-2 text-[11.5px] text-[var(--pa-t-8E2F34,#8E2F34)]">
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--pa-E8EEF4,#E8EEF4)] px-5 py-3">
        <button
          type="button"
          onClick={onRequestContact}
          disabled={Boolean(config.flags.assistant_kill)}
          className="min-h-[42px] w-full rounded-lg bg-[var(--pa-103848,#103848)] px-4 text-[12.5px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-0B2C44,#0B2C44)] disabled:cursor-not-allowed disabled:bg-[var(--pa-CBD6E1,#CBD6E1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
        >
          {COPY.onboardingRequest}
        </button>
      </div>
    </div>
  );
}
