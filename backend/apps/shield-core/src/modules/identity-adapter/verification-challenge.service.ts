import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt, randomUUID } from 'crypto';
import { MoreThan, Repository } from 'typeorm';
import {
  ChallengePurpose,
  VerificationChallenge,
} from './verification-challenge.entity';

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

export interface ChallengeRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class VerificationChallengeService {
  constructor(
    @InjectRepository(VerificationChallenge)
    private readonly challengeRepository: Repository<VerificationChallenge>,
  ) {}

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** True if a new challenge may be generated now (resend cooldown has elapsed). */
  async canGenerate(
    principalId: string,
    purpose: ChallengePurpose,
  ): Promise<boolean> {
    const latest = await this.challengeRepository.findOne({
      where: { principalId, purpose },
      order: { createdAt: 'DESC' },
    });
    return !latest || latest.resendAfter <= new Date();
  }

  async generate(
    principalId: string,
    purpose: ChallengePurpose,
    destination: string,
    metadata: ChallengeRequestMetadata = {},
  ): Promise<{ code: string; correlationId: string }> {
    await this.challengeRepository.update(
      { principalId, purpose, status: 'PENDING' },
      { status: 'EXPIRED' },
    );

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const correlationId = randomUUID();
    const now = Date.now();
    const challenge = this.challengeRepository.create({
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
    });
    await this.challengeRepository.save(challenge);
    return { code, correlationId };
  }

  async verify(
    principalId: string,
    purpose: ChallengePurpose,
    code: string,
  ): Promise<void> {
    const challenge = await this.challengeRepository.findOne({
      where: {
        principalId,
        purpose,
        status: 'PENDING',
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!challenge) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (challenge.secretHash !== this.hashCode(code)) {
      const attemptCount = challenge.attemptCount + 1;
      const locked = attemptCount >= challenge.maxAttempts;
      await this.challengeRepository.update(
        { id: challenge.id },
        { attemptCount, status: locked ? 'LOCKED' : 'PENDING' },
      );
      throw new UnauthorizedException(
        locked
          ? 'Too many attempts, request a new code'
          : 'Invalid or expired code',
      );
    }

    await this.challengeRepository.update(
      { id: challenge.id },
      { consumedAt: new Date(), status: 'CONSUMED' },
    );
  }
}
