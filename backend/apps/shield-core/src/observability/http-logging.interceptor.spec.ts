import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpLoggingInterceptor } from './http-logging.interceptor';

function makeContext(overrides: Record<string, any> = {}): ExecutionContext {
  const req = {
    traceId: 'trace-abc',
    requestId: 'req-xyz',
    headers: { 'x-tenant-id': 'tenant-1' },
    method: 'GET',
    path: '/api/v1/test',
    ...overrides.req,
  };
  const res = { statusCode: 200, ...overrides.res };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('HttpLoggingInterceptor', () => {
  let interceptor: HttpLoggingInterceptor;

  beforeEach(() => {
    interceptor = new HttpLoggingInterceptor('test-service');
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should pass through the response on success', (done) => {
    const ctx = makeContext();
    const next: CallHandler = { handle: () => of({ ok: true }) };

    interceptor.intercept(ctx, next).subscribe({
      next: (value) => {
        expect(value).toEqual({ ok: true });
        done();
      },
    });
  });

  it('should propagate errors without swallowing them', (done) => {
    const ctx = makeContext();
    const error = Object.assign(new Error('DB failure'), { status: 500 });
    const next: CallHandler = { handle: () => throwError(() => error) };

    interceptor.intercept(ctx, next).subscribe({
      error: (err) => {
        expect(err.message).toBe('DB failure');
        done();
      },
    });
  });

  it('should skip non-http contexts', (done) => {
    const ctx = { getType: () => 'rpc' } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('rpc-response') };

    interceptor.intercept(ctx, next).subscribe({
      next: (v) => {
        expect(v).toBe('rpc-response');
        done();
      },
    });
  });
});
