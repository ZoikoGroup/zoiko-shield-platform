import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService, CANONICAL_TOPICS } from '../kafka/kafka.producer.service';
import { MeteringService } from '../metering/metering.service';
import { DeduplicationService } from './deduplication.service';
import * as crypto from 'crypto';

export class IngestPayloadDto {
  eventId?: string;
  sourceEventId?: string;
  eventType?: string;
  occurredAt?: string;
  sourceRegion?: string;
  [key: string]: any;
}

export interface IngestionResult {
  id: string;
  tenantId: string;
  environmentId: string;
  connectorId: string;
  sourceEventId?: string;
  payloadHash: string;
  processingStatus: 'ACCEPTED' | 'DUPLICATE_IGNORED' | 'QUARANTINED';
  receivedAt: Date;
}

@Injectable()
export class RawIngestService {
  private readonly logger = new Logger(RawIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly deduplicationService: DeduplicationService,
    @Optional() private readonly meteringService?: MeteringService,
  ) {}

  /**
   * Internal (non-HTTP) raw-ingest entrypoint for connector runtimes —
   * tenant/environment/source_type are resolved from the already-loaded
   * ConnectorInstance, not from request headers. Shares the same raw
   * storage, SHA-256 hashing, dedup and quarantine behavior as the webhook
   * path below.
   */
  async ingestRawEvent(params: {
    tenantId: string;
    environmentId: string;
    connectorId: string;
    sourceType: string;
    sourceRegion?: string;
    sourceEventId?: string;
    occurredAt?: Date;
    payload: Record<string, any>;
  }): Promise<IngestionResult> {
    const { tenantId, environmentId, connectorId, sourceType, sourceEventId } = params;

    const rawString = JSON.stringify(params.payload);
    const payloadHash = crypto.createHash('sha256').update(rawString).digest('hex');

    if (sourceEventId) {
      const existing = await this.deduplicationService.findExisting(tenantId, connectorId, sourceEventId);
      if (existing) {
        return {
          id: existing.id,
          tenantId: existing.tenant_id,
          environmentId: existing.environment_id,
          connectorId: existing.connector_id,
          sourceEventId: existing.source_event_id || undefined,
          payloadHash: existing.payload_hash,
          processingStatus: 'DUPLICATE_IGNORED',
          receivedAt: existing.received_at,
        };
      }
    }

    const processingStatus: 'ACCEPTED' | 'QUARANTINED' =
      params.payload && typeof params.payload === 'object' && Object.keys(params.payload).length > 0
        ? 'ACCEPTED'
        : 'QUARANTINED';

    const rawEvent = await this.prisma.rawEvent.create({
      data: {
        tenant_id: tenantId,
        environment_id: environmentId,
        connector_id: connectorId,
        source_type: sourceType,
        source_event_id: sourceEventId,
        source_region: params.sourceRegion,
        occurred_at: params.occurredAt,
        payload_hash: payloadHash,
        raw_payload_reference: rawString,
        schema_version: 'v1.0',
        processing_status: processingStatus,
      },
    });

    try {
      await this.kafkaProducer.emit('telemetry.ingested', {
        rawEventId: rawEvent.id,
        tenantId,
        environmentId,
        connectorId,
        sourceType,
        payloadHash,
        status: processingStatus,
      });
    } catch (err) {
      this.logger.warn(`Failed to emit Kafka event: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (processingStatus === 'QUARANTINED') {
      await this.kafkaProducer.publishEvent(
        CANONICAL_TOPICS.CONNECTOR_EVENT_QUARANTINED,
        'connector.event.quarantined',
        { tenantId, rawEventId: rawEvent.id, connectorId, sourceType, sourceEventId, payloadHash },
      );
    }

    return {
      id: rawEvent.id,
      tenantId: rawEvent.tenant_id,
      environmentId: rawEvent.environment_id,
      connectorId: rawEvent.connector_id,
      sourceEventId: rawEvent.source_event_id || undefined,
      payloadHash: rawEvent.payload_hash,
      processingStatus: rawEvent.processing_status as 'ACCEPTED' | 'QUARANTINED',
      receivedAt: rawEvent.received_at,
    };
  }

  /**
   * Process generic webhook payloads, record raw events, handle deduplication, and publish events.
   */
  async processWebhookPayload(
    connectorId: string,
    headers: Record<string, string | string[] | undefined>,
    payload: IngestPayloadDto,
  ): Promise<IngestionResult> {
    this.logger.log(`Received webhook payload for connector: ${connectorId}`);

    const connector = await this.prisma.connectorInstance.findUnique({
      where: { id: connectorId },
    });

    if (!connector) {
      throw new NotFoundException(`Connector with ID '${connectorId}' not found`);
    }

    const tenantId = (headers['x-tenant-id'] as string) || connector.tenant_id;
    const environmentId = (headers['x-environment-id'] as string) || connector.environment_id || 'default-env';
    const sourceRegion = (headers['x-source-region'] as string) || connector.source_region || undefined;
    const sourceEventId = payload.sourceEventId || payload.eventId || undefined;

    let occurredAt: Date | undefined;
    if (payload.occurredAt) {
      const parsedDate = new Date(payload.occurredAt);
      if (!isNaN(parsedDate.getTime())) {
        occurredAt = parsedDate;
      }
    }

    if (sourceEventId) {
      const existing = await this.deduplicationService.findExisting(tenantId, connectorId, sourceEventId);
      if (existing) {
        this.logger.warn(
          `Duplicate event detected for connector ${connectorId}, sourceEventId: ${sourceEventId}`,
        );

        if (this.meteringService) {
          try {
            await this.meteringService.recordUsageObservation({
              tenantId,
              environmentId,
              sourceType: connector.authentication_type || 'WEBHOOK',
              rawEventId: existing.id,
              usageState: 'DUPLICATE',
              acceptedQuantity: 1,
              billableQuantity: 0,
            });
          } catch (err) {
            this.logger.warn(`Failed to record duplicate usage observation: ${err}`);
          }
        }

        return {
          id: existing.id,
          tenantId: existing.tenant_id,
          environmentId: existing.environment_id,
          connectorId: existing.connector_id,
          sourceEventId: existing.source_event_id || undefined,
          payloadHash: existing.payload_hash,
          processingStatus: 'DUPLICATE_IGNORED',
          receivedAt: existing.received_at,
        };
      }
    }

    const result = await this.ingestRawEvent({
      tenantId,
      environmentId,
      connectorId,
      sourceType: connector.authentication_type || 'WEBHOOK',
      sourceRegion,
      sourceEventId,
      occurredAt,
      payload,
    });

    // Record usage observation per ZS-COM-BILL-001 rules
    if (this.meteringService) {
      try {
        await this.meteringService.recordUsageObservation({
          tenantId,
          environmentId,
          sourceType: connector.authentication_type || 'WEBHOOK',
          rawEventId: result.id,
          usageState: result.processingStatus === 'QUARANTINED' ? 'QUARANTINED' : 'ACCEPTED',
          acceptedQuantity: 1,
          billableQuantity: result.processingStatus === 'ACCEPTED' ? 1 : 0,
        });

        const resourceId = payload.resourceId || payload.sourceIp || payload.clientIp;
        if (resourceId) {
          await this.meteringService.observeProtectedResource({
            tenantId,
            environmentId,
            canonicalResourceId: resourceId,
            resourceType: payload.resourceType || (payload.sourceIp ? 'IP' : 'ENDPOINT'),
            sourceConnectorId: connectorId,
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to record usage observation: ${err}`);
      }
    }

    return result;
  }
}
