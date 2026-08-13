import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { WebhookDeliveryService } from '../delivery/webhook-delivery.service';

const BASE_DELAY_MS = 30_000;

function backoffDelayMs(attemptCount: number): number {
  const exponential = BASE_DELAY_MS * 2 ** (attemptCount - 1);
  const jitter = Math.random() * BASE_DELAY_MS;
  return Math.min(exponential + jitter, 30 * 60_000); // cap at 30 minutes
}

/** Bounded exponential backoff + jitter — never retries infinitely (spec §22/§49); WebhookDeliveryService.attempt() itself enforces MAX_ATTEMPTS -> DEAD_LETTERED. */
@Injectable()
export class WebhookRetryService {
  private readonly logger = new Logger(WebhookRetryService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryService: WebhookDeliveryService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async retryDue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const failed = await this.prisma.webhookDelivery.findMany({
        where: { status: 'FAILED' },
        take: 50,
      });
      for (const delivery of failed) {
        if (!delivery.last_attempt_at) continue;
        const dueAt =
          delivery.last_attempt_at.getTime() +
          backoffDelayMs(delivery.attempt_count);
        if (Date.now() < dueAt) continue;
        try {
          await this.deliveryService.retryAttempt(delivery.id);
        } catch (err) {
          this.logger.error(
            `Retry failed for WebhookDelivery ${delivery.id}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
