import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface RecordEventInput {
  eventType: string;
  principalId?: string | null;
  actorId?: string | null;
  tenantId?: string | null;
  correlationId?: string | null;
  data?: Record<string, unknown>;
}

/**
 * Single write path for identity/audit events. Never pass secrets, OTP
 * codes, tokens or password material in `data` — this is not enforced by
 * the type system and must be enforced by callers.
 */
@Injectable()
export class IdentityEventService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordEventInput): Promise<void> {
    await this.prisma.identityEvent.create({
      data: {
        eventType: input.eventType,
        principalId: input.principalId ?? null,
        actorId: input.actorId ?? null,
        tenantId: input.tenantId ?? null,
        correlationId: input.correlationId ?? null,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
