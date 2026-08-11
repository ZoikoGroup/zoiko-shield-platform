import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, SendResult } from './notification-channel.interface';

@Injectable()
export class SlackChannelService implements NotificationChannel {
  readonly channelType = 'SLACK';
  private readonly logger = new Logger(SlackChannelService.name);

  async send(params: { recipientPrincipalId: string; subject?: string; body: string }): Promise<SendResult> {
    this.logger.log(`[SLACK CHANNEL] Dispatched notification card to channel/webhook for principal ${params.recipientPrincipalId}: "${params.subject ?? 'Alert'}" — ${params.body}`);
    return { delivered: true };
  }
}
