import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

if (typeof window !== 'undefined') {
  class MockEventSource {
    url: string;
    withCredentials = false;
    readyState = 0;
    CONNECTING = 0;
    OPEN = 1;
    CLOSED = 2;
    onopen = null;
    onmessage = null;
    onerror = null;

    constructor(url: string) {
      this.url = url;
    }

    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    dispatchEvent = vi.fn(() => true);
    close = vi.fn();
  }

  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  class MockIntersectionObserver {
    root = null;
    rootMargin = '';
    thresholds = [];
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
  }

  global.EventSource = MockEventSource as any;
  global.ResizeObserver = MockResizeObserver as any;
  global.IntersectionObserver = MockIntersectionObserver as any;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  window.scrollTo = vi.fn() as any;
}
