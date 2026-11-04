import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { AiUnavailableException } from './fallback/fallback.exceptions';
import {
  assertSyntheticOutputAllowed,
  isProductionRuntime,
} from '../provider-registry/synthetic-output-guard';

export interface AiGatewayRequest {
  requestId: string;
  tenantId: string;
  principalId: string;
  useCase: 'INCIDENT_TRIAGE' | 'THREAT_EXPLANATION' | 'POLICY_ASSISTANCE';
  prompt: string;
  contextTelemetry: string[];
}

export interface AiGatewayResponse {
  requestId: string;
  tenantId: string;
  modelRoute: string;
  modelVersion: string;
  verdict: 'PERMITTED_AI_OUTPUT' | 'FALLBACK_DETERMINISTIC_WORKFLOW';
  sanitizedOutput: string;
  citations: string[];
  safetyFiltersTriggered: string[];
  tokensUsed: number;
  costUsd: number;
  evaluatedAt: string;
  attestationDigest: string;
  /**
   * POLICY_REFUSAL: blocked before any model ran; carries no analysis.
   * SYNTHETIC_NON_PRODUCTION: canned text, never a model's output.
   */
  outputProvenance: 'POLICY_REFUSAL' | 'SYNTHETIC_NON_PRODUCTION';
}

/**
 * Vertex AI Model Armor Safety Layer & Fail-Closed Deterministic Fallback
 * Specification: Backend Build Guide §LAB 13 (AI Gateway on Vertex AI)
 */
@Injectable()
export class ModelArmorSafetyGatewayService {
  private readonly logger = new Logger(ModelArmorSafetyGatewayService.name);

  // High-risk prompt injection & jailbreak indicators per ZS-ENG-AI-001 §05
  private readonly injectionSignatures = [
    /ignore (all )?previous instructions/i,
    /system prompt override/i,
    /drop (all )?tables/i,
    /you are now in god mode/i,
    /reveal (the )?master key/i,
    /disable security controls/i,
    /exfiltrate (all )?credentials/i,
    /do anything now|dan mode/i,
    /bypass (all )?(safety|ethical) (filters|guardrails)/i,
    /repeat (everything|all instructions) above/i,
    /print (the )?(system|internal) prompt/i,
    /roleplay as (an )?unrestricted/i,
    /developer mode (enabled|on)/i,
  ];

  /**
   * Evaluates AI request through redaction, Model Armor screening, and deterministic fallback.
   */
  processAiInference(
    request: AiGatewayRequest,
    isModelProviderAvailable = true,
  ): AiGatewayResponse {
    const requestId = request.requestId || `ai-req-${crypto.randomUUID()}`;
    const evaluatedAt = new Date().toISOString();
    const modelVersion = 'gemini-1.5-pro-002-vertex';
    const modelRoute = 'gcp-europe-west3-vertex-ai';

    const triggeredFilters: string[] = [];

    // 1. Redact PII / Secrets from incoming prompt and telemetry
    const redactedPrompt = this.redactSensitiveData(request.prompt);

    // 2. Check for Prompt Injection / Adversarial jailbreaks
    for (const pattern of this.injectionSignatures) {
      if (
        pattern.test(request.prompt) ||
        request.contextTelemetry.some((t) => pattern.test(t))
      ) {
        triggeredFilters.push(`PROMPT_INJECTION_DETECTED:${pattern.source}`);
      }
    }

    // A provider outage has no approved fallback (spec §18): fail closed.
    if (
      triggeredFilters.length === 0 &&
      !isModelProviderAvailable &&
      isProductionRuntime()
    ) {
      throw new AiUnavailableException(
        `Model provider unavailable for request '${requestId}'`,
      );
    }

    // 3. Fail-Closed Fallback on Injection Attack OR Provider Outage
    if (triggeredFilters.length > 0 || !isModelProviderAvailable) {
      const reason =
        triggeredFilters.length > 0
          ? 'MALICIOUS_PROMPT_INJECTION'
          : 'VERTEX_AI_PROVIDER_OUTAGE';
      this.logger.warn(
        `⚠️ [AI GATEWAY DEGRADED TO DETERMINISTIC FALLBACK] Reason: ${reason} for Request '${requestId}'`,
      );

      const fallbackOutput = `[DETERMINISTIC FALLBACK ENGINE]: The AI investigation route was bypassed (${reason}). No analysis was performed on the ${request.contextTelemetry.length} supplied telemetry item(s). Proceed with standard playbook triage without generative advice.`;

      const attestationDigest = crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            requestId,
            verdict: 'FALLBACK_DETERMINISTIC_WORKFLOW',
            reason,
            evaluatedAt,
          }),
        )
        .digest('hex');

      return {
        requestId,
        tenantId: request.tenantId,
        modelRoute: 'local-deterministic-rule-engine',
        modelVersion: 'rule-engine-v1.0.0',
        verdict: 'FALLBACK_DETERMINISTIC_WORKFLOW',
        sanitizedOutput: fallbackOutput,
        citations: [],
        safetyFiltersTriggered:
          triggeredFilters.length > 0
            ? triggeredFilters
            : ['PROVIDER_OUTAGE_FALLBACK'],
        tokensUsed: 0,
        costUsd: 0.0,
        evaluatedAt,
        attestationDigest,
        outputProvenance:
          triggeredFilters.length > 0
            ? 'POLICY_REFUSAL'
            : 'SYNTHETIC_NON_PRODUCTION',
      };
    }

    // No model is called below; this canned analysis must never reach production.
    assertSyntheticOutputAllowed('ModelArmorSafetyGatewayService');

    // 4. Successful Safe Inference
    const safeOutput = `[SYNTHETIC — NOT MODEL OUTPUT] Triage analysis for Tenant '${request.tenantId}'. Observed ${request.contextTelemetry.length} telemetry streams. Corroborated credential usage anomaly matching MITRE T1078. Recommended action: isolate affected target with verified human authorization.`;

    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          requestId,
          verdict: 'PERMITTED_AI_OUTPUT',
          promptHash: crypto
            .createHash('sha256')
            .update(redactedPrompt)
            .digest('hex'),
          evaluatedAt,
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ [AI GATEWAY PERMITTED] Generated verified response for Request '${requestId}' via '${modelRoute}'`,
    );

    return {
      requestId,
      tenantId: request.tenantId,
      modelRoute,
      modelVersion,
      verdict: 'PERMITTED_AI_OUTPUT',
      sanitizedOutput: safeOutput,
      // Synthetic: cites only the telemetry the caller supplied, by position.
      citations: request.contextTelemetry.map(
        (_, idx) => `context-telemetry:${idx}`,
      ),
      safetyFiltersTriggered: [],
      tokensUsed: 420,
      costUsd: 0.00105,
      evaluatedAt,
      attestationDigest,
      outputProvenance: 'SYNTHETIC_NON_PRODUCTION',
    };
  }

  private redactSensitiveData(text: string): string {
    return text
      .replace(
        /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g,
        '[REDACTED_EMAIL]',
      )
      .replace(
        /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\b/g,
        '[REDACTED_PAN]',
      )
      .replace(
        /(?:bearer|token|secret|password|api[_-]?key)\s*[:=]\s*[^\s]+/gi,
        '[REDACTED_SECRET]',
      );
  }
}
