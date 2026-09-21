import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';

export type AiRiskTier = 'AR-1' | 'AR-2' | 'AR-3';

export interface GroundingGatePayload {
  groundingScore?: number;
  citationPrecision?: number;
  citationRecall?: number;
  citedSourceRefs?: string[];
  allowedSourceRefs?: string[];
  useCaseKey?: string;
  riskTier?: AiRiskTier;
  hasHumanApproval?: boolean;
  hasSimulationReceipt?: boolean;
}

export interface GroundingEvaluationResult {
  passed: boolean;
  riskTier: AiRiskTier;
  groundingScore: number;
  citationPrecision: number;
  minGroundingThreshold: number;
  minPrecisionThreshold: number;
  requiresHumanReview: boolean;
  requiresSimulationReceipt: boolean;
  blockingReasons: string[];
  actionRequired: 'PROCEED' | 'DIVERT_TO_DETERMINISTIC_FALLBACK';
}

export interface RiskTierThresholds {
  minGrounding: number;
  minPrecision: number;
  requiresHumanReview: boolean;
  requiresSimulationReceipt: boolean;
}

export const RISK_TIER_THRESHOLDS: Record<AiRiskTier, RiskTierThresholds> = {
  'AR-1': {
    minGrounding: 0.75,
    minPrecision: 0.8,
    requiresHumanReview: false,
    requiresSimulationReceipt: false,
  },
  'AR-2': {
    minGrounding: 0.85,
    minPrecision: 0.9,
    requiresHumanReview: true,
    requiresSimulationReceipt: false,
  },
  'AR-3': {
    minGrounding: 0.95,
    minPrecision: 0.98,
    requiresHumanReview: true,
    requiresSimulationReceipt: true,
  },
};

/**
 * Section 18: Grounding Gate Guard & Differential Tier Enforcement (AR-1, AR-2, AR-3)
 * Architecture: ADR-11 (AI Governance & Safety Circuit Breakers)
 *
 * Tier Policies:
 *   - AR-1 (Assistive Low):       Grounding >= 0.75, Precision >= 0.80 (Advisory summary)
 *   - AR-2 (Controlled Advisory): Grounding >= 0.85, Precision >= 0.90 (Mandatory human approval)
 *   - AR-3 (High-Control Agentic): Grounding >= 0.95, Precision >= 0.98 (Simulation receipt required)
 */
@Injectable()
export class GroundingGateGuard implements CanActivate {
  private readonly logger = new Logger(GroundingGateGuard.name);

  public static readonly DEFAULT_MIN_GROUNDING_SCORE = 0.85;
  public static readonly DEFAULT_MIN_CITATION_PRECISION = 0.9;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const body: GroundingGatePayload = request.body || {};

    const evaluation = this.evaluateGrounding(body);

    if (!evaluation.passed) {
      this.logger.warn(
        `🛑 [GROUNDING GATE BLOCKED] [${evaluation.riskTier}] Threshold breached: ${evaluation.blockingReasons.join(', ')}`,
      );
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'GROUNDING_THRESHOLD_BREACH',
        message: `AI output failed ${evaluation.riskTier} grounding and safety quality gate`,
        riskTier: evaluation.riskTier,
        blockingReasons: evaluation.blockingReasons,
        actionRequired: evaluation.actionRequired,
        groundingScore: evaluation.groundingScore,
        citationPrecision: evaluation.citationPrecision,
        minGroundingThreshold: evaluation.minGroundingThreshold,
        minPrecisionThreshold: evaluation.minPrecisionThreshold,
      });
    }

    return true;
  }

  public evaluateGrounding(
    payload: GroundingGatePayload,
    overrideMinGrounding?: number,
    overrideMinPrecision?: number,
  ): GroundingEvaluationResult {
    const riskTier: AiRiskTier = payload.riskTier || 'AR-2';
    const tierConfig = RISK_TIER_THRESHOLDS[riskTier];

    const minGrounding = overrideMinGrounding ?? tierConfig.minGrounding;
    const minPrecision = overrideMinPrecision ?? tierConfig.minPrecision;

    const blockingReasons: string[] = [];

    // Calculate citation precision if source refs are provided
    let precision = payload.citationPrecision;
    if (
      precision === undefined &&
      payload.citedSourceRefs &&
      payload.allowedSourceRefs
    ) {
      if (payload.citedSourceRefs.length === 0) {
        precision = 1.0;
      } else {
        const allowedSet = new Set(payload.allowedSourceRefs);
        const validCount = payload.citedSourceRefs.filter((ref) =>
          allowedSet.has(ref),
        ).length;
        precision = validCount / payload.citedSourceRefs.length;
      }
    }
    precision = precision ?? 1.0;

    let grounding = payload.groundingScore;
    if (grounding === undefined) {
      grounding = precision;
    }

    // 1. Check Grounding Score against Risk Tier
    if (grounding < minGrounding) {
      blockingReasons.push(
        `[${riskTier}] Grounding score (${(grounding * 100).toFixed(1)}%) is below mandatory threshold (${(minGrounding * 100).toFixed(1)}%)`,
      );
    }

    // 2. Check Citation Precision against Risk Tier
    if (precision < minPrecision) {
      blockingReasons.push(
        `[${riskTier}] Citation precision (${(precision * 100).toFixed(1)}%) is below mandatory threshold (${(minPrecision * 100).toFixed(1)}%)`,
      );
    }

    // 3. For AR-3: Check Simulation Receipt requirement
    if (
      tierConfig.requiresSimulationReceipt &&
      payload.hasSimulationReceipt === false
    ) {
      blockingReasons.push(
        `[${riskTier}] Autonomous action requires pre-execution sandboxed simulation receipt`,
      );
    }

    const passed = blockingReasons.length === 0;

    return {
      passed,
      riskTier,
      groundingScore: Number(grounding.toFixed(3)),
      citationPrecision: Number(precision.toFixed(3)),
      minGroundingThreshold: minGrounding,
      minPrecisionThreshold: minPrecision,
      requiresHumanReview: tierConfig.requiresHumanReview,
      requiresSimulationReceipt: tierConfig.requiresSimulationReceipt,
      blockingReasons,
      actionRequired: passed ? 'PROCEED' : 'DIVERT_TO_DETERMINISTIC_FALLBACK',
    };
  }
}
