import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface IdempotentRunParams {
  key: string;
  operation: string;
  tenantId?: string;
  actorId?: string;
  requestPayload: unknown;
}

export interface IdempotentResult<T> {
  statusCode: number;
  body: T;
}

/**
 * Reusable idempotency mechanism for shield-ingest operations.
 * Operates independently within shield-ingest using its own PrismaService.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  private fingerprint(payload: unknown): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload ?? null))
      .digest('hex');
  }

  async run<T>(
    params: IdempotentRunParams,
    fn: () => Promise<IdempotentResult<T>>,
  ): Promise<IdempotentResult<T> & { replayed: boolean }> {
    const requestFingerprint = this.fingerprint(params.requestPayload);

    const existing = await (this.prisma as any).idempotencyRecord?.findUnique({
      where: {
        idempotency_key_operation: {
          idempotency_key: params.key,
          operation: params.operation,
        },
      },
    });

    if (existing) {
      if (existing.request_fingerprint !== requestFingerprint) {
        throw new ConflictException({
          statusCode: 409,
          error: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
          message: `Idempotency key '${params.key}' was already used for operation '${params.operation}' with a different request body`,
        });
      }

      if (existing.status === 'IN_PROGRESS') {
        throw new ConflictException({
          statusCode: 409,
          error: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
          message: `A request with idempotency key '${params.key}' is already being processed`,
        });
      }

      if (existing.status === 'COMPLETED') {
        this.logger.log(
          `Idempotent replay for '${params.operation}' key '${params.key}'`,
        );
        return {
          statusCode: existing.response_code ?? 200,
          body: existing.response_body
            ? JSON.parse(existing.response_body)
            : (undefined as unknown as T),
          replayed: true,
        };
      }

      await (this.prisma as any).idempotencyRecord?.delete({
        where: { id: existing.id },
      });
    }

    try {
      await (this.prisma as any).idempotencyRecord?.create({
        data: {
          idempotency_key: params.key,
          operation: params.operation,
          tenant_id: params.tenantId,
          actor_id: params.actorId,
          request_fingerprint: requestFingerprint,
          status: 'IN_PROGRESS',
        },
      });
    } catch {
      throw new ConflictException({
        statusCode: 409,
        error: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
        message: `A request with idempotency key '${params.key}' is already being processed`,
      });
    }

    try {
      const result = await fn();
      await (this.prisma as any).idempotencyRecord?.update({
        where: {
          idempotency_key_operation: {
            idempotency_key: params.key,
            operation: params.operation,
          },
        },
        data: {
          status: 'COMPLETED',
          response_code: result.statusCode,
          response_body: JSON.stringify(result.body),
        },
      });
      return { ...result, replayed: false };
    } catch (err) {
      await (this.prisma as any).idempotencyRecord?.update({
        where: {
          idempotency_key_operation: {
            idempotency_key: params.key,
            operation: params.operation,
          },
        },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }
}
