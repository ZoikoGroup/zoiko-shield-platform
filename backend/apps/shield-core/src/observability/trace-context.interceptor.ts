import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as crypto from 'crypto';

export const W3C_TRACEPARENT_HEADER = 'traceparent';
export const W3C_TRACESTATE_HEADER = 'tracestate';

export interface TraceContextData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: string;
}

@Injectable()
export class TraceContextInterceptor implements NestInterceptor {
  /**
   * Generates a valid 16-byte hex trace ID if none provided.
   */
  static generateTraceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generates a valid 8-byte hex span ID.
   */
  static generateSpanId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Formats a W3C traceparent string: 00-traceid-spanid-flags
   */
  static formatTraceparent(data: TraceContextData): string {
    return `00-${data.traceId}-${data.spanId}-${data.traceFlags}`;
  }

  /**
   * Parses an inbound W3C traceparent header.
   */
  static parseTraceparent(header?: string): TraceContextData | null {
    if (!header) return null;
    const parts = header.trim().split('-');
    if (parts.length < 4 || parts[0] !== '00') return null;

    const traceId = parts[1];
    const parentSpanId = parts[2];
    const traceFlags = parts[3];

    if (traceId.length !== 32 || parentSpanId.length !== 16) return null;

    return {
      traceId,
      spanId: TraceContextInterceptor.generateSpanId(),
      parentSpanId,
      traceFlags,
    };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const rawHeader = req?.headers?.[W3C_TRACEPARENT_HEADER] as
      | string
      | undefined;
    let traceData = TraceContextInterceptor.parseTraceparent(rawHeader);

    if (!traceData) {
      traceData = {
        traceId: TraceContextInterceptor.generateTraceId(),
        spanId: TraceContextInterceptor.generateSpanId(),
        traceFlags: '01',
      };
    }

    const formatted = TraceContextInterceptor.formatTraceparent(traceData);
    if (req) {
      req.traceContext = traceData;
    }
    if (res?.setHeader) {
      res.setHeader(W3C_TRACEPARENT_HEADER, formatted);
    }

    return next.handle().pipe(
      tap(() => {
        // Trace telemetry hook on completion
      }),
    );
  }
}
