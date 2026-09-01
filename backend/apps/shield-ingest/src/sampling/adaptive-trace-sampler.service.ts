import { Injectable, Logger } from '@nestjs/common';

export interface TelemetrySpan {
  traceId: string;
  spanId: string;
  tenantId: string;
  serviceName: string;
  operationName: string;
  durationMs: number;
  hasError: boolean;
  httpStatusCode?: number;
  matchedIoc?: boolean;
  timestamp: string;
}

export interface SamplingDecision {
  traceId: string;
  spanId: string;
  retained: boolean;
  reason:
    | 'RETAIN_THREAT_IOC'
    | 'RETAIN_ERROR'
    | 'PROBABILISTIC_SAMPLE'
    | 'DROPPED_BASELINE';
  appliedSampleRate: number;
}

export interface SamplerMetrics {
  totalEvaluated: number;
  retainedCount: number;
  droppedCount: number;
  effectiveRetentionRatio: number;
  currentQueuePressure: number;
}

@Injectable()
export class AdaptiveTraceSamplerService {
  private readonly logger = new Logger(AdaptiveTraceSamplerService.name);

  private baselineSampleRate = 0.05; // 5% baseline sample rate for normal spans
  private currentQueuePressure = 0.1; // 10% normal queue pressure

  private totalEvaluatedCount = 0;
  private retainedCount = 0;
  private droppedCount = 0;

  /**
   * Sets current backpressure (0.0 = idle, 1.0 = saturated) to adapt sample rate dynamically.
   */
  setQueuePressure(pressure: number): void {
    this.currentQueuePressure = Math.max(0.0, Math.min(1.0, pressure));
  }

  getEffectiveSampleRate(): number {
    if (this.currentQueuePressure > 0.8) {
      return 0.01; // Drop to 1% under heavy backpressure
    } else if (this.currentQueuePressure > 0.5) {
      return 0.025; // 2.5% under moderate load
    }
    return this.baselineSampleRate;
  }

  /**
   * Evaluates whether a telemetry span should be retained or dropped.
   */
  sampleSpan(span: TelemetrySpan): SamplingDecision {
    this.totalEvaluatedCount++;

    // 1. Mandatory 100% Retention Rule: Threat IOC Matches
    if (span.matchedIoc) {
      this.retainedCount++;
      return {
        traceId: span.traceId,
        spanId: span.spanId,
        retained: true,
        reason: 'RETAIN_THREAT_IOC',
        appliedSampleRate: 1.0,
      };
    }

    // 2. Mandatory 100% Retention Rule: Errors or HTTP 5xx
    if (span.hasError || (span.httpStatusCode && span.httpStatusCode >= 500)) {
      this.retainedCount++;
      return {
        traceId: span.traceId,
        spanId: span.spanId,
        retained: true,
        reason: 'RETAIN_ERROR',
        appliedSampleRate: 1.0,
      };
    }

    // 3. Adaptive Head-Based Probabilistic Sampling for Normal Baseline Spans
    const effectiveRate = this.getEffectiveSampleRate();
    // Deterministic FNV-1a hash over traceId for uniform distribution
    let hash = 2166136261;
    for (let i = 0; i < span.traceId.length; i++) {
      hash ^= span.traceId.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const normalized = ((hash >>> 0) % 100000) / 100000;

    if (normalized < effectiveRate) {
      this.retainedCount++;
      return {
        traceId: span.traceId,
        spanId: span.spanId,
        retained: true,
        reason: 'PROBABILISTIC_SAMPLE',
        appliedSampleRate: effectiveRate,
      };
    }

    // 4. Drop normal baseline span
    this.droppedCount++;
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      retained: false,
      reason: 'DROPPED_BASELINE',
      appliedSampleRate: effectiveRate,
    };
  }

  getMetrics(): SamplerMetrics {
    const ratio =
      this.totalEvaluatedCount > 0
        ? this.retainedCount / this.totalEvaluatedCount
        : 0;
    return {
      totalEvaluated: this.totalEvaluatedCount,
      retainedCount: this.retainedCount,
      droppedCount: this.droppedCount,
      effectiveRetentionRatio: Number(ratio.toFixed(4)),
      currentQueuePressure: this.currentQueuePressure,
    };
  }
}
