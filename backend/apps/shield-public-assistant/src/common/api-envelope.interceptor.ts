import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const API_VERSION = 'v1';

/**
 * Adds the wire envelope to ordinary JSON responses. SSE responses are written
 * directly to the Express response and are intentionally not wrapped.
 */
@Injectable()
export class ApiEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ correlationId?: string }>();
    const correlationId = request.correlationId ?? '';
    return next.handle().pipe(
      map((data) => {
        if (data === undefined || data === null) {
          return { api_version: API_VERSION, correlation_id: correlationId };
        }
        if (Array.isArray(data) || typeof data !== 'object') {
          return {
            data,
            api_version: API_VERSION,
            correlation_id: correlationId,
          };
        }
        return {
          ...(data as Record<string, unknown>),
          api_version: API_VERSION,
          correlation_id: correlationId,
        };
      }),
    );
  }
}
