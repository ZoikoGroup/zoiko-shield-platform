import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as crypto from 'crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: string;
  traceparent: string;
}

/**
 * W3C Trace Context Distributed Tracing Interceptor
 * Specification: Backend Build Guide §LAB 16 (Observability & Distributed Tracing)
 * Standard: W3C Trace Context (traceparent: 00-{traceId}-{spanId}-{flags})
 */
@Injectable()
export class TelemetryTracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TelemetryTracingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const incomingTraceparent = req?.headers?.['traceparent'] as string | undefined;
    const traceContext = this.parseOrCreateTraceContext(incomingTraceparent);

    // Attach to request context for downstream service calls
    if (req) {
      req.traceContext = traceContext;
    }

    // Set response traceparent header
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('traceparent', traceContext.traceparent);
    }

    const startHrTime = process.hrtime();

    return next.handle().pipe(
      tap({
        next: () => {
          const [seconds, nanoseconds] = process.hrtime(startHrTime);
          const durationMs = seconds * 1000 + nanoseconds / 1000000;
          this.logger.debug(
            `[Trace: ${traceContext.traceId}] [Span: ${traceContext.spanId}] ${req?.method || 'INTERNAL'} ${req?.url || ''} - ${durationMs.toFixed(2)}ms`,
          );
        },
        error: (err) => {
          this.logger.warn(
            `[Trace: ${traceContext.traceId}] [Span: ${traceContext.spanId}] Error: ${err?.message}`,
          );
        },
      }),
    );
  }

  /**
   * Parses incoming W3C traceparent header or generates a new trace context.
   */
  parseOrCreateTraceContext(header?: string): TraceContext {
    if (header && /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(header)) {
      const parts = header.split('-');
      const traceId = parts[1];
      const parentSpanId = parts[2];
      const traceFlags = parts[3];
      const newSpanId = crypto.randomBytes(8).toString('hex');
      const traceparent = `00-${traceId}-${newSpanId}-${traceFlags}`;

      return {
        traceId,
        spanId: newSpanId,
        parentSpanId,
        traceFlags,
        traceparent,
      };
    }

    const traceId = crypto.randomBytes(16).toString('hex');
    const spanId = crypto.randomBytes(8).toString('hex');
    const traceFlags = '01'; // sampled
    const traceparent = `00-${traceId}-${spanId}-${traceFlags}`;

    return {
      traceId,
      spanId,
      traceFlags,
      traceparent,
    };
  }
}
