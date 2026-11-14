import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small in-process token bucket. Production replaces this with the shared
 * Redis limiter (WF12): the thresholds come from config and are never exposed
 * to the client. Reads are exempt so static help keeps working under load.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')
      return true;

    const windowMs = Number(
      process.env.PUBLIC_ASSISTANT_RATE_WINDOW_MS ?? 60_000,
    );
    const limit = Number(process.env.PUBLIC_ASSISTANT_RATE_LIMIT ?? 60);
    const forwarded = request.header('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwarded || request.ip || 'unknown';
    const key = createHash('sha256').update(ip).digest('hex').slice(0, 24);
    const now = Date.now();

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          error_code: 'RATE_LIMITED',
          user_safe_message:
            'Too many requests. Please wait a moment and try again.',
          retry_after: retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
