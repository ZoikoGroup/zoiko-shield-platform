import type { IntentKey } from '../content/types';

export interface Classification {
  intent: IntentKey;
  writeFlow?: 'demo' | 'support' | 'quote';
  reason: string;
  /** Blocked input is never sent to retrieval or a model. */
  blocked: boolean;
  routeKey?: string;
}

const SECRET_PATTERNS: RegExp[] = [
  /(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
  /(?:api[_-]?key|secret|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*[A-Za-z0-9_\-./+]{8,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:\d[ -]*?){13,19}\b/,
  /\bbearer\s+[A-Za-z0-9._-]{20,}/i,
  /\b(?:password|passwd|pwd|passcode|pin)\s+(?:is|was)\s+\S{3,}/i,
];

const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+|any\s+|your\s+|the\s+)?(?:previous|prior|above|earlier|system)\s+(?:instructions?|prompts?|rules?|messages?)\b/i,
  /\bdisregard\s+(?:all\s+|any\s+|your\s+|the\s+)?(?:previous\s+|prior\s+|above\s+|system\s+)?(?:instructions?|prompts?|rules?)\b/i,
  /\b(?:reveal|print|show|repeat|output|leak|display|tell me)\b[^.]{0,40}\b(?:system|hidden|initial|developer)\s+(?:prompt|message|instructions?)\b/i,
  /\bwhat\s+(?:is|are)\s+your\s+(?:system\s+)?(?:prompt|instructions)\b/i,
  /\b(?:developer|jailbreak|god|dan)\s+mode\b/i,
  /\byou\s+are\s+now\s+(?:an?\s+)?(?:unrestricted|unfiltered|different|new)\b/i,
  /\bpretend\s+(?:you\s+)?(?:have\s+no|there\s+are\s+no)\s+(?:rules|restrictions)\b/i,
];

const IDENTITY_PATTERNS: RegExp[] = [
  /^\s*(?:hi|hello|hey|hiya|howdy|yo|good\s+(?:morning|afternoon|evening)|greetings)\b[\s!.,?]*(?:there|team|assistant|bot)?[\s!.,?]*$/i,
  /\bwho\s+are\s+you\b/i,
  /\bwhat\s+are\s+you\b/i,
  /\bwhat(?:'s|\s+is)\s+your\s+name\b/i,
  /\bwhat\s+can\s+you\s+(?:do|help)\b/i,
  /\bhow\s+can\s+you\s+help\b/i,
  /\bare\s+you\s+(?:a\s+|an\s+)?(?:bot|human|real\s+person|person|ai|robot|chatgpt|gpt|llm|machine)\b/i,
  /\bwho\s+(?:made|built|created)\s+you\b/i,
];

const INCIDENT_PATTERNS: RegExp[] = [
  /\b(?:we(?:'re| are)|i(?:'m| am))\s+(?:under attack|being attacked|compromised|breached)\b/i,
  /\b(?:active|live|ongoing)\s+(?:incident|attack|breach)\b/i,
  /\bransomware\s+(?:is|attack|has hit|locked)\b/i,
  /\bwe(?:'ve| have)\s+been\s+(?:breached|compromised|hacked)\b/i,
  /\bhacked\s+(?:right now|now|currently)\b/i,
  /\burgent\s+incident\b/i,
];

const PRIVILEGED_PATTERNS: RegExp[] = [
  /\b(?:show|list|open|get|read|see|export)\b[^.]{0,40}\b(?:alerts?|cases?|tenants?|tenant data|customer data|incidents?|evidence ledger|playbooks?|soc dashboard|admin panel)\b/i,
  /\b(?:run|execute|trigger|launch)\b[^.]{0,30}\b(?:playbook|action|isolation|response)\b/i,
  /\b(?:isolate|disable|delete|revoke|quarantine)\b[^.]{0,30}\b(?:host|user|account|endpoint)\b/i,
  /\b(?:my|our)\s+tenant\b/i,
  /\bother\s+customers?\b/i,
  /\b(?:soc|siem)\s+(?:console|dashboard|access)\b/i,
];

const PRIVACY_PATTERNS: RegExp[] = [
  /\bdelete\s+my\s+(?:data|account|information)\b/i,
  /\bdata\s+subject\s+request\b/i,
  /\bdsr\b/i,
  /\bright\s+to\s+(?:erasure|be forgotten)\b/i,
  /\bgdpr\s+request\b/i,
  /\bprivacy\s+request\b/i,
  /\bremove\s+my\s+personal\s+data\b/i,
];

const DEMO_PATTERNS: RegExp[] = [
  /\bbook\s+(?:a\s+)?demo\b/i,
  /\brequest\s+(?:a\s+)?demo\b/i,
  /\bschedule\s+(?:a\s+)?demo\b/i,
  /\bsee\s+zoikoshield\s+in\s+action\b/i,
  /\btalk\s+to\s+(?:sales|someone)\b/i,
];

const QUOTE_PATTERNS: RegExp[] = [
  /\b(?:get|request|need)\s+(?:a\s+)?quote\b/i,
  /\bpricing\s+for\s+(?:my|our)\b/i,
  /\bcost\s+for\s+(?:my|our)\b/i,
  /\bhow\s+much\s+(?:does|will)\b/i,
];

const SUPPORT_PATTERNS: RegExp[] = [
  /\bcontact\s+support\b/i,
  /\bopen\s+(?:a\s+)?(?:ticket|support\s+request)\b/i,
  /\bsupport\s+request\b/i,
  /\breport\s+(?:a\s+)?(?:problem|bug|issue)\b/i,
  /\bneed\s+help\s+with\s+(?:the\s+)?(?:platform|product|account)\b/i,
];

export function hasSecret(content: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(content));
}

export function classify(content: string): Classification {
  const text = content.trim();

  // WF12 priority order: incident > secrets > privileged/SOC > privacy >
  // write intents > information. A blocked match stops the pipeline.
  if (INCIDENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: 'INCIDENT',
      reason: 'live-incident-language',
      blocked: false,
      routeKey: 'INCIDENT_ROUTE',
    };
  }
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: 'SECRET',
      reason: 'secret-pattern',
      blocked: true,
    };
  }
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: 'INJECTION',
      reason: 'instruction-override',
      blocked: true,
    };
  }
  if (PRIVILEGED_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: 'PRIVILEGED',
      reason: 'privileged-or-tenant-intent',
      blocked: true,
    };
  }
  if (PRIVACY_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: 'PRIVACY',
      reason: 'data-rights-intent',
      blocked: false,
      routeKey: 'WEB_PRIVACY',
    };
  }
  if (DEMO_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: 'WRITE_DEMO',
      writeFlow: 'demo',
      reason: 'demo-intent',
      blocked: false,
    };
  }
  if (QUOTE_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: 'WRITE_QUOTE',
      writeFlow: 'quote',
      reason: 'quote-intent',
      blocked: false,
    };
  }
  if (SUPPORT_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: 'WRITE_SUPPORT',
      writeFlow: 'support',
      reason: 'support-intent',
      blocked: false,
    };
  }

  if (IDENTITY_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      intent: 'IDENTITY',
      reason: 'identity-or-greeting',
      blocked: false,
    };
  }

  return { intent: 'INFO', reason: 'information', blocked: false };
}

/** Removes obvious secret-shaped values before anything is logged or stored. */
export function redact(text: string): string {
  let result = text;
  result = result.replace(
    /\b((?:password|passwd|pwd|passcode|pin)\s+(?:is|was)\s+)\S+/gi,
    '$1[REDACTED]',
  );
  result = result.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_KEY]');
  result = result.replace(/\bsk-[A-Za-z0-9]{20,}\b/g, '[REDACTED_KEY]');
  result = result.replace(/\bghp_[A-Za-z0-9]{20,}\b/g, '[REDACTED_KEY]');
  result = result.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED_KEY]',
  );
  result = result.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_NUMBER]');
  result = result.replace(
    /((?:password|passwd|pwd|api[_-]?key|secret|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*)\S+/gi,
    '$1[REDACTED]',
  );
  return result;
}
