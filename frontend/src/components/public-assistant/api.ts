import type {
  AnswerAction,
  AnswerBlock,
  AssistantConfig,
  Citation,
  FinalEvent,
  Journey,
  MessageResponse,
  Receipt,
  SessionResponse,
  StatusResponse,
} from "./types";

const BASE = "/api/public/chat/v1";

export interface ApiErrorBody {
  error_code?: string;
  user_safe_message?: string;
  field_errors?: Record<string, string[]>;
  retry_after?: number;
  correlation_id?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]>;
  readonly retryAfter?: number;
  readonly correlationId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.user_safe_message || "The request could not be completed.");
    this.name = "ApiError";
    this.status = status;
    this.code = body.error_code || "ASSISTANT_ERROR";
    this.fieldErrors = body.field_errors ?? {};
    this.retryAfter = body.retry_after;
    this.correlationId = body.correlation_id;
  }
}

function newClientMessageId(): string {
  const globalCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return globalCrypto.randomUUID();
  }
  return `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  headers.set("accept", "application/json");

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, {
      error_code: "ASSISTANT_UNAVAILABLE",
      user_safe_message:
        "The assistant is temporarily unavailable. You can still explore the site or contact support.",
    });
  }

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = {};
    }
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function fetchConfig(): Promise<AssistantConfig> {
  return request<AssistantConfig>("/config");
}

export function fetchStatus(): Promise<StatusResponse> {
  return request<StatusResponse>("/status");
}

let configPromise: Promise<AssistantConfig> | null = null;

/**
 * Config is fetched once per page load. A failed request clears the cache so the
 * Retry button performs a real network call.
 */
export function loadConfig(force = false): Promise<AssistantConfig> {
  if (!configPromise || force) {
    configPromise = fetchConfig().catch((error) => {
      configPromise = null;
      throw error;
    });
  }
  return configPromise;
}

export function createSession(): Promise<SessionResponse> {
  return request<SessionResponse>("/sessions", { method: "POST", body: "{}" });
}

export function clearSession(): Promise<{ cleared: boolean }> {
  return request<{ cleared: boolean }>("/sessions/clear", { method: "POST", body: "{}" });
}

export interface SendMessageInput {
  content: string;
  locale?: string;
  market?: string;
  intent_key?: string;
  /** The visitor's earlier questions in this chat, oldest first. Context only. */
  previous_questions?: string[];
}

export function createMessage(input: SendMessageInput): Promise<MessageResponse> {
  return request<MessageResponse>("/messages", {
    method: "POST",
    body: JSON.stringify({
      client_message_id: newClientMessageId(),
      content: input.content,
      locale: input.locale ?? "en-US",
      market: input.market ?? "undecided",
      ...(input.intent_key ? { intent_key: input.intent_key } : {}),
      ...(input.previous_questions?.length ? { previous_questions: input.previous_questions } : {}),
    }),
  });
}

export function cancelMessage(messageId: string): Promise<{ cancelled: boolean }> {
  return request<{ cancelled: boolean }>(
    `/messages/${encodeURIComponent(messageId)}/cancel`,
    { method: "POST", body: "{}" },
  );
}

export type StreamEventType =
  | "acknowledged"
  | "progress"
  | "delta"
  | "final"
  | "safety_limited"
  | "error";

export interface StreamEvent {
  type: StreamEventType;
  data: Record<string, unknown>;
}

interface ParsedSseEvent {
  type: string;
  data: string;
}

function parseSseBlock(block: string): ParsedSseEvent | null {
  let type = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") type = value;
    if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { type, data: dataLines.join("\n") };
}

export interface StreamHandlers {
  onEvent?: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

/**
 * The BFF replays its validated event list as `text/event-stream`. Reading it
 * with fetch (rather than EventSource) keeps cookies same-origin and lets the
 * caller abort a cancelled message.
 */
export async function streamMessage(
  messageId: string,
  handlers: StreamHandlers = {},
): Promise<FinalEvent> {
  let response: Response;
  try {
    response = await fetch(
      `${BASE}/messages/${encodeURIComponent(messageId)}/events`,
      {
        headers: { accept: "text/event-stream" },
        credentials: "same-origin",
        cache: "no-store",
        signal: handlers.signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(503, {
      error_code: "ASSISTANT_UNAVAILABLE",
      user_safe_message:
        "The assistant is temporarily unavailable. You can still explore the site or contact support.",
    });
  }

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = {};
    }
    throw new ApiError(response.status, body);
  }

  if (!response.body) {
    throw new ApiError(503, {
      error_code: "ASSISTANT_UNAVAILABLE",
      user_safe_message: "The assistant could not finish that answer. Please try again.",
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalEvent: FinalEvent | null = null;
  let streamError: StreamEvent | null = null;

  const consume = (block: string) => {
    const parsed = parseSseBlock(block);
    if (!parsed) return;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(parsed.data) as Record<string, unknown>;
    } catch {
      data = { raw: parsed.data };
    }
    const event = { type: parsed.type as StreamEventType, data };
    handlers.onEvent?.(event);
    if (parsed.type === "final") {
      finalEvent = data as unknown as FinalEvent;
    }
    if (parsed.type === "error") {
      streamError = event;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        if (block.trim()) consume(block);
        separator = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n");
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }

  if (finalEvent) return finalEvent;

  if (streamError) {
    const data = (streamError as StreamEvent).data;
    throw new ApiError(409, {
      error_code: String(data.error_code ?? "STREAM_ERROR"),
      user_safe_message: String(
        data.user_safe_message ?? "The message could not be completed. Please try again.",
      ),
    });
  }

  throw new ApiError(503, {
    error_code: "STREAM_INCOMPLETE",
    user_safe_message: "The answer did not finish. Please try again.",
  });
}

export interface IntakeKey {
  idempotency_key: string;
  expires_at: string;
  notice_version: string;
}

export function createSubmissionKey(journey: Journey): Promise<IntakeKey> {
  return request<IntakeKey>("/submissions/keys", {
    method: "POST",
    body: JSON.stringify({ journey }),
  });
}

export interface IntakePayload {
  idempotency_key: string;
  notice_version: string;
  consent: boolean;
  work_email: string;
  organization: string;
  contact_name?: string;
  market?: string;
  locale?: string;
  topic?: string;
  description?: string;
  document_id?: string;
  purpose?: string;
  use_case?: string;
  notes?: string;
  request_summary?: string;
  persona?: string;
  topic_ids?: string[];
  transcript_share?: boolean;
  marketing_opt_in?: boolean;
}

const INTAKE_PATH: Record<Journey, string> = {
  demo: "/demo-requests",
  support: "/support/requests",
  quote: "/commercial/inquiries",
  trust: "/trust/access-requests",
  tech: "/technical-reviews",
  onboarding: "/onboarding/requests",
  privacy: "/privacy/requests",
};

export function submitIntake(journey: Journey, payload: IntakePayload): Promise<Receipt> {
  return request<Receipt>(INTAKE_PATH[journey], {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface OnboardingQuestion {
  id: string;
  persona: string;
  question: string;
  topic: string;
}

export interface OnboardingChecklistStep {
  id: string;
  topic: string;
  title: string;
  sourceId: string;
  source_title: string | null;
  source_url: string | null;
}

export function fetchOnboardingQuestions(): Promise<{
  personas: Array<{ id: string; label: string }>;
  questions: OnboardingQuestion[];
}> {
  return request("/onboarding/questions");
}

export function fetchOnboardingChecklist(
  persona?: string,
  topicIds?: string[],
): Promise<{
  persona: string | null;
  steps: OnboardingChecklistStep[];
  disclaimer: string;
}> {
  return request("/onboarding/checklists", {
    method: "POST",
    body: JSON.stringify({
      ...(persona ? { persona } : {}),
      ...(topicIds && topicIds.length > 0 ? { topic_ids: topicIds } : {}),
    }),
  });
}

export function sendFeedback(
  targetType: "message" | "flow" | "discovery",
  targetId: string,
  rating: "helpful" | "not_helpful",
  reasonCode?: string,
): Promise<{ accepted: boolean }> {
  return request("/feedback", {
    method: "POST",
    body: JSON.stringify({
      target_type: targetType,
      target_id: targetId,
      rating,
      ...(reasonCode ? { reason_code: reasonCode } : {}),
    }),
  });
}

export type { AnswerAction, AnswerBlock, Citation };
