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
import { OktaNormalizerService } from './okta.normalizer';
import { OktaEventPayload } from './okta.types';

@Injectable()
export class OktaProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(OktaProvider.name);

  constructor(
    private readonly normalizer: OktaNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('okta-identity', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(
      `Connecting Okta Identity Cloud for tenant ${context.tenantId}, domain: ${input.orgUrl}`,
    );

    if (!input.orgUrl || !input.apiToken) {
      return {
        status: 'FAILED',
        error: 'Missing required configuration: orgUrl and apiToken are mandatory',
      };
    }

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      orgUrl: input.orgUrl,
    };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    return {
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 52,
    };
  }

  async sync(
    context: ConnectorContext,
    events: OktaEventPayload[] = [],
  ): Promise<SyncResult> {
    let processed = 0;
    for (const evt of events) {
      const normalized = this.normalizer.normalizeEvent(
        evt,
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
      granted: [
        'okta.logs.read',
        'okta.users.read',
        'okta.events.read',
      ],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(`Disconnecting Okta Identity Cloud for tenant ${context.tenantId}`);
  }
}
