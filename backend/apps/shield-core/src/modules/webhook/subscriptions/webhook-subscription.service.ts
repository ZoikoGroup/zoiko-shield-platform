import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { WebhookEndpointValidatorService } from '../endpoint-validation/webhook-endpoint-validator.service';
import { WebhookSecretService } from '../secret-rotation/webhook-secret.service';

const ALLOWED_EVENT_TYPES = new Set([
  'alert.created.v1', 'alert.updated.v1',
  'case.created.v1', 'case.state.changed.v1',
  'connector.health.changed.v1',
  'evidence.completeness.changed.v1',
  'assessment.completed.v1',
  'risk.updated.v1', 'exception.expired.v1',
  'audit_package.frozen.v1',
  'export.ready.v1',
]);

@Injectable()
export class WebhookSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly validator: WebhookEndpointValidatorService,
    private readonly secretService: WebhookSecretService,
  ) {}

  async create(params: { tenantId: string; apiClientId?: string; endpointUrl: string; eventTypes: string[]; createdBy: string }) {
    await this.validator.validate(params.endpointUrl);

    const unknownEvents = params.eventTypes.filter((e) => !ALLOWED_EVENT_TYPES.has(e));
    if (unknownEvents.length > 0) {
      throw new NotFoundException(`Event type(s) not on the allowlist: ${unknownEvents.join(', ')}`);
    }

    const subscriptionId = randomUUID();
    const [subscription] = await this.prisma.$transaction([
      this.prisma.outboundWebhookSubscription.create({
        data: {
          id: subscriptionId,
          tenant_id: params.tenantId,
          api_client_id: params.apiClientId,
          endpoint_url: params.endpointUrl,
          event_types: JSON.stringify(params.eventTypes),
          created_by: params.createdBy,
          status: 'PENDING_VERIFICATION',
        },
      }),
      this.prisma.outboxEvent.create({ data: this.outbox.build({ tenantId: params.tenantId, topic: CANONICAL_TOPICS.WEBHOOK_SUBSCRIPTION_CREATED, eventType: 'webhook.subscription.created', payload: { subscriptionId } }) }),
    ]);

    await this.secretService.issue(params.tenantId, subscriptionId);
    return subscription;
  }

  async markVerified(tenantId: string, subscriptionId: string) {
    const [updated] = await this.prisma.$transaction([
      this.prisma.outboundWebhookSubscription.update({ where: { id: subscriptionId }, data: { status: 'ACTIVE', verified_at: new Date() } }),
      this.prisma.outboxEvent.create({ data: this.outbox.build({ tenantId, topic: CANONICAL_TOPICS.WEBHOOK_SUBSCRIPTION_VERIFIED, eventType: 'webhook.subscription.verified', payload: { subscriptionId } }) }),
    ]);
    return updated;
  }

  async suspend(tenantId: string, subscriptionId: string) {
    const [updated] = await this.prisma.$transaction([
      this.prisma.outboundWebhookSubscription.update({ where: { id: subscriptionId }, data: { status: 'SUSPENDED', suspended_at: new Date() } }),
      this.prisma.outboxEvent.create({ data: this.outbox.build({ tenantId, topic: CANONICAL_TOPICS.WEBHOOK_SUBSCRIPTION_SUSPENDED, eventType: 'webhook.subscription.suspended', payload: { subscriptionId } }) }),
    ]);
    return updated;
  }

  async rotateSecret(tenantId: string, subscriptionId: string) {
    return this.secretService.issue(tenantId, subscriptionId);
  }

  async assertTenantOwnership(tenantId: string, subscriptionId: string) {
    const subscription = await this.prisma.outboundWebhookSubscription.findFirst({ where: { id: subscriptionId, tenant_id: tenantId } });
    if (!subscription) {
      throw new NotFoundException(`WebhookSubscription '${subscriptionId}' not found`);
    }
    return subscription;
  }

  async listActiveForEventType(tenantId: string, eventType: string) {
    const subscriptions = await this.prisma.outboundWebhookSubscription.findMany({ where: { tenant_id: tenantId, status: 'ACTIVE' } });
    return subscriptions.filter((s) => (JSON.parse(s.event_types) as string[]).includes(eventType));
  }
}
