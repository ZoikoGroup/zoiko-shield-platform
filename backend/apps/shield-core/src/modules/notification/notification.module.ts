import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { NotificationController } from './notification.controller';
import { NotificationPolicyService } from './policies/notification-policy.service';
import { NotificationTemplateService } from './templates/notification-template.service';
import { NotificationPreferenceService } from './preferences/notification-preference.service';
import { InAppChannelService } from './channels/in-app-channel.service';
import { EmailChannelService } from './channels/email-channel.service';
import { SlackChannelService } from './channels/slack-channel.service';
import { TeamsChannelService } from './channels/teams-channel.service';
import { NotificationDispatchService } from './dispatch/notification-dispatch.service';
import { NotificationAcknowledgementService } from './acknowledgement/notification-acknowledgement.service';
import { DomainEventNotificationConsumer } from './consumers/domain-event-notification.consumer';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [NotificationController],
  providers: [
    NotificationPolicyService,
    NotificationTemplateService,
    NotificationPreferenceService,
    InAppChannelService,
    EmailChannelService,
    SlackChannelService,
    TeamsChannelService,
    NotificationDispatchService,
    NotificationAcknowledgementService,
    DomainEventNotificationConsumer,
  ],
  exports: [
    NotificationPolicyService,
    NotificationTemplateService,
    NotificationDispatchService,
    SlackChannelService,
    TeamsChannelService,
  ],
})
export class NotificationModule {}
