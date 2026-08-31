import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ActionExecutionContext {
  actionId: string;
  playbookId: string;
  tenantId: string;
  targetResource: string;
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
}

export interface CircuitBreakerStatus {
  tenantId: string;
  playbookId: string;
  state: CircuitBreakerState;
  totalExecutions: number;
  failureCount: number;
  errorRatePercentage: number;
  distinctTargetResourcesCount: number;
  maxBlastRadiusLimit: number;
  isActionAllowed: boolean;
  tripReason?: string;
}

export interface CircuitBreakerTripReceipt {
  receiptId: string;
  tenantId: string;
  playbookId: string;
  previousState: CircuitBreakerState;
  currentState: 'OPEN';
  tripReason: string;
  attestationDigest: string;
  trippedAt: string;
}

/**
 * Automated Adaptive SOAR Circuit Breaker & Blast Radius Governor
 * Specification: ZS-SOAR-DISP-001 §10 (SOAR Blast Radius & Rate Throttling Governor)
 */
@Injectable()
export class SoarCircuitBreakerService {
  private readonly logger = new Logger(SoarCircuitBreakerService.name);

  // In-memory sliding window stats: Map<`${tenantId}:${playbookId}`, Stats>
  private readonly circuitStats = new Map<
    string,
    {
      state: CircuitBreakerState;
      executions: ActionExecutionContext[];
      maxBlastRadiusLimit: number;
      trippedAt?: string;
      tripReason?: string;
    }
  >();

  /**
   * Evaluates if a SOAR response action is permitted before dispatch.
   */
  canExecuteAction(tenantId: string, playbookId: string, targetResource: string, maxBlastRadiusLimit = 5): CircuitBreakerStatus {
    const key = `${tenantId}:${playbookId}`;
    const entry = this.getOrCreateEntry(key, maxBlastRadiusLimit);
    entry.maxBlastRadiusLimit = maxBlastRadiusLimit;

    if (entry.state === 'OPEN') {
      return {
        tenantId,
        playbookId,
        state: 'OPEN',
        totalExecutions: entry.executions.length,
        failureCount: entry.executions.filter((e) => e.status === 'FAILED').length,
        errorRatePercentage: this.calculateErrorRate(entry.executions),
        distinctTargetResourcesCount: new Set(entry.executions.map((e) => e.targetResource)).size,
        maxBlastRadiusLimit: entry.maxBlastRadiusLimit,
        isActionAllowed: false,
        tripReason: entry.tripReason,
      };
    }

    // Check potential blast radius overflow
    const currentTargets = new Set(entry.executions.map((e) => e.targetResource));
    currentTargets.add(targetResource);

    if (currentTargets.size > entry.maxBlastRadiusLimit) {
      this.tripCircuit(key, `Blast radius ceiling exceeded: Attempted targets (${currentTargets.size}) exceeds limit (${entry.maxBlastRadiusLimit})`);
      return {
        tenantId,
        playbookId,
        state: 'OPEN',
        totalExecutions: entry.executions.length,
        failureCount: entry.executions.filter((e) => e.status === 'FAILED').length,
        errorRatePercentage: this.calculateErrorRate(entry.executions),
        distinctTargetResourcesCount: currentTargets.size,
        maxBlastRadiusLimit: entry.maxBlastRadiusLimit,
        isActionAllowed: false,
        tripReason: `Blast radius ceiling exceeded: Limit is ${entry.maxBlastRadiusLimit} targets`,
      };
    }

    return {
      tenantId,
      playbookId,
      state: entry.state,
      totalExecutions: entry.executions.length,
      failureCount: entry.executions.filter((e) => e.status === 'FAILED').length,
      errorRatePercentage: this.calculateErrorRate(entry.executions),
      distinctTargetResourcesCount: currentTargets.size,
      maxBlastRadiusLimit: entry.maxBlastRadiusLimit,
      isActionAllowed: true,
    };
  }

  /**
   * Records execution outcome and automatically adjusts circuit breaker state.
   */
  recordActionOutcome(context: ActionExecutionContext): CircuitBreakerStatus {
    const key = `${context.tenantId}:${context.playbookId}`;
    const entry = this.getOrCreateEntry(key);

    entry.executions.push(context);

    // Keep sliding window to last 20 actions
    if (entry.executions.length > 20) {
      entry.executions.shift();
    }

    const errorRate = this.calculateErrorRate(entry.executions);
    const failureCount = entry.executions.filter((e) => e.status === 'FAILED').length;

    // Trip if error rate > 20% with at least 3 executions, or 3 consecutive failures
    if (entry.executions.length >= 3 && (errorRate > 20 || failureCount >= 3)) {
      this.tripCircuit(key, `Error rate threshold breached (${errorRate.toFixed(1)}% failures over ${entry.executions.length} actions)`);
    }

    return {
      tenantId: context.tenantId,
      playbookId: context.playbookId,
      state: entry.state,
      totalExecutions: entry.executions.length,
      failureCount,
      errorRatePercentage: errorRate,
      distinctTargetResourcesCount: new Set(entry.executions.map((e) => e.targetResource)).size,
      maxBlastRadiusLimit: entry.maxBlastRadiusLimit,
      isActionAllowed: entry.state !== 'OPEN',
      tripReason: entry.tripReason,
    };
  }

  /**
   * Trips the circuit breaker into OPEN state and logs a warning.
   */
  private tripCircuit(key: string, reason: string): CircuitBreakerTripReceipt {
    const entry = this.circuitStats.get(key)!;
    const previousState = entry.state;
    entry.state = 'OPEN';
    entry.trippedAt = new Date().toISOString();
    entry.tripReason = reason;

    const receiptId = `trip-rcpt-${crypto.randomUUID()}`;
    const attestationDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ receiptId, key, previousState, currentState: 'OPEN', reason, trippedAt: entry.trippedAt }))
      .digest('hex');

    this.logger.error(`🚨 [CIRCUIT BREAKER TRIPPED] Playbook '${key}' is now OPEN (HALTED). Reason: ${reason}`);

    return {
      receiptId,
      tenantId: key.split(':')[0],
      playbookId: key.split(':')[1],
      previousState,
      currentState: 'OPEN',
      tripReason: reason,
      attestationDigest,
      trippedAt: entry.trippedAt,
    };
  }

  /**
   * Resets the circuit breaker back to CLOSED state.
   */
  resetCircuit(tenantId: string, playbookId: string) {
    const key = `${tenantId}:${playbookId}`;
    const entry = this.circuitStats.get(key);
    if (entry) {
      entry.state = 'CLOSED';
      entry.executions = [];
      entry.tripReason = undefined;
      entry.trippedAt = undefined;
      this.logger.log(`✔ Circuit breaker reset for Playbook '${key}' -> State: CLOSED`);
    }
  }

  private getOrCreateEntry(key: string, maxBlastRadiusLimit = 5) {
    if (!this.circuitStats.has(key)) {
      this.circuitStats.set(key, {
        state: 'CLOSED',
        executions: [],
        maxBlastRadiusLimit,
      });
    }
    return this.circuitStats.get(key)!;
  }

  private calculateErrorRate(executions: ActionExecutionContext[]): number {
    if (executions.length === 0) return 0;
    const failures = executions.filter((e) => e.status === 'FAILED').length;
    return (failures / executions.length) * 100;
  }
}
