import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable, filter, map, interval, merge } from 'rxjs';

export type StreamingEventType =
  | 'TELEMETRY_INGESTION_PULSE'
  | 'ALERT_DISPATCHED'
  | 'DECISION_ENVELOPE_GENERATED'
  | 'JIT_ELEVATION_STATE_CHANGE'
  | 'MERKLE_ROOT_COMMITTED'
  | 'EMERGENCY_FREEZE_TOGGLED'
  | 'HEARTBEAT';

export interface LiveStreamEvent<T = any> {
  eventId: string;
  eventType: StreamingEventType;
  tenantId?: string; // If undefined, applies globally (e.g. system heartbeat, emergency freeze)
  timestamp: string;
  payload: T;
}

export interface SseMessageFormat {
  data: {
    id: string;
    type: StreamingEventType;
    tenantId?: string;
    timestamp: string;
    payload: any;
  };
}

/**
 * Live Real-Time Telemetry & Incident Push Streaming Service
 * Specification: ZS-T0-BE-ARCH-001 §14 (Reactive Event Bus & Real-Time Push Engine)
 */
@Injectable()
export class LiveTelemetryStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(LiveTelemetryStreamService.name);
  private readonly eventBus$ = new Subject<LiveStreamEvent>();

  constructor() {
    this.logger.log('✔ LiveTelemetryStreamService initialized (Reactive SSE Bus Ready)');
  }

  onModuleDestroy() {
    this.eventBus$.complete();
  }

  /**
   * Publishes an event to the reactive event bus.
   */
  publishEvent<T>(event: Omit<LiveStreamEvent<T>, 'eventId' | 'timestamp'> & { eventId?: string; timestamp?: string }): LiveStreamEvent<T> {
    const fullEvent: LiveStreamEvent<T> = {
      eventId: event.eventId || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      eventType: event.eventType,
      tenantId: event.tenantId,
      timestamp: event.timestamp || new Date().toISOString(),
      payload: event.payload,
    };

    this.eventBus$.next(fullEvent);
    return fullEvent;
  }

  /**
   * Subscribes a client to a tenant-isolated SSE stream with automatic heartbeat pings.
   *
   * @param tenantId The tenant identifier requesting the stream.
   * @param isSuperAdmin If true, receives global multi-tenant stream events.
   */
  subscribeTenantStream(tenantId: string, isSuperAdmin = false): Observable<SseMessageFormat> {
    // Filtered real-time events
    const tenantEvents$ = this.eventBus$.asObservable().pipe(
      filter((event) => {
        if (isSuperAdmin) return true;
        // Deliver if event is global (no tenantId) or matches the requested tenantId
        return !event.tenantId || event.tenantId === tenantId;
      }),
      map((event) => ({
        data: {
          id: event.eventId,
          type: event.eventType,
          tenantId: event.tenantId,
          timestamp: event.timestamp,
          payload: event.payload,
        },
      })),
    );

    // Periodic 15-second heartbeat to keep HTTP connections alive through proxies
    const heartbeat$ = interval(15000).pipe(
      map(() => ({
        data: {
          id: `hb-${Date.now()}`,
          type: 'HEARTBEAT' as StreamingEventType,
          tenantId,
          timestamp: new Date().toISOString(),
          payload: { status: 'CONNECTED', uptime: process.uptime() },
        },
      })),
    );

    return merge(tenantEvents$, heartbeat$);
  }

  /**
   * Synthesizes and publishes a simulated alert for demonstration and testing.
   */
  simulateAlertStream(tenantId: string, alertData: { alertId: string; title: string; severity: string }): LiveStreamEvent {
    return this.publishEvent({
      eventType: 'ALERT_DISPATCHED',
      tenantId,
      payload: {
        ...alertData,
        source: 'STREAM_DETECTION_ENGINE',
        triaged: false,
      },
    });
  }

  /**
   * Synthesizes and publishes a JIT elevation state change.
   */
  simulateJitStream(tenantId: string, jitData: { requestId: string; requester: string; status: string; durationMinutes: number }): LiveStreamEvent {
    return this.publishEvent({
      eventType: 'JIT_ELEVATION_STATE_CHANGE',
      tenantId,
      payload: jitData,
    });
  }

  /**
   * Synthesizes and publishes a Merkle Root block commit event.
   */
  simulateMerkleCommitStream(tenantId: string, blockData: { epochBlockNumber: number; merkleRootHex: string; leafCount: number }): LiveStreamEvent {
    return this.publishEvent({
      eventType: 'MERKLE_ROOT_COMMITTED',
      tenantId,
      payload: blockData,
    });
  }
}
