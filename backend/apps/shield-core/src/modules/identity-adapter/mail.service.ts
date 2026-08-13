import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { ChallengePurpose } from './verification-challenge.entity';

const OTP_SUBJECT: Record<ChallengePurpose, string> = {
  EMAIL_VERIFICATION: 'Verify your ZoikoShield email',
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
}
