export type AnswerOutcome =
  | "ANSWERED"
  | "LIMITED"
  | "ABSTAINED"
  | "PENDING"
  | "REJECTED"
  | "ERROR";

export interface AnswerBlock {
  type: "paragraph" | "bullets" | "callout" | "note";
  text?: string;
  items?: string[];
}

export interface Citation {
  source_id: string;
  title: string;
  url: string;
  kind: string;
}

export interface AnswerAction {
  type: "flow" | "link";
  flow?: "demo" | "support" | "quote" | "trust" | "onboarding";
  href?: string;
  label: string;
}

export interface AssistantConfig {
  assistant: {
    display_name: string;
    disclosure: string;
    clearance_state: "APPROVED" | "PENDING";
    mode: "ai" | "static" | "disabled";
  };
  routes: Record<
    string,
    { label: string; href: string; owner?: string; status?: string; note?: string }
  >;
  flags: Record<string, boolean>;
  policy_versions: {
    content_policy: string;
    privacy_notice: string;
    prompt: string;
  };
  limits: {
    message_chars: number;
    counter_visible_at: number;
    free_text_chars: number;
    search_chars: number;
    messages_per_minute: number;
    session_minutes: number;
  };
  welcome: {
    displayName: string;
    disclosure: string;
    welcomeHeading: string;
    welcomeSupport: string;
    composerPlaceholder: string;
    safetyNotice: string;
    footerNotice: string;
    unavailable: string;
  };
  topic_tiles: Array<{
    id: string;
    title: string;
    description: string;
    prompt: string;
    sourceId: string;
    flow?: string;
  }>;
  suggested_questions: string[];
  content_epoch: number;
}

export interface StatusResponse {
  status: "enabled" | "degraded" | "disabled";
  mode: "ai" | "static" | "disabled";
  ai_answers: boolean;
  fallback_links: Record<string, { label: string; href: string }>;
}

export interface SessionResponse {
  session_id: string;
  expires_at: string;
  epoch: number;
  limits: AssistantConfig["limits"];
}

export interface MessageResponse {
  message_id: string;
  status: "PENDING";
  outcome: AnswerOutcome;
  created_at: string;
}

export interface FinalEvent {
  message_id: string;
  outcome: AnswerOutcome;
  blocks: AnswerBlock[];
  citations: Citation[];
  follow_up_chips: string[];
  route_key?: string;
  action?: AnswerAction;
}

export interface Receipt {
  status: "ACCEPTED";
  public_reference: string;
  submission_id: string;
  accepted_at: string;
  status_token?: string;
  notice_version: string;
  delivery: "ACCEPTED_FOR_TEAM";
  message: string;
  replayed?: boolean;
}

export type Journey = "demo" | "support" | "quote" | "trust" | "tech" | "onboarding" | "privacy";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  outcome?: AnswerOutcome;
  blocks?: AnswerBlock[];
  citations?: Citation[];
  followUpChips?: string[];
  action?: AnswerAction;
  pending?: boolean;
  error?: string;
}
