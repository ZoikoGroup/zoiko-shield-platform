import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVisibleInterval } from '@/lib/use-visible-interval';

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useVisibleInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires immediately and then on every interval while visible', () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 30000));

    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('stops polling while hidden and refreshes once on return', () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 30000));

    setVisibility('hidden');
    vi.advanceTimersByTime(120000);
    expect(callback).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('stops polling on unmount', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useVisibleInterval(callback, 30000));

    unmount();
    vi.advanceTimersByTime(120000);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
