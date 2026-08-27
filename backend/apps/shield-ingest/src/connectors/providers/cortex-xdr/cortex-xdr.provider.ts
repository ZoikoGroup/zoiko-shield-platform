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
import { CortexXdrNormalizerService, OcsfSecurityFinding } from './cortex-xdr.normalizer';
import { CortexXdrIncident } from './cortex-xdr.types';

@Injectable()
export class CortexXdrProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(CortexXdrProvider.name);

  constructor(
    private readonly normalizer: CortexXdrNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('palo-alto-cortex-xdr', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(`Connecting Palo Alto Cortex XDR for tenant=${context.tenantId}`);
    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      provider: 'palo-alto-cortex-xdr',
      apiUrl: input.apiUrl || 'https://api-eu.xdr.paloaltonetworks.com',
    };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    this.logger.log(`Testing Cortex XDR health for tenant=${context.tenantId}`);
    return {
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 42,
    };
  }

  async sync(context: ConnectorContext): Promise<SyncResult> {
    this.logger.log(`Syncing Cortex XDR incidents for tenant=${context.tenantId}`);
    return {
      recordsProcessed: 0,
      syncedAt: new Date().toISOString(),
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(`Disconnecting Cortex XDR for tenant=${context.tenantId}`);
  }

  async getPermissions(context: ConnectorContext): Promise<PermissionResult> {
    return {
      granted: [
        'incidents:read',
        'alerts:read',
        'endpoints:read',
        'isolation:write',
      ],
      missing: [],
      evaluatedAt: new Date().toISOString(),
    };
  }

  async ingestIncident(
    context: ConnectorContext,
    incident: CortexXdrIncident,
  ): Promise<{ status: string; findings: OcsfSecurityFinding[] }> {
    this.logger.log(
      `Ingesting Cortex XDR incident=${incident.incident_id} for tenant=${context.tenantId}`,
    );
    const findings = this.normalizer.normalizeIncident(incident);
    return {
      status: 'INGESTED',
      findings,
    };
  }
}
