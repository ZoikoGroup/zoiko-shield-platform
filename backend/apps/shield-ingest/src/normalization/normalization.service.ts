import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../kafka/kafka.producer.service';
import { requireRegion } from '../security/tenant-context';

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
    const eventActivity =
      payload.eventActivity || payload.eventType || 'LOG_ENTRY';
    const severity = (payload.severity || 'INFORMATIONAL').toUpperCase();

    const actorUserId =
      payload.actorUserId || payload.user?.id || payload.userId || undefined;
    const actorEmail =
      payload.actorEmail ||
      payload.user?.email ||
      payload.userEmail ||
      undefined;
    const sourceIp =
      payload.sourceIp || payload.clientIp || payload.ipAddress || undefined;
    const destinationIp =
      payload.destinationIp || payload.targetIp || undefined;
    const resourceId = payload.resourceId || payload.targetId || undefined;
    const resourceType =
      payload.resourceType || payload.targetType || undefined;
    const action = payload.action || payload.eventType || 'EXECUTE';
    const outcome = (
      payload.outcome ||
      payload.result ||
      'SUCCESS'
    ).toUpperCase();

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

    const connectorHealth = await this.prisma.connectorHealthStatus.findFirst({
      where: {
        tenant_id: normalizedEvent.tenant_id,
        instanceId: normalizedEvent.connector_id,
      },
      select: { state: true },
    });

    await this.kafkaProducer.publishEvent(
      CANONICAL_TOPICS.EVENT_NORMALIZED,
      'event.normalized',
      {
        tenantId: normalizedEvent.tenant_id,
        environmentId: normalizedEvent.environment_id,
        region: requireRegion(rawEvent.source_region),
        normalizedEventId: normalizedEvent.id,
        connectorId: normalizedEvent.connector_id,
        sourceSystem: rawEvent.source_type,
        eventClass: normalizedEvent.event_class,
        eventCategory: normalizedEvent.event_category ?? undefined,
        eventActivity: normalizedEvent.event_activity ?? undefined,
        actorUserId: normalizedEvent.actor_user_id ?? undefined,
        actorEmail: normalizedEvent.actor_email ?? undefined,
        sourceIp: normalizedEvent.source_ip ?? undefined,
        destinationIp: normalizedEvent.destination_ip ?? undefined,
        resourceId: normalizedEvent.resource_id ?? undefined,
        resourceType: normalizedEvent.resource_type ?? undefined,
        action: normalizedEvent.action ?? undefined,
        outcome: normalizedEvent.outcome ?? undefined,
        occurredAt: (
          normalizedEvent.occurred_at ?? normalizedEvent.recorded_at
        ).toISOString(),
        schemaVersion: rawEvent.schema_version,
        normalizerVersion: normalizedEvent.mapping_version,
        correlationId: normalizedEvent.id,
        traceId: normalizedEvent.id,
        sourceHealthState: connectorHealth?.state ?? 'UNKNOWN',
      },
      {
        correlationId: normalizedEvent.id,
        traceId: normalizedEvent.id,
        occurredAt: normalizedEvent.occurred_at ?? normalizedEvent.recorded_at,
      },
    );

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
  async getNormalizedEventById(tenantId: string, eventId: string) {
    const event = await this.prisma.normalizedEvent.findFirst({
      where: { id: eventId, tenant_id: tenantId },
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
  async reprocessQuarantinedEvent(
    tenantId: string,
    quarantineId: string,
  ): Promise<ReprocessResult> {
    const quarantined = await this.prisma.quarantinedEvent.findFirst({
      where: { id: quarantineId, tenant_id: tenantId },
    });

    if (!quarantined) {
      throw new NotFoundException(
        `Quarantined event '${quarantineId}' not found`,
      );
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
      throw new NotFoundException(
        `Associated raw event for quarantine '${quarantineId}' not found`,
      );
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
  async replayEvents(
    tenantId: string,
    connectorId?: string,
  ): Promise<ReplayResult> {
    this.logger.log(
      `Starting event replay for tenant ${tenantId}, connector ${connectorId || 'ALL'}`,
    );

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
