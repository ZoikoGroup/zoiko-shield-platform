import { Injectable, Logger } from '@nestjs/common';

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
        'AWS_KMS',
        {
          provider: 'AWS_KMS',
          status: 'HEALTHY',
          lastLatencyMs: 35,
          averageLatencyMs: 40,
          errorRate: 0,
          consecutiveFailures: 0,
          lastCheckedAt: new Date().toISOString(),
        },
      ],
      [
        'GCP_CLOUD_KMS',
        {
          provider: 'GCP_CLOUD_KMS',
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

  private primaryProvider: KmsProviderType = 'AWS_KMS';
  private secondaryProvider: KmsProviderType = 'GCP_CLOUD_KMS';

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
        ? 'AWS_KMS'
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
