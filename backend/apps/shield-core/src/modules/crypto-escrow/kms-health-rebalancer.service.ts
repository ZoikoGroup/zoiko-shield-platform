import { Injectable, Logger } from '@nestjs/common';

/**
 * KMS provider health-based routing (NOT secret-splitting escrow).
 *
 * This is an in-memory health map that shifts a routing weight from one KMS
 * provider to another when the primary looks unhealthy — a failover router,
 * not the "split-KMS escrow" some documentation has called it. Real
 * multi-party key-share escrow (Shamir's secret sharing or equivalent) is a
 * different, unimplemented capability; see SplitKmsEscrowService in this
 * same module for the XOR-based secret-splitting engine and its own
 * corrected labeling.
 */
export type KmsProviderType = 'AWS_KMS' | 'GCP_CLOUD_KMS' | 'AZURE_KEYVAULT';

export interface KmsProviderHealth {
  provider: KmsProviderType;
  status: 'HEALTHY' | 'DEGRADED' | 'OUTAGE';
  lastLatencyMs: number;
  averageLatencyMs: number;
  errorRate: number;
  consecutiveFailures: number;
  lastCheckedAt: string;
}

export interface FailoverEvent {
  failedProvider: KmsProviderType;
  newPrimaryProvider: KmsProviderType;
  reason: string;
  timestamp: string;
  affectedTenants: string[];
}

@Injectable()
export class KmsHealthRebalancerService {
  private readonly logger = new Logger(KmsHealthRebalancerService.name);

  private readonly providers: Map<KmsProviderType, KmsProviderHealth> = new Map(
    [
      [
        'GCP_CLOUD_KMS',
        {
          provider: 'GCP_CLOUD_KMS',
          status: 'HEALTHY',
          lastLatencyMs: 35,
          averageLatencyMs: 40,
          errorRate: 0,
          consecutiveFailures: 0,
          lastCheckedAt: new Date().toISOString(),
        },
      ],
      [
        'AWS_KMS',
        {
          provider: 'AWS_KMS',
          status: 'HEALTHY',
          lastLatencyMs: 42,
          averageLatencyMs: 45,
          errorRate: 0,
          consecutiveFailures: 0,
          lastCheckedAt: new Date().toISOString(),
        },
      ],
    ],
  );

  // GCP is the hosting baseline (ADR-16) — GCP Cloud KMS is the real,
  // wired-up primary. AWS/Azure remain modeled as a documented cross-cloud
  // escape hatch for a total GCP KMS outage, not an equally-real secondary:
  // no AWS/Azure KMS credentials or client exist in this codebase today.
  private primaryProvider: KmsProviderType = 'GCP_CLOUD_KMS';
  private secondaryProvider: KmsProviderType = 'AWS_KMS';

  /**
   * Records a synthetic KMS probe result (e.g. heartbeat encryption/unwrapping).
   */
  recordProbe(
    provider: KmsProviderType,
    success: boolean,
    latencyMs: number,
  ): KmsProviderHealth {
    const health = this.providers.get(provider) || {
      provider,
      status: 'HEALTHY',
      lastLatencyMs: latencyMs,
      averageLatencyMs: latencyMs,
      errorRate: 0,
      consecutiveFailures: 0,
      lastCheckedAt: new Date().toISOString(),
    };

    health.lastLatencyMs = latencyMs;
    health.averageLatencyMs = Math.round(
      (health.averageLatencyMs * 4 + latencyMs) / 5,
    );
    health.lastCheckedAt = new Date().toISOString();

    if (!success) {
      health.consecutiveFailures++;
      health.errorRate = Math.min(1.0, health.errorRate + 0.2);
    } else {
      health.consecutiveFailures = 0;
      health.errorRate = Math.max(0.0, health.errorRate - 0.05);
    }

    // Determine status
    if (health.consecutiveFailures >= 3 || health.errorRate >= 0.5) {
      health.status = 'OUTAGE';
    } else if (health.averageLatencyMs > 400 || health.errorRate >= 0.15) {
      health.status = 'DEGRADED';
    } else {
      health.status = 'HEALTHY';
    }

    this.providers.set(provider, health);

    // Auto-rebalance if primary provider is in outage or severely degraded
    if (this.primaryProvider === provider && health.status !== 'HEALTHY') {
      this.triggerFailover(
        provider,
        `Primary KMS provider '${provider}' entered ${health.status} state (Latency: ${health.averageLatencyMs}ms, Failures: ${health.consecutiveFailures})`,
      );
    }

    return health;
  }

  /**
   * Triggers proactive traffic re-balancing and failover to the healthy secondary KMS provider.
   */
  triggerFailover(
    failedProvider: KmsProviderType,
    reason: string,
  ): FailoverEvent {
    const fallback =
      this.secondaryProvider === failedProvider
        ? this.nextFallbackAfter(this.primaryProvider, failedProvider)
        : this.secondaryProvider;
    const oldPrimary = this.primaryProvider;
    this.primaryProvider = fallback;
    this.secondaryProvider = oldPrimary;

    const event: FailoverEvent = {
      failedProvider,
      newPrimaryProvider: this.primaryProvider,
      reason,
      timestamp: new Date().toISOString(),
      affectedTenants: ['*'],
    };

    this.logger.warn(
      `🚨 [KMS FAILOVER] Shifted cryptographic traffic from '${failedProvider}' to '${this.primaryProvider}'. Reason: ${reason}`,
    );

    return event;
  }

  /** The remaining provider once both primary and the just-failed one are excluded. */
  private nextFallbackAfter(
    primary: KmsProviderType,
    failed: KmsProviderType,
  ): KmsProviderType {
    const remaining = (
      ['GCP_CLOUD_KMS', 'AWS_KMS', 'AZURE_KEYVAULT'] as const
    ).find((p) => p !== primary && p !== failed);
    if (!remaining) {
      throw new Error(
        `No remaining KMS provider to fail over to (primary and failed both exhaust the provider set).`,
      );
    }
    return remaining;
  }

  getPrimaryProvider(): KmsProviderType {
    return this.primaryProvider;
  }

  getProviderHealth(provider: KmsProviderType): KmsProviderHealth | undefined {
    return this.providers.get(provider);
  }

  getRoutingWeights(): Record<KmsProviderType, number> {
    const primaryHealth = this.providers.get(this.primaryProvider);
    if (primaryHealth?.status === 'OUTAGE') {
      return {
        AWS_KMS: this.primaryProvider === 'AWS_KMS' ? 0 : 100,
        GCP_CLOUD_KMS: this.primaryProvider === 'GCP_CLOUD_KMS' ? 0 : 100,
        AZURE_KEYVAULT: 0,
      };
    }
    return {
      AWS_KMS: this.primaryProvider === 'AWS_KMS' ? 100 : 0,
      GCP_CLOUD_KMS: this.primaryProvider === 'GCP_CLOUD_KMS' ? 100 : 0,
      AZURE_KEYVAULT: 0,
    };
  }
}
