import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import {
  TraceContextInterceptor,
  W3C_TRACEPARENT_HEADER,
} from './trace-context.interceptor';

describe('TraceContextInterceptor', () => {
  let interceptor: TraceContextInterceptor;

  beforeEach(() => {
    interceptor = new TraceContextInterceptor();
  });

  it('generates valid 32-char traceId and 16-char spanId when no traceparent header is present', (done) => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const context: Partial<ExecutionContext> = {
      switchToHttp: () =>
        ({ getRequest: () => req, getResponse: () => res }) as any,
    };
    const next: CallHandler = { handle: () => of('test-result') };

    interceptor.intercept(context as ExecutionContext, next).subscribe({
      next: (val) => {
        expect(val).toBe('test-result');
        expect(req.traceContext).toBeDefined();
        expect(req.traceContext.traceId).toHaveLength(32);
        expect(req.traceContext.spanId).toHaveLength(16);
        expect(res.setHeader).toHaveBeenCalledWith(
          W3C_TRACEPARENT_HEADER,
          expect.stringMatching(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/),
        );
        done();
      },
    });
  });

  it('preserves inbound traceId and creates child spanId when valid traceparent is provided', (done) => {
    const inboundTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const inboundSpanId = '00f067aa0ba902b7';
    const inboundHeader = `00-${inboundTraceId}-${inboundSpanId}-01`;

    const req: any = { headers: { [W3C_TRACEPARENT_HEADER]: inboundHeader } };
    const res: any = { setHeader: jest.fn() };
    const context: Partial<ExecutionContext> = {
      switchToHttp: () =>
        ({ getRequest: () => req, getResponse: () => res }) as any,
    };
    const next: CallHandler = { handle: () => of('propagated') };

    interceptor.intercept(context as ExecutionContext, next).subscribe({
      next: (val) => {
        expect(val).toBe('propagated');
        expect(req.traceContext.traceId).toBe(inboundTraceId);
        expect(req.traceContext.parentSpanId).toBe(inboundSpanId);
        expect(req.traceContext.spanId).not.toBe(inboundSpanId); // Child span
        expect(res.setHeader).toHaveBeenCalledWith(
          W3C_TRACEPARENT_HEADER,
          expect.stringContaining(`00-${inboundTraceId}-`),
        );
        done();
      },
    });
  });
});
