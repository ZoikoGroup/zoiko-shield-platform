import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaProducerService } from '../../kafka/kafka-producer.service';

/**
 * ZS-COM-BILL-001 Part 31: transactional outbox for the commercial plane.
 * Every commercial state change already writes its CommercialEvent row in
 * the same DB transaction as the mutation (contract transitions,
 * payments, approvals, dunning, etc. — see grep for
 * `tx.commercialEvent.create` across the commercial modules), so this
 * poller only ever publishes AFTER commit, never before. Consumers must
 * tolerate replay: publishing sets published_at but a crash between the
 * Kafka write and that update means the same event can be republished —
 * the envelope's eventId/idempotency_key make that safe to dedupe on the
 * consumer side.
 */
@Injectable()
export class CommercialEventPublisherService {
  private readonly logger = new Logger(CommercialEventPublisherService.name);
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
      const pending = await this.prisma.commercialEvent.findMany({
        where: { published_at: null },
        orderBy: { created_at: 'asc' },
        take: 100,
      });

      for (const event of pending) {
        try {
          await this.kafkaProducer.publishEvent(
            `commercial.${event.event_type}`,
            event.event_type,
            {
              tenantId: event.tenant_id || 'unknown-tenant',
              actor: event.actor,
              ...JSON.parse(event.payload),
            },
            { correlationId: event.idempotency_key },
          );
          await this.prisma.commercialEvent.update({
            where: { id: event.id },
            data: { published_at: new Date() },
          });
        } catch (err) {
          this.logger.error(
            `Failed to publish commercial event ${event.id}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
