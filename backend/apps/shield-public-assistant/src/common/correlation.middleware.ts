import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Attaches a correlation id to every public request. The id is safe to expose:
 * it is random and carries no tenant, session or message content.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(
    req: Request & { correlationId?: string },
    res: Response,
    next: NextFunction,
  ) {
    const incoming = req.header(CORRELATION_ID_HEADER);
    const correlationId =
      incoming && /^[A-Za-z0-9._:-]{8,120}$/.test(incoming)
        ? incoming
        : randomUUID();
    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
