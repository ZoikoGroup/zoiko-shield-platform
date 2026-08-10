import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthorizationDecisionService } from '../../authorization-decision/authorization-decision.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { WebhookDeliveryService } from '../delivery/webhook-delivery.service';

/**
 * Replay must be manual, authorized, audited, bounded (spec §51). Creates
 * a NEW deliveryId but retains the original eventId, re-signs with the
 * CURRENTLY valid secret (not whatever was active at the original
 * delivery time), and never creates a new domain event — replaying a
 * webhook delivery can never itself replay a response action or produce
 * new external authority.
 */
@Injectable()
export class WebhookReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
    private readonly deliveryService: WebhookDeliveryService,
  ) {}

  async replay(tenantId: string, subscriptionId: string, deliveryId: string, actorId: string) {
    const original = await this.prisma.webhookDelivery.findFirst({ where: { id: deliveryId, tenant_id: tenantId, webhook_subscription_id: subscriptionId } });
    if (!original) {
      throw new NotFoundException(`WebhookDelivery '${deliveryId}' not found`);
    }

    const { decision } = await this.authorizationDecisionService.evaluate({ actorId, tenantId, action: 'webhook:replay', resourceType: 'WebhookDelivery', resourceId: deliveryId });
    if (decision === 'DENY') {
      throw new ForbiddenException('Actor is not authorized to replay webhook deliveries');
    }

    const data = JSON.parse(original.payload)?.data ?? {};
    await this.deliveryService.deliver({ tenantId, webhookSubscriptionId: subscriptionId, eventId: original.event_id, eventType: original.event_type, data }, original.id);

    await this.prisma.outboxEvent.create({ data: this.outbox.build({ tenantId, topic: CANONICAL_TOPICS.WEBHOOK_DELIVERY_REPLAYED, eventType: 'webhook.delivery.replayed', payload: { originalDeliveryId: deliveryId, eventId: original.event_id } }) });

    return this.prisma.webhookDelivery.findFirst({ where: { replay_of_delivery_id: deliveryId }, orderBy: { created_at: 'desc' } });
  }
}
