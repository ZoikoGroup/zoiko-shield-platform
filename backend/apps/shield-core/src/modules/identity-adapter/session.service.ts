import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { Assurance, Session, SessionBinding } from './session.entity';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, rolling
const ABSOLUTE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, hard ceiling regardless of activity

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

  async createSession(
    principalId: string,
    assurance: Assurance,
    metadata: SessionMetadata,
    binding: SessionBinding,
    familyId?: string,
    absoluteExpiresAt?: Date,
  ): Promise<{ session: Session; refreshToken: string }> {
    const refreshToken = randomBytes(48).toString('hex');
    const now = Date.now();
    const session = this.sessionRepository.create({
      principalId,
      assurance,
      tenantId: binding.tenantId,
      membershipId: binding.membershipId,
      environmentId: binding.environmentId,
      region: binding.region,
      authenticationMethod: binding.authenticationMethod,
      issuer: binding.issuer ?? null,
      policyVersion: binding.policyVersion,
      riskState: binding.riskState ?? 'NORMAL',
      state: binding.state ?? 'ACTIVE',
      refreshTokenHash: this.hashToken(refreshToken),
      familyId: familyId ?? randomUUID(),
      deviceName: metadata.deviceName,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
      absoluteExpiresAt:
        absoluteExpiresAt ?? new Date(now + ABSOLUTE_SESSION_TTL_MS),
      revokedAt: null,
      revokedReason: null,
    });
    await this.sessionRepository.save(session);
    return { session, refreshToken };
  }

  findById(sessionId: string): Promise<Session | null> {
    return this.sessionRepository.findOne({ where: { id: sessionId } });
  }

  /** Any session matching this token hash, active or not — used to detect refresh-token reuse. */
  findByTokenHash(refreshToken: string): Promise<Session | null> {
    return this.sessionRepository.findOne({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
    });
  }

  async findActiveByToken(refreshToken: string): Promise<Session | null> {
    const session = await this.findByTokenHash(refreshToken);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.absoluteExpiresAt < new Date()
    ) {
      return null;
    }
    return session;
  }

  isActive(session: Session): boolean {
    return (
      !session.revokedAt &&
      session.expiresAt >= new Date() &&
      session.absoluteExpiresAt >= new Date()
    );
  }

  async revoke(sessionId: string, reason = 'LOGOUT'): Promise<void> {
    await this.sessionRepository.update(
      { id: sessionId },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.sessionRepository.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async revokeAllForPrincipal(
    principalId: string,
    reason = 'LOGOUT_ALL',
  ): Promise<void> {
    await this.sessionRepository.update(
      { principalId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async revokeForPrincipalTenant(
    principalId: string,
    tenantId: string,
    reason = 'DELEGATED_AUTHORITY_CHANGED',
  ): Promise<void> {
    await this.sessionRepository.update(
      { principalId, tenantId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async revokeForMembership(
    membershipId: string,
    reason = 'MEMBERSHIP_CHANGED',
  ): Promise<void> {
    await this.sessionRepository.update(
      { membershipId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async revokeForTenant(
    tenantId: string,
    reason = 'TENANT_CONFIGURATION_CHANGED',
  ): Promise<void> {
    await this.sessionRepository.update(
      { tenantId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }
}
