import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { RecoveryGrant } from './recovery-grant.entity';

const RECOVERY_GRANT_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class RecoveryGrantService {
  constructor(
    @InjectRepository(RecoveryGrant)
    private readonly recoveryGrantRepository: Repository<RecoveryGrant>,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(principalId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.recoveryGrantRepository.save(
      this.recoveryGrantRepository.create({
        principalId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + RECOVERY_GRANT_TTL_MS),
        consumedAt: null,
      }),
    );
    return token;
  }

  /** Validates and consumes the grant in one step — single use. */
  async consume(token: string): Promise<{ principalId: string }> {
    const grant = await this.recoveryGrantRepository.findOne({
      where: { tokenHash: this.hashToken(token), consumedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
    if (!grant) {
      throw new UnauthorizedException('Invalid or expired recovery grant');
    }
    await this.recoveryGrantRepository.update({ id: grant.id }, { consumedAt: new Date() });
    return { principalId: grant.principalId };
  }
}
