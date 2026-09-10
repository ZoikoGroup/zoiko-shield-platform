import { Injectable, Logger } from '@nestjs/common';
import { ModelDriftMonitorService, DriftEvaluationResult } from './model-drift-monitor.service';
import { AiKillSwitchService } from '../kill-switch/ai-kill-switch.service';
import { SafeDegradationService, DegradationResolution } from '../degradation/safe-degradation.service';

export interface AiDriftGuardrailReport {
  evaluation: DriftEvaluationResult;
  resolution: DegradationResolution;
  killSwitchEngaged: boolean;
  activeFallbackMode: boolean;
  tenantId: string;
}

/**
 * AI Drift & Automated Kill-Switch Guardrail Service
 * Specification: ZS-ENG-AI-001 §21 (Model Drift) & §23 (Kill Switches)
 */
@Injectable()
export class AiDriftMonitorService {
  private readonly logger = new Logger(AiDriftMonitorService.name);

  constructor(
    private readonly driftService: ModelDriftMonitorService,
    private readonly killSwitchService: AiKillSwitchService,
    private readonly degradationService: SafeDegradationService,
  ) {}

  /**
   * Evaluates drift and automatically activates emergency freeze & fallback if critical.
   */
  async evaluateAndEnforce(
    modelId: string,
    tenantId: string,
    minSampleSize = 10,
  ): Promise<AiDriftGuardrailReport> {
    const evaluation = this.driftService.evaluateDrift(modelId, minSampleSize);

    let killSwitchEngaged = false;
    let resolution: DegradationResolution;

    if (evaluation.driftStatus === 'CRITICAL_DRIFT_DETECTED') {
      // 1. Activate granular kill-switch on MODEL_ROUTE
      this.killSwitchService.activateKillSwitch({
        scope: 'MODEL_ROUTE',
        targetId: modelId,
        reason: `AUTOMATED_DRIFT_CONTAINMENT: PSI=${evaluation.psiScore} >= 0.25 threshold`,
        activatedBy: 'AiDriftMonitorService (Autonomous Guardrail)',
      });
      killSwitchEngaged = true;

      // 2. Record incident
      await this.degradationService.recordIncidentForAnomaly(
        tenantId,
        'QUALITY_DRIFT',
        `Critical PSI drift (${evaluation.psiScore}) detected on model route '${modelId}'. Confidence shift: ${evaluation.confidenceShift}.`,
      );

      // 3. Resolve degradation to deterministic fallback
      resolution = this.degradationService.resolveOperatingMode(
        'QUALITY_DRIFT',
        `Model '${modelId}' critical drift threshold exceeded.`,
      );

      this.logger.error(
        `🚨 [AUTONOMOUS AI CONTAINMENT] Model '${modelId}' frozen due to critical drift (PSI: ${evaluation.psiScore}). Deterministic fallback active.`,
      );
    } else if (evaluation.driftStatus === 'WARNING_DRIFT_DETECTED') {
      resolution = this.degradationService.resolveOperatingMode(
        'NOMINAL',
        `Warning: Mild drift detected on '${modelId}'. Recalibration queued.`,
      );
    } else {
      resolution = this.degradationService.resolveOperatingMode('NOMINAL');
    }

    return {
      evaluation,
      resolution,
      killSwitchEngaged,
      activeFallbackMode: killSwitchEngaged || resolution.isDegraded,
      tenantId,
    };
  }
}
