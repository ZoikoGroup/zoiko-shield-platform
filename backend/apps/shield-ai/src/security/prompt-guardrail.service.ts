import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface GuardrailInspectionResult {
  isClean: boolean;
  injectionDetected: boolean;
  redactedText: string;
  detectedThreats: string[];
  redactedTokensCount: number;
  sanitizationDigest: string;
}

@Injectable()
export class PromptGuardrailService {
  private readonly logger = new Logger(PromptGuardrailService.name);

  private readonly INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
    /system\s+prompt\s+override/i,
    /you\s+are\s+now\s+in\s+developer\s+mode/i,
    /dan\s+mode\s+enabled/i,
    /bypass\s+all\s+(security\s+)?guardrails/i,
    /output\s+the\s+initial\s+system\s+prompt/i,
    /<script[\s\S]*?>/i,
  ];

  private readonly SECRET_PATTERNS = [
    {
      name: 'AWS_ACCESS_KEY',
      regex: /AKIA[0-9A-Z]{16}/g,
      replacement: '[REDACTED_AWS_KEY]',
    },
    {
      name: 'BEARER_TOKEN',
      regex: /Bearer\s+[A-Za-z0-9\-_]{20,}/g,
      replacement: 'Bearer [REDACTED_TOKEN]',
    },
    {
      name: 'API_KEY_GENERIC',
      regex: /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9]{20,}['"]?/gi,
      replacement: 'api_key: [REDACTED_KEY]',
    },
    {
      name: 'PASSWORD_FIELD',
      regex: /password\s*[:=]\s*['"]?[^,\s'"]{4,}['"]?/gi,
      replacement: 'password: [REDACTED_PASSWORD]',
    },
  ];

  /**
   * Inspects and sanitizes user input before passing to LLM gateway.
   */
  inspectAndSanitize(prompt: string): GuardrailInspectionResult {
    const detectedThreats: string[] = [];
    let injectionDetected = false;

    // 1. Check Prompt Injection
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(prompt)) {
        injectionDetected = true;
        detectedThreats.push(`Prompt Injection Pattern: ${pattern.source}`);
      }
    }

    // 2. Secret Redaction
    let redactedText = prompt;
    let redactedTokensCount = 0;

    for (const sec of this.SECRET_PATTERNS) {
      const matches = redactedText.match(sec.regex);
      if (matches) {
        redactedTokensCount += matches.length;
        detectedThreats.push(
          `Sensitive Secret Exposed: ${sec.name} (${matches.length} found)`,
        );
        redactedText = redactedText.replace(sec.regex, sec.replacement);
      }
    }

    const isClean = !injectionDetected;
    const sanitizationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          promptLength: prompt.length,
          isClean,
          injectionDetected,
          redactedTokensCount,
        }),
      )
      .digest('hex');

    if (injectionDetected) {
      this.logger.warn(
        `🚨 Prompt injection attempt detected! Threats: [${detectedThreats.join(', ')}]`,
      );
    }

    return {
      isClean,
      injectionDetected,
      redactedText,
      detectedThreats,
      redactedTokensCount,
      sanitizationDigest,
    };
  }
}
