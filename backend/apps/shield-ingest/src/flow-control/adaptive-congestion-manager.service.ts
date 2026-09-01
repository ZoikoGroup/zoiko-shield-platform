import { Injectable, Logger } from '@nestjs/common';

export interface CongestionState {
  tenantId: string;
  bufferUtilizationRatio: number;
  queueDepth: number;
  currentWindowSize: number; // Current allowable concurrent in-flight items
  isCongested: boolean;
  recommendedRetryAfterMs: number;
  lastUpdated: string;
}

export interface IngestAdmissionDecision {
  admitted: boolean;
  tenantId: string;
  statusCode: number; // 200 (OK) or 429 (Too Many Requests / Congestion)
  retryAfterMs?: number;
  reason?: string;
}

@Injectable()
export class AdaptiveCongestionManagerService {
  private readonly logger = new Logger(AdaptiveCongestionManagerService.name);

  // Per-tenant congestion state tracking
  private readonly states = new Map<string, CongestionState>();

  private readonly minWindowSize = 10;
  private readonly maxWindowSize = 1000;
  private readonly defaultWindowSize = 200;

  /**
   * Updates buffer usage metrics and executes AIMD congestion window adaptation.
   */
  recordBufferUsage(
    tenantId: string,
    currentBufferBytes: number,
    maxBufferBytes: number,
    queueDepth: number,
  ): CongestionState {
    const utilization = Math.min(1.0, currentBufferBytes / Math.max(1, maxBufferBytes));
    const now = new Date().toISOString();

    const existing = this.states.get(tenantId) || {
      tenantId,
      bufferUtilizationRatio: utilization,
      queueDepth,
      currentWindowSize: this.defaultWindowSize,
      isCongested: false,
      recommendedRetryAfterMs: 0,
      lastUpdated: now,
    };

    existing.bufferUtilizationRatio = Number(utilization.toFixed(4));
    existing.queueDepth = queueDepth;
    existing.lastUpdated = now;

    // AIMD Congestion Control Logic
    if (utilization >= 0.8 || queueDepth >= 500) {
      // Congestion Event -> Multiplicative Decrease (cut window by half)
      existing.isCongested = true;
      existing.currentWindowSize = Math.max(
        this.minWindowSize,
        Math.floor(existing.currentWindowSize * 0.5),
      );
      // Exponential backoff recommendation (e.g. 500ms to 3000ms based on saturation)
      existing.recommendedRetryAfterMs = Math.round(500 + utilization * 2500);

      this.logger.warn(
        `⚠️ [CONGESTION BACKPRESSURE] Tenant '${tenantId}' buffer utilization=${(utilization * 100).toFixed(1)}%, Queue=${queueDepth}. Throttled window to ${existing.currentWindowSize} (Retry-After: ${existing.recommendedRetryAfterMs}ms)`,
      );
    } else if (utilization < 0.5 && queueDepth < 100) {
      // Normal Operation -> Additive Increase (step up window by 10)
      existing.isCongested = false;
      existing.recommendedRetryAfterMs = 0;
      existing.currentWindowSize = Math.min(
        this.maxWindowSize,
        existing.currentWindowSize + 10,
      );
    } else {
      // Moderate steady load
      existing.isCongested = false;
      existing.recommendedRetryAfterMs = 0;
    }

    this.states.set(tenantId, existing);
    return existing;
  }

  /**
   * Evaluates admission of incoming telemetry payload against current congestion state.
   */
  evaluateIngestRequest(
    tenantId: string,
    currentInFlightCount: number,
  ): IngestAdmissionDecision {
    const state = this.states.get(tenantId);

    if (state && state.isCongested && currentInFlightCount >= state.currentWindowSize) {
      return {
        admitted: false,
        tenantId,
        statusCode: 429,
        retryAfterMs: state.recommendedRetryAfterMs,
        reason: `Buffer pool saturation (utilization: ${(state.bufferUtilizationRatio * 100).toFixed(1)}%). Current in-flight ${currentInFlightCount} >= allowable window ${state.currentWindowSize}`,
      };
    }

    return {
      admitted: true,
      tenantId,
      statusCode: 200,
    };
  }

  getCongestionState(tenantId: string): CongestionState | undefined {
    return this.states.get(tenantId);
  }
}
