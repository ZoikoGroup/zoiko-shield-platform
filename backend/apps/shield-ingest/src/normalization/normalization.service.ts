import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService, CANONICAL_TOPICS } from '../kafka/kafka.producer.service';
import { OutboxService } from '../outbox/outbox.service';
import { EntraNormalizerService } from '../connectors/providers/microsoft-entra/entra.normalizer';

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
    private readonly outbox: OutboxService,
    @Optional() private readonly entraNormalizer?: EntraNormalizerService,
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

    // Determine normalized event fields — source-aware: connector-specific
    // raw shapes (e.g. Microsoft Graph sign-in logs) don't match the
    // generic heuristic mapper's field names, so each source_type gets its
    // own extraction while still producing one NormalizedEvent shape.
    const fields =
      rawEvent.source_type === 'microsoft-entra' && this.entraNormalizer
        ? this.mapEntraSignInFields(payload, rawEvent.tenant_id)
        : this.mapGenericFields(payload);

    const {
      eventClass,
      eventCategory,
      eventActivity,
      severity,
      actorUserId,
      actorEmail,
      sourceIp,
      destinationIp,
      resourceId,
      resourceType,
      action,
      outcome,
    } = fields;

    const occurredAt = payload.occurredAt
      ? new Date(payload.occurredAt)
      : rawEvent.occurred_at || new Date();

    // Connector health as shield-ingest sees it right now — travels inside
    // the event.normalized.v1 payload so shield-core never has to read
    // ConnectorHealthStatus (a shield-ingest-owned, connectors-domain
    // table) itself.
    const health = await this.prisma.connectorHealthStatus.findUnique({
      where: { instanceId: rawEvent.connector_id },
    });

    const correlationId = randomUUID();
    const traceId = randomUUID();

    // NormalizedEvent creation, the RawEvent status flip, and the
    // event.normalized.v1 outbox row all commit atomically — nothing
    // downstream can observe a NormalizedEvent whose publish was lost to a
    // crash between the DB write and the Kafka send (spec §38).
    const [normalizedEvent] = await this.prisma.$transaction([
      this.prisma.normalizedEvent.create({
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
      }),
      this.prisma.rawEvent.update({
        where: { id: rawEvent.id },
        data: { processing_status: 'NORMALIZED' },
      }),
    ]);

    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId: rawEvent.tenant_id,
        topic: CANONICAL_TOPICS.EVENT_NORMALIZED,
        eventType: 'event.normalized',
        correlationId,
        payload: {
          tenantId: rawEvent.tenant_id,
          environmentId: rawEvent.environment_id,
          region: rawEvent.source_region ?? 'unspecified',
          normalizedEventId: normalizedEvent.id,
          connectorId: rawEvent.connector_id,
          sourceSystem: rawEvent.source_type,
          eventClass: normalizedEvent.event_class,
          eventCategory: normalizedEvent.event_category,
          eventActivity: normalizedEvent.event_activity,
          actorUserId: normalizedEvent.actor_user_id,
          actorEmail: normalizedEvent.actor_email,
          sourceIp: normalizedEvent.source_ip,
          destinationIp: normalizedEvent.destination_ip,
          resourceId: normalizedEvent.resource_id,
          resourceType: normalizedEvent.resource_type,
          action: normalizedEvent.action,
          outcome: normalizedEvent.outcome,
          occurredAt: normalizedEvent.occurred_at?.toISOString(),
          schemaVersion: rawEvent.schema_version,
          normalizerVersion: normalizedEvent.mapping_version,
          correlationId,
          traceId,
          sourceHealthState: health?.state ?? 'UNKNOWN',
        },
      }),
    });

    // Publish TelemetryNormalized event (unrelated ad hoc telemetry topic, left as-is)
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

  private mapGenericFields(payload: Record<string, any>) {
    return {
      eventClass:
        payload.eventClass ||
        payload.eventType ||
        (payload.user ? 'AUTHENTICATION' : 'SECURITY_LOG'),
      eventCategory: payload.eventCategory || 'AUDIT',
      eventActivity: payload.eventActivity || payload.eventType || 'LOG_ENTRY',
      severity: (payload.severity || 'INFORMATIONAL').toUpperCase(),
      actorUserId: payload.actorUserId || payload.user?.id || payload.userId || undefined,
      actorEmail: payload.actorEmail || payload.user?.email || payload.userEmail || undefined,
      sourceIp: payload.sourceIp || payload.clientIp || payload.ipAddress || undefined,
      destinationIp: payload.destinationIp || payload.targetIp || undefined,
      resourceId: payload.resourceId || payload.targetId || undefined,
      resourceType: payload.resourceType || payload.targetType || undefined,
      action: payload.action || payload.eventType || 'EXECUTE',
      outcome: (payload.outcome || payload.result || 'SUCCESS').toUpperCase(),
    };
  }

  /** Delegates field extraction to EntraNormalizerService's canonical mapping instead of the generic heuristics, which don't understand Graph's field names (userPrincipalName, ipAddress, etc.). */
  private mapEntraSignInFields(payload: Record<string, any>, tenantId: string) {
    const canonical = this.entraNormalizer!.normalizeSignInLog(payload, tenantId);
    return {
      eventClass: 'AUTHENTICATION',
      eventCategory: 'IDENTITY',
      eventActivity: canonical.event_type,
      severity: canonical.risk_state === 'HIGH' ? 'HIGH' : 'INFORMATIONAL',
      actorUserId: canonical.user_identity.id,
      actorEmail: canonical.user_identity.email,
      sourceIp: canonical.ip_address,
      destinationIp: undefined,
      resourceId: canonical.application.id,
      resourceType: 'APPLICATION',
      action: 'SIGN_IN',
      outcome: canonical.authentication_result,
    };
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
