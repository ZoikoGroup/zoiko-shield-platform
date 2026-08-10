import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../../../kafka/kafka-consumer.service';
import { EventEnvelope, CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { IdentityResolutionService } from './identity-resolution.service';

/** Must match shield-ingest's CANONICAL_TOPICS.IDENTITY_DIRECTORY_SYNC exactly (apps/shield-ingest/src/kafka/kafka.producer.service.ts) — no shared package exists yet. */
const IDENTITY_DIRECTORY_SYNC_TOPIC = 'identity.directory-sync.v1';

interface DirectorySyncPayload {
  tenantId: string;
  instanceId: string;
  sourceSystem: string;
  externalId: string;
  email?: string;
  displayName?: string;
  removed: boolean;
}

/**
 * Consumes identity.directory-sync.v1 (published by shield-ingest's
 * entra.user-sync.ts) and performs the actual identity resolution — this
 * is now the only place directory-sync resolution happens, since
 * IdentityResolutionService moved here. Publishes identity.user.upserted.v1
 * / identity.user.removed.v1 itself afterward (via its own outbox), since
 * it's the app that actually performed the resolution.
 */
@Injectable()
export class IdentityDirectorySyncConsumer implements OnModuleInit {
  private readonly logger = new Logger(IdentityDirectorySyncConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly identityResolution: IdentityResolutionService,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  onModuleInit(): void {
    this.kafkaConsumer.registerHandler(IDENTITY_DIRECTORY_SYNC_TOPIC, this.handle.bind(this));
  }

  private async handle(envelope: EventEnvelope<DirectorySyncPayload>): Promise<void> {
    const payload = envelope.payload;
    if (!payload?.tenantId || !payload?.externalId) {
      this.logger.warn(`Malformed identity.directory-sync.v1 payload, skipping: ${JSON.stringify(payload)}`);
      return;
    }

    if (payload.removed) {
      await this.identityResolution.markRemoved(payload.tenantId, payload.externalId);
      await this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: payload.tenantId,
          topic: CANONICAL_TOPICS.IDENTITY_USER_REMOVED,
          eventType: 'identity.user.removed',
          payload: { instanceId: payload.instanceId, externalId: payload.externalId },
        }),
      });
      return;
    }

    await this.identityResolution.resolve({
      tenantId: payload.tenantId,
      sourceSystem: payload.sourceSystem,
      sourceAccountId: payload.instanceId,
      externalType: 'OBJECT_ID',
      externalId: payload.externalId,
      email: payload.email,
      displayName: payload.displayName,
      identityType: 'HUMAN',
    });

    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId: payload.tenantId,
        topic: CANONICAL_TOPICS.IDENTITY_USER_UPSERTED,
        eventType: 'identity.user.upserted',
        payload: { instanceId: payload.instanceId, externalId: payload.externalId, email: payload.email, displayName: payload.displayName },
      }),
    });
  }
}
