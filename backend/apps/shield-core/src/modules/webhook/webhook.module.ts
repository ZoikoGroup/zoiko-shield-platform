import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { OutboxService } from '../../outbox/outbox.service';
import { WebhookController } from './webhook.controller';
import { WebhookEndpointValidatorService } from './endpoint-validation/webhook-endpoint-validator.service';
import { WebhookSecretService } from './secret-rotation/webhook-secret.service';
import { WebhookSigningService } from './signing/webhook-signing.service';
import { WebhookSubscriptionService } from './subscriptions/webhook-subscription.service';
import { WebhookDeliveryService } from './delivery/webhook-delivery.service';
import { WebhookRetryService } from './retry/webhook-retry.service';
import { WebhookReplayService } from './replay/webhook-replay.service';

@Module({
  imports: [PrismaModule, AuthorizationDecisionModule],
  controllers: [WebhookController],
  providers: [
    OutboxService,
    WebhookEndpointValidatorService,
    WebhookSecretService,
    WebhookSigningService,
    WebhookSubscriptionService,
    WebhookDeliveryService,
    WebhookRetryService,
    WebhookReplayService,
  ],
  exports: [WebhookSubscriptionService, WebhookDeliveryService],
})
export class WebhookModule {}
