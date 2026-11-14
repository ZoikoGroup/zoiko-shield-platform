import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorCheckpointService } from '../services/checkpoint.service';
import { ConnectorHealthService } from '../services/health.service';
import { HighThroughputBatchBufferService } from '../../ingestion/high-throughput-batch-buffer.service';

export interface CloudTrailPollResult {
  instanceId: string;
  tenantId: string;
  polledCount: number;
  newCheckpoint: string;
  status: 'SUCCESS' | 'NO_NEW_DATA' | 'NOT_IMPLEMENTED' | 'ERROR';
  errorMessage?: string;
}

/** Shown on the connector's health so the customer knows nothing is collected. */
export const AWS_CLOUDTRAIL_NOT_COLLECTING_MESSAGE =
  'No AWS CloudTrail collector is implemented yet: this connector is configured but no events are being collected.';

/**
 * Scheduled poller for AWS CloudTrail connector instances.
 *
 * There is no AWS CloudTrail API client in this service yet. This poller used to
 * fabricate records and push them into the tenant's ingestion pipeline as if
 * they had come from the customer's cloud account; those records then became
 * normalized events, detections and alerts. It now collects nothing and marks
 * each connector's health so the gap is visible instead of hidden.
 */
@Injectable()
export class AwsCloudTrailPollerService {
  private readonly logger = new Logger(AwsCloudTrailPollerService.name);
  private isPolling = false;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly checkpointService?: ConnectorCheckpointService,
    @Optional() private readonly healthService?: ConnectorHealthService,
    @Optional() private readonly batchBuffer?: HighThroughputBatchBufferService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledPoll(): Promise<void> {
    if (this.isPolling || !this.prisma) return;
    this.isPolling = true;
    try {
      const activeInstances = await this.prisma.connectorInstance.findMany({
        where: { definition: { provider: 'aws-cloudtrail' }, deletedAt: null },
      });
      for (const instance of activeInstances) {
        try {
          await this.pollConnector(instance.id);
        } catch (err) {
          this.logger.error(
            `Failed to poll AWS CloudTrail instance ${instance.id}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Error during AWS CloudTrail scheduled poll: ${(err as Error).message}`,
      );
    } finally {
      this.isPolling = false;
    }
  }

  async pollConnector(instanceId: string): Promise<CloudTrailPollResult> {
    let tenantId = '';
    if (this.prisma) {
      const instance = await this.prisma.connectorInstance.findUnique({
        where: { id: instanceId },
      });
      tenantId = instance?.tenant_id ?? '';
    }
    const checkpoint =
      (this.checkpointService && tenantId
        ? await this.checkpointService
            .get(instanceId, 'aws-cloudtrail')
            .catch(() => null)
        : null) || '0';

    if (this.healthService && tenantId) {
      await this.healthService
        .updateHealth(
          instanceId,
          tenantId,
          'DEGRADED',
          AWS_CLOUDTRAIL_NOT_COLLECTING_MESSAGE,
        )
        .catch(() => undefined);
    }

    return {
      instanceId,
      tenantId,
      polledCount: 0,
      newCheckpoint: checkpoint,
      status: 'NOT_IMPLEMENTED',
    };
  }
}
