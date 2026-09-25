import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { Assurance, Session, SessionBinding } from './session.entity';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, rolling
const ABSOLUTE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, hard ceiling regardless of activity

export interface SessionMetadata {
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

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
    const session = (await this.prisma.session.create({
      data: {
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
      },
    })) as Session;
    return { session, refreshToken };
  }

  async findById(sessionId: string): Promise<Session | null> {
    return (await this.prisma.session.findUnique({
      where: { id: sessionId },
    })) as Session | null;
  }

  /** Any session matching this token hash, active or not — used to detect refresh-token reuse. */
  async findByTokenHash(refreshToken: string): Promise<Session | null> {
    return (await this.prisma.session.findFirst({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
    })) as Session | null;
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
    await this.prisma.session.updateMany({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForPrincipal(
    principalId: string,
    reason = 'LOGOUT_ALL',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { principalId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeForPrincipalTenant(
    principalId: string,
    tenantId: string,
    reason = 'DELEGATED_AUTHORITY_CHANGED',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { principalId, tenantId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeForMembership(
    membershipId: string,
    reason = 'MEMBERSHIP_CHANGED',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { membershipId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeForTenant(
    tenantId: string,
    reason = 'TENANT_CONFIGURATION_CHANGED',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tenantId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
