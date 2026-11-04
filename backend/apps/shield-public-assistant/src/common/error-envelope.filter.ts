import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

const SAFE_MESSAGES: Record<number, string> = {
  400: 'The request could not be accepted. Check the fields and try again.',
  401: 'Your session has expired. Start a new conversation.',
  403: 'This request is not allowed from this page.',
  404: 'That information is not available.',
  409: 'This request conflicts with an earlier one. Refresh and try again.',
  413: 'The request is too large.',
  429: 'Too many requests. Please wait a moment and try again.',
  503: 'The assistant is temporarily unavailable. You can still explore the site or contact support.',
};

@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorEnvelopeFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<{ correlationId?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let errorCode = 'ASSISTANT_ERROR';
    let userSafeMessage = SAFE_MESSAGES[status] ?? SAFE_MESSAGES[503];
    let fieldErrors: Record<string, string[]> | undefined;
    let retryAfter: number | undefined;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        userSafeMessage = SAFE_MESSAGES[status] ?? userSafeMessage;
      } else if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        if (typeof record.error_code === 'string') errorCode = record.error_code;
        if (typeof record.user_safe_message === 'string') {
          userSafeMessage = record.user_safe_message;
        } else if (typeof record.message === 'string' && status < 500) {
          // Never echo raw stack traces or model details; class-validator
          // messages are field-level and safe to surface.
          userSafeMessage = record.message;
        }
        if (record.field_errors && typeof record.field_errors === 'object') {
          fieldErrors = record.field_errors as Record<string, string[]>;
        }
        if (typeof record.retry_after === 'number') retryAfter = record.retry_after;
      }
    } else {
      this.logger.error(
        `Unhandled public assistant error (correlation=${request.correlationId ?? 'unknown'})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (status === 429) {
      const header = response.getHeader('Retry-After');
      if (!retryAfter && header) retryAfter = Number(header);
    }

    response.status(status).json({
      error_code: errorCode,
      user_safe_message: userSafeMessage,
      ...(fieldErrors ? { field_errors: fieldErrors } : {}),
      ...(retryAfter ? { retry_after: retryAfter } : {}),
      correlation_id: request.correlationId ?? '',
      api_version: 'v1',
    });
  }
}
