import { Injectable, Logger } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { WebhookSigningService } from '../signing/webhook-signing.service';
import { WebhookSecretService } from '../secret-rotation/webhook-secret.service';

export interface DeliverInput {
  tenantId: string;
  webhookSubscriptionId: string;
  eventId: string;
  eventType: string;
  data: Record<string, unknown>;
  test?: boolean;
}

const RETRYABLE_STATUS = new Set([408, 429]);
const MAX_ATTEMPTS = 6;

/**
 * HTTP 2xx means transport accepted — it does NOT prove the customer's
 * business process succeeded or that the event was understood (spec §50).
 * The redirect-following behavior of fetch is disabled ('manual') so a
 * malicious/misconfigured endpoint can't redirect us past the SSRF checks
 * already performed at subscription time (spec §43).
 */
@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly signingService: WebhookSigningService,
    private readonly secretService: WebhookSecretService,
  ) {}

  async deliver(input: DeliverInput, replayOfDeliveryId?: string): Promise<void> {
    const subscription = await this.prisma.outboundWebhookSubscription.findUniqueOrThrow({ where: { id: input.webhookSubscriptionId } });

    const minimizedPayload = { id: input.eventId, type: input.eventType, version: '1.0', occurredAt: new Date().toISOString(), tenantContext: { tenantId: input.tenantId }, test: input.test ?? false, data: input.data };
    const rawBody = JSON.stringify(minimizedPayload);
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');

    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        webhook_subscription_id: subscription.id,
        event_id: input.eventId,
        event_type: input.eventType,
        payload_version: '1.0',
        payload_hash: payloadHash,
        payload: rawBody,
        status: 'DELIVERING',
        replay_of_delivery_id: replayOfDeliveryId,
        correlation_id: randomUUID(),
      },
    });

    await this.attempt(delivery.id, subscription.id, subscription.endpoint_url, input.eventId, rawBody);
  }

  private async attempt(deliveryId: string, subscriptionId: string, endpointUrl: string, eventId: string, rawBody: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    const attemptNumber = delivery.attempt_count + 1;
    const startedAt = new Date();

    const secret = await this.secretService.getActiveSecret(subscriptionId);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = secret ? this.signingService.sign({ secret, timestamp, eventId, rawBody }) : 'UNSIGNED_NO_ACTIVE_SECRET';

    let responseStatus: number | undefined;
    let errorClass: string | undefined;
    let retryable = true;

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        redirect: 'manual', // never follow redirects blindly past SSRF validation
        headers: {
          'Content-Type': 'application/json',
          'X-Zoiko-Webhook-Id': subscriptionId,
          'X-Zoiko-Delivery-Id': deliveryId,
          'X-Zoiko-Event-Id': eventId,
          'X-Zoiko-Timestamp': timestamp,
          'X-Zoiko-Schema-Version': '1.0',
          'X-Zoiko-Signature': signature,
        },
        body: rawBody,
      });
      responseStatus = response.status;
      retryable = response.status >= 500 || RETRYABLE_STATUS.has(response.status);
    } catch (err) {
      errorClass = (err as Error).name || 'NETWORK_ERROR';
      retryable = true;
    }

    const completedAt = new Date();
    await this.prisma.webhookDeliveryAttempt.create({
      data: { id: randomUUID(), tenant_id: delivery.tenant_id, delivery_id: deliveryId, attempt_number: attemptNumber, started_at: startedAt, completed_at: completedAt, response_status: responseStatus, error_class: errorClass, retryable, duration_ms: completedAt.getTime() - startedAt.getTime() },
    });

    const succeeded = responseStatus !== undefined && responseStatus >= 200 && responseStatus < 300;
    const exhausted = attemptNumber >= MAX_ATTEMPTS;

    const nextStatus = succeeded ? 'DELIVERED' : !retryable || exhausted ? (exhausted ? 'DEAD_LETTERED' : 'FAILED') : 'FAILED';

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: succeeded ? 'DELIVERED' : nextStatus,
        attempt_count: attemptNumber,
        first_attempt_at: delivery.first_attempt_at ?? startedAt,
        last_attempt_at: startedAt,
        delivered_at: succeeded ? completedAt : null,
        response_status: responseStatus,
      },
    });

    const topic = succeeded ? CANONICAL_TOPICS.WEBHOOK_DELIVERY_SUCCEEDED : nextStatus === 'DEAD_LETTERED' ? CANONICAL_TOPICS.WEBHOOK_DELIVERY_DEAD_LETTERED : CANONICAL_TOPICS.WEBHOOK_DELIVERY_FAILED;
    await this.prisma.outboxEvent.create({ data: this.outbox.build({ tenantId: delivery.tenant_id, topic, eventType: topic, payload: { deliveryId, subscriptionId, responseStatus } }) });

    if (!succeeded && retryable && !exhausted) {
      this.logger.debug(`WebhookDelivery ${deliveryId} attempt ${attemptNumber} failed (status=${responseStatus}, retryable) — will retry via WebhookRetryService`);
    }
  }

  /** Called by WebhookRetryService's bounded backoff scheduler — resends the exact frozen bytes from the first attempt, never a reconstructed body. */
  async retryAttempt(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    const subscription = await this.prisma.outboundWebhookSubscription.findUniqueOrThrow({ where: { id: delivery.webhook_subscription_id } });
    await this.attempt(deliveryId, subscription.id, subscription.endpoint_url, delivery.event_id, delivery.payload);
  }
}
