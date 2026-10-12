import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  NotificationChannel,
  SendResult,
} from './notification-channel.interface';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class EmailChannelService implements NotificationChannel, OnModuleInit {
  readonly channelType = 'EMAIL';
  private readonly logger = new Logger(EmailChannelService.name);
  private transporter: Transporter | null = null;
  private fromAddress = '';

  onModuleInit(): void {
    const user = process.env.EMAIL_USER;
    const appPassword = process.env.EMAIL_APP_PASSWORD;

    if (user && appPassword) {
      this.fromAddress = user;
      this.transporter = createTransport({
        service: 'gmail',
        auth: { user, pass: appPassword },
      });
      this.logger.log(
        `EmailChannelService initialized with active SMTP transport (${user}).`,
      );
    } else {
      this.logger.warn(
        'EmailChannelService: EMAIL_USER/EMAIL_APP_PASSWORD not set — operating in dev logging mode.',
      );
    }
  }

  async send(params: {
    recipientPrincipalId: string;
    subject?: string;
    body: string;
  }): Promise<SendResult> {
    if (this.transporter && params.recipientPrincipalId.includes('@')) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to: params.recipientPrincipalId,
          subject: params.subject ?? 'ZoikoShield Security Notification',
          html: params.body,
        });
        return { delivered: true };
      } catch (err: any) {
        this.logger.error(
          `SMTP delivery failed to ${params.recipientPrincipalId}: ${err.message}`,
        );
        return { delivered: false, errorCode: err.message || 'SMTP_FAILED' };
      }
    }

    this.logger.log(
      `[EMAIL DISPATCH] To: ${params.recipientPrincipalId} | Subject: "${params.subject ?? '(no subject)'}" | Payload: ${params.body.length} bytes`,
    );
    return { delivered: true };
  }
}
