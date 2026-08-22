import { Injectable, Logger } from '@nestjs/common';

export type AiSafeOperatingState =
  | 'NOMINAL'
  | 'MODEL_UNAVAILABLE'
  | 'PROVIDER_INELIGIBLE'
  | 'CONTEXT_INCOMPLETE'
  | 'RETRIEVAL_SUSPECT'
  | 'INJECTION_DETECTED'
  | 'OUTPUT_UNGROUNDED'
  | 'TOOL_DENIED'
  | 'AGENT_BUDGET_EXHAUSTED'
  | 'MEMORY_UNAVAILABLE'
  | 'QUALITY_DRIFT'
  | 'COST_LIMIT_REACHED'
  | 'KILL_ACTIVE';

export interface DegradationResolution {
  state: AiSafeOperatingState;
  actionRequired: 'PROCEED' | 'FALLBACK_DETERMINISTIC' | 'HUMAN_ONLY' | 'FAIL_CLOSED';
  userMessage: string;
  isDegraded: boolean;
  blockExecution: boolean;
}

/**
 * ZS-ENG-AI-001 §27: Failure, Degraded and Safe Operating Modes.
 * Evaluates operational anomalies and enforces deterministic degradation or fail-closed
 * behavior. Never silently downgrades security or tenant isolation controls.
 */
@Injectable()
export class SafeDegradationService {
  private readonly logger = new Logger(SafeDegradationService.name);

  resolveOperatingMode(state: AiSafeOperatingState, detail?: string): DegradationResolution {
    switch (state) {
      case 'NOMINAL':
        return {
          state: 'NOMINAL',
          actionRequired: 'PROCEED',
          userMessage: 'Operating nominally within approved governance boundaries.',
          isDegraded: false,
          blockExecution: false,
        };

      case 'MODEL_UNAVAILABLE':
        this.logger.warn(`Model unavailable: ${detail}. Falling back to deterministic pipeline.`);
        return {
          state: 'MODEL_UNAVAILABLE',
          actionRequired: 'FALLBACK_DETERMINISTIC',
          userMessage: 'Primary AI model route is temporarily unavailable; using deterministic core rules.',
          isDegraded: true,
          blockExecution: false,
        };

      case 'PROVIDER_INELIGIBLE':
        this.logger.error(`Provider ineligible for data class or region: ${detail}. Failing closed.`);
        return {
          state: 'PROVIDER_INELIGIBLE',
          actionRequired: 'FAIL_CLOSED',
          userMessage: 'Requested model provider is ineligible for this data classification or residency region.',
          isDegraded: true,
          blockExecution: true,
        };

      case 'CONTEXT_INCOMPLETE':
        return {
          state: 'CONTEXT_INCOMPLETE',
          actionRequired: 'HUMAN_ONLY',
          userMessage: 'Context sources are incomplete or missing; declining automated conclusion.',
          isDegraded: true,
          blockExecution: false,
        };

      case 'RETRIEVAL_SUSPECT':
        return {
          state: 'RETRIEVAL_SUSPECT',
          actionRequired: 'FALLBACK_DETERMINISTIC',
          userMessage: 'Knowledge retrieval source failed integrity/ACL checks; continuing with safe baseline.',
          isDegraded: true,
          blockExecution: false,
        };

      case 'INJECTION_DETECTED':
        this.logger.error(`Adversarial prompt injection detected: ${detail}. Blocking tool access.`);
        return {
          state: 'INJECTION_DETECTED',
          actionRequired: 'FAIL_CLOSED',
          userMessage: 'Untrusted input instruction detected in context payload; operation blocked.',
          isDegraded: true,
          blockExecution: true,
        };

      case 'OUTPUT_UNGROUNDED':
        return {
          state: 'OUTPUT_UNGROUNDED',
          actionRequired: 'HUMAN_ONLY',
          userMessage: 'Model generated claims lacking authoritative source citations; routed to analyst review.',
          isDegraded: true,
          blockExecution: false,
        };

      case 'TOOL_DENIED':
        return {
          state: 'TOOL_DENIED',
          actionRequired: 'HUMAN_ONLY',
          userMessage: 'Tool invocation denied by target-side policy; human escalation required.',
          isDegraded: true,
          blockExecution: false,
        };

      case 'AGENT_BUDGET_EXHAUSTED':
        return {
          state: 'AGENT_BUDGET_EXHAUSTED',
          actionRequired: 'HUMAN_ONLY',
          userMessage: 'Agent reasoning step or cost ceiling reached; paused at safe checkpoint boundary.',
          isDegraded: true,
          blockExecution: false,
        };

      case 'MEMORY_UNAVAILABLE':
        return {
          state: 'MEMORY_UNAVAILABLE',
          actionRequired: 'PROCEED',
          userMessage: 'Working memory unavailable; proceeding statelessly without persistent context.',
          isDegraded: true,
          blockExecution: false,
        };

      case 'QUALITY_DRIFT':
        return {
          state: 'QUALITY_DRIFT',
          actionRequired: 'FALLBACK_DETERMINISTIC',
          userMessage: 'Model output quality drifted below threshold; routed to deterministic baseline.',
          isDegraded: true,
          blockExecution: false,
        };

      case 'COST_LIMIT_REACHED':
        return {
          state: 'COST_LIMIT_REACHED',
          actionRequired: 'FAIL_CLOSED',
          userMessage: 'Tenant monthly AI budget limit reached; non-critical AI assistance paused.',
          isDegraded: true,
          blockExecution: true,
        };

      case 'KILL_ACTIVE':
        this.logger.error(`AI Kill Switch is ACTIVE: ${detail}`);
        return {
          state: 'KILL_ACTIVE',
          actionRequired: 'FALLBACK_DETERMINISTIC',
          userMessage: 'Emergency kill switch active for this scope; using deterministic core workflows.',
          isDegraded: true,
          blockExecution: false,
        };
    }
  }
}
