import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdentityEvent } from './identity-event.entity';

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
  constructor(
    @InjectRepository(IdentityEvent)
    private readonly eventRepository: Repository<IdentityEvent>,
  ) {}

  async record(input: RecordEventInput): Promise<void> {
    await this.eventRepository.save(
      this.eventRepository.create({
        eventType: input.eventType,
        principalId: input.principalId ?? null,
        actorId: input.actorId ?? null,
        tenantId: input.tenantId ?? null,
        correlationId: input.correlationId ?? null,
        data: input.data ?? {},
      }),
    );
  }
}
