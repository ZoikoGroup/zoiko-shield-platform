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
import { JiraNormalizerService } from './jira-ticketing.normalizer';
import { JiraIssuePayload } from './jira-ticketing.types';

@Injectable()
export class JiraTicketingProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(JiraTicketingProvider.name);

  constructor(
    private readonly normalizer: JiraNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('jira-ticketing', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(
      `Connecting Jira Ticketing integration for tenant ${context.tenantId}`,
    );

    if (!input.apiToken || !input.hostUrl || !input.userEmail) {
      return {
        status: 'FAILED',
        error:
          'Missing required configuration: apiToken, userEmail, and hostUrl are mandatory for Jira integration',
      };
    }

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      hostUrl: input.hostUrl,
      projectKey: input.projectKey || 'SEC',
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
    issues: JiraIssuePayload[] = [],
  ): Promise<SyncResult> {
    let processed = 0;
    for (const issue of issues) {
      const normalized = this.normalizer.normalizeIssue(
        issue,
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
      granted: ['read:jira-work', 'write:jira-work'],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(
      `Disconnecting Jira Ticketing integration for tenant ${context.tenantId}`,
    );
  }
}
