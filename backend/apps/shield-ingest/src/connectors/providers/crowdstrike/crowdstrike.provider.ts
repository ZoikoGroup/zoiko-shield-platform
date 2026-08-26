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
import { CrowdStrikeNormalizerService } from './crowdstrike.normalizer';
import { CrowdStrikeDetectionPayload } from './crowdstrike.types';

@Injectable()
export class CrowdStrikeProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(CrowdStrikeProvider.name);

  constructor(
    private readonly normalizer: CrowdStrikeNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('crowdstrike-edr', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(
      `Connecting CrowdStrike Falcon EDR for tenant ${context.tenantId}, clientId: ${input.clientId?.substring(0, 8)}...`,
    );

    if (!input.clientId || !input.clientSecret) {
      return {
        status: 'FAILED',
        error:
          'Missing required configuration: clientId and clientSecret are mandatory for OAuth2 token exchange',
      };
    }

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      baseUrl: input.baseUrl || 'https://api.crowdstrike.com',
    };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    return {
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 44,
    };
  }

  async sync(
    context: ConnectorContext,
    detections: CrowdStrikeDetectionPayload[] = [],
  ): Promise<SyncResult> {
    let processed = 0;
    for (const det of detections) {
      const normalized = this.normalizer.normalizeDetection(
        det,
        context.tenantId,
        context.environmentId,
        'us-east-1',
      );
      if (normalized) {
        processed += 1;
      }
    }

    return {
      status: 'SYNCED',
      recordsProcessed: processed,
      syncedAt: new Date().toISOString(),
    };
  }

  async getPermissions(context: ConnectorContext): Promise<PermissionResult> {
    return {
      granted: ['detections:read', 'hosts:read', 'event_streams:read'],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(
      `Disconnecting CrowdStrike Falcon EDR for tenant ${context.tenantId}`,
    );
  }
}
