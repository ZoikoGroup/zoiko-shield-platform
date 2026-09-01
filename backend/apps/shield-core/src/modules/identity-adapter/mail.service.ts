import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { ChallengePurpose } from './verification-challenge.entity';

const OTP_SUBJECT: Record<ChallengePurpose, string> = {
  PASSWORD_RECOVERY: 'Reset your ZoikoShield password',
};

/**
 * Stand-in for the spec's `notification` module (not built yet). Sends via
 * Gmail SMTP when EMAIL_USER/EMAIL_APP_PASSWORD are set; otherwise logs the
 * code so local dev without SMTP credentials still works.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress = '';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const user = this.configService.get<string>('EMAIL_USER');
    const appPassword = this.configService.get<string>('EMAIL_APP_PASSWORD');

    if (!user || !appPassword) {
      this.logger.warn(
        'EMAIL_USER/EMAIL_APP_PASSWORD not set — OTP codes will be logged, not emailed.',
      );
      return;
    }

    this.fromAddress = user;
    this.transporter = createTransport({
      service: 'gmail',
      auth: { user, pass: appPassword },
    });
  }

  async sendOtp(
    email: string,
    code: string,
    purpose: ChallengePurpose,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `OTP for ${email} [${purpose}]: ${code} (valid 10 minutes)`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: email,
      subject: OTP_SUBJECT[purpose],
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    });
  }

  async sendOwnerInvitation(input: {
    email: string;
    tenantName: string;
    token: string;
    expiresAt: Date;
  }): Promise<string> {
    const appBaseUrl = this.configService
      .get<string>('APP_BASE_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    const activationUrl = `${appBaseUrl}/accept-invite?token=${encodeURIComponent(input.token)}`;

    if (!this.transporter) {
      this.logger.log(
        `Owner activation for ${input.email} (${input.tenantName}): ${activationUrl} (expires ${input.expiresAt.toISOString()})`,
      );
      return activationUrl;
    }

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: input.email,
      subject: `Activate your ${input.tenantName} ZoikoShield account`,
      text: [
        `You have been invited to activate the ZoikoShield tenant ${input.tenantName}.`,
        `Open this single-use link, accept the access disclosure, and authenticate with ZoikoID: ${activationUrl}`,
        `The link expires at ${input.expiresAt.toISOString()}.`,
        'If you were not expecting this invitation, do not use the link.',
      ].join('\n\n'),
    });

    return activationUrl;
  }
}
