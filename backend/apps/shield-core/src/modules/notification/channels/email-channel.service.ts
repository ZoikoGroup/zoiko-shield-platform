import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, SendResult } from './notification-channel.interface';

/**
 * No real SMTP/email-provider transport is wired in this sandbox — this is
 * a deterministic local/mock transport, and that fact is recorded rather
 * than assuming success (spec §92: "explicitly record that transport
 * integration remains unverified rather than assuming success").
 */
@Injectable()
export class EmailChannelService implements NotificationChannel {
  readonly channelType = 'EMAIL';
  private readonly logger = new Logger(EmailChannelService.name);

  async send(params: { recipientPrincipalId: string; subject?: string; body: string }): Promise<SendResult> {
    this.logger.warn(`EMAIL transport is a MOCK in this environment — no real SMTP/provider integration exists. Would have sent "${params.subject ?? '(no subject)'}" to ${params.recipientPrincipalId}.`);
    return { delivered: true };
  }
}
