"use client";

import React, { useEffect, useRef } from "react";
import { Send, Square } from "lucide-react";
import { COPY } from "./copy";

interface AssistantComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isSending: boolean;
  disabled?: boolean;
  placeholder: string;
  maxLength: number;
  counterVisibleAt: number;
  error?: string | null;
  privacyHref?: string;
}

export function AssistantComposer({
  value,
  onChange,
  onSend,
  onStop,
  isSending,
  disabled = false,
  placeholder,
  maxLength,
  counterVisibleAt,
  error,
  privacyHref = "/trust",
}: AssistantComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tooLong = value.length > maxLength;
  const canSend = value.trim().length > 0 && !tooLong && !isSending && !disabled;

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 104)}px`;
  }, [value]);

  return (
    <form
      className="border-t border-[var(--pa-E8EEF4,#E8EEF4)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-4 pb-3 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      {error && (
        <p role="alert" className="mb-2 text-[11.5px] font-medium text-[var(--pa-t-A72F34,#A72F34)]">
          {error}
        </p>
      )}
      <div
        className={[
          "flex items-end gap-2 rounded-xl border bg-[var(--pa-FFFFFF,#FFFFFF)] px-2.5 py-2 transition",
          error ? "border-[var(--pa-D9A5A8,#D9A5A8)]" : "border-[var(--pa-DCE5EE,#DCE5EE)] focus-within:border-[var(--pa-7B9AB5,#7B9AB5)]",
        ].join(" ")}
      >
        <label htmlFor="pa-composer" className="sr-only">
          {placeholder}
        </label>
        <textarea
          id="pa-composer"
          ref={textareaRef}
          rows={1}
          value={value}
          maxLength={maxLength + 200}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          className="max-h-[104px] min-h-[32px] flex-1 resize-none bg-transparent py-1 text-[13px] leading-5 text-[var(--pa-t-0B2C44,#0B2C44)] placeholder:text-[var(--pa-t-8FA2B3,#8FA2B3)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          aria-describedby="pa-composer-help"
        />
        {isSending ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={COPY.stop}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--pa-F1F5F9,#F1F5F9)] text-[var(--pa-t-334E63,#334E63)] hover:bg-[var(--pa-E2E8F0,#E2E8F0)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
          >
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label={COPY.send}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--pa-103848,#103848)] text-[#FFFFFF] transition hover:bg-[var(--pa-0B2C44,#0B2C44)] disabled:cursor-not-allowed disabled:bg-[var(--pa-CBD6E1,#CBD6E1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <div id="pa-composer-help" className="mt-2 flex items-start justify-between gap-3">
        <p className="text-[10.5px] leading-4 text-[var(--pa-t-7B8FA2,#7B8FA2)]">{COPY.fallbackSafety}</p>
        <div className="flex shrink-0 items-center gap-2">
          {value.length >= counterVisibleAt && (
            <span
              className={tooLong ? "text-[10.5px] font-semibold text-[var(--pa-t-A72F34,#A72F34)]" : "text-[10.5px] text-[var(--pa-t-7B8FA2,#7B8FA2)]"}
              aria-live="polite"
            >
              {COPY.charCounter(value.length, maxLength)}
            </span>
          )}
          <a
            href={privacyHref}
            className="text-[10.5px] font-medium text-[var(--pa-t-52677A,#52677A)] underline-offset-2 hover:text-[var(--pa-t-0B2C44,#0B2C44)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
          >
            {COPY.privacy}
          </a>
        </div>
      </div>
    </form>
  );
}
