import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { OtpCode, OtpPurpose } from './otp-code.entity';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OtpCode)
    private readonly otpRepository: Repository<OtpCode>,
  ) {}

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  async generate(userId: string, purpose: OtpPurpose): Promise<string> {
    await this.otpRepository.delete({ userId, purpose, consumedAt: IsNull() });

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otp = this.otpRepository.create({
      userId,
      purpose,
      codeHash: this.hashCode(code),
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      consumedAt: null,
    });
    await this.otpRepository.save(otp);
    return code;
  }

  async verify(userId: string, purpose: OtpPurpose, code: string): Promise<void> {
    const otp = await this.otpRepository.findOne({
      where: { userId, purpose, consumedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });

    if (!otp) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many attempts, request a new code');
    }

    if (otp.codeHash !== this.hashCode(code)) {
      await this.otpRepository.update({ id: otp.id }, { attempts: otp.attempts + 1 });
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.otpRepository.update({ id: otp.id }, { consumedAt: new Date() });
  }
}
