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
import { GcpSccNormalizerService } from './gcp-scc.normalizer';
import { GcpSccFindingPayload } from './gcp-scc.types';

@Injectable()
export class GcpSccProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(GcpSccProvider.name);

  constructor(
    private readonly normalizer: GcpSccNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('gcp-scc', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(
      `Connecting Google Cloud SCC for tenant ${context.tenantId}, gcpProjectId: ${input.gcpProjectId || 'default'}...`,
    );

    if (!input.serviceAccountKey && !input.clientId) {
      return {
        status: 'FAILED',
        error:
          'Missing required configuration: serviceAccountKey or OAuth credentials mandatory for GCP SCC authentication',
      };
    }

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      baseUrl: 'https://securitycenter.googleapis.com',
    };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    return {
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 32,
    };
  }

  async sync(
    context: ConnectorContext,
    findings: GcpSccFindingPayload[] = [],
  ): Promise<SyncResult> {
    let processed = 0;
    for (const finding of findings) {
      const normalized = this.normalizer.normalizeFinding(
        finding,
        context.tenantId,
        context.environmentId,
        'us-central1',
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
        'securitycenter.findings.list',
        'securitycenter.findings.get',
        'securitycenter.sources.list',
      ],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(
      `Disconnecting Google Cloud SCC for tenant ${context.tenantId}`,
    );
  }
}
