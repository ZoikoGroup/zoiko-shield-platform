import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { PlatformScope } from '../../../../libs/database/src';

/** shield-anchor owns checkpoint./witness./anchor. — zero overlap with any other app's owned prefixes. */
const SHIELD_ANCHOR_OWNED_TOPIC_PREFIXES = [
  'checkpoint.',
  'witness.',
  'anchor.',
];

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @PlatformScope('scheduled job OutboxPublisherService.publishPending')
  @Cron(CronExpression.EVERY_10_SECONDS)
  async publishPending(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: {
          published_at: null,
          OR: SHIELD_ANCHOR_OWNED_TOPIC_PREFIXES.map((prefix) => ({
            topic: { startsWith: prefix },
          })),
        },
        orderBy: { created_at: 'asc' },
        take: 100,
      });

      // Publish one at a time (keeps per-tenant ordering; one bad event cannot
      // block the rest), then mark every successful one in a single UPDATE.
      const publishedIds: string[] = [];
      for (const event of pending) {
        try {
          await this.kafkaProducer.publishEvent(
            event.topic,
            event.event_type,
            { tenantId: event.tenant_id, ...JSON.parse(event.payload) },
            { correlationId: event.correlation_id ?? undefined },
          );
          publishedIds.push(event.id);
        } catch (err) {
          this.logger.error(
            `Failed to publish outbox event ${event.id}: ${(err as Error).message}`,
          );
        }
      }
      if (publishedIds.length > 0) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: { in: publishedIds } },
          data: { published_at: new Date() },
        });
      }
    } finally {
      this.running = false;
    }
  }
}
