import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationPolicyService } from '../policies/notification-policy.service';
import { NotificationPreferenceService } from '../preferences/notification-preference.service';
import { NotificationTemplateService } from '../templates/notification-template.service';
import { InAppChannelService } from '../channels/in-app-channel.service';
import { EmailChannelService } from '../channels/email-channel.service';
import { SlackChannelService } from '../channels/slack-channel.service';
import { TeamsChannelService } from '../channels/teams-channel.service';
import { NotificationChannel } from '../channels/notification-channel.interface';

export interface DispatchInput {
  tenantId: string;
  eventId: string;
  eventType: string;
  recipientPrincipalId: string;
  templateContext: Record<string, string>;
  correlationId?: string;
}

const PRISMA_UNIQUE_CONSTRAINT_ERROR = 'P2002';

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);
  private readonly channels: Map<string, NotificationChannel>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: NotificationPolicyService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly templateService: NotificationTemplateService,
    inAppChannel: InAppChannelService,
    emailChannel: EmailChannelService,
    slackChannel: SlackChannelService,
    teamsChannel: TeamsChannelService,
  ) {
    this.channels = new Map<string, NotificationChannel>([
      [inAppChannel.channelType, inAppChannel],
      [emailChannel.channelType, emailChannel],
      [slackChannel.channelType, slackChannel],
      [teamsChannel.channelType, teamsChannel],
    ]);
  }

  async dispatch(input: DispatchInput): Promise<void> {
    const policies = await this.policyService.getByEventType(input.eventType);
    for (const policy of policies) {
      const allowedChannels: string[] = JSON.parse(policy.allowed_channels);
      for (const channelType of allowedChannels) {
        const decision = await this.preferenceService.resolveDeliveryDecision({
          tenantId: input.tenantId,
          principalId: input.recipientPrincipalId,
          policy: { id: policy.id, mandatory: policy.mandatory },
        });
        if (!decision.shouldDeliver) {
          this.logger.debug(
            `Skipping delivery for policy ${policy.key} channel ${channelType}: ${decision.reason}`,
          );
          continue;
        }

        let delivery;
        try {
          delivery = await this.prisma.notificationDelivery.create({
            data: {
              id: randomUUID(),
              tenant_id: input.tenantId,
              event_id: input.eventId,
              policy_id: policy.id,
              policy_version: policy.version,
              recipient_principal_id: input.recipientPrincipalId,
              channel: channelType,
              template_version: 0,
              status: 'PROCESSING',
              first_attempt_at: new Date(),
              last_attempt_at: new Date(),
              attempt_count: 1,
              correlation_id: input.correlationId ?? randomUUID(),
            },
          });
        } catch (err: any) {
          if (err?.code === PRISMA_UNIQUE_CONSTRAINT_ERROR) {
            this.logger.debug(
              `Duplicate dispatch suppressed for event ${input.eventId}/${input.recipientPrincipalId}/${channelType} — idempotency key already exists`,
            );
            continue;
          }
          throw err;
        }

        try {
          const template = await this.templateService.getLatestPublished(
            policy.key,
            channelType,
          );
          const rendered = this.templateService.render(
            template,
            input.templateContext,
          );
          const channel = this.channels.get(channelType);
          const result = channel
            ? await channel.send({
                recipientPrincipalId: input.recipientPrincipalId,
                subject: rendered.subject,
                body: rendered.body,
              })
            : { delivered: false, errorCode: 'NO_CHANNEL_ADAPTER' };

          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: result.delivered ? 'DELIVERED' : 'FAILED',
              delivered_at: result.delivered ? new Date() : null,
              error_code: result.errorCode,
              template_version: template.version,
            },
          });
        } catch (err) {
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'FAILED',
              error_code: (err as Error).message.slice(0, 200),
            },
          });
        }
      }
    }
  }
}
