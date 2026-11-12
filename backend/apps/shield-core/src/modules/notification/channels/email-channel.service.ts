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
    const smtpHost = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_APP_PASSWORD;

    if (smtpHost && user && pass) {
      this.fromAddress = process.env.SMTP_FROM || user;
      this.transporter = createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
      });
      this.logger.log(
        `EmailChannelService initialized with SMTP transport (${smtpHost}, from: ${this.fromAddress}).`,
      );
    } else if (user && pass) {
      this.fromAddress = process.env.SMTP_FROM || user;
      this.transporter = createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
      this.logger.log(
        `EmailChannelService initialized with Gmail transport (${user}).`,
      );
    } else {
      this.logger.warn(
        'EmailChannelService: SMTP_*/EMAIL_USER credentials not set — operating in dev logging mode.',
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
