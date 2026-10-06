'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

export type StreamingEventType =
  | 'TELEMETRY_INGESTION_PULSE'
  | 'ALERT_DISPATCHED'
  | 'DECISION_ENVELOPE_GENERATED'
  | 'JIT_ELEVATION_STATE_CHANGE'
  | 'MERKLE_ROOT_COMMITTED'
  | 'EMERGENCY_FREEZE_TOGGLED'
  | 'HEARTBEAT';

export interface LiveStreamMessage {
  id: string;
  type: StreamingEventType;
  tenantId?: string;
  timestamp: string;
  payload: any;
}

export interface UseLiveTelemetryStreamOptions {
  tenantId?: string;
  enabled?: boolean;
  onAlert?: (alert: any) => void;
  onJitStateChange?: (jit: any) => void;
  onMerkleCommit?: (merkle: any) => void;
  onFreezeToggle?: (freeze: any) => void;
}

/**
 * React Hook for Real-Time Server-Sent Events (SSE) Telemetry & Incident Streaming
 * Specification: ZS-T0-FE-STREAM-001 (Real-Time Reactive Cockpit Integration)
 */
export function useLiveTelemetryStream({
  tenantId = 'tenant-commercial-bank',
  enabled = true,
  onAlert,
  onJitStateChange,
  onMerkleCommit,
  onFreezeToggle,
}: UseLiveTelemetryStreamOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<LiveStreamMessage[]>([]);
  const [activeAlertsCount, setActiveAlertsCount] = useState<number>(0);
  const [isEmergencyFrozen, setIsEmergencyFrozen] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  const handleIncomingMessage = useCallback(
    (message: LiveStreamMessage) => {
      setRecentEvents((prev) => [message, ...prev.slice(0, 49)]);

      switch (message.type) {
        case 'HEARTBEAT':
          setLastHeartbeat(message.timestamp);
          break;

        case 'ALERT_DISPATCHED':
          setActiveAlertsCount((prev) => prev + 1);
          if (onAlert) onAlert(message.payload);
          break;

        case 'JIT_ELEVATION_STATE_CHANGE':
          if (onJitStateChange) onJitStateChange(message.payload);
          break;

        case 'MERKLE_ROOT_COMMITTED':
          if (onMerkleCommit) onMerkleCommit(message.payload);
          break;

        case 'EMERGENCY_FREEZE_TOGGLED':
          setIsEmergencyFrozen(Boolean(message.payload?.isFrozen));
          if (onFreezeToggle) onFreezeToggle(message.payload);
          break;
      }
    },
    [onAlert, onJitStateChange, onMerkleCommit, onFreezeToggle],
  );

  // handleIncomingMessage's identity changes whenever a caller passes an
  // inline onAlert/onJitStateChange/etc. (an ordinary, common React pattern).
  // Routing through a ref lets the connecting effect below always call the
  // latest handler without needing handleIncomingMessage in its own deps -
  // so a parent re-render updates the ref instead of tearing down and
  // reopening the EventSource.
  const handleIncomingMessageRef = useRef(handleIncomingMessage);
  useEffect(() => {
    handleIncomingMessageRef.current = handleIncomingMessage;
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const streamUrl = `/api/v1/streaming/events?tenantId=${encodeURIComponent(tenantId)}`;

    try {
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          handleIncomingMessageRef.current(parsed);
        } catch {
          // Ignore invalid JSON chunks
        }
      };

      es.onerror = () => {
        setIsConnected(false);
      };

      return () => {
        es.close();
        eventSourceRef.current = null;
        setIsConnected(false);
      };
    } catch {
      setIsConnected(false);
    }
    // handleIncomingMessage is intentionally excluded: see
    // handleIncomingMessageRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tenantId]);

  return {
    isConnected,
    lastHeartbeat,
    recentEvents,
    activeAlertsCount,
    isEmergencyFrozen,
  };
}
