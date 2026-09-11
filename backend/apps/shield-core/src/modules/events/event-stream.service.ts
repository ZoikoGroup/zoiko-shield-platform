import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable, interval, merge, from } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface ShieldRealtimeEvent {
  id: string;
  type:
    | 'ALERT_CREATED'
    | 'CASE_UPDATED'
    | 'MERKLE_EPOCH_SEALED'
    | 'ACTION_EXECUTED'
    | 'CORRELATION_MATCH'
    | 'ROLLBACK_PROGRESS'
    | 'AI_INCIDENT_DRIFT'
    | 'HEARTBEAT';
  tenantId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface SseMessage {
  id?: string;
  type: string;
  data: ShieldRealtimeEvent | { ping: string; timestamp: string };
  retry?: number;
}

@Injectable()
export class EventStreamService {
  private readonly logger = new Logger(EventStreamService.name);
  private readonly eventBus$ = new Subject<ShieldRealtimeEvent>();
  private readonly replayBuffer: ShieldRealtimeEvent[] = [];
  private readonly maxBufferSize = 200;

  /**
   * Publishes an event to all active real-time subscribers and stores in replay buffer.
   */
  publishEvent(event: ShieldRealtimeEvent): void {
    this.logger.debug(
      `[Realtime SSE Broadcast] Type: ${event.type} | Tenant: ${event.tenantId} | ID: ${event.id}`,
    );

    // Buffer event for reconnection replay
    this.replayBuffer.push(event);
    if (this.replayBuffer.length > this.maxBufferSize) {
      this.replayBuffer.shift();
    }

    this.eventBus$.next(event);
  }

  /**
   * Returns a tenant-filtered observable stream for Server-Sent Events (SSE).
   * Supports Last-Event-ID replay buffer and keep-alive heartbeats.
   */
  getEventStreamForTenant(
    tenantId: string,
    lastEventId?: string,
  ): Observable<SseMessage> {
    // 1. Live tenant-filtered events
    const liveStream$ = this.eventBus$.pipe(
      filter(
        (event) => event.tenantId === tenantId || event.tenantId === 'GLOBAL',
      ),
      map((event) => ({
        id: event.id,
        type: event.type,
        data: event,
        retry: 5000,
      })),
    );

    // 2. Replay missed events if lastEventId is supplied
    let replayEvents: SseMessage[] = [];
    if (lastEventId) {
      const lastIndex = this.replayBuffer.findIndex((e) => e.id === lastEventId);
      if (lastIndex !== -1 && lastIndex < this.replayBuffer.length - 1) {
        replayEvents = this.replayBuffer
          .slice(lastIndex + 1)
          .filter(
            (event) => event.tenantId === tenantId || event.tenantId === 'GLOBAL',
          )
          .map((event) => ({
            id: event.id,
            type: event.type,
            data: event,
            retry: 5000,
          }));
      }
    }

    // 3. Heartbeat stream to maintain connection through ALBs / proxies (every 15s)
    const heartbeat$ = interval(15000).pipe(
      map(() => ({
        type: 'HEARTBEAT',
        data: { ping: 'keep-alive', timestamp: new Date().toISOString() },
        retry: 5000,
      })),
    );

    return merge(from(replayEvents), liveStream$, heartbeat$);
  }

  /**
   * Clears replay buffer (useful for test isolation).
   */
  clearBuffer(): void {
    this.replayBuffer.length = 0;
  }
}
