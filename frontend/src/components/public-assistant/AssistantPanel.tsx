"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Clock,
  Moon,
  SquarePen,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import type { AssistantConfig, ChatTurn, Journey } from "./types";
import {
  ApiError,
  cancelMessage,
  clearSession,
  createMessage,
  createSession,
  loadConfig,
  sendFeedback,
  streamMessage,
} from "./api";
import { COPY } from "./copy";
import { AssistantWelcome } from "./AssistantWelcome";
import { AssistantThread } from "./AssistantThread";
import { AssistantComposer } from "./AssistantComposer";
import { AssistantHistory } from "./AssistantHistory";
import {
  clearHistory,
  deleteConversation,
  loadHistory,
  saveConversation,
  type StoredConversation,
} from "./history";
import { themeStyle, useAssistantTheme } from "./theme";
import { IntakeFlow } from "./flows/IntakeFlow";
import { OnboardingFlow } from "./flows/OnboardingFlow";
import { ZoikoShieldMark } from "./ZoikoShieldMark";

type View = "welcome" | "thread" | "intake" | "onboarding" | "history";

interface AssistantPanelProps {
  embedded?: boolean;
  onClose?: () => void;
}

function turnId() {
  const globalCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return globalCrypto.randomUUID();
  }
  return `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(query.matches);
    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  return isMobile;
}

export function AssistantPanel({ embedded = false, onClose }: AssistantPanelProps) {
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [view, setView] = useState<View>("welcome");
  const [journey, setJourney] = useState<Journey>("demo");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [theme, toggleTheme] = useAssistantTheme();
  const [conversationId, setConversationId] = useState(turnId);
  const [history, setHistory] = useState<StoredConversation[]>([]);

  const panelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(false);
  const turnsRef = useRef<ChatTurn[]>([]);
  turnsRef.current = turns;
  const abortRef = useRef<AbortController | null>(null);
  const currentMessageRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);
  const isMobile = useIsMobile();

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setConfigError(null);
    try {
      const loaded = await loadConfig(force);
      setConfig(loaded);
      setLoading(false);
      if (!embedded) {
        window.setTimeout(() => panelRef.current?.focus(), 30);
      }
      const requested = new URLSearchParams(window.location.search).get("flow");
      const allowed: Journey[] = ["demo", "support", "quote", "trust", "tech", "onboarding", "privacy"];
      if (requested && allowed.includes(requested as Journey)) {
        setJourney(requested as Journey);
        setView("intake");
      }
    } catch (error) {
      setLoading(false);
      setConfigError(
        error instanceof ApiError
          ? error.message
          : "The assistant is temporarily unavailable. You can still explore the site or contact support.",
      );
    }
  }, [embedded]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (embedded || !isMobile || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [embedded, isMobile]);

  useEffect(() => {
    if (!isSending && turns.length === 0) return;
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    bottomRef.current?.scrollIntoView?.({ behavior, block: "end" });
  }, [turns, isSending, view]);

  useEffect(() => {
    if (!onClose) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (event: Event) => {
      const requested = (event as CustomEvent<string>).detail;
      const allowed: Journey[] = ["demo", "support", "quote", "trust", "tech", "onboarding", "privacy"];
      if (!allowed.includes(requested as Journey)) return;
      setJourney(requested as Journey);
      setView("intake");
    };
    window.addEventListener("zoiko-assistant-flow", handler);
    return () => window.removeEventListener("zoiko-assistant-flow", handler);
  }, []);

  const openFlow = useCallback((next: Journey) => {
    setJourney(next);
    setView("intake");
  }, []);

  const stop = useCallback(async () => {
    stoppedRef.current = true;
    abortRef.current?.abort();
    const id = currentMessageRef.current;
    if (id) {
      await cancelMessage(id).catch(() => undefined);
    }
    setIsSending(false);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      if (!config || isSending) return;
      const content = raw.trim();
      if (!content) {
        setInputError(COPY.messageEmpty);
        return;
      }
      if ([...content].length > config.limits.message_chars) {
        setInputError(COPY.messageTooLong);
        return;
      }

      setInputError(null);
      setInput("");
      setView("thread");
      // Earlier questions give a follow-up ("tell me more") something to refer to.
      const previousQuestions = turnsRef.current
        .filter((turn) => turn.role === "user")
        .map((turn) => turn.content.slice(0, 300))
        .slice(-3);
      const userTurn: ChatTurn = { id: turnId(), role: "user", content };
      const pendingId = turnId();
      const pendingTurn: ChatTurn = { id: pendingId, role: "assistant", content: "", pending: true };
      setTurns((previous) => [...previous, userTurn, pendingTurn]);
      setIsSending(true);

      try {
        if (!sessionRef.current) {
          await createSession();
          sessionRef.current = true;
        }

        let message;
        try {
          message = await createMessage({ content, previous_questions: previousQuestions });
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            await createSession();
            sessionRef.current = true;
            message = await createMessage({ content, previous_questions: previousQuestions });
          } else {
            throw error;
          }
        }

        currentMessageRef.current = message.message_id;
        const controller = new AbortController();
        abortRef.current = controller;
        const final = await streamMessage(message.message_id, {
          signal: controller.signal,
        });

        setTurns((previous) =>
          previous.map((turn) =>
            turn.id === pendingId
              ? {
                  id: message.message_id,
                  role: "assistant",
                  content: "",
                  outcome: final.outcome,
                  blocks: final.blocks,
                  citations: final.citations,
                  followUpChips: final.follow_up_chips,
                  action: final.action,
                }
              : turn,
          ),
        );
      } catch (error) {
        if (stoppedRef.current) {
          setTurns((previous) =>
            previous.map((turn) =>
              turn.id === pendingId
                ? { id: pendingId, role: "assistant", content: "", error: COPY.stopped }
                : turn,
            ),
          );
        } else {
          const message =
            error instanceof ApiError
              ? error.message
              : "The assistant could not complete that answer. Please try again.";
          setTurns((previous) =>
            previous.map((turn) =>
              turn.id === pendingId
                ? { id: pendingId, role: "assistant", content: "", error: message }
                : turn,
            ),
          );
        }
      } finally {
        stoppedRef.current = false;
        abortRef.current = null;
        currentMessageRef.current = null;
        setIsSending(false);
      }
    },
    [config, isSending],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const prompt = (event as CustomEvent<string>).detail;
      if (typeof prompt !== "string" || !prompt.trim()) return;
      void send(prompt);
    };
    window.addEventListener("zoiko-assistant-ask", handler);
    return () => window.removeEventListener("zoiko-assistant-ask", handler);
  }, [send]);

  const retryLast = useCallback(() => {
    const lastUser = [...turns].reverse().find((turn) => turn.role === "user");
    if (!lastUser) return;
    setTurns((previous) =>
      previous.filter((turn) => turn.id !== lastUser.id && !(turn.role === "assistant" && turn.error)),
    );
    void send(lastUser.content);
  }, [turns, send]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Save once an answer has finished, never while one is still streaming.
  useEffect(() => {
    if (isSending || turns.length === 0) return;
    setHistory(saveConversation(conversationId, turns));
  }, [turns, isSending, conversationId]);

  const resetConversation = useCallback(async () => {
    setConversationId(turnId());
    stoppedRef.current = true;
    abortRef.current?.abort();
    setTurns([]);
    setInput("");
    setInputError(null);
    setView("welcome");
    setConfirmClear(false);
    sessionRef.current = false;
    await clearSession().catch(() => undefined);
    stoppedRef.current = false;
  }, []);

  // "Clear conversation" also removes it from saved history; "New chat" keeps it.
  const clearConversation = useCallback(async () => {
    setHistory(deleteConversation(conversationId));
    await resetConversation();
  }, [conversationId, resetConversation]);

  const openSaved = useCallback(
    (id: string) => {
      const item = history.find((entry) => entry.id === id);
      if (!item) return;
      stoppedRef.current = true;
      abortRef.current?.abort();
      setIsSending(false);
      setConversationId(item.id);
      setTurns(item.turns);
      setInput("");
      setInputError(null);
      setView("thread");
    },
    [history],
  );

  const onFeedback = useCallback((messageId: string, rating: "helpful" | "not_helpful") => {
    void sendFeedback("message", messageId, rating).catch(() => undefined);
  }, []);

  const statusLabel = config
    ? config.assistant.mode === "disabled"
      ? COPY.unavailableMode
      : config.flags.assistant_ai_answers
        ? COPY.online
        : COPY.staticMode
    : COPY.loading;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={!embedded && isMobile ? true : undefined}
      aria-label={config?.assistant.display_name ?? COPY.fallbackDisplayName}
      tabIndex={-1}
      className={[
        "relative flex flex-col overflow-hidden border border-[var(--pa-D8E2EC,#D8E2EC)] bg-[var(--pa-FFFFFF,#FFFFFF)] shadow-[0_24px_80px_rgba(11,44,68,0.22)] focus:outline-none",
        embedded
          ? "h-[min(720px,calc(100dvh-140px))] w-full max-w-[430px] rounded-2xl"
          : "h-[min(720px,calc(100dvh-96px))] w-[min(430px,calc(100vw-32px))] rounded-2xl max-sm:h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0",
      ].join(" ")}
      data-testid="assistant-panel"
      data-pa-theme={theme}
      style={themeStyle(theme)}
    >
      <header className="flex items-center gap-3 bg-[var(--pa-0B2C44,#0B2C44)] px-4 py-3 text-[#FFFFFF]">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <ZoikoShieldMark className="h-9 w-9 rounded-xl text-[13px]" />
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--pa-0B2C44,#0B2C44)] bg-[var(--pa-4ADE80,#4ADE80)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">
            {config?.assistant.display_name ?? COPY.fallbackDisplayName}
          </p>
          <p className="flex items-center gap-1.5 text-[10.5px] text-[#FFFFFF]/65">
            <span
              className={[
                "h-1.5 w-1.5 rounded-full",
                config?.assistant.mode === "disabled"
                  ? "bg-[var(--pa-FCA5A5,#FCA5A5)]"
                  : config?.flags.assistant_ai_answers
                    ? "bg-[var(--pa-4ADE80,#4ADE80)]"
                    : "bg-[var(--pa-FCD34D,#FCD34D)]",
              ].join(" ")}
              aria-hidden="true"
            />
            {statusLabel}
            <span aria-hidden="true">•</span>
            <span className="truncate">{config?.assistant.disclosure ?? COPY.fallbackDisclosure}</span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Chat history"
            aria-pressed={view === "history"}
            onClick={() => setView(view === "history" ? (turns.length > 0 ? "thread" : "welcome") : "history")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#FFFFFF]/75 hover:bg-[#FFFFFF]/10 hover:text-[#FFFFFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFFFF]/70"
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={COPY.newChat}
            onClick={() => void resetConversation()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#FFFFFF]/75 hover:bg-[#FFFFFF]/10 hover:text-[#FFFFFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFFFF]/70"
          >
            <SquarePen className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#FFFFFF]/75 hover:bg-[#FFFFFF]/10 hover:text-[#FFFFFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFFFF]/70"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>
          {onClose && (
            <button
              type="button"
              aria-label={COPY.closeLabel}
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#FFFFFF]/75 hover:bg-[#FFFFFF]/10 hover:text-[#FFFFFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFFFF]/70"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {config && config.assistant.mode === "static" && (
        <div className="border-b border-[var(--pa-F0E2C2,#F0E2C2)] bg-[var(--pa-FFF9EC,#FFF9EC)] px-4 py-1.5 text-[10.5px] leading-4 text-[var(--pa-t-6B4E1E,#6B4E1E)]">
          AI answers are in static-help mode. Answers use approved public content only.
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 flex-col gap-4 px-5 py-6" aria-busy="true" aria-label={COPY.loading}>
            <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-[var(--pa-EAF1F7,#EAF1F7)]" />
            <div className="mx-auto h-4 w-56 animate-pulse rounded bg-[var(--pa-EAF1F7,#EAF1F7)]" />
            <div className="mx-auto h-3 w-64 animate-pulse rounded bg-[var(--pa-F1F5F9,#F1F5F9)]" />
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-[96px] animate-pulse rounded-xl bg-[var(--pa-F4F7FA,#F4F7FA)]" />
              ))}
            </div>
          </div>
        ) : configError || !config ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--pa-FFF1F1,#FFF1F1)] text-[var(--pa-t-A72F34,#A72F34)]">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-[17px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">{COPY.unavailableTitle}</h3>
              <p className="mt-2 text-[13px] leading-5 text-[var(--pa-t-52677A,#52677A)]">
                {configError ?? COPY.fallbackFooter}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void load(true)}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-[var(--pa-103848,#103848)] px-4 text-[12.5px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-0B2C44,#0B2C44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
              >
                <Loader2 className="hidden h-3.5 w-3.5" aria-hidden="true" />
                {COPY.retry}
              </button>
              <a
                href="/help"
                className="min-h-[38px] rounded-lg px-3 text-[12px] font-semibold text-[var(--pa-t-52677A,#52677A)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
              >
                {COPY.helpFallback}
              </a>
            </div>
          </div>
        ) : config.assistant.mode === "disabled" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--pa-FFF1F1,#FFF1F1)] text-[var(--pa-t-A72F34,#A72F34)]">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-[17px] font-semibold text-[var(--pa-t-0B2C44,#0B2C44)]">{COPY.unavailableTitle}</h3>
              <p className="mt-2 text-[13px] leading-5 text-[var(--pa-t-52677A,#52677A)]">{config.welcome.unavailable}</p>
            </div>
            <a
              href={config.routes.WEB_SUPPORT?.href ?? "/help"}
              className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-[var(--pa-103848,#103848)] px-4 text-[12.5px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-0B2C44,#0B2C44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
            >
              {COPY.supportFallback}
            </a>
          </div>
        ) : view === "history" ? (
          <AssistantHistory
            items={history}
            activeId={conversationId}
            onOpen={openSaved}
            onDelete={(id) => {
              setHistory(deleteConversation(id));
              if (id === conversationId) void resetConversation();
            }}
            onDeleteAll={() => {
              setHistory(clearHistory());
              void resetConversation();
            }}
            onNewChat={() => void resetConversation()}
            onBack={() => setView(turns.length > 0 ? "thread" : "welcome")}
          />
        ) : view === "intake" ? (
          <IntakeFlow
            journey={journey}
            config={config}
            onClose={() => setView("welcome")}
            onBackToChat={() => {
              setView(turns.length > 0 ? "thread" : "welcome");
            }}
          />
        ) : view === "onboarding" ? (
          <OnboardingFlow
            config={config}
            onBackToChat={() => setView(turns.length > 0 ? "thread" : "welcome")}
            onRequestContact={() => {
              setJourney("onboarding");
              setView("intake");
            }}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {view === "thread" && turns.length > 0 ? (
                <AssistantThread
                  turns={turns}
                  onChip={(text) => void send(text)}
                  onFlow={openFlow}
                  onRetry={retryLast}
                  onFeedback={onFeedback}
                  isSending={isSending}
                />
              ) : (
                <AssistantWelcome
                  config={config}
                  onPrompt={(prompt) => void send(prompt)}
                  onFlow={openFlow}
                />
              )}
              <div ref={bottomRef} />
            </div>

            <AssistantComposer
              value={input}
              onChange={(value) => {
                setInput(value);
                if (inputError) setInputError(null);
              }}
              onSend={() => void send(input)}
              onStop={() => void stop()}
              isSending={isSending}
              placeholder={config.welcome.composerPlaceholder || COPY.fallbackPlaceholder}
              maxLength={config.limits.message_chars}
              counterVisibleAt={config.limits.counter_visible_at}
              error={inputError}
              privacyHref={config.routes.WEB_PRIVACY?.href ?? "/trust"}
            />

            <div className="flex items-start justify-between gap-3 border-t border-[var(--pa-EEF2F6,#EEF2F6)] bg-[var(--pa-FBFCFE,#FBFCFE)] px-4 py-2.5">
              <p className="text-[9.5px] leading-[1.45] text-[var(--pa-t-8FA2B3,#8FA2B3)]">
                {config.welcome.footerNotice || COPY.fallbackFooter}
              </p>
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="shrink-0 rounded px-1 py-0.5 text-[9.5px] font-semibold text-[var(--pa-t-8FA2B3,#8FA2B3)] underline-offset-2 hover:text-[var(--pa-t-52677A,#52677A)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
                >
                  {COPY.clear}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {confirmClear && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(11,44,68,0.45)] p-5">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={COPY.clear}
            className="w-full max-w-[320px] rounded-xl border border-[var(--pa-DCE5EE,#DCE5EE)] bg-[var(--pa-FFFFFF,#FFFFFF)] p-4 shadow-xl"
          >
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--pa-FFF1F1,#FFF1F1)] text-[var(--pa-t-A72F34,#A72F34)]">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="text-[13px] leading-5 text-[var(--pa-t-334E63,#334E63)]">{COPY.clearConfirm}</p>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[38px] rounded-lg px-3 text-[12px] font-semibold text-[var(--pa-t-52677A,#52677A)] hover:bg-[var(--pa-F1F5F9,#F1F5F9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void clearConversation()}
                className="min-h-[38px] rounded-lg bg-[var(--pa-A72F34,#A72F34)] px-3 text-[12px] font-semibold text-[#FFFFFF] hover:bg-[var(--pa-8E2F34,#8E2F34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pa-C04044,#C04044)] focus-visible:ring-offset-2"
              >
                {COPY.clear}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
