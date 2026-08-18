import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

/**
 * OutboxEvent is a table shared with shield-core and shield-ingest (one
 * Prisma schema, three apps). shield-action owns only these narrow
 * sub-prefixes — action.simulated./command.signed./action.dispatched./
 * action.receipt./action.reconciliation./action.rollback./action.frozen. —
 * NOT a broad "action." prefix, since shield-core owns action.proposed./
 * action.approved./action.rejected. under that same top-level word. Zero
 * overlap across all three apps' owned-prefix lists.
 */
const SHIELD_ACTION_OWNED_TOPIC_PREFIXES = [
  'action.simulated.',
  'command.signed.',
  'action.dispatched.',
  'action.receipt.',
  'action.reconciliation.',
  'action.rollback.',
  'action.frozen.',
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
          OR: SHIELD_ACTION_OWNED_TOPIC_PREFIXES.map((prefix) => ({
            topic: { startsWith: prefix },
          })),
        },
        orderBy: { created_at: 'asc' },
        take: 100,
      });

      for (const event of pending) {
        try {
          await this.kafkaProducer.publishEvent(
            event.topic,
            event.event_type,
            { tenantId: event.tenant_id, ...JSON.parse(event.payload) },
            { correlationId: event.correlation_id ?? undefined },
          );
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { published_at: new Date() },
          });
        } catch (err) {
          this.logger.error(
            `Failed to publish outbox event ${event.id}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
