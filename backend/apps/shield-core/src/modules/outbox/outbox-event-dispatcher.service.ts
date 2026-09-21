import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  DistributedOutboxRelayService,
  OutboxRecord,
} from './distributed-outbox-relay.service';

export interface DomainEventEnvelope<T = Record<string, any>> {
  eventId: string;
  eventType:
    | 'ALERT_CREATED'
    | 'CASE_PROMOTED'
    | 'AI_GROUNDING_REVIEWED'
    | 'SOAR_ACTION_SIMULATED'
    | 'CONTROL_EVALUATED'
    | 'EVIDENCE_ANCHORED'
    | 'LEGAL_ACCESS_AUDITED';
  tenantId: string;
  environmentId: string;
  correlationId: string;
  causationId?: string;
  actorId?: string;
  payload: T;
  occurredAt: string;
  schemaVersion: string;
}

export interface DispatchEventOptions {
  maxAttempts?: number;
  idempotencyKey?: string;
}

/**
 * Outbox Event Dispatcher Service
 * Implements typed domain event publishing via the transactional outbox pattern.
 * Ensures strict canonical context validation, partition key selection, and
 * idempotent event serialization across all ZoikoShield platform microservices.
 */
@Injectable()
export class OutboxEventDispatcherService {
  private readonly logger = new Logger(OutboxEventDispatcherService.name);
  private readonly dispatchedRecords = new Map<string, OutboxRecord>();

  constructor(private readonly outboxRelay: DistributedOutboxRelayService) {}

  /**
   * Validates canonical envelope and enqueues domain event into the outbox.
   */
  dispatch<T extends Record<string, any>>(
    event: Omit<
      DomainEventEnvelope<T>,
      'eventId' | 'occurredAt' | 'schemaVersion'
    >,
    options?: DispatchEventOptions,
  ): OutboxRecord {
    if (
      !event.tenantId ||
      !event.environmentId ||
      !event.correlationId ||
      !event.eventType
    ) {
      throw new BadRequestException(
        'Missing mandatory canonical event attributes (tenantId, environmentId, correlationId, eventType).',
      );
    }

    const idempotencyKey =
      options?.idempotencyKey ||
      `${event.tenantId}:${event.eventType}:${event.correlationId}:${crypto
        .createHash('sha256')
        .update(JSON.stringify(event.payload))
        .digest('hex')
        .slice(0, 16)}`;

    if (this.dispatchedRecords.has(idempotencyKey)) {
      this.logger.warn(
        `[IDEMPOTENCY DUPLICATE DETECTED] Suppressing duplicate event dispatch for key: ${idempotencyKey}`,
      );
      return this.dispatchedRecords.get(idempotencyKey)!;
    }

    const fullEnvelope: DomainEventEnvelope<T> = {
      ...event,
      eventId: `evt-${crypto.randomUUID()}`,
      occurredAt: new Date().toISOString(),
      schemaVersion: '1.1.0',
    };

    const topic = this.resolveTopic(event.eventType);
    const partitionKey = `${event.tenantId}:${event.environmentId}`;

    const record = this.outboxRelay.enqueueEvent(
      topic,
      partitionKey,
      {
        ...fullEnvelope,
        idempotencyKey,
      },
      options?.maxAttempts || 3,
    );

    this.dispatchedRecords.set(idempotencyKey, record);
    this.logger.log(
      `✔ [OUTBOX ENQUEUED] ${event.eventType} (EventId: ${fullEnvelope.eventId}, Topic: ${topic}, PartitionKey: ${partitionKey})`,
    );

    return record;
  }

  /**
   * Maps domain event type to durable event bus topic.
   */
  private resolveTopic(eventType: DomainEventEnvelope['eventType']): string {
    switch (eventType) {
      case 'ALERT_CREATED':
      case 'CASE_PROMOTED':
        return 'shield.core.threats.v1';
      case 'AI_GROUNDING_REVIEWED':
        return 'shield.ai.governance.v1';
      case 'SOAR_ACTION_SIMULATED':
        return 'shield.action.remediation.v1';
      case 'CONTROL_EVALUATED':
        return 'shield.core.assurance.v1';
      case 'EVIDENCE_ANCHORED':
        return 'shield.anchor.ledger.v1';
      case 'LEGAL_ACCESS_AUDITED':
        return 'shield.core.legal-access.v1';
      default:
        return 'shield.platform.events.v1';
    }
  }

  /**
   * Flushes and processes the current outbox batch through the relay.
   */
  async flush(batchSize = 50) {
    return this.outboxRelay.processBatch(batchSize);
  }
}
