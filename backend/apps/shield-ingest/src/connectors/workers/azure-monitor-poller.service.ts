import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorCheckpointService } from '../services/checkpoint.service';
import { ConnectorHealthService } from '../services/health.service';
import { HighThroughputBatchBufferService } from '../../ingestion/high-throughput-batch-buffer.service';

export interface AzureMonitorPollResult {
  instanceId: string;
  tenantId: string;
  polledCount: number;
  newCheckpoint: string;
  status: 'SUCCESS' | 'NO_NEW_DATA' | 'NOT_IMPLEMENTED' | 'ERROR';
  errorMessage?: string;
}

/** Shown on the connector's health so the customer knows nothing is collected. */
export const AZURE_MONITOR_NOT_COLLECTING_MESSAGE =
  'No Azure Monitor collector is implemented yet: this connector is configured but no events are being collected.';

/**
 * Scheduled poller for Azure Monitor connector instances.
 *
 * There is no Azure Monitor API client in this service yet. This poller used to
 * fabricate records and push them into the tenant's ingestion pipeline as if
 * they had come from the customer's cloud account; those records then became
 * normalized events, detections and alerts. It now collects nothing and marks
 * each connector's health so the gap is visible instead of hidden.
 */
@Injectable()
export class AzureMonitorPollerService {
  private readonly logger = new Logger(AzureMonitorPollerService.name);
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
        where: { definition: { provider: 'azure-monitor' }, deletedAt: null },
      });
      for (const instance of activeInstances) {
        try {
          await this.pollConnector(instance.id);
        } catch (err) {
          this.logger.error(
            `Failed to poll Azure Monitor instance ${instance.id}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Error during Azure Monitor scheduled poll: ${(err as Error).message}`,
      );
    } finally {
      this.isPolling = false;
    }
  }

  async pollConnector(instanceId: string): Promise<AzureMonitorPollResult> {
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
            .get(instanceId, 'azure-monitor')
            .catch(() => null)
        : null) || '0';

    if (this.healthService && tenantId) {
      await this.healthService
        .updateHealth(
          instanceId,
          tenantId,
          'DEGRADED',
          AZURE_MONITOR_NOT_COLLECTING_MESSAGE,
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
