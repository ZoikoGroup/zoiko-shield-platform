import { Injectable } from '@nestjs/common';

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'BEARER_TOKEN', pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  { name: 'AWS_ACCESS_KEY', pattern: /AKIA[0-9A-Z]{16}/g },
  {
    name: 'GENERIC_SECRET_ASSIGNMENT',
    pattern:
      /(secret|password|api[_-]?key|client[_-]?secret)\s*[:=]\s*['"]?[^\s'"]{6,}/gi,
  },
  {
    name: 'JWT',
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  },
];

/**
 * Scrubs known secret-shaped patterns out of retrieval content before it
 * ever reaches a model provider (mock or real). Retrieval content already
 * comes from shield-core's own APIs (which never store raw credentials —
 * established discipline: connector secrets are vault references, not
 * values), so this is a defense-in-depth layer, not the only control.
 */
@Injectable()
export class RedactionService {
  redact(text: string): { redacted: string; redactionCount: number } {
    let redacted = text;
    let redactionCount = 0;

    for (const { name, pattern } of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, () => {
        redactionCount++;
        return `[REDACTED:${name}]`;
      });
    }

    return { redacted, redactionCount };
  }
}
