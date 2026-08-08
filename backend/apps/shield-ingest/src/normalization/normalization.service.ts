import { Injectable, Logger, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { AssetIdentityContextService } from '../context/asset-identity-context.service';
import { DetectionEngineService } from '../detection/detection-engine.service';

export interface ReprocessResult {
  quarantineId: string;
  rawEventId: string;
  status: 'REPROCESSED' | 'QUARANTINED';
  normalizedEventId?: string;
  reason?: string;
}

export interface ReplayResult {
  totalProcessed: number;
  normalizedCount: number;
  quarantinedCount: number;
}

@Injectable()
export class NormalizationService {
  private readonly logger = new Logger(NormalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
    @Optional() private readonly contextService?: AssetIdentityContextService,
    @Optional() private readonly detectionService?: DetectionEngineService,
  ) {}

  /**
   * Normalizes a RawEvent into a NormalizedEvent or sends it to Quarantine if invalid.
   */
  async normalizeRawEvent(rawEventId: string) {
    this.logger.log(`Normalizing raw event: ${rawEventId}`);

    const rawEvent = await this.prisma.rawEvent.findUnique({
      where: { id: rawEventId },
    });

    if (!rawEvent) {
      throw new NotFoundException(`RawEvent '${rawEventId}' not found`);
    }

    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(rawEvent.raw_payload_reference);
    } catch {
      return this.quarantineEvent(
        rawEvent.id,
        rawEvent.tenant_id,
        rawEvent.connector_id,
        rawEvent.raw_payload_reference,
        'MALFORMED_PAYLOAD',
      );
    }

    if (!payload || typeof payload !== 'object') {
      return this.quarantineEvent(
        rawEvent.id,
        rawEvent.tenant_id,
        rawEvent.connector_id,
        rawEvent.raw_payload_reference,
        'INVALID_SCHEMA',
      );
    }

    // Determine normalized event fields
    const eventClass =
      payload.eventClass ||
      payload.eventType ||
      (payload.user ? 'AUTHENTICATION' : 'SECURITY_LOG');
    const eventCategory = payload.eventCategory || 'AUDIT';
    const eventActivity = payload.eventActivity || payload.eventType || 'LOG_ENTRY';
    const severity = (payload.severity || 'INFORMATIONAL').toUpperCase();

    const actorUserId = payload.actorUserId || payload.user?.id || payload.userId || undefined;
    const actorEmail = payload.actorEmail || payload.user?.email || payload.userEmail || undefined;
    const sourceIp = payload.sourceIp || payload.clientIp || payload.ipAddress || undefined;
    const destinationIp = payload.destinationIp || payload.targetIp || undefined;
    const resourceId = payload.resourceId || payload.targetId || undefined;
    const resourceType = payload.resourceType || payload.targetType || undefined;
    const action = payload.action || payload.eventType || 'EXECUTE';
    const outcome = (payload.outcome || payload.result || 'SUCCESS').toUpperCase();

    const occurredAt = payload.occurredAt
      ? new Date(payload.occurredAt)
      : rawEvent.occurred_at || new Date();

    // Store in NormalizedEvent table
    const normalizedEvent = await this.prisma.normalizedEvent.create({
      data: {
        tenant_id: rawEvent.tenant_id,
        environment_id: rawEvent.environment_id,
        connector_id: rawEvent.connector_id,
        raw_event_id: rawEvent.id,
        event_class: eventClass,
        event_category: eventCategory,
        event_activity: eventActivity,
        severity: severity,
        actor_user_id: actorUserId,
        actor_email: actorEmail,
        source_ip: sourceIp,
        destination_ip: destinationIp,
        resource_id: resourceId,
        resource_type: resourceType,
        action: action,
        outcome: outcome,
        occurred_at: occurredAt,
        observed_at: new Date(),
        mapping_version: '1.0',
        normalization_status: 'NORMALIZED',
      },
    });

    // Update RawEvent status to NORMALIZED
    await this.prisma.rawEvent.update({
      where: { id: rawEvent.id },
      data: { processing_status: 'NORMALIZED' },
    });

    // Resolve asset & identity context
    if (this.contextService) {
      try {
        await this.contextService.processNormalizedEventContext(normalizedEvent.id);
      } catch (err) {
        this.logger.warn(`Failed to resolve event context: ${err}`);
      }
    }

    // Evaluate detection rules
    if (this.detectionService) {
      try {
        await this.detectionService.evaluateNormalizedEvent(normalizedEvent.id);
      } catch (err) {
        this.logger.warn(`Failed to evaluate detection rules: ${err}`);
      }
    }

    // Publish TelemetryNormalized event
    try {
      await this.kafkaProducer.emit('telemetry.normalized', {
        eventId: normalizedEvent.id,
        rawEventId: rawEvent.id,
        tenantId: normalizedEvent.tenant_id,
        environmentId: normalizedEvent.environment_id,
        connectorId: normalizedEvent.connector_id,
        eventClass: normalizedEvent.event_class,
        severity: normalizedEvent.severity,
        actorEmail: normalizedEvent.actor_email,
        outcome: normalizedEvent.outcome,
      });
    } catch (err) {
      this.logger.warn(`Failed to emit Kafka TelemetryNormalized event: ${err}`);
    }

    return normalizedEvent;
  }

  /**
   * Quarantines a raw event
   */
  private async quarantineEvent(
    rawEventId: string,
    tenantId: string,
    connectorId: string,
    rawPayload: string,
    reason: string,
  ) {
    this.logger.warn(`Quarantining raw event ${rawEventId}: ${reason}`);

    const quarantined = await this.prisma.quarantinedEvent.create({
      data: {
        tenant_id: tenantId,
        instanceId: connectorId,
        rawPayload,
        reason,
      },
    });

    await this.prisma.rawEvent.update({
      where: { id: rawEventId },
      data: { processing_status: 'QUARANTINED' },
    });

    return quarantined;
  }

  /**
   * Get normalized events for tenant
   */
  async getNormalizedEvents(tenantId: string, limit = 50) {
    return this.prisma.normalizedEvent.findMany({
      where: { tenant_id: tenantId },
      take: limit,
      orderBy: { recorded_at: 'desc' },
    });
  }

  /**
   * Get normalized event by ID
   */
  async getNormalizedEventById(eventId: string) {
    const event = await this.prisma.normalizedEvent.findUnique({
      where: { id: eventId },
      include: { rawEvent: true },
    });

    if (!event) {
      throw new NotFoundException(`Normalized event '${eventId}' not found`);
    }

    return event;
  }

  /**
   * Get quarantined events for tenant
   */
  async getQuarantinedEvents(tenantId: string) {
    return this.prisma.quarantinedEvent.findMany({
      where: { tenant_id: tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Reprocess a quarantined event
   */
  async reprocessQuarantinedEvent(quarantineId: string): Promise<ReprocessResult> {
    const quarantined = await this.prisma.quarantinedEvent.findUnique({
      where: { id: quarantineId },
    });

    if (!quarantined) {
      throw new NotFoundException(`Quarantined event '${quarantineId}' not found`);
    }

    // Find associated raw event
    const rawEvent = await this.prisma.rawEvent.findFirst({
      where: {
        tenant_id: quarantined.tenant_id,
        connector_id: quarantined.instanceId,
        raw_payload_reference: quarantined.rawPayload,
      },
    });

    if (!rawEvent) {
      throw new NotFoundException(`Associated raw event for quarantine '${quarantineId}' not found`);
    }

    // Attempt normalization
    const result = await this.normalizeRawEvent(rawEvent.id);

    if ('reason' in result) {
      return {
        quarantineId,
        rawEventId: rawEvent.id,
        status: 'QUARANTINED',
        reason: (result as any).reason,
      };
    }

    // Delete quarantine record on successful reprocess
    await this.prisma.quarantinedEvent.delete({
      where: { id: quarantineId },
    });

    return {
      quarantineId,
      rawEventId: rawEvent.id,
      status: 'REPROCESSED',
      normalizedEventId: (result as any).id,
    };
  }

  /**
   * Idempotent event replay across tenant or connector
   */
  async replayEvents(tenantId: string, connectorId?: string): Promise<ReplayResult> {
    this.logger.log(`Starting event replay for tenant ${tenantId}, connector ${connectorId || 'ALL'}`);

    const rawEvents = await this.prisma.rawEvent.findMany({
      where: {
        tenant_id: tenantId,
        ...(connectorId ? { connector_id: connectorId } : {}),
      },
    });

    let normalizedCount = 0;
    let quarantinedCount = 0;

    for (const raw of rawEvents) {
      const res = await this.normalizeRawEvent(raw.id);
      if ('reason' in res) {
        quarantinedCount++;
      } else {
        normalizedCount++;
      }
    }

    return {
      totalProcessed: rawEvents.length,
      normalizedCount,
      quarantinedCount,
    };
  }
}
