import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CircuitBreakerState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

export interface DatabaseHealthStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  circuitBreakerState: CircuitBreakerState;
  latencyMs: number;
  consecutiveFailures: number;
  lastCheckedAt: Date;
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

@Injectable()
export class DatabaseResilienceService {
  private readonly logger = new Logger(DatabaseResilienceService.name);
  private circuitState: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;

  private readonly failureThreshold = 5;
  private readonly resetTimeoutMs = 15000; // 15 seconds cool-down
  private readonly degradedLatencyThresholdMs = 1500; // 1.5 seconds

  constructor(private readonly prisma: PrismaService) {}

  getCircuitState(): CircuitBreakerState {
    if (this.circuitState === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.resetTimeoutMs) {
        this.circuitState = 'HALF_OPEN';
        this.logger.log('Database circuit breaker transitioning to HALF_OPEN');
      }
    }
    return this.circuitState;
  }

  /**
   * Executes database operation with retry, backoff, and circuit breaker protection.
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: RetryOptions,
  ): Promise<T> {
    const currentState = this.getCircuitState();
    if (currentState === 'OPEN') {
      throw new Error(
        'Database circuit breaker is OPEN: rejecting queries to protect database pool.',
      );
    }

    const maxRetries = options?.maxRetries ?? 3;
    const initialDelay = options?.initialDelayMs ?? 100;
    const maxDelay = options?.maxDelayMs ?? 2000;
    const factor = options?.factor ?? 2;

    let attempt = 0;
    let delay = initialDelay;

    while (attempt <= maxRetries) {
      try {
        const result = await operation();
        this.recordSuccess();
        return result;
      } catch (err: any) {
        attempt++;
        this.recordFailure();

        if (attempt > maxRetries || this.circuitState === 'OPEN') {
          throw err;
        }

        // Add random jitter to avoid thundering herd
        const jitter = Math.random() * 0.3 * delay;
        const sleepTime = Math.min(maxDelay, delay + jitter);
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
        delay *= factor;
      }
    }

    throw new Error('Unexpected retry loop termination');
  }

  /**
   * Checks database connectivity and health metrics.
   */
  async checkHealth(): Promise<DatabaseHealthStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      const latencyMs = Date.now() - start;
      this.recordSuccess();

      const status =
        latencyMs > this.degradedLatencyThresholdMs ? 'DEGRADED' : 'HEALTHY';

      return {
        status,
        circuitBreakerState: this.circuitState,
        latencyMs,
        consecutiveFailures: this.consecutiveFailures,
        lastCheckedAt: new Date(),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      this.recordFailure();

      return {
        status: 'UNHEALTHY',
        circuitBreakerState: this.circuitState,
        latencyMs,
        consecutiveFailures: this.consecutiveFailures,
        lastCheckedAt: new Date(),
      };
    }
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitState = 'CLOSED';
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitState = 'OPEN';
      this.logger.error(
        `Database circuit breaker tripped to OPEN after ${this.consecutiveFailures} consecutive failures.`,
      );
    }
  }
}
