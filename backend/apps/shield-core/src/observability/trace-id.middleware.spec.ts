import { Test } from '@nestjs/testing';
import { TraceIdMiddleware } from './trace-id.middleware';

function makeMockReqRes() {
  const req: any = { headers: {} };
  const res: any = {
    headers: {},
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('TraceIdMiddleware', () => {
  let middleware: TraceIdMiddleware;

  beforeEach(() => {
    middleware = new TraceIdMiddleware();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should generate a traceId when none is provided', () => {
    const { req, res, next } = makeMockReqRes();
    middleware.use(req, res, next);

    expect(req.traceId).toBeDefined();
    expect(req.traceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-trace-id']).toBe(req.traceId);
    expect(next).toHaveBeenCalled();
  });

  it('should reuse an existing x-trace-id from upstream', () => {
    const { req, res, next } = makeMockReqRes();
    req.headers['x-trace-id'] = 'upstream-trace-123';
    middleware.use(req, res, next);

    expect(req.traceId).toBe('upstream-trace-123');
    expect(res.headers['x-trace-id']).toBe('upstream-trace-123');
  });

  it('should always generate a fresh requestId', () => {
    const { req: r1, res: s1, next: n1 } = makeMockReqRes();
    const { req: r2, res: s2, next: n2 } = makeMockReqRes();
    middleware.use(r1, s1, n1);
    middleware.use(r2, s2, n2);

    expect(r1.requestId).toBeDefined();
    expect(r2.requestId).toBeDefined();
    expect(r1.requestId).not.toBe(r2.requestId);
  });
});
