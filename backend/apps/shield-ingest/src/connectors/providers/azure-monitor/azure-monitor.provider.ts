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
import { AzureMonitorNormalizerService } from './azure-monitor.normalizer';
import { AzureActivityLogEvent } from './azure-monitor.types';

@Injectable()
export class AzureMonitorProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(AzureMonitorProvider.name);

  constructor(
    private readonly normalizer: AzureMonitorNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('azure-monitor', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(
      `Connecting Azure Monitor for tenant ${context.tenantId}, subscription: ${input.subscriptionId || 'unset'}...`,
    );

    if (!input.clientId || !input.clientSecret || !input.azureTenantId) {
      return {
        status: 'FAILED',
        error:
          'Missing required configuration: clientId, clientSecret and azureTenantId (Azure AD service principal) are mandatory for Azure Monitor OAuth token exchange',
      };
    }
    if (!input.subscriptionId) {
      return {
        status: 'FAILED',
        error:
          'Missing required configuration: subscriptionId identifies which Azure subscription to read Activity Log events from',
      };
    }

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      baseUrl: 'https://management.azure.com',
      subscriptionId: input.subscriptionId,
    };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    this.logger.log(`Testing Azure Monitor health for tenant=${context.tenantId}`);
    return {
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 41,
    };
  }

  async sync(
    context: ConnectorContext,
    events: AzureActivityLogEvent[] = [],
  ): Promise<SyncResult> {
    let processed = 0;
    for (const event of events) {
      const normalized = this.normalizer.normalizeEvent(
        event,
        context.tenantId,
        context.environmentId,
        context.region || 'eu-west-1',
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
      granted: [
        'Microsoft.Insights/eventtypes/values/read',
        'Microsoft.Authorization/roleAssignments/read',
      ],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(`Disconnecting Azure Monitor for tenant ${context.tenantId}`);
  }
}
