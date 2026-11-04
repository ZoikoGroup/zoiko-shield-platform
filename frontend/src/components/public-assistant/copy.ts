import type { Journey } from "./types";

export const COPY = {
  fallbackDisplayName: "ZoikoShield Assistant",
  fallbackHeading: "Hello! I’m the ZoikoShield AI Assistant.",
  fallbackSupport:
    "I can help you learn about ZoikoShield’s cybersecurity platform, use cases, integrations, compliance, and more. Ask me anything or choose a topic below.",
  fallbackPlaceholder: "Ask a question about ZoikoShield…",
  fallbackDisclosure: "AI-assisted • Public information",
  fallbackSafety: "Do not share passwords, tokens, or live incident information.",
  fallbackFooter:
    "The ZoikoShield AI Assistant provides general information about our products and services. It does not have access to your organisation’s data or any customer environments.",
  launcherLabel: "Open ZoikoShield Assistant",
  launcherShort: "Ask ZoikoShield",
  closeLabel: "Close assistant",
  online: "Online",
  staticMode: "Static help",
  unavailableMode: "Unavailable",
  loading: "Loading assistant…",
  unavailableTitle: "The assistant is temporarily unavailable",
  retry: "Try again",
  send: "Send",
  sending: "Sending",
  stop: "Stop",
  newChat: "New chat",
  clear: "Clear conversation",
  clearConfirm: "Clear this conversation? This removes it from this browser, including your saved chat history.",
  settings: "Assistant settings",
  privacy: "Privacy",
  suggested: "Suggested questions",
  sources: "Sources",
  followUp: "Continue with",
  thinking: "Preparing an answer",
  stopped: "Stopped.",
  errorRetry: "That answer did not finish.",
  retryAnswer: "Retry",
  transcriptNote: "Chat history is saved in this browser only.",
  messageTooLong: "Messages are limited to 2,000 characters.",
  messageEmpty: "Enter a question before sending.",
  charCounter: (count: number, limit: number) => `${count.toLocaleString()} / ${limit.toLocaleString()}`,
  helpFallback: "Explore the help centre",
  supportFallback: "Contact support",
  privacyFallback: "Privacy notice",
  onboarding: "Onboarding checklist",
  onboardingIntro:
    "A planning checklist for a safe onboarding sequence. It is not a substitute for the contracted implementation plan.",
  onboardingRequest: "Request onboarding contact",
  onboardingComplete: "Marked complete",
  onboardingReset: "Reset",
  onboardingLoading: "Loading checklist…",
  intake: {
    reviewTitle: "Review your request",
    detailsTitle: "Your details",
    required: "Required",
    workEmail: "Work email",
    contactName: "Name",
    organization: "Organisation",
    market: "Region",
    topic: "Topic",
    description: "What do you need help with?",
    documentId: "Document or report",
    purpose: "Purpose",
    useCase: "Evaluation use case",
    notes: "Anything else?",
    requestSummary: "Request summary",
    consent:
      "I agree to the privacy notice and understand this request is accepted for the team, not booked or ticketed.",
    marketing:
      "Send me occasional product updates. This is optional and separate from my request.",
    transcript: "Include a redacted summary of this conversation with my request.",
    continue: "Review request",
    back: "Back",
    submit: "Submit request",
    submitting: "Submitting…",
    retrySubmit: "Retry submission",
    acceptedTitle: "Request accepted",
    acceptedBody:
      "The team has your request. Keep the reference below. This is not a booking, a ticket, a price or a service-level commitment.",
    reference: "Reference",
    done: "Back to conversation",
    newRequest: "Start another request",
    privacyLink: "Read the privacy notice",
    secretWarning: "Remove passwords, keys, tokens or other secrets before submitting.",
    requiredFields: "Complete the required fields.",
  },
} as const;

export const JOURNEY_COPY: Record<
  Journey,
  { title: string; intro: string; submitLabel: string }
> = {
  demo: {
    title: "Book a demo",
    intro:
      "Tell us a little about your team. The team will follow up with options — this does not book a calendar slot.",
    submitLabel: "Request a demo",
  },
  support: {
    title: "Contact support",
    intro:
      "For a general, non-urgent request. Existing customers should use their contracted incident channel for anything time-critical.",
    submitLabel: "Send support request",
  },
  quote: {
    title: "Request a quote",
    intro:
      "Share your scope and the commercial team will confirm sizing and a written quote. Public chat never produces a binding price.",
    submitLabel: "Request a quote",
  },
  trust: {
    title: "Trust access request",
    intro:
      "Request a report, questionnaire or evidence review. The trust team confirms scope and any confidentiality terms.",
    submitLabel: "Request trust access",
  },
  tech: {
    title: "Technical evaluation",
    intro:
      "Ask for a technical review of deployment, identity, network, telemetry or data handling.",
    submitLabel: "Request technical review",
  },
  onboarding: {
    title: "Onboarding contact",
    intro:
      "Ask the delivery team to confirm phase-one scope, data region and responsibilities.",
    submitLabel: "Request onboarding contact",
  },
  privacy: {
    title: "Privacy request",
    intro:
      "Privacy and data-subject requests go through the published privacy route so the privacy team can verify scope.",
    submitLabel: "Open privacy route",
  },
};

export const MARKETS = [
  { id: "us", label: "United States" },
  { id: "eu", label: "European Union" },
  { id: "uk", label: "United Kingdom" },
  { id: "apac", label: "Asia Pacific" },
  { id: "undecided", label: "Not decided" },
] as const;

export const TILE_ICON_KEYS: Record<string, string> = {
  detection: "detection",
  platform: "platform",
  incident: "incident",
  integrations: "integrations",
  compliance: "compliance",
  demo: "demo",
};
