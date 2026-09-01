import { Injectable, Logger } from '@nestjs/common';

export interface RunningMetricStats {
  count: number;
  mean: number;
  m2: number; // Sum of squared differences from mean (Welford)
  lastUpdated: number;
}

export interface AnomalyEvaluationResult {
  tenantId: string;
  metricName: string;
  observedValue: number;
  baselineMean: number;
  baselineStdDev: number;
  zScore: number;
  isAnomaly: boolean;
  severity: 'NORMAL' | 'LOW' | 'MEDIUM' | 'CRITICAL';
  suggestedMitreTtp?: string;
  evaluatedAt: string;
}

@Injectable()
export class TimeSeriesAnomalyDetectorService {
  private readonly logger = new Logger(TimeSeriesAnomalyDetectorService.name);

  // In-memory sliding metric states mapped by `${tenantId}:${metricName}`
  private readonly metricBaselines = new Map<string, RunningMetricStats>();

  /**
   * Records a new sample and evaluates whether it deviates statistically from the baseline.
   */
  recordSample(
    tenantId: string,
    metricName: string,
    value: number,
    minSamplesForBaseline = 10,
  ): AnomalyEvaluationResult {
    const key = `${tenantId}:${metricName}`;
    let stats = this.metricBaselines.get(key);

    if (!stats) {
      stats = { count: 0, mean: 0, m2: 0, lastUpdated: Date.now() };
      this.metricBaselines.set(key, stats);
    }

    // Prior baseline before incorporating new sample
    const priorCount = stats.count;
    const priorMean = stats.mean;
    const priorVariance = priorCount > 1 ? stats.m2 / (priorCount - 1) : 0;
    const priorStdDev = Math.sqrt(priorVariance);

    let zScore = 0;
    if (priorStdDev > 0 && priorCount >= minSamplesForBaseline) {
      zScore = Number(((value - priorMean) / priorStdDev).toFixed(2));
    }

    const absZ = Math.abs(zScore);
    let severity: 'NORMAL' | 'LOW' | 'MEDIUM' | 'CRITICAL' = 'NORMAL';
    let isAnomaly = false;

    if (absZ >= 4.5) {
      severity = 'CRITICAL';
      isAnomaly = true;
    } else if (absZ >= 3.0) {
      severity = 'MEDIUM';
      isAnomaly = true;
    } else if (absZ >= 2.0) {
      severity = 'LOW';
      isAnomaly = true;
    }

    // Update running stats with Welford algorithm
    stats.count++;
    const delta = value - stats.mean;
    stats.mean += delta / stats.count;
    const delta2 = value - stats.mean;
    stats.m2 += delta * delta2;
    stats.lastUpdated = Date.now();

    const currentVariance = stats.count > 1 ? stats.m2 / (stats.count - 1) : 0;
    const currentStdDev = Math.sqrt(currentVariance);

    let suggestedMitreTtp: string | undefined;
    if (isAnomaly) {
      if (metricName.includes('login') || metricName.includes('auth')) {
        suggestedMitreTtp = 'T1110 (Brute Force / Credential Stuffing)';
      } else if (
        metricName.includes('egress') ||
        metricName.includes('bytes')
      ) {
        suggestedMitreTtp = 'T1048 (Exfiltration Over Alternative Protocol)';
      } else if (metricName.includes('query') || metricName.includes('sql')) {
        suggestedMitreTtp = 'T1059.006 (Command & Scripting Interpreter: SQL)';
      } else {
        suggestedMitreTtp =
          'T1499 (Endpoint Denial of Service: Resource Hijacking)';
      }

      this.logger.warn(
        `🚨 [ANOMALY DETECTED] Tenant '${tenantId}', Metric '${metricName}' -> Value=${value}, Z=${zScore}, Severity=${severity}`,
      );
    }

    return {
      tenantId,
      metricName,
      observedValue: value,
      baselineMean: Number(stats.mean.toFixed(2)),
      baselineStdDev: Number(currentStdDev.toFixed(2)),
      zScore,
      isAnomaly,
      severity,
      suggestedMitreTtp,
      evaluatedAt: new Date().toISOString(),
    };
  }

  getBaseline(
    tenantId: string,
    metricName: string,
  ): RunningMetricStats | undefined {
    return this.metricBaselines.get(`${tenantId}:${metricName}`);
  }
}
