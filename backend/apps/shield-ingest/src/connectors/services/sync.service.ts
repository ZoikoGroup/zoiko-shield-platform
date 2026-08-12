import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectorRegistry } from '../core/connector-registry';
import { ConnectorContext } from '../core/connector-context';
import { ConnectorError } from '../core/connector-errors';
import { ConnectorHealthService } from './health.service';
import { KafkaProducerService, CANONICAL_TOPICS } from '../../kafka/kafka.producer.service';
import { randomUUID } from 'crypto';

/**
 * Generic §29 orchestration: load instance -> resolve context -> resolve
 * provider via registry -> run sync -> record run/health. Provider-specific
 * behavior (Graph calls, raw storage, normalization) lives entirely inside
 * the registered SecurityConnector implementation, never here.
 */
@Injectable()
export class ConnectorSyncService {
  private readonly logger = new Logger(ConnectorSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
    private readonly healthService: ConnectorHealthService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async runSync(instanceId: string): Promise<void> {
    const instance = await this.prisma.connectorInstance.findUnique({
      where: { id: instanceId },
      include: { definition: true },
    });
    if (!instance) {
      throw new Error(`Connector instance '${instanceId}' not found`);
    }

    const context: ConnectorContext = {
      connectorInstanceId: instance.id,
      tenantId: instance.tenant_id,
      environmentId: instance.environment_id,
      region: instance.source_region ?? 'unspecified',
      purpose: 'security-monitoring',
      correlationId: randomUUID(),
      traceId: randomUUID(),
    };

    const syncRun = await this.prisma.connectorSynchronizationRun.create({
      data: {
        tenant_id: instance.tenant_id,
        instanceId: instance.id,
        syncType: 'SCHEDULED_OR_MANUAL',
        status: 'RUNNING',
      },
    });

    try {
      const connector = this.registry.get(instance.definition.provider);
      const result = await connector.sync(context);

      await this.prisma.connectorSynchronizationRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          recordsProcessed: result.recordsProcessed,
          recordsReceived: (result.recordsReceived as number) ?? result.recordsProcessed,
          recordsDuplicated: (result.recordsDuplicated as number) ?? 0,
          recordsQuarantined: (result.recordsQuarantined as number) ?? 0,
        },
      });

      await this.healthService.updateHealth(instance.id, instance.tenant_id, 'HEALTHY', 'Sync completed');
      await this.healthService.recordSuccessfulSync(instance.id);

      await this.kafkaProducer.publishEvent(
        CANONICAL_TOPICS.CONNECTOR_SYNC_COMPLETED,
        'connector.sync.completed',
        {
          tenantId: instance.tenant_id,
          instanceId: instance.id,
          provider: instance.definition.provider,
          syncRunId: syncRun.id,
          status: 'SUCCESS',
          recordsProcessed: result.recordsProcessed,
        },
        { correlationId: context.correlationId, traceId: context.traceId },
      );
    } catch (error) {
      this.logger.error(`Sync failed for instance ${instanceId}: ${(error as Error).message}`);

      await this.prisma.connectorSynchronizationRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorCode: error instanceof ConnectorError ? error.errorCode : 'UNKNOWN',
        },
      });

      await this.healthService.handleConnectorError(instance.id, instance.tenant_id, error as Error);
    }
  }
}
