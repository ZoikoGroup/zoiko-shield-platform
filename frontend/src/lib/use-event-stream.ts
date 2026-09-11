"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type StreamEventType =
  | "ALERT_CREATED"
  | "CASE_UPDATED"
  | "MERKLE_EPOCH_SEALED"
  | "ACTION_EXECUTED"
  | "CORRELATION_MATCH"
  | "ROLLBACK_PROGRESS"
  | "AI_INCIDENT_DRIFT"
  | "CONNECTOR_HEALTH_CHANGED"
  | "CONNECTOR_DRIFT_DETECTED"
  | "JIT_ELEVATION_GRANTED"
  | "JIT_ELEVATION_REVOKED"
  | "JIT_ELEVATION_EXPIRED"
  | "TELEMETRY_INGESTED"
  | "HEARTBEAT"
  | (string & {});

export interface StreamEventPayload {
  id: string;
  type: StreamEventType;
  tenantId: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface UseEventStreamOptions {
  tenantId?: string;
  onEvent?: (event: StreamEventPayload) => void;
  enabled?: boolean;
}

export interface UseEventStreamResult {
  isConnected: boolean;
  isDegraded: boolean;
  lastEvent: StreamEventPayload | null;
  eventHistory: StreamEventPayload[];
  lastEventId: string | null;
  reconnectCount: number;
  reconnect: () => void;
}

export function useEventStream({
  tenantId = "tenant-bank-01",
  onEvent,
  enabled = true,
}: UseEventStreamOptions = {}): UseEventStreamResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isDegraded, setIsDegraded] = useState(false);
  const [lastEvent, setLastEvent] = useState<StreamEventPayload | null>(null);
  const [eventHistory, setEventHistory] = useState<StreamEventPayload[]>([]);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (typeof window === "undefined" || !enabled) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const streamUrl = `/api/v1/events/stream?tenantId=${encodeURIComponent(tenantId)}${
      lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : ""
    }`;

    try {
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        setIsDegraded(false);
      };

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as StreamEventPayload;
          if (parsed.type === "HEARTBEAT") {
            return;
          }

          setLastEvent(parsed);
          setLastEventId(parsed.id || e.lastEventId || null);
          setEventHistory((prev) => [parsed, ...prev].slice(0, 50));

          if (onEventRef.current) {
            onEventRef.current(parsed);
          }
        } catch {
          // Non-JSON SSE message / keep-alive
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        setIsDegraded(true);
        es.close();
        eventSourceRef.current = null;

        // Schedule auto-reconnect with exponential backoff (max 15s)
        const delay = Math.min(2000 * Math.pow(1.5, reconnectCount), 15000);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectCount((c) => c + 1);
          connect();
        }, delay);
      };
    } catch {
      setIsConnected(false);
      setIsDegraded(true);
    }
  }, [enabled, tenantId, lastEventId, reconnectCount]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const reconnect = useCallback(() => {
    setReconnectCount(0);
    connect();
  }, [connect]);

  return {
    isConnected,
    isDegraded,
    lastEvent,
    eventHistory,
    lastEventId,
    reconnectCount,
    reconnect,
  };
}
