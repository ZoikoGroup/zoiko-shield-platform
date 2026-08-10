import { Injectable } from '@nestjs/common';

export interface OutboxEventData {
  tenant_id: string;
  topic: string;
  event_type: string;
  payload: string;
  correlation_id?: string;
}

/**
 * Builds an OutboxEvent row shape to be written inside the SAME Prisma
 * transaction as the domain state it accompanies — domain state and the
 * outbox row commit atomically (spec §38). The separate
 * OutboxPublisherService polls unpublished rows and only then talks to
 * Kafka, so a Kafka outage can never silently drop an event that already
 * committed to Postgres.
 */
@Injectable()
export class OutboxService {
  build(params: { tenantId: string; topic: string; eventType: string; payload: unknown; correlationId?: string }): OutboxEventData {
    return {
      tenant_id: params.tenantId,
      topic: params.topic,
      event_type: params.eventType,
      payload: JSON.stringify(params.payload),
      correlation_id: params.correlationId,
    };
  }
}
