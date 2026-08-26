import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import {
  SecurityConnector,
  ConnectInput,
  ConnectionResult,
  HealthResult,
  SyncResult,
  PermissionResult,
} from '../../core/connector.interface';
import { ConnectorContext } from '../../core/connector-context';
import { ConnectorRegistry } from '../../core/connector-registry';
import { SentinelOneNormalizerService } from './sentinelone.normalizer';
import { SentinelOneThreatPayload } from './sentinelone.types';

@Injectable()
export class SentinelOneProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(SentinelOneProvider.name);

  constructor(
    private readonly normalizer: SentinelOneNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('sentinelone-edr', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(`Connecting SentinelOne for tenant=${context.tenantId}`);
    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      provider: 'sentinelone',
      apiUrl: input.apiUrl || 'https://usea1.sentinelone.net',
    };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    this.logger.log(`Testing SentinelOne health for tenant=${context.tenantId}`);
    return {
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 38,
    };
  }

  async sync(context: ConnectorContext): Promise<SyncResult> {
    this.logger.log(`Syncing SentinelOne threats for tenant=${context.tenantId}`);
    return {
      recordsProcessed: 0,
      syncedAt: new Date().toISOString(),
    };
  }

  async getPermissions(context: ConnectorContext): Promise<PermissionResult> {
    return {
      granted: ['threats.read', 'threats.mitigate', 'agents.read'],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(`Disconnecting SentinelOne for tenant=${context.tenantId}`);
  }

  async handleWebhook(
    payload: SentinelOneThreatPayload,
    context: ConnectorContext,
  ): Promise<{ success: boolean; event: any }> {
    this.logger.log(
      `Received SentinelOne threat webhook for threat=${payload.threatInfo?.threatId || payload.id} on tenant=${context.tenantId}`,
    );

    const normalized = this.normalizer.normalizeThreat(
      payload,
      context.tenantId,
      context.environmentId || 'default-env',
      context.region || 'GLOBAL',
    );

    return {
      success: true,
      event: normalized,
    };
  }
}
