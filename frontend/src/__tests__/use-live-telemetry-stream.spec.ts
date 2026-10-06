import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveTelemetryStream } from '@/lib/use-live-telemetry-stream';

describe('useLiveTelemetryStream Hook Suite', () => {
  let mockEventSourceInstance: any;

  beforeEach(() => {
    mockEventSourceInstance = {
      onopen: null,
      onmessage: null,
      onerror: null,
      close: vi.fn(),
    };

    global.EventSource = vi.fn(function (url: string) {
      mockEventSourceInstance.url = url;
      return mockEventSourceInstance;
    }) as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes EventSource with tenantId query parameter', () => {
    const { result } = renderHook(() =>
      useLiveTelemetryStream({ tenantId: 'tenant-enterprise-bank' }),
    );

    expect(global.EventSource).toHaveBeenCalledWith(
      '/api/v1/streaming/events?tenantId=tenant-enterprise-bank',
    );
    expect(result.current.isConnected).toBe(false);

    // Simulate connection open
    act(() => {
      if (mockEventSourceInstance.onopen) {
        mockEventSourceInstance.onopen();
      }
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('processes incoming ALERT_DISPATCHED message and triggers callback', () => {
    const onAlert = vi.fn();
    const { result } = renderHook(() =>
      useLiveTelemetryStream({ tenantId: 'tenant-acme', onAlert }),
    );

    const alertEvent = {
      id: 'evt-101',
      type: 'ALERT_DISPATCHED',
      tenantId: 'tenant-acme',
      timestamp: '2026-10-05T12:00:00Z',
      payload: {
        alertId: 'INC-2026-9999',
        title: 'Lateral Movement Detected',
        severity: 'CRITICAL',
      },
    };

    act(() => {
      if (mockEventSourceInstance.onmessage) {
        mockEventSourceInstance.onmessage({
          data: JSON.stringify(alertEvent),
        });
      }
    });

    expect(result.current.activeAlertsCount).toBe(1);
    expect(result.current.recentEvents.length).toBe(1);
    expect(result.current.recentEvents[0].id).toBe('evt-101');
    expect(onAlert).toHaveBeenCalledWith(alertEvent.payload);
  });

  it('updates emergency freeze state when EMERGENCY_FREEZE_TOGGLED message arrives', () => {
    const onFreezeToggle = vi.fn();
    const { result } = renderHook(() =>
      useLiveTelemetryStream({ onFreezeToggle }),
    );

    const freezeEvent = {
      id: 'evt-freeze-01',
      type: 'EMERGENCY_FREEZE_TOGGLED',
      timestamp: '2026-10-05T12:01:00Z',
      payload: { isFrozen: true, actor: 'emergency-admin' },
    };

    act(() => {
      if (mockEventSourceInstance.onmessage) {
        mockEventSourceInstance.onmessage({
          data: JSON.stringify(freezeEvent),
        });
      }
    });

    expect(result.current.isEmergencyFrozen).toBe(true);
    expect(onFreezeToggle).toHaveBeenCalledWith(freezeEvent.payload);
  });

  it('cleans up and closes EventSource upon unmount', () => {
    const { unmount } = renderHook(() => useLiveTelemetryStream());

    unmount();
    expect(mockEventSourceInstance.close).toHaveBeenCalled();
  });
});
