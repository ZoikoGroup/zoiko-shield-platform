// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// A short timeout so the tests run fast; the route reads it at import time.
async function loadRoute(timeoutMs: string) {
  vi.stubEnv('BACKEND_PROXY_TIMEOUT_MS', timeoutMs);
  vi.resetModules();
  return import('@/app/api/v1/[...slug]/route');
}

const get = (handler: (req: NextRequest, ctx: any) => Promise<Response>, slug: string) =>
  handler(new NextRequest(`http://localhost:3000/api/v1/${slug}`), {
    params: Promise.resolve({ slug: slug.split('/') }),
  });

/** Behaves like real fetch: aborting the signal errors the body mid-stream. */
function backendWithSlowBody(chunks: string[], gapMs: number) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        init?.signal?.addEventListener('abort', () =>
          controller.error(new DOMException('aborted', 'AbortError')),
        );
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          await new Promise((resolve) => setTimeout(resolve, gapMs));
        }
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

describe('API proxy streaming', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('delivers the whole body even when it keeps streaming past the timeout', async () => {
    const { GET } = await loadRoute('50');
    backendWithSlowBody(['{"data":[1,', '2,', '3]}'], 40);

    const res = await get(GET, 'exports/big');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [1, 2, 3] });
    expect(res.headers.get('x-zoiko-fallback')).toBeNull();
  });

  it('still falls back when the backend does not answer within the timeout', async () => {
    const { GET } = await loadRoute('50');
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    );

    const res = await get(GET, 'alerts');

    expect(res.headers.get('x-zoiko-fallback')).toBe('true');
  });
});
