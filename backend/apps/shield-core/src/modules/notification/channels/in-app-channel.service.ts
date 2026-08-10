import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, SendResult } from './notification-channel.interface';

/** In-app delivery is a durable row (NotificationDelivery itself) — this "send" step is the fan-out signal, deterministic and local. */
@Injectable()
export class InAppChannelService implements NotificationChannel {
  readonly channelType = 'IN_APP';
  private readonly logger = new Logger(InAppChannelService.name);

  async send(params: { recipientPrincipalId: string; subject?: string; body: string }): Promise<SendResult> {
    this.logger.log(`IN_APP notification for ${params.recipientPrincipalId}: ${params.body.slice(0, 120)}`);
    return { delivered: true };
  }
}
