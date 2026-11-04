import type { ChatTurn } from "./types";

/*
 * Chat history lives in this browser only (localStorage). The assistant
 * service keeps no transcript, so nothing here can be restored from the server.
 * Turns the service refused (secrets, privileged requests) and failed or
 * unfinished turns are never saved.
 */
export const HISTORY_STORAGE_KEY = "zs_pa_history_v1";
export const HISTORY_MAX_CONVERSATIONS = 20;

export interface StoredConversation {
  id: string;
  title: string;
  updatedAt: number;
  turns: ChatTurn[];
}

function isConversation(value: unknown): value is StoredConversation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.updatedAt === "number" &&
    Array.isArray(item.turns)
  );
}

export function loadHistory(): StoredConversation[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isConversation).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function persist(items: StoredConversation[]) {
  try {
    window.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(items.slice(0, HISTORY_MAX_CONVERSATIONS)),
    );
  } catch {
    // Storage can be full or blocked; history is a convenience, so fail quietly.
  }
}

/** Keep only finished, user-safe turns: drops pending, errored and refused answers with their question. */
export function savableTurns(turns: ChatTurn[]): ChatTurn[] {
  const kept: ChatTurn[] = [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (turn.role !== "user") continue;
    const answer = turns[index + 1];
    if (!answer || answer.role !== "assistant" || answer.pending || answer.error) continue;
    if (answer.outcome === "REJECTED" || answer.outcome === "ERROR") continue;
    kept.push(turn, answer);
  }
  return kept;
}

export function titleFor(turns: ChatTurn[]): string {
  const first = turns.find((turn) => turn.role === "user")?.content.trim() ?? "";
  const collapsed = first.replace(/\s+/g, " ");
  return collapsed.length > 60 ? `${collapsed.slice(0, 57)}…` : collapsed || "New conversation";
}

export function saveConversation(id: string, turns: ChatTurn[]): StoredConversation[] {
  const savable = savableTurns(turns);
  const existing = loadHistory().filter((item) => item.id !== id);
  if (savable.length === 0) {
    persist(existing);
    return existing;
  }
  const next = [{ id, title: titleFor(savable), updatedAt: Date.now(), turns: savable }, ...existing];
  persist(next);
  return next.slice(0, HISTORY_MAX_CONVERSATIONS);
}

export function deleteConversation(id: string): StoredConversation[] {
  const next = loadHistory().filter((item) => item.id !== id);
  persist(next);
  return next;
}

export function clearHistory(): StoredConversation[] {
  try {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Nothing to do; see persist().
  }
  return [];
}
