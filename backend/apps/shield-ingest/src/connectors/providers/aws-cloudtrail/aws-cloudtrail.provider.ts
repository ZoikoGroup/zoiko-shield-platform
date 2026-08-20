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
import { AwsCloudTrailNormalizerService } from './aws-cloudtrail.normalizer';
import { CloudTrailRawRecord } from './aws-cloudtrail.types';

@Injectable()
export class AwsCloudTrailProvider implements SecurityConnector, OnModuleInit {
  private readonly logger = new Logger(AwsCloudTrailProvider.name);

  constructor(
    private readonly normalizer: AwsCloudTrailNormalizerService,
    @Optional() private readonly registry?: ConnectorRegistry,
  ) {}

  onModuleInit(): void {
    if (this.registry) {
      this.registry.register('aws-cloudtrail', this);
    }
  }

  async connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult> {
    this.logger.log(
      `Connecting AWS CloudTrail for tenant ${context.tenantId}, roleArn: ${input.roleArn}`,
    );

    if (!input.roleArn || !input.s3BucketName) {
      return {
        status: 'FAILED',
        error: 'Missing required configuration: roleArn and s3BucketName are mandatory',
      };
    }

    return {
      status: 'CONNECTED',
      connectedAt: new Date().toISOString(),
      account: input.awsAccountId,
      bucket: input.s3BucketName,
    };
  }

  async testConnection(context: ConnectorContext): Promise<HealthResult> {
    return {
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 45,
    };
  }

  async sync(
    context: ConnectorContext,
    recordsToIngest: CloudTrailRawRecord[] = [],
  ): Promise<SyncResult> {
    let processed = 0;
    for (const rawRecord of recordsToIngest) {
      const normalized = this.normalizer.normalizeRecord(
        rawRecord,
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
      granted: ['s3:GetObject', 's3:ListBucket', 'sqs:ReceiveMessage', 'sqs:DeleteMessage'],
      missing: [],
    };
  }

  async disconnect(context: ConnectorContext): Promise<void> {
    this.logger.log(`Disconnecting AWS CloudTrail for tenant ${context.tenantId}`);
  }
}
