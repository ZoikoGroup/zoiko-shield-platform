import { Injectable } from '@nestjs/common';

export interface OutboxEventData {
  tenant_id: string;
  topic: string;
  event_type: string;
  payload: string;
  correlation_id?: string;
}

/** Same outbox pattern as the other two apps (spec correction #4). */
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
