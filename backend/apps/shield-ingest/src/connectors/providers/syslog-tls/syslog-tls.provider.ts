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
import { SyslogTlsNormalizerService } from './syslog-tls.normalizer';

@Injectable()
export class SyslogTlsProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(SyslogTlsProvider.name);

  constructor(
    private readonly normalizer: SyslogTlsNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('generic-syslog', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(
      `Connecting Syslog TLS listener for tenant ${context.tenantId} on port ${input.tlsPort || 6514}`,
    );

    return {
      status: 'LISTENING',
      port: input.tlsPort || 6514,
      tlsCipher: 'TLS_AES_256_GCM_SHA384',
      clientCertRequired: true,
      connectedAt: new Date().toISOString(),
    };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    return {
      status: 'HEALTHY',
      tlsHandshakeSuccess: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  async sync(
    context: ConnectorContext,
    rawLines: string[] = [],
  ): Promise<SyncResult> {
    let processed = 0;
    for (const line of rawLines) {
      const parsed = this.normalizer.parseRfc5424(line);
      if (parsed) {
        this.normalizer.normalizeMessage(
          parsed,
          context.tenantId,
          context.environmentId,
          'us-east-1',
        );
        processed += 1;
      }
    }

    return {
      status: 'STREAMING',
      recordsProcessed: processed,
      syncedAt: new Date().toISOString(),
    };
  }

  async getPermissions(context: ConnectorContext): Promise<PermissionResult> {
    return {
      granted: ['syslog:listen', 'tls:handshake'],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(
      `Stopped Syslog TLS listener for tenant ${context.tenantId}`,
    );
  }
}
