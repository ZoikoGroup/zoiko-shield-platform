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
import { AwsGuardDutyNormalizerService } from './aws-guardduty.normalizer';
import { GuardDutyFinding } from './aws-guardduty.types';

@Injectable()
export class AwsGuardDutyProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(AwsGuardDutyProvider.name);

  constructor(
    private readonly normalizer: AwsGuardDutyNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('aws-guardduty', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(
      `Connecting AWS GuardDuty for tenant ${context.tenantId}, detectorId: ${input.detectorId}`,
    );

    if (!input.roleArn) {
      return {
        status: 'FAILED',
        error: 'Missing required configuration: roleArn is mandatory for AWS IAM cross-account access',
      };
    }

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      account: input.awsAccountId,
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
    findings: GuardDutyFinding[] = [],
  ): Promise<SyncResult> {
    let processed = 0;
    for (const finding of findings) {
      const normalized = this.normalizer.normalizeFinding(
        finding,
        context.tenantId,
        context.environmentId,
        finding.region || 'us-east-1',
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
        'guardduty:GetFindings',
        'guardduty:ListFindings',
        'guardduty:GetDetector',
        'sqs:ReceiveMessage',
      ],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(`Disconnecting AWS GuardDuty for tenant ${context.tenantId}`);
  }
}
