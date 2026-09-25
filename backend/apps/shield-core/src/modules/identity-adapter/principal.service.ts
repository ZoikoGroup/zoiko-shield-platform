import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Principal, PrincipalType } from './principal.entity';
import type { LocalCredential } from './local-credential.entity';
import type { ExternalIdentityProvider } from './external-identity.entity';

@Injectable()
export class PrincipalService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<Principal | null> {
    return (await this.prisma.principal.findUnique({
      where: { email },
    })) as Principal | null;
  }

  async findById(id: string): Promise<Principal | null> {
    return (await this.prisma.principal.findUnique({
      where: { id },
    })) as Principal | null;
  }

  getLocalCredential(principalId: string): Promise<LocalCredential | null> {
    return this.prisma.localCredential.findUnique({ where: { principalId } });
  }

  findByExternalIdentity(
    issuer: string,
    subject: string,
  ): Promise<Principal | null> {
    return this.prisma.externalIdentity
      .findUnique({ where: { issuer_subject: { issuer, subject } } })
      .then((identity) =>
        identity ? this.findById(identity.principalId) : null,
      );
  }

  async createFederated(data: {
    email: string;
    fullName?: string;
    avatarUrl?: string;
    provider: ExternalIdentityProvider;
    issuer: string;
    subject: string;
    claimProfile?: Record<string, unknown>;
  }): Promise<Principal> {
    const principal = (await this.prisma.principal.create({
      data: {
        principalType: 'HUMAN',
        source: data.provider,
        email: data.email,
        fullName: data.fullName,
        avatarUrl: data.avatarUrl,
        emailVerified: true,
        status: 'ACTIVE',
      },
    })) as Principal;
    await this.prisma.externalIdentity.create({
      data: {
        principalId: principal.id,
        issuer: data.issuer,
        subject: data.subject,
        provider: data.provider,
        claimProfile: (data.claimProfile ?? {}) as Prisma.InputJsonValue,
        verificationState: 'VERIFIED',
        lastSyncedAt: new Date(),
      },
    });
    return principal;
  }

  async recordLogin(principalId: string): Promise<void> {
    await this.prisma.principal.updateMany({
      where: { id: principalId },
      data: { lastLoginAt: new Date() },
    });
  }

  async updatePassword(
    principalId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.localCredential.updateMany({
      where: { principalId },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  /** Increments the failed-attempt counter and locks the credential once a threshold is crossed by the caller. */
  async recordFailedLogin(
    principalId: string,
    lockUntil?: Date,
  ): Promise<void> {
    const credential = await this.getLocalCredential(principalId);
    if (!credential) return;
    await this.prisma.localCredential.updateMany({
      where: { principalId },
      data: {
        failedAttempts: credential.failedAttempts + 1,
        ...(lockUntil ? { lockedUntil: lockUntil } : {}),
      },
    });
  }

  async resetFailedLogins(principalId: string): Promise<void> {
    await this.prisma.localCredential.updateMany({
      where: { principalId },
      data: { failedAttempts: 0 },
    });
  }
}

export type { PrincipalType };
