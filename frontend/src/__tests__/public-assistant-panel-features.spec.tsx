import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AssistantConfig, ChatTurn } from "@/components/public-assistant/types";
import {
  HISTORY_STORAGE_KEY,
  loadHistory,
  saveConversation,
  savableTurns,
} from "@/components/public-assistant/history";
import { THEME_STORAGE_KEY } from "@/components/public-assistant/theme";

const config = {
  assistant: { display_name: "ZoikoShield AI Assistant", disclosure: "AI-assisted • Public information", clearance_state: "PENDING", mode: "ai" },
  routes: {},
  flags: { assistant_kill: false, assistant_launcher: true, assistant_ai_answers: true },
  policy_versions: { content_policy: "1", privacy_notice: "1", prompt: "1" },
  limits: { message_chars: 2000, counter_visible_at: 1800, free_text_chars: 500, search_chars: 200, messages_per_minute: 12, session_minutes: 1440 },
  welcome: {
    displayName: "ZoikoShield Assistant",
    disclosure: "AI-assisted • Public information",
    welcomeHeading: "Hello! I’m the ZoikoShield AI Assistant.",
    welcomeSupport: "Ask me anything.",
    composerPlaceholder: "Ask a question about ZoikoShield…",
    safetyNotice: "Do not share passwords.",
    footerNotice: "General information only.",
    unavailable: "Unavailable.",
  },
  topic_tiles: [],
  suggested_questions: [],
  content_epoch: 1,
} as unknown as AssistantConfig;

vi.mock("@/components/public-assistant/api", async () => {
  const actual = await vi.importActual<typeof import("@/components/public-assistant/api")>(
    "@/components/public-assistant/api",
  );
  return {
    ...actual,
    loadConfig: vi.fn(async () => config),
    createSession: vi.fn(async () => ({})),
    clearSession: vi.fn(async () => ({ cleared: true })),
    createMessage: vi.fn(async () => ({ message_id: "m1" })),
    cancelMessage: vi.fn(async () => ({ cancelled: true })),
    sendFeedback: vi.fn(async () => ({})),
    streamMessage: vi.fn(async () => ({
      outcome: "ANSWERED",
      blocks: [{ type: "paragraph", text: "ZoikoShield is a security platform." }],
      citations: [],
      follow_up_chips: [],
    })),
  };
});

import { AssistantPanel } from "@/components/public-assistant/AssistantPanel";

const user = (id: string, content: string): ChatTurn => ({ id, role: "user", content });
const answer = (id: string, outcome: ChatTurn["outcome"] = "ANSWERED"): ChatTurn => ({
  id,
  role: "assistant",
  content: "",
  outcome,
  blocks: [{ type: "paragraph", text: "ok" }],
});

describe("assistant history store", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps finished exchanges and drops refused, failed and pending ones", () => {
    const kept = savableTurns([
      user("u1", "What is ZoikoShield?"),
      answer("a1"),
      user("u2", "my password is hunter2"),
      answer("a2", "REJECTED"),
      user("u3", "and pricing?"),
      { id: "a3", role: "assistant", content: "", error: "boom" },
      user("u4", "still thinking"),
      { id: "a4", role: "assistant", content: "", pending: true },
    ]);
    expect(kept.map((turn) => turn.id)).toEqual(["u1", "a1"]);
  });

  it("titles a conversation from its first question and lists the newest first", () => {
    saveConversation("c1", [user("u1", "What is ZoikoShield?"), answer("a1")]);
    saveConversation("c2", [user("u2", "How do integrations work?"), answer("a2")]);
    const items = loadHistory();
    expect(items.map((item) => item.id)).toEqual(["c2", "c1"]);
    expect(items[1].title).toBe("What is ZoikoShield?");
  });

  it("stores nothing for a conversation with no finished exchange", () => {
    saveConversation("c1", [user("u1", "hello"), { id: "a1", role: "assistant", content: "", pending: true }]);
    expect(window.localStorage.getItem(HISTORY_STORAGE_KEY)).toBe("[]");
  });
});

describe("assistant panel: theme, new chat and history", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.clearAllMocks());

  async function open() {
    render(<AssistantPanel embedded />);
    await screen.findByTestId("assistant-welcome");
  }

  it("opens in light mode and switches to dark and back, remembering the choice", async () => {
    await open();
    const panel = screen.getByTestId("assistant-panel");
    expect(panel).toHaveAttribute("data-pa-theme", "light");
    expect(panel.style.getPropertyValue("--pa-FFFFFF")).toBe("#FFFFFF");

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(panel).toHaveAttribute("data-pa-theme", "dark");
    expect(panel.style.getPropertyValue("--pa-FFFFFF")).not.toBe("#FFFFFF");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(panel).toHaveAttribute("data-pa-theme", "light");
  });

  it("applies a saved dark preference on open", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    await open();
    await waitFor(() => expect(screen.getByTestId("assistant-panel")).toHaveAttribute("data-pa-theme", "dark"));
  });

  it("saves a finished chat, starts a new one, and reopens the old one from history", async () => {
    await open();
    const input = screen.getByPlaceholderText("Ask a question about ZoikoShield…");
    fireEvent.change(input, { target: { value: "What is ZoikoShield?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("ZoikoShield is a security platform.");
    await waitFor(() => expect(loadHistory()).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    });
    await screen.findByTestId("assistant-welcome");
    expect(screen.queryByText("ZoikoShield is a security platform.")).not.toBeInTheDocument();
    expect(loadHistory()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Chat history" }));
    const list = await screen.findByRole("list", { name: "Saved conversations" });
    fireEvent.click(screen.getByRole("button", { name: /^What is ZoikoShield\?/ }));
    expect(list).not.toBeInTheDocument();
    expect(await screen.findByText("ZoikoShield is a security platform.")).toBeInTheDocument();
  });

  it("uses the ZoikoShield ZS mark, not a generic icon", async () => {
    await open();
    const marks = screen.getAllByTestId("zoikoshield-mark");
    expect(marks.length).toBeGreaterThanOrEqual(2);
    expect(marks[0]).toHaveTextContent("ZS");
  });

  it("sends earlier questions with a follow-up so it has something to refer to", async () => {
    const api = await import("@/components/public-assistant/api");
    await open();
    const input = screen.getByPlaceholderText("Ask a question about ZoikoShield…");
    fireEvent.change(input, { target: { value: "Which plan fits a small team?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("ZoikoShield is a security platform.");
    expect(vi.mocked(api.createMessage).mock.calls[0][0].previous_questions).toEqual([]);

    fireEvent.change(screen.getByPlaceholderText("Ask a question about ZoikoShield…"), { target: { value: "tell me more about that" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(vi.mocked(api.createMessage)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createMessage).mock.calls[1][0].previous_questions).toEqual(["Which plan fits a small team?"]);
  });

  it("deletes a saved conversation from history", async () => {
    saveConversation("c1", [user("u1", "What is ZoikoShield?"), answer("a1")]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Chat history" }));
    fireEvent.click(await screen.findByRole("button", { name: /Delete conversation: What is ZoikoShield\?/ }));
    expect(await screen.findByText("No saved conversations yet")).toBeInTheDocument();
    expect(loadHistory()).toHaveLength(0);
  });
});
