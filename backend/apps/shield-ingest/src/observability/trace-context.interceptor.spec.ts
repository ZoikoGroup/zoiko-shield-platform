import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import {
  TraceContextInterceptor,
  W3C_TRACEPARENT_HEADER,
} from './trace-context.interceptor';

describe('ShieldIngest TraceContextInterceptor', () => {
  let interceptor: TraceContextInterceptor;

  beforeEach(() => {
    interceptor = new TraceContextInterceptor();
  });

  it('generates valid W3C traceparent on inbound ingestion request', (done) => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const context: Partial<ExecutionContext> = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res } as any),
    };
    const next: CallHandler = { handle: () => of({ success: true }) };

    interceptor.intercept(context as ExecutionContext, next).subscribe({
      next: (val) => {
        expect(val).toEqual({ success: true });
        expect(req.traceContext.traceId).toHaveLength(32);
        expect(res.setHeader).toHaveBeenCalledWith(
          W3C_TRACEPARENT_HEADER,
          expect.stringMatching(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/),
        );
        done();
      },
    });
  });
});
