import { Injectable, Logger } from '@nestjs/common';

export interface RateLimitConfig {
  capacity: number; // Max burst capacity
  refillRatePerSec: number; // Tokens added per second
}

export interface RateLimitDecision {
  allowed: boolean;
  remainingTokens: number;
  retryAfterMs?: number;
  tenantId: string;
}

interface BucketState {
  tokens: number;
  lastRefillTimestamp: number;
}

@Injectable()
export class TokenBucketRateLimiterService {
  private readonly logger = new Logger(TokenBucketRateLimiterService.name);
  private readonly buckets = new Map<string, BucketState>();

  // Default configuration: 500 events burst capacity, 100 events/sec refill
  private readonly defaultConfig: RateLimitConfig = {
    capacity: 500,
    refillRatePerSec: 100,
  };

  /**
   * Evaluates if a tenant request is permitted under token bucket limits.
   * If permitted, consumes `cost` tokens.
   */
  consume(
    tenantId: string,
    cost: number = 1,
    customConfig?: Partial<RateLimitConfig>,
  ): RateLimitDecision {
    const config: RateLimitConfig = {
      ...this.defaultConfig,
      ...customConfig,
    };

    const now = Date.now();
    let bucket = this.buckets.get(tenantId);

    if (!bucket) {
      bucket = {
        tokens: config.capacity,
        lastRefillTimestamp: now,
      };
      this.buckets.set(tenantId, bucket);
    } else {
      // Refill tokens based on elapsed time
      const elapsedSeconds = (now - bucket.lastRefillTimestamp) / 1000;
      const tokensToAdd = elapsedSeconds * config.refillRatePerSec;
      bucket.tokens = Math.min(config.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefillTimestamp = now;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return {
        allowed: true,
        remainingTokens: Math.floor(bucket.tokens),
        tenantId,
      };
    }

    // Rate limit exceeded - calculate wait time until enough tokens are replenished
    const missingTokens = cost - bucket.tokens;
    const retryAfterMs = Math.ceil(
      (missingTokens / config.refillRatePerSec) * 1000,
    );

    this.logger.warn(
      `Rate limit exceeded for tenant '${tenantId}'. Remaining: ${bucket.tokens.toFixed(1)}, Cost: ${cost}, Retry-After: ${retryAfterMs}ms`,
    );

    return {
      allowed: false,
      remainingTokens: Math.floor(bucket.tokens),
      retryAfterMs,
      tenantId,
    };
  }

  /**
   * Resets or clears the bucket state for a given tenant (useful for tests or tier upgrades).
   */
  reset(tenantId: string): void {
    this.buckets.delete(tenantId);
  }

  /**
   * Returns current active bucket count.
   */
  getActiveTenantCount(): number {
    return this.buckets.size;
  }
}
