import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';

/**
 * An expired exception must never silently remain effective (spec §28).
 * Flips passed-expiresAt exceptions to EXPIRED, re-opens any Risk that was
 * only mitigated by that exception, publishes exception.expired.
 */
@Injectable()
export class ExceptionExpiryService {
  private readonly logger = new Logger(ExceptionExpiryService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireDue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.exception.findMany({
        where: { status: { in: ['REQUESTED', 'APPROVED'] }, expires_at: { lte: new Date() } },
      });

      for (const exception of due) {
        try {
          await this.prisma.$transaction([
            this.prisma.exception.update({ where: { id: exception.id }, data: { status: 'EXPIRED' } }),
            this.prisma.outboxEvent.create({
              data: this.outbox.build({ tenantId: exception.tenant_id, topic: CANONICAL_TOPICS.EXCEPTION_EXPIRED, eventType: 'exception.expired', payload: { exceptionId: exception.id, riskId: exception.risk_id } }),
            }),
          ]);
          if (exception.risk_id) {
            const risk = await this.prisma.risk.findUnique({ where: { id: exception.risk_id } });
            if (risk && risk.status !== 'OPEN') {
              await this.prisma.risk.update({ where: { id: risk.id }, data: { status: 'OPEN' } });
              this.logger.warn(`Risk ${risk.id} re-opened — its exception ${exception.id} expired`);
            }
          }
        } catch (err) {
          this.logger.error(`Failed to expire exception ${exception.id}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
