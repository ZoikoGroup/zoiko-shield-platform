import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * HttpLoggingInterceptor
 * ----------------------
 * Emits a structured JSON log line for every HTTP request:
 *
 * {
 *   "traceId": "...",
 *   "requestId": "...",
 *   "tenantId": "...",
 *   "method": "POST",
 *   "path": "/api/v1/...",
 *   "statusCode": 201,
 *   "latencyMs": 42,
 *   "service": "shield-core"
 * }
 *
 * Intentionally avoids logging request bodies to prevent accidental PII/secret leakage.
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly serviceName: string = 'shield') {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();

    const traceId = (req as any).traceId ?? req.headers['x-trace-id'] ?? '-';
    const requestId = (req as any).requestId ?? '-';
    const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? '-';
    const { method, path } = req;

    return next.handle().pipe(
      tap({
        next: () => {
          const latencyMs = Date.now() - start;
          const statusCode = res.statusCode;
          this.logger.log(
            JSON.stringify({
              traceId,
              requestId,
              tenantId,
              method,
              path,
              statusCode,
              latencyMs,
              service: this.serviceName,
            }),
          );
        },
        error: (err: any) => {
          const latencyMs = Date.now() - start;
          const statusCode = err?.status ?? 500;
          this.logger.error(
            JSON.stringify({
              traceId,
              requestId,
              tenantId,
              method,
              path,
              statusCode,
              latencyMs,
              service: this.serviceName,
              error: err?.message ?? 'Unknown error',
            }),
          );
        },
      }),
    );
  }
}
