import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { PlatformScope } from '../../../../../../libs/database/src';

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

  @PlatformScope('scheduled job ExceptionExpiryService.expireDue')
  @Cron(CronExpression.EVERY_MINUTE)
  async expireDue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.exception.findMany({
        where: {
          status: { in: ['REQUESTED', 'APPROVED'] },
          expires_at: { lte: new Date() },
        },
        // Bounded per tick; any remainder is picked up a minute later.
        take: 500,
      });

      for (const exception of due) {
        try {
          // The risk re-open is part of the same transaction: an exception
          // must never end up EXPIRED while its risk stays mitigated.
          const expire = this.prisma.exception.update({
            where: { id: exception.id },
            data: { status: 'EXPIRED' },
          });
          const publish = this.prisma.outboxEvent.create({
            data: this.outbox.build({
              tenantId: exception.tenant_id,
              topic: CANONICAL_TOPICS.EXCEPTION_EXPIRED,
              eventType: 'exception.expired',
              payload: {
                exceptionId: exception.id,
                riskId: exception.risk_id,
              },
            }),
          });
          // No risk_id: nothing to re-open. (Never pass it as undefined to
          // updateMany below - that drops the filter and matches every risk.)
          if (!exception.risk_id) {
            await this.prisma.$transaction([expire, publish]);
            continue;
          }
          const [, , reopened] = await this.prisma.$transaction([
            expire,
            publish,
            this.prisma.risk.updateMany({
              where: { id: exception.risk_id, status: { not: 'OPEN' } },
              data: { status: 'OPEN' },
            }),
          ]);
          if (reopened.count > 0) {
            this.logger.warn(
              `Risk ${exception.risk_id} re-opened — its exception ${exception.id} expired`,
            );
          }
        } catch (err) {
          this.logger.error(
            `Failed to expire exception ${exception.id}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
