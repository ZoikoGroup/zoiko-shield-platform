import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const RECOVERY_GRANT_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class RecoveryGrantService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(principalId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.prisma.recoveryGrant.create({
      data: {
        principalId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + RECOVERY_GRANT_TTL_MS),
        consumedAt: null,
      },
    });
    return token;
  }

  /** Validates and consumes the grant in one step — single use. */
  async consume(token: string): Promise<{ principalId: string }> {
    const grant = await this.prisma.recoveryGrant.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!grant) {
      throw new UnauthorizedException('Invalid or expired recovery grant');
    }
    await this.prisma.recoveryGrant.updateMany({
      where: { id: grant.id },
      data: { consumedAt: new Date() },
    });
    return { principalId: grant.principalId };
  }
}
