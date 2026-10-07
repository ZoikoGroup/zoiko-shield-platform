import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { NotificationController } from './notification.controller';
import { NotificationDeliveryWebhookController } from './webhooks/notification-delivery-webhook.controller';
import { NotificationPolicyService } from './policies/notification-policy.service';
import { NotificationTemplateService } from './templates/notification-template.service';
import { NotificationPreferenceService } from './preferences/notification-preference.service';
import { InAppChannelService } from './channels/in-app-channel.service';
import { EmailChannelService } from './channels/email-channel.service';
import { SlackChannelService } from './channels/slack-channel.service';
import { TeamsChannelService } from './channels/teams-channel.service';
import { NotificationDispatchService } from './dispatch/notification-dispatch.service';
import { TransactionalEmailService } from './transactional-email.service';
import { NotificationAcknowledgementService } from './acknowledgement/notification-acknowledgement.service';
import { DomainEventNotificationConsumer } from './consumers/domain-event-notification.consumer';
import { ProductionEmailTemplateEngine } from './templates/production-email-template.engine';
import { TenantIsolationValidator } from './policies/tenant-isolation-validator.service';
import { SenderClassRouterService } from './channels/sender-class-router.service';
import { NotificationAuditReconstructionService } from './audit/notification-audit-reconstruction.service';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [NotificationController, NotificationDeliveryWebhookController],
  providers: [
    NotificationPolicyService,
    NotificationTemplateService,
    TransactionalEmailService,
    ProductionEmailTemplateEngine,
    NotificationPreferenceService,
    InAppChannelService,
    EmailChannelService,
    SlackChannelService,
    TeamsChannelService,
    NotificationDispatchService,
    NotificationAcknowledgementService,
    DomainEventNotificationConsumer,
    TenantIsolationValidator,
    SenderClassRouterService,
    NotificationAuditReconstructionService,
  ],
  exports: [
    NotificationPolicyService,
    NotificationTemplateService,
    TransactionalEmailService,
    ProductionEmailTemplateEngine,
    NotificationDispatchService,
    SlackChannelService,
    TeamsChannelService,
    TenantIsolationValidator,
    SenderClassRouterService,
    NotificationAuditReconstructionService,
  ],
})
export class NotificationModule {}
