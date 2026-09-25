import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChallengePurpose } from './verification-challenge.entity';

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

export interface ChallengeRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class VerificationChallengeService {
  constructor(private readonly prisma: PrismaService) {}

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** True if a new challenge may be generated now (resend cooldown has elapsed). */
  async canGenerate(
    principalId: string,
    purpose: ChallengePurpose,
  ): Promise<boolean> {
    const latest = await this.prisma.verificationChallenge.findFirst({
      where: { principalId, purpose },
      orderBy: { createdAt: 'desc' },
    });
    return !latest || latest.resendAfter <= new Date();
  }

  async generate(
    principalId: string,
    purpose: ChallengePurpose,
    destination: string,
    metadata: ChallengeRequestMetadata = {},
  ): Promise<{ code: string; correlationId: string }> {
    await this.prisma.verificationChallenge.updateMany({
      where: { principalId, purpose, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const correlationId = randomUUID();
    const now = Date.now();
    await this.prisma.verificationChallenge.create({
      data: {
        principalId,
        purpose,
        destination,
        secretHash: this.hashCode(code),
        attemptCount: 0,
        maxAttempts: MAX_ATTEMPTS,
        resendAfter: new Date(now + RESEND_COOLDOWN_MS),
        expiresAt: new Date(now + CHALLENGE_TTL_MS),
        consumedAt: null,
        status: 'PENDING',
        correlationId,
        requestIp: metadata.ipAddress,
        requestUserAgent: metadata.userAgent,
      },
    });
    return { code, correlationId };
  }

  async verify(
    principalId: string,
    purpose: ChallengePurpose,
    code: string,
  ): Promise<void> {
    const challenge = await this.prisma.verificationChallenge.findFirst({
      where: {
        principalId,
        purpose,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (challenge.secretHash !== this.hashCode(code)) {
      const attemptCount = challenge.attemptCount + 1;
      const locked = attemptCount >= challenge.maxAttempts;
      await this.prisma.verificationChallenge.updateMany({
        where: { id: challenge.id },
        data: { attemptCount, status: locked ? 'LOCKED' : 'PENDING' },
      });
      throw new UnauthorizedException(
        locked
          ? 'Too many attempts, request a new code'
          : 'Invalid or expired code',
      );
    }

    await this.prisma.verificationChallenge.updateMany({
      where: { id: challenge.id },
      data: { consumedAt: new Date(), status: 'CONSUMED' },
    });
  }
}
