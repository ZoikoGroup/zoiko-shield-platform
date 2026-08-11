import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const TRACE_ID_HEADER = 'x-trace-id';
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * TraceIdMiddleware
 * -----------------
 * Attaches a trace ID and request ID to every inbound HTTP request.
 * - Accepts `x-trace-id` from an upstream gateway; generates one if absent.
 * - Generates a unique `x-request-id` per request hop (never trusted from client).
 * - Exposes both IDs on the response headers so callers can correlate logs.
 * - Stores both IDs on `req` so interceptors and services can read them.
 */
@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const traceId = (req.headers[TRACE_ID_HEADER] as string | undefined) ?? randomUUID();
    const requestId = randomUUID();

    (req as any).traceId = traceId;
    (req as any).requestId = requestId;

    res.setHeader(TRACE_ID_HEADER, traceId);
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}
