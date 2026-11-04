import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AssistantWelcome } from "@/components/public-assistant/AssistantWelcome";
import type { AssistantConfig } from "@/components/public-assistant/types";

const config: AssistantConfig = {
  assistant: {
    display_name: "ZoikoShield AI Assistant",
    disclosure: "AI-assisted • Public information",
    clearance_state: "PENDING",
    mode: "ai",
  },
  routes: {
    WEB_CAPABILITIES: { label: "Explore capabilities", href: "/help" },
    WEB_PRICING: { label: "Plans and pricing", href: "/pricing" },
    WEB_DEMO: { label: "Book a demo", href: "/assistant?flow=demo" },
    WEB_SUPPORT: { label: "Contact support", href: "/assistant?flow=support" },
    WEB_PRIVACY: { label: "Privacy notice", href: "/trust" },
  },
  flags: {
    assistant_kill: false,
    assistant_launcher: true,
    assistant_ai_answers: true,
    assistant_lead_submit: true,
    assistant_support_submit: true,
    assistant_trust_gated: false,
    assistant_public_pricing: false,
    assistant_connector_claims: true,
    assistant_privacy_write: false,
  },
  policy_versions: {
    content_policy: "2026.10.1",
    privacy_notice: "2026.10-review",
    prompt: "pa-prompt-2026.10.1",
  },
  limits: {
    message_chars: 2000,
    counter_visible_at: 1800,
    free_text_chars: 500,
    search_chars: 200,
    messages_per_minute: 12,
    session_minutes: 1440,
  },
  welcome: {
    displayName: "ZoikoShield Assistant",
    disclosure: "AI-assisted • Public information",
    welcomeHeading: "Hello! I’m the ZoikoShield AI Assistant.",
    welcomeSupport:
      "I can help you learn about ZoikoShield’s cybersecurity platform, use cases, integrations, compliance, and more. Ask me anything or choose a topic below.",
    composerPlaceholder: "Ask a question about ZoikoShield…",
    safetyNotice: "Do not share passwords, tokens, or live incident information.",
    footerNotice:
      "The ZoikoShield AI Assistant provides general information about our products and services.",
    unavailable: "The assistant is temporarily unavailable.",
  },
  topic_tiles: [
    {
      id: "detection",
      title: "Threat Detection",
      description: "Stop threats before they impact your business.",
      prompt: "How does ZoikoShield detect threats?",
      sourceId: "cap-detection",
    },
    {
      id: "platform",
      title: "Platform Overview",
      description: "Explore key capabilities and benefits.",
      prompt: "What is ZoikoShield?",
      sourceId: "cap-overview",
    },
    {
      id: "incident",
      title: "Incident Response",
      description: "Detect, analyze, and respond faster.",
      prompt: "How does ZoikoShield support incident response?",
      sourceId: "cap-investigation",
    },
    {
      id: "integrations",
      title: "Integrations",
      description: "Works with your existing security stack.",
      prompt: "Which integrations are available?",
      sourceId: "help-connectors",
    },
    {
      id: "compliance",
      title: "Compliance",
      description: "Support for global regulatory frameworks.",
      prompt: "Which compliance frameworks do you support?",
      sourceId: "help-trust-guide",
    },
    {
      id: "demo",
      title: "Book a Demo",
      description: "See ZoikoShield in action.",
      prompt: "I would like to book a demo.",
      sourceId: "help-ai-disclosure",
      flow: "demo",
    },
  ],
  suggested_questions: [
    "What is ZoikoShield?",
    "What are key use cases?",
    "Which compliance frameworks do you support?",
    "How does ZoikoShield detect threats?",
  ],
  content_epoch: 1,
};

describe("public assistant welcome", () => {
  it("renders the six topic tiles and four suggested questions from config", () => {
    render(<AssistantWelcome config={config} onPrompt={vi.fn()} onFlow={vi.fn()} />);

    expect(screen.getByText("Hello! I’m the ZoikoShield AI Assistant.")).toBeInTheDocument();
    for (const title of [
      "Threat Detection",
      "Platform Overview",
      "Incident Response",
      "Integrations",
      "Compliance",
      "Book a Demo",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    for (const question of config.suggested_questions) {
      expect(screen.getByText(question)).toBeInTheDocument();
    }
  });

  it("routes a normal tile to its deterministic prompt", () => {
    const onPrompt = vi.fn();
    render(<AssistantWelcome config={config} onPrompt={onPrompt} onFlow={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Threat Detection/i }));
    expect(onPrompt).toHaveBeenCalledWith("How does ZoikoShield detect threats?");
  });

  it("routes the demo tile to the in-panel flow instead of a model call", () => {
    const onFlow = vi.fn();
    const onPrompt = vi.fn();
    render(<AssistantWelcome config={config} onPrompt={onPrompt} onFlow={onFlow} />);

    fireEvent.click(screen.getByRole("button", { name: /Book a Demo/i }));
    expect(onFlow).toHaveBeenCalledWith("demo");
    expect(onPrompt).not.toHaveBeenCalled();
  });
});
