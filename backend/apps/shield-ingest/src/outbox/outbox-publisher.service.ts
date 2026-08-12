import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka.producer.service';

/**
 * Polls unpublished OutboxEvent rows and publishes them to Kafka, then
 * stamps published_at — the actual publish-after-commit half of the
 * outbox pattern (spec §38). Pattern copied from EntraSchedulerService's
 * cron-poller shape.
 *
 * OutboxEvent is a table shared with shield-core (one Prisma schema, two
 * apps) — this poller only claims topics shield-ingest authors. Narrow,
 * explicit prefixes (no catch-all `event.*`) so there is zero overlap with
 * shield-core's owned list (identity.user., detection., alert., case.,
 * evidence., incident.).
 */
const SHIELD_INGEST_OWNED_TOPIC_PREFIXES = [
  'event.normalized.',
  'identity.directory-sync.',
  'identity.signin.',
  'connector.',
  'ingestion.',
  'normalization.',
];

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async publishPending(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: {
          published_at: null,
          OR: SHIELD_INGEST_OWNED_TOPIC_PREFIXES.map((prefix) => ({ topic: { startsWith: prefix } })),
        },
        orderBy: { created_at: 'asc' },
        take: 100,
      });

      for (const event of pending) {
        try {
          await this.kafkaProducer.emit(event.topic, {
            eventType: event.event_type,
            tenantId: event.tenant_id,
            correlationId: event.correlation_id ?? undefined,
            ...JSON.parse(event.payload),
          });
          await this.prisma.outboxEvent.update({ where: { id: event.id }, data: { published_at: new Date() } });
        } catch (err) {
          this.logger.error(`Failed to publish outbox event ${event.id}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
