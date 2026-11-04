import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://www.zoikoshield.com',
  'https://zoikoshield.com',
];

/**
 * CSRF defence for stateful public actions:
 *  - every mutation must carry `X-ZS-Assistant: 1` (a custom header that a
 *    cross-site form cannot set without a CORS preflight);
 *  - when an Origin header is present it must be on the allowlist.
 *
 * No session cookie is required to read config, status or published content.
 */
@Injectable()
export class OriginCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    if (request.header('x-zs-assistant') !== '1') {
      throw new ForbiddenException({
        error_code: 'CSRF_HEADER_REQUIRED',
        user_safe_message: 'Refresh the page and try again.',
      });
    }

    const origin = request.header('origin');
    if (origin) {
      const allowed = (process.env.PUBLIC_ASSISTANT_ALLOWED_ORIGINS ?? DEFAULT_ORIGINS.join(','))
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (!allowed.includes(origin)) {
        throw new ForbiddenException({
          error_code: 'ORIGIN_NOT_ALLOWED',
          user_safe_message: 'This request is not allowed from this page.',
        });
      }
    }
    return true;
  }
}
