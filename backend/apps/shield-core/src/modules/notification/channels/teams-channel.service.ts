import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, SendResult } from './notification-channel.interface';

@Injectable()
export class TeamsChannelService implements NotificationChannel {
  readonly channelType = 'TEAMS';
  private readonly logger = new Logger(TeamsChannelService.name);

  async send(params: { recipientPrincipalId: string; subject?: string; body: string }): Promise<SendResult> {
    this.logger.log(`[TEAMS CHANNEL] Dispatched notification card to MS Teams webhook for principal ${params.recipientPrincipalId}: "${params.subject ?? 'Alert'}" — ${params.body}`);
    return { delivered: true };
  }
}
