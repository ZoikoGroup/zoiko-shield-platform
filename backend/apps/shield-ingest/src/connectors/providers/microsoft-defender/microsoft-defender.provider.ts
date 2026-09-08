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
import { MicrosoftDefenderNormalizerService } from './microsoft-defender.normalizer';
import { MicrosoftDefenderAlertPayload } from './microsoft-defender.types';

@Injectable()
export class MicrosoftDefenderProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(MicrosoftDefenderProvider.name);

  constructor(
    private readonly normalizer: MicrosoftDefenderNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('microsoft-defender-edr', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(
      `Connecting Microsoft Defender for Endpoint for tenant ${context.tenantId}, tenantAzureId: ${input.tenantAzureId || input.clientId?.substring(0, 8)}...`,
    );

    if (!input.clientId || !input.clientSecret) {
      return {
        status: 'FAILED',
        error:
          'Missing required configuration: clientId and clientSecret are mandatory for Azure AD OAuth token exchange',
      };
    }

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      baseUrl: input.baseUrl || 'https://api.securitycenter.microsoft.com',
    };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    return {
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 38,
    };
  }

  async sync(
    context: ConnectorContext,
    alerts: MicrosoftDefenderAlertPayload[] = [],
  ): Promise<SyncResult> {
    let processed = 0;
    for (const alert of alerts) {
      const normalized = this.normalizer.normalizeAlert(
        alert,
        context.tenantId,
        context.environmentId,
        'GLOBAL',
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
      granted: ['Alert.Read.All', 'Machine.Read.All', 'SecurityIncident.Read.All'],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(
      `Disconnecting Microsoft Defender for Endpoint for tenant ${context.tenantId}`,
    );
  }
}
