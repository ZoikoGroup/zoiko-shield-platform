import { Injectable } from '@nestjs/common';
import { ContentService } from '../content/content.service';

export type FlagKey =
  | 'assistant_kill'
  | 'assistant_launcher'
  | 'assistant_ai_answers'
  | 'assistant_lead_submit'
  | 'assistant_support_submit'
  | 'assistant_trust_gated'
  | 'assistant_public_pricing'
  | 'assistant_connector_claims'
  | 'assistant_privacy_write';

const DEV_DEFAULTS: Record<FlagKey, boolean> = {
  assistant_kill: false,
  assistant_launcher: true,
  // Development convenience: the mock provider is deterministic and safe to
  // run without external model credentials. Production keeps this OFF until
  // ADR-11 (provider + DPA) is accepted.
  assistant_ai_answers: process.env.NODE_ENV !== 'production',
  assistant_lead_submit: process.env.NODE_ENV !== 'production',
  assistant_support_submit: process.env.NODE_ENV !== 'production',
  assistant_trust_gated: false,
  assistant_public_pricing: false,
  assistant_connector_claims: true,
  assistant_privacy_write: false,
};

function envFlag(key: FlagKey): boolean | undefined {
  const raw = process.env[`PUBLIC_ASSISTANT_FLAG_${key.toUpperCase()}`];
  if (raw === undefined || raw === '') return undefined;
  return /^(1|true|on|yes|enabled)$/i.test(raw);
}

@Injectable()
export class AssistantConfigService {
  constructor(private readonly content: ContentService) {}

  flags(): Record<FlagKey, boolean> {
    const flags = {} as Record<FlagKey, boolean>;
    for (const key of Object.keys(DEV_DEFAULTS) as FlagKey[]) {
      flags[key] = envFlag(key) ?? DEV_DEFAULTS[key];
    }
    return flags;
  }

  isEnabled(key: FlagKey): boolean {
    return this.flags()[key];
  }

  aiAnswersEnabled(): boolean {
    return !this.flags().assistant_kill && this.flags().assistant_ai_answers;
  }

  displayName(): string {
    const clearance = this.clearanceState();
    const configured = process.env.PUBLIC_ASSISTANT_DISPLAY_NAME?.trim();
    // WF01: never ship a provisional name when brand clearance is pending.
    if (clearance !== 'APPROVED' || !configured) return 'ZoikoShield Assistant';
    return configured;
  }

  clearanceState(): 'APPROVED' | 'PENDING' {
    return process.env.PUBLIC_ASSISTANT_DISPLAY_CLEARANCE === 'APPROVED'
      ? 'APPROVED'
      : 'PENDING';
  }

  policyVersions() {
    return {
      content_policy: process.env.PUBLIC_ASSISTANT_CONTENT_POLICY_VERSION ?? '2026.10.1',
      privacy_notice: process.env.PUBLIC_ASSISTANT_NOTICE_VERSION ?? '2026.10-review',
      prompt: process.env.PUBLIC_ASSISTANT_PROMPT_VERSION ?? 'pa-prompt-2026.10.1',
    };
  }

  limits() {
    return {
      message_chars: 2000,
      counter_visible_at: 1800,
      free_text_chars: 500,
      search_chars: 200,
      messages_per_minute: Number(process.env.PUBLIC_ASSISTANT_MESSAGES_PER_MINUTE ?? 12),
      session_minutes: 1440,
    };
  }

  snapshot() {
    const flags = this.flags();
    return {
      assistant: {
        display_name: this.displayName(),
        disclosure: 'AI-assisted • Public information',
        clearance_state: this.clearanceState(),
        mode: flags.assistant_kill ? 'disabled' : flags.assistant_ai_answers ? 'ai' : 'static',
      },
      routes: this.content.routes(),
      flags,
      policy_versions: this.policyVersions(),
      limits: this.limits(),
      welcome: this.content.copy(),
      topic_tiles: this.content.helpHome().tiles,
      suggested_questions: this.content.helpHome().suggested_questions,
      content_epoch: this.content.getEpoch(),
    };
  }
}
