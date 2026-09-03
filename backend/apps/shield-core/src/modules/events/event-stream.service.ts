import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface ShieldRealtimeEvent {
  id: string;
  type: 'ALERT_CREATED' | 'CASE_UPDATED' | 'MERKLE_EPOCH_SEALED' | 'ACTION_EXECUTED' | 'CORRELATION_MATCH';
  tenantId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

@Injectable()
export class EventStreamService {
  private readonly logger = new Logger(EventStreamService.name);
  private readonly eventBus$ = new Subject<ShieldRealtimeEvent>();

  /**
   * Publishes an event to all active real-time subscribers.
   */
  publishEvent(event: ShieldRealtimeEvent): void {
    this.logger.debug(`[Realtime SSE Broadcast] Type: ${event.type} | Tenant: ${event.tenantId}`);
    this.eventBus$.next(event);
  }

  /**
   * Returns a tenant-filtered observable stream for Server-Sent Events (SSE).
   */
  getEventStreamForTenant(tenantId: string): Observable<MessageEvent> {
    return this.eventBus$.pipe(
      filter((event) => event.tenantId === tenantId || event.tenantId === 'GLOBAL'),
      map((event) => {
        return {
          type: event.type,
          data: event,
        } as unknown as MessageEvent;
      }),
    );
  }
}
