import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  EventHubConsumerClient,
  latestEventPosition,
  type ReceivedEventData,
  type Subscription,
} from '@azure/event-hubs';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CANONICAL_TOPICS,
  KafkaProducerService,
} from '../../../kafka/kafka.producer.service';
import { RawIngestService } from '../../../ingestion/raw-ingest.service';
import { NormalizationService } from '../../../normalization/normalization.service';
import { EntraNormalizerService } from './entra.normalizer';
import { requireRegion } from '../../../security/tenant-context';

export interface EntraEventHubConsumerOptions {
  connectionString: string;
  eventHubName: string;
  consumerGroup?: string;
  tenantId: string;
  instanceId: string;
}

interface RunningConsumer {
  client: EventHubConsumerClient;
  subscriptions: Subscription[];
}

/** High-volume Microsoft Entra ingestion with durable per-partition checkpoints. */
@Injectable()
export class EntraEventHubConsumer implements OnModuleDestroy {
  private readonly logger = new Logger(EntraEventHubConsumer.name);
  private readonly consumers = new Map<string, RunningConsumer>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: EntraNormalizerService,
    private readonly rawIngestService: RawIngestService,
    private readonly normalizationService: NormalizationService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async startConsuming(options: EntraEventHubConsumerOptions): Promise<void> {
    if (this.consumers.has(options.instanceId)) {
      throw new Error(`Event Hub consumer for connector '${options.instanceId}' is already running`);
    }
    if (!options.connectionString || !options.eventHubName) {
      throw new Error('Event Hub connection string and hub name are required');
    }

    const instance = await this.prisma.connectorInstance.findFirst({
      where: {
        id: options.instanceId,
        tenant_id: options.tenantId,
        deletedAt: null,
      },
    });
    if (!instance) {
      throw new Error(`Connector '${options.instanceId}' does not belong to tenant '${options.tenantId}'`);
    }

    const client = new EventHubConsumerClient(
      options.consumerGroup ?? EventHubConsumerClient.defaultConsumerGroupName,
      options.connectionString,
      options.eventHubName,
    );

    try {
      const partitionIds = await client.getPartitionIds();
      const checkpoints = await this.prisma.eventHubConsumerCheckpoint.findMany({
        where: {
          instanceId: instance.id,
          tenant_id: instance.tenant_id,
        },
      });
      const checkpointByPartition = new Map(
        checkpoints.map((checkpoint) => [checkpoint.partitionId, checkpoint]),
      );

      const subscriptions = partitionIds.map((partitionId) => {
        const checkpoint = checkpointByPartition.get(partitionId);
        return client.subscribe(
          partitionId,
          {
            processEvents: async (events) => {
              await this.processEvents(instance, partitionId, events);
            },
            processError: async (error) => {
              await this.recordConsumerError(instance.id, instance.tenant_id, error);
            },
          },
          {
            startPosition: checkpoint
              ? { offset: checkpoint.offset, isInclusive: false }
              : latestEventPosition,
            maxBatchSize: 100,
            maxWaitTimeInSeconds: 15,
          },
        );
      });

      this.consumers.set(instance.id, { client, subscriptions });
      this.logger.log(
        `Started Event Hub consumer for connector ${instance.id} across ${partitionIds.length} partitions`,
      );
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  }

  async stopConsuming(instanceId: string): Promise<void> {
    const running = this.consumers.get(instanceId);
    if (!running) return;
    this.consumers.delete(instanceId);
    await Promise.all(running.subscriptions.map((subscription) => subscription.close()));
    await running.client.close();
    this.logger.log(`Stopped Event Hub consumer for connector ${instanceId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.consumers.keys()].map((instanceId) => this.stopConsuming(instanceId)));
  }

  private async processEvents(
    instance: {
      id: string;
      tenant_id: string;
      environment_id: string;
      source_region: string | null;
    },
    partitionId: string,
    events: ReceivedEventData[],
  ): Promise<void> {
    if (events.length === 0) return;

    for (const event of events) {
      const records = this.recordsFromBody(event.body as unknown);
      for (const [index, record] of records.entries()) {
        const sourceEventId =
          this.stringValue(record.id) ??
          this.stringValue(record.correlationId) ??
          `${event.sequenceNumber}:${index}`;
        const ingestResult = await this.rawIngestService.ingestRawEvent({
          tenantId: instance.tenant_id,
          environmentId: instance.environment_id,
          connectorId: instance.id,
          sourceType: 'microsoft-entra-event-hub',
          sourceEventId,
          occurredAt: this.eventTime(record) ?? event.enqueuedTimeUtc,
          payload: record,
        });

        if (ingestResult.processingStatus === 'DUPLICATE_IGNORED') continue;
        await this.normalizationService.normalizeRawEvent(ingestResult.id);

        if (record.userPrincipalName || record.userId) {
          const canonicalEvent = this.normalizer.normalizeSignInLog(
            record,
            instance.tenant_id,
            instance.environment_id,
            requireRegion(instance.source_region),
          );
          await this.kafkaProducer.publishEvent(
            CANONICAL_TOPICS.IDENTITY_SIGNIN,
            canonicalEvent.event_type,
            {
              tenantId: instance.tenant_id,
              instanceId: instance.id,
              ...canonicalEvent,
            },
            {
              correlationId: canonicalEvent.correlation_id,
              occurredAt: new Date(canonicalEvent.event_timestamp),
            },
          );
        }
      }
    }

    const lastEvent = events[events.length - 1];
    await this.prisma.eventHubConsumerCheckpoint.upsert({
      where: {
        instanceId_partitionId: {
          instanceId: instance.id,
          partitionId,
        },
      },
      create: {
        tenant_id: instance.tenant_id,
        instanceId: instance.id,
        partitionId,
        offset: lastEvent.offset,
        sequenceNumber: BigInt(lastEvent.sequenceNumber),
      },
      update: {
        offset: lastEvent.offset,
        sequenceNumber: BigInt(lastEvent.sequenceNumber),
      },
    });
  }

  private recordsFromBody(body: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(body)) {
      return body.filter((record): record is Record<string, unknown> =>
        Boolean(record) && typeof record === 'object' && !Array.isArray(record),
      );
    }
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      if (Array.isArray(record.records)) {
        return record.records.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        );
      }
      return [record];
    }
    throw new Error('Event Hub message body must contain an object or record array');
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private eventTime(record: Record<string, unknown>): Date | undefined {
    const raw = this.stringValue(record.createdDateTime) ?? this.stringValue(record.time);
    if (!raw) return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private async recordConsumerError(
    instanceId: string,
    tenantId: string,
    error: Error,
  ): Promise<void> {
    this.logger.error(`Event Hub consumer failed for connector ${instanceId}: ${error.message}`);
    await this.prisma.$transaction([
      this.prisma.connectorInstance.updateMany({
        where: { id: instanceId, tenant_id: tenantId },
        data: { state: 'DEGRADED' },
      }),
      this.prisma.connectorError.create({
        data: {
          tenant_id: tenantId,
          instanceId,
          errorCode: 'EVENT_HUB_CONSUMER_ERROR',
          message: error.message.slice(0, 2000),
        },
      }),
    ]);
  }
}
