import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { Session } from './session.entity';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionMetadata {
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(userId: string, metadata: SessionMetadata): Promise<{ session: Session; refreshToken: string }> {
    const refreshToken = randomBytes(48).toString('hex');
    const session = this.sessionRepository.create({
      userId,
      refreshTokenHash: this.hashToken(refreshToken),
      deviceName: metadata.deviceName,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
    });
    await this.sessionRepository.save(session);
    return { session, refreshToken };
  }

  async findActiveByToken(refreshToken: string): Promise<Session | null> {
    const session = await this.sessionRepository.findOne({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }
    return session;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.sessionRepository.update({ id: sessionId }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessionRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
