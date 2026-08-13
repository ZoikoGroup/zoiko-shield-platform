import { Injectable, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { MeteringService } from '../metering/metering.service';
import * as crypto from 'crypto';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class IngestPayloadDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  eventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceEventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  eventType?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
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
    @Optional() private readonly meteringService?: MeteringService,
  ) {}

  /**
   * Process generic webhook payloads, record raw events, handle deduplication, and publish events.
   */
  async processWebhookPayload(
    connectorId: string,
    headers: Record<string, string | string[] | undefined>,
    payload: IngestPayloadDto,
  ): Promise<IngestionResult> {
    this.logger.log(`Received webhook payload for connector: ${connectorId}`);

    // Verify connector exists
    const connector = await this.prisma.connectorInstance.findUnique({
      where: { id: connectorId },
    });

    if (!connector) {
      throw new NotFoundException(`Connector with ID '${connectorId}' not found`);
    }

    // The authenticated connector is the authority. Caller-provided routing
    // headers may confirm the route but can never override it.
    const tenantId = connector.tenant_id;
    const environmentId = connector.environment_id;
    const sourceRegion = connector.source_region;
    const assertedTenant = headers['x-tenant-id'];
    const assertedEnvironment = headers['x-environment-id'];
    const assertedRegion = headers['x-source-region'];
    const routeMismatch =
      (typeof assertedTenant === 'string' && assertedTenant !== tenantId) ||
      (typeof assertedEnvironment === 'string' && assertedEnvironment !== environmentId) ||
      (typeof assertedRegion === 'string' && assertedRegion !== sourceRegion);

    // Calculate SHA-256 cryptographic hash of raw payload
    const rawString = JSON.stringify(payload);
    const payloadHash = crypto.createHash('sha256').update(rawString).digest('hex');

    // Extract source event ID if provided
    const sourceEventId = payload.sourceEventId || payload.eventId || undefined;

    // Deduplication check: if sourceEventId exists, check if already recorded
    if (sourceEventId) {
      const existing = await this.prisma.rawEvent.findFirst({
        where: {
          tenant_id: tenantId,
          connector_id: connectorId,
          source_event_id: sourceEventId,
        },
      });

      if (existing) {
        this.logger.warn(
          `Duplicate event detected for connector ${connectorId}, sourceEventId: ${sourceEventId}`,
        );

        // Record duplicate usage observation as NON_BILLABLE (ZS-COM-BILL-001)
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

    // Basic payload schema validation: must be a non-empty object
    let processingStatus: 'ACCEPTED' | 'QUARANTINED' = 'ACCEPTED';
    if (routeMismatch || !sourceRegion || !payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
      processingStatus = 'QUARANTINED';
    }

    // Parse occurred_at timestamp
    let occurredAt: Date | undefined;
    if (payload.occurredAt) {
      const parsedDate = new Date(payload.occurredAt);
      if (!isNaN(parsedDate.getTime())) {
        occurredAt = parsedDate;
      }
    }

    // Record raw event in PostgreSQL
    const rawEvent = await this.prisma.rawEvent.create({
      data: {
        tenant_id: tenantId,
        environment_id: environmentId,
        connector_id: connectorId,
        source_type: connector.authentication_type || 'WEBHOOK',
        source_event_id: sourceEventId,
        source_region: sourceRegion,
        occurred_at: occurredAt,
        payload_hash: payloadHash,
        raw_payload_reference: rawString,
        schema_version: 'v1.0',
        processing_status: processingStatus,
      },
    });

    // Record usage observation per ZS-COM-BILL-001 rules
    if (this.meteringService) {
      try {
        await this.meteringService.recordUsageObservation({
          tenantId,
          environmentId,
          sourceType: rawEvent.source_type,
          rawEventId: rawEvent.id,
          usageState: processingStatus === 'QUARANTINED' ? 'QUARANTINED' : 'ACCEPTED',
          acceptedQuantity: 1,
          billableQuantity: processingStatus === 'ACCEPTED' ? 1 : 0,
        });

        // Observe resource if payload specifies resourceId or sourceIp
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

    // Publish telemetry event to Kafka (or log if Kafka unavailable)
    try {
      await this.kafkaProducer.emit('telemetry.ingested', {
        rawEventId: rawEvent.id,
        tenantId,
        environmentId,
        connectorId,
        sourceType: rawEvent.source_type,
        payloadHash,
        status: processingStatus,
      });
    } catch (err) {
      this.logger.warn(`Failed to emit Kafka event: ${err instanceof Error ? err.message : String(err)}`);
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
   * Directly ingest a structured raw event from internal connectors (e.g. Entra)
   */
  async ingestRawEvent(params: {
    tenantId: string;
    environmentId: string;
    connectorId: string;
    sourceType: string;
    sourceEventId?: string;
    occurredAt?: Date;
    payload: any;
  }): Promise<IngestionResult> {
    return this.processWebhookPayload(
      params.connectorId,
      {
        'x-tenant-id': params.tenantId,
        'x-environment-id': params.environmentId,
      },
      {
        sourceEventId: params.sourceEventId,
        occurredAt: params.occurredAt?.toISOString(),
        ...params.payload,
      },
    );
  }
}
