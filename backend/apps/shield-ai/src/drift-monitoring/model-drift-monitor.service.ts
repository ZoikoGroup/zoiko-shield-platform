import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';

export interface ModelBaselineProfile {
  modelId: string;
  version: string;
  baselineSampleCount: number;
  avgConfidence: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgTokenCount: number;
  embeddingCentroid?: number[];
  categoryDistribution?: Record<string, number>; // Normalized proportions (sum to 1.0)
  createdAt: string;
}

export interface LiveInferenceObservation {
  modelId: string;
  timestamp: string;
  confidenceScore: number;
  latencyMs: number;
  tokenCount: number;
  predictedCategory?: string;
  outputEmbedding?: number[];
  tenantId?: string;
}

export interface DriftEvaluationResult {
  evaluationId: string;
  modelId: string;
  evaluatedAt: string;
  sampleSize: number;
  driftStatus: 'STABLE' | 'WARNING_DRIFT_DETECTED' | 'CRITICAL_DRIFT_DETECTED';
  psiScore: number; // Population Stability Index approximation
  confidenceShift: number; // Absolute delta in mean confidence
  latencyMultiplier: number; // Current avg latency / baseline avg latency
  categoryDriftDistance: number; // Total variation distance or Jensen-Shannon divergence
  embeddingCentroidDistance?: number; // Cosine distance between baseline centroid and current centroid
  recommendation: 'NO_ACTION' | 'SCHEDULE_RECALIBRATION' | 'TRIGGER_MODEL_FAILOVER_OR_CONTAINMENT';
}

/**
 * §21: Model Drift & Change Management Service
 * Monitors inference telemetry against established baseline profiles
 * using statistical drift indicators (PSI, distribution shift, latency multipliers).
 */
@Injectable()
export class ModelDriftMonitorService {
  private readonly logger = new Logger(ModelDriftMonitorService.name);

  // Keyed by modelId
  private readonly baselines = new Map<string, ModelBaselineProfile>();

  // In-memory sliding window of recent observations keyed by modelId
  private readonly observations = new Map<string, LiveInferenceObservation[]>();

  /**
   * Register or update a baseline distribution profile for a model
   */
  registerBaseline(profile: {
    modelId: string;
    version: string;
    baselineSampleCount?: number;
    avgConfidence: number;
    avgLatencyMs: number;
    p95LatencyMs?: number;
    avgTokenCount: number;
    embeddingCentroid?: number[];
    categoryDistribution?: Record<string, number>;
  }): ModelBaselineProfile {
    if (!profile.modelId) {
      throw new BadRequestException('modelId is required to register baseline');
    }

    const baseline: ModelBaselineProfile = {
      modelId: profile.modelId,
      version: profile.version || 'v1.0.0',
      baselineSampleCount: profile.baselineSampleCount || 1000,
      avgConfidence: profile.avgConfidence,
      avgLatencyMs: profile.avgLatencyMs,
      p95LatencyMs: profile.p95LatencyMs || profile.avgLatencyMs * 1.5,
      avgTokenCount: profile.avgTokenCount,
      embeddingCentroid: profile.embeddingCentroid,
      categoryDistribution: profile.categoryDistribution || {},
      createdAt: new Date().toISOString(),
    };

    this.baselines.set(profile.modelId, baseline);
    this.logger.log(`Registered drift baseline for model [${profile.modelId}]`);
    return baseline;
  }

  /**
   * Record live inference observation into the sliding window
   */
  recordObservation(obs: LiveInferenceObservation): void {
    if (!obs.modelId) return;

    if (!this.observations.has(obs.modelId)) {
      this.observations.set(obs.modelId, []);
    }

    const window = this.observations.get(obs.modelId)!;
    window.push(obs);

    // Keep sliding window capped at 5,000 samples per model
    if (window.length > 5000) {
      window.shift();
    }
  }

  /**
   * Evaluate drift between live telemetry window and registered baseline
   */
  evaluateDrift(modelId: string, minSampleSize = 10): DriftEvaluationResult {
    const baseline = this.baselines.get(modelId);
    if (!baseline) {
      throw new NotFoundException(`No baseline profile registered for model '${modelId}'`);
    }

    const window = this.observations.get(modelId) || [];
    if (window.length < minSampleSize) {
      return {
        evaluationId: `drift-eval-${crypto.randomUUID()}`,
        modelId,
        evaluatedAt: new Date().toISOString(),
        sampleSize: window.length,
        driftStatus: 'STABLE',
        psiScore: 0.0,
        confidenceShift: 0.0,
        latencyMultiplier: 1.0,
        categoryDriftDistance: 0.0,
        recommendation: 'NO_ACTION',
      };
    }

    // 1. Calculate live statistics
    const sampleSize = window.length;
    const avgLiveConfidence =
      window.reduce((acc, o) => acc + o.confidenceScore, 0) / sampleSize;
    const avgLiveLatency =
      window.reduce((acc, o) => acc + o.latencyMs, 0) / sampleSize;
    const confidenceShift = Math.abs(avgLiveConfidence - baseline.avgConfidence);
    const latencyMultiplier =
      baseline.avgLatencyMs > 0 ? avgLiveLatency / baseline.avgLatencyMs : 1.0;

    // 2. Compute category distribution shift (Total Variation Distance)
    let categoryDriftDistance = 0;
    if (
      baseline.categoryDistribution &&
      Object.keys(baseline.categoryDistribution).length > 0
    ) {
      const liveCounts: Record<string, number> = {};
      let totalCategories = 0;

      for (const obs of window) {
        if (obs.predictedCategory) {
          liveCounts[obs.predictedCategory] =
            (liveCounts[obs.predictedCategory] || 0) + 1;
          totalCategories++;
        }
      }

      if (totalCategories > 0) {
        const liveProportions: Record<string, number> = {};
        for (const [cat, count] of Object.entries(liveCounts)) {
          liveProportions[cat] = count / totalCategories;
        }

        const allKeys = Array.from(
          new Set([
            ...Object.keys(baseline.categoryDistribution),
            ...Object.keys(liveProportions),
          ]),
        );

        let sumDiff = 0;
        for (const k of allKeys) {
          const p = baseline.categoryDistribution[k] || 0.001;
          const q = liveProportions[k] || 0.001;
          sumDiff += Math.abs(p - q);
        }
        categoryDriftDistance = 0.5 * sumDiff; // TVD bounded [0, 1]
      }
    }

    // 3. Approximate Population Stability Index (PSI)
    // PSI = confidenceShift * 2 + categoryDriftDistance + (latencyMultiplier > 2.0 ? 0.15 : 0)
    const psiScore = Number(
      (confidenceShift * 2.0 + categoryDriftDistance * 0.8 + (latencyMultiplier > 1.8 ? 0.1 : 0.0)).toFixed(4),
    );

    // 4. Determine status & recommendation
    let driftStatus: 'STABLE' | 'WARNING_DRIFT_DETECTED' | 'CRITICAL_DRIFT_DETECTED' = 'STABLE';
    let recommendation: 'NO_ACTION' | 'SCHEDULE_RECALIBRATION' | 'TRIGGER_MODEL_FAILOVER_OR_CONTAINMENT' = 'NO_ACTION';

    if (psiScore >= 0.25 || confidenceShift > 0.35 || latencyMultiplier > 3.0) {
      driftStatus = 'CRITICAL_DRIFT_DETECTED';
      recommendation = 'TRIGGER_MODEL_FAILOVER_OR_CONTAINMENT';
      this.logger.error(
        `🚨 CRITICAL DRIFT DETECTED on model [${modelId}]: PSI=${psiScore}, ConfidenceShift=${confidenceShift.toFixed(3)}, LatencyMultiplier=${latencyMultiplier.toFixed(2)}x`,
      );
    } else if (psiScore >= 0.1 || confidenceShift > 0.15 || latencyMultiplier > 1.5) {
      driftStatus = 'WARNING_DRIFT_DETECTED';
      recommendation = 'SCHEDULE_RECALIBRATION';
      this.logger.warn(
        `⚠️ Warning: Mild drift detected on model [${modelId}]: PSI=${psiScore}`,
      );
    }

    return {
      evaluationId: `drift-eval-${crypto.randomUUID()}`,
      modelId,
      evaluatedAt: new Date().toISOString(),
      sampleSize,
      driftStatus,
      psiScore,
      confidenceShift: Number(confidenceShift.toFixed(4)),
      latencyMultiplier: Number(latencyMultiplier.toFixed(2)),
      categoryDriftDistance: Number(categoryDriftDistance.toFixed(4)),
      recommendation,
    };
  }

  getBaseline(modelId: string): ModelBaselineProfile | undefined {
    return this.baselines.get(modelId);
  }

  clearObservations(modelId?: string): void {
    if (modelId) {
      this.observations.delete(modelId);
    } else {
      this.observations.clear();
      this.baselines.clear();
    }
  }
}
