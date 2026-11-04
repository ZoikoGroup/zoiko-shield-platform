"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ExternalLink,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { AnswerBlock, ChatTurn, Journey } from "./types";
import { COPY } from "./copy";
import { ZoikoShieldMark } from "./ZoikoShieldMark";

interface AssistantThreadProps {
  turns: ChatTurn[];
  onChip: (text: string) => void;
  onFlow: (journey: Journey) => void;
  onRetry: () => void;
  onFeedback: (messageId: string, rating: "helpful" | "not_helpful") => void;
  isSending: boolean;
}

function Block({ block }: { block: AnswerBlock }) {
  if (block.type === "bullets" && block.items?.length) {
    return (
      <ul className="ml-4 list-disc space-y-1.5 text-[13px] leading-5 text-[var(--pa-t-334E63,#334E63)]">
        {block.items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 16)}`}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "note") {
    return (
      <p className="border-t border-[var(--pa-EEF2F6,#EEF2F6)] pt-2 text-[11px] leading-4 text-[var(--pa-t-7B8FA2,#7B8FA2)]">
        {block.text}
      </p>
    );
  }
  if (block.type === "callout") {
    return (
      <div className="flex gap-2 rounded-lg border border-[var(--pa-E7D6B5,#E7D6B5)] bg-[var(--pa-FFF9EC,#FFF9EC)] px-3 py-2.5 text-[12.5px] leading-5 text-[var(--pa-t-6B4E1E,#6B4E1E)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pa-t-A9761B,#A9761B)]" aria-hidden="true" />
        <p>{block.text}</p>
      </div>
    );
  }
  return <p className="text-[13px] leading-5 text-[var(--pa-t-334E63,#334E63)]">{block.text}</p>;
}

function AssistantTurn({
  turn,
  onChip,
  onFlow,
  onRetry,
  onFeedback,
}: {
  turn: ChatTurn;
  onChip: (text: string) => void;
  onFlow: (journey: Journey) => void;
  onRetry: () => void;
  onFeedback: (messageId: string, rating: "helpful" | "not_helpful") => void;
}) {
  const [feedback, setFeedback] = useState<"helpful" | "not_helpful" | null>(null);

  if (turn.pending) {
    return (
      <div className="flex items-start gap-2.5" aria-live="polite">
        <Avatar />
        <div className="rounded-2xl rounded-tl-md border border-[var(--pa-E1E8F0,#E1E8F0)] bg-[var(--pa-F7FAFD,#F7FAFD)] px-3.5 py-3">
          <span className="sr-only">{COPY.thinking}</span>
          <span className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--pa-7B8FA2,#7B8FA2)] [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--pa-7B8FA2,#7B8FA2)] [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--pa-7B8FA2,#7B8FA2)]" />
          </span>
        </div>
      </div>
    );
  }

  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[var(--pa-103848,#103848)] px-3.5 py-2.5 text-[13px] leading-5 text-[#FFFFFF]">
          {turn.content}
        </div>
      </div>
    );
  }

  if (turn.error) {
    return (
      <div className="flex items-start gap-2.5">
        <Avatar />
        <div className="rounded-2xl rounded-tl-md border border-[var(--pa-E9C8CA,#E9C8CA)] bg-[var(--pa-FFF8F8,#FFF8F8)] px-3.5 py-3">
          <p className="text-[13px] leading-5 text-[var(--pa-t-8E2F34,#8E2F34)]">{turn.error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--pa-D9A5A8,#D9A5A8)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-2.5 text-[12px] font-semibold text-[var(--pa-t-8E2F34,#8E2F34)] hover:bg-[var(--pa-FFF1F1,#FFF1F1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {COPY.retryAnswer}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="space-y-2.5 rounded-2xl rounded-tl-md border border-[var(--pa-E1E8F0,#E1E8F0)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-3.5 py-3 shadow-[0_1px_2px_rgba(11,44,68,0.04)]">
          {(turn.blocks ?? []).map((block, index) => (
            <Block key={`${turn.id}-block-${index}`} block={block} />
          ))}

          {turn.citations && turn.citations.length > 0 && (
            <div className="border-t border-[var(--pa-EEF2F6,#EEF2F6)] pt-2.5">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--pa-t-7B8FA2,#7B8FA2)]">
                {COPY.sources}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {turn.citations.map((citation) => (
                  <a
                    key={citation.source_id}
                    href={citation.url}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--pa-DCE5EE,#DCE5EE)] bg-[var(--pa-F7FAFD,#F7FAFD)] px-2 py-1 text-[11px] font-medium text-[var(--pa-t-334E63,#334E63)] hover:border-[var(--pa-9FB3C8,#9FB3C8)] hover:text-[var(--pa-t-0B2C44,#0B2C44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
                  >
                    {citation.title}
                    <ExternalLink className="h-3 w-3 text-[var(--pa-t-8FA2B3,#8FA2B3)]" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {turn.action && (
            <div className="pt-0.5">
              {turn.action.type === "flow" && turn.action.flow ? (
                <button
                  type="button"
                  onClick={() => onFlow(turn.action!.flow as Journey)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[var(--pa-103848,#103848)] px-3 text-[12.5px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-0B2C44,#0B2C44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
                >
                  {turn.action.label}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : (
                <a
                  href={turn.action.href ?? "/help"}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[var(--pa-DCE5EE,#DCE5EE)] px-3 text-[12.5px] font-semibold text-[var(--pa-t-103848,#103848)] hover:bg-[var(--pa-F6F9FC,#F6F9FC)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
                >
                  {turn.action.label}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>

        {turn.followUpChips && turn.followUpChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label={COPY.followUp}>
            {turn.followUpChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => onChip(chip)}
                className="min-h-[34px] rounded-full border border-[var(--pa-DCE5EE,#DCE5EE)] bg-[var(--pa-FFFFFF,#FFFFFF)] px-2.5 text-[11.5px] font-medium text-[var(--pa-t-334E63,#334E63)] hover:border-[var(--pa-9FB3C8,#9FB3C8)] hover:bg-[var(--pa-F7FAFD,#F7FAFD)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="This answer was helpful"
            aria-pressed={feedback === "helpful"}
            onClick={() => {
              setFeedback("helpful");
              onFeedback(turn.id, "helpful");
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--pa-t-8FA2B3,#8FA2B3)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] hover:text-[var(--pa-t-103848,#103848)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
          >
            {feedback === "helpful" ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label="This answer was not helpful"
            aria-pressed={feedback === "not_helpful"}
            onClick={() => {
              setFeedback("not_helpful");
              onFeedback(turn.id, "not_helpful");
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--pa-t-8FA2B3,#8FA2B3)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] hover:text-[var(--pa-t-103848,#103848)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
          >
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
      <ZoikoShieldMark className="h-7 w-7 rounded-full text-[10px]" />
    </span>
  );
}

export function AssistantThread({
  turns,
  onChip,
  onFlow,
  onRetry,
  onFeedback,
  isSending,
}: AssistantThreadProps) {
  return (
    <div
      className="flex flex-col gap-3.5 px-4 py-4"
      role="log"
      aria-live="polite"
      aria-busy={isSending}
      aria-label="Conversation"
    >
      {turns.map((turn) => (
        <AssistantTurn
          key={turn.id}
          turn={turn}
          onChip={onChip}
          onFlow={onFlow}
          onRetry={onRetry}
          onFeedback={onFeedback}
        />
      ))}
    </div>
  );
}
