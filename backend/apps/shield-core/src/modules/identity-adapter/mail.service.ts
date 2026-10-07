import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { ChallengePurpose } from './verification-challenge.entity';
import { TransactionalEmailService } from '../notification/transactional-email.service';

const OTP_SUBJECT: Record<ChallengePurpose, string> = {
  PASSWORD_RECOVERY: 'Reset your ZoikoShield password',
};

/**
 * Enterprise Identity & Access Mail Service (ZS-EML-TPL-001 v2.0)
 * Uses TransactionalEmailService with ZS-EML-IAM-005 & ZS-EML-ORG-002 production templates.
 * Falls back to SMTP or console logging for local/air-gapped development.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress = '';

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly transactionalEmailService?: TransactionalEmailService,
  ) {}

  onModuleInit(): void {
    const user = this.configService.get<string>('EMAIL_USER');
    const appPassword = this.configService.get<string>('EMAIL_APP_PASSWORD');

    if (!user || !appPassword) {
      this.logger.warn(
        'EMAIL_USER/EMAIL_APP_PASSWORD not set — OTP codes will be logged or handled via notification engine.',
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
    if (this.transactionalEmailService) {
      try {
        await this.transactionalEmailService.dispatchTransactionalEmail({
          tenantId: 'identity-service',
          templateKey: 'ZS-EML-IAM-005',
          recipients: [{ email, name: email.split('@')[0] }],
          variables: {
            referenceId: `otp-${Date.now().toString(36)}`,
            statusLabel: 'PASSWORD_RESET_REQUESTED',
            token_expires_at_local: '10 minutes',
            password_reset_url: `https://app.zoikoshield.com/login?otp=${encodeURIComponent(code)}`,
          },
        });
        return;
      } catch (err: any) {
        this.logger.debug(`Transactional email engine fallback: ${err.message}`);
      }
    }

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

    if (this.transactionalEmailService) {
      try {
        await this.transactionalEmailService.dispatchTransactionalEmail({
          tenantId: input.tenantName,
          templateKey: 'ZS-EML-ORG-002',
          recipients: [{ email: input.email, name: input.email.split('@')[0] }],
          variables: {
            organization_name: input.tenantName,
            inviter_display_name: 'Zoiko Shield Onboarding Command',
            invited_role_label: 'Organization Owner',
            referenceId: `inv-${Date.now().toString(36)}`,
            statusLabel: 'INVITATION_SENT',
            invitation_expires_at_local: input.expiresAt.toISOString(),
            invitation_url: activationUrl,
          },
        });
        return activationUrl;
      } catch (err: any) {
        this.logger.debug(`Transactional invitation engine fallback: ${err.message}`);
      }
    }

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

