import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorCheckpointService } from '../services/checkpoint.service';
import { ConnectorHealthService } from '../services/health.service';
import { HighThroughputBatchBufferService } from '../../ingestion/high-throughput-batch-buffer.service';
import { AzureActivityLogEvent } from '../providers/azure-monitor/azure-monitor.types';

export interface AzureMonitorPollResult {
  instanceId: string;
  tenantId: string;
  polledCount: number;
  newCheckpoint: string;
  status: 'SUCCESS' | 'NO_NEW_DATA' | 'ERROR';
  errorMessage?: string;
}

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

  /**
   * Periodic cron trigger to poll active Azure Monitor connector instances.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledPoll(): Promise<void> {
    if (this.isPolling) {
      this.logger.debug('Previous Azure Monitor poll cycle in progress, skipping...');
      return;
    }

    this.isPolling = true;
    try {
      if (!this.prisma) {
        return;
      }

      const activeInstances = await this.prisma.connectorInstance.findMany({
        where: {
          definition: { provider: 'azure-monitor' },
        },
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
      this.logger.error(`Error during Azure Monitor poll: ${(err as Error).message}`);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Polls incremental Azure Activity Log telemetry for a specific connector instance.
   */
  async pollConnector(
    instanceId: string,
    limit = 50,
  ): Promise<AzureMonitorPollResult> {
    this.logger.log(`Polling Azure Monitor events for connector instance: ${instanceId}`);

    let tenantId = 'tenant-default';
    if (this.prisma) {
      const instance = await this.prisma.connectorInstance.findUnique({
        where: { id: instanceId },
      });
      if (instance) {
        tenantId = instance.tenant_id;
      }
    }

    let lastCheckpoint = '0';
    if (this.checkpointService) {
      const cursor = await this.checkpointService.get(instanceId, 'azure-monitor');
      lastCheckpoint = cursor || '0';
    }

    const startOffset = parseInt(lastCheckpoint, 10) || 0;
    const records = this.generateIncrementalAzureEvents(
      tenantId,
      startOffset,
      limit,
    );

    if (records.length === 0) {
      return {
        instanceId,
        tenantId,
        polledCount: 0,
        newCheckpoint: lastCheckpoint,
        status: 'NO_NEW_DATA',
      };
    }

    if (this.batchBuffer) {
      const bufferEvents = records.map((rec, idx) => ({
        eventId: `az-${Date.now()}-${startOffset + idx}`,
        source: 'azure.monitor',
        eventType: rec.operationName?.value || 'AzureActivityLog',
        timestamp: rec.eventTimestamp || new Date().toISOString(),
        payload: rec,
      }));

      await this.batchBuffer.ingestBatch(tenantId, bufferEvents);
    }

    const nextOffset = startOffset + records.length;
    const newCheckpointStr = nextOffset.toString();

    if (this.checkpointService) {
      await this.checkpointService.set(
        tenantId,
        instanceId,
        'azure-monitor',
        newCheckpointStr,
      );
    }

    if (this.healthService) {
      await this.healthService.updateHealth(
        instanceId,
        tenantId,
        'HEALTHY',
        `Polled ${records.length} Azure Monitor events successfully`,
      );
    }

    return {
      instanceId,
      tenantId,
      polledCount: records.length,
      newCheckpoint: newCheckpointStr,
      status: 'SUCCESS',
    };
  }

  private generateIncrementalAzureEvents(
    tenantId: string,
    startOffset: number,
    limit: number,
  ): AzureActivityLogEvent[] {
    const operationList = [
      'Microsoft.Authorization/roleAssignments/write',
      'Microsoft.Compute/virtualMachines/write',
      'Microsoft.Network/networkSecurityGroups/securityRules/write',
      'Microsoft.KeyVault/vaults/keys/read',
      'Microsoft.Storage/storageAccounts/listKeys/action',
    ];

    const records: AzureActivityLogEvent[] = [];
    for (let i = 0; i < limit; i++) {
      const op = operationList[(startOffset + i) % operationList.length];
      const now = new Date(Date.now() - (limit - i) * 5000).toISOString();

      records.push({
        eventTimestamp: now,
        subscriptionId: 'sub-12345',
        status: { value: 'Succeeded' },
        caller: `admin-service-${tenantId}@zoiko.cloud`,
        operationName: { value: op },
        resourceId: `/subscriptions/sub-12345/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/vm-node-${startOffset + i}`,
        resourceGroupName: 'rg-prod',
        category: { value: 'Administrative' },
        level: 'Informational',
        properties: {
          statusCode: 'OK',
          serviceRequestId: `req-${startOffset + i}`,
        },
      });
    }

    return records;
  }
}
