import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Principal, PrincipalType } from './principal.entity';
import { LocalCredential } from './local-credential.entity';
import { ExternalIdentity, ExternalIdentityProvider } from './external-identity.entity';

@Injectable()
export class PrincipalService {
  constructor(
    @InjectRepository(Principal)
    private readonly principalRepository: Repository<Principal>,
    @InjectRepository(LocalCredential)
    private readonly localCredentialRepository: Repository<LocalCredential>,
    @InjectRepository(ExternalIdentity)
    private readonly externalIdentityRepository: Repository<ExternalIdentity>,
  ) {}

  findByEmail(email: string): Promise<Principal | null> {
    return this.principalRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<Principal | null> {
    return this.principalRepository.findOne({ where: { id } });
  }

  getLocalCredential(principalId: string): Promise<LocalCredential | null> {
    return this.localCredentialRepository.findOne({ where: { principalId } });
  }

  findByExternalIdentity(issuer: string, subject: string): Promise<Principal | null> {
    return this.externalIdentityRepository
      .findOne({ where: { issuer, subject } })
      .then((identity) => (identity ? this.findById(identity.principalId) : null));
  }

  async createLocal(data: {
    email: string;
    fullName?: string;
    passwordHash: string;
  }): Promise<Principal> {
    const principal = await this.principalRepository.save(
      this.principalRepository.create({
        principalType: 'HUMAN',
        source: 'LOCAL',
        email: data.email,
        fullName: data.fullName,
        emailVerified: false,
        status: 'ACTIVE',
      }),
    );
    await this.localCredentialRepository.save(
      this.localCredentialRepository.create({
        principalId: principal.id,
        passwordHash: data.passwordHash,
        passwordUpdatedAt: new Date(),
      }),
    );
    return principal;
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
    const principal = await this.principalRepository.save(
      this.principalRepository.create({
        principalType: 'HUMAN',
        source: data.provider,
        email: data.email,
        fullName: data.fullName,
        avatarUrl: data.avatarUrl,
        emailVerified: true,
        status: 'ACTIVE',
      }),
    );
    await this.externalIdentityRepository.save(
      this.externalIdentityRepository.create({
        principalId: principal.id,
        issuer: data.issuer,
        subject: data.subject,
        provider: data.provider,
        claimProfile: data.claimProfile ?? {},
        verificationState: 'VERIFIED',
        lastSyncedAt: new Date(),
      }),
    );
    return principal;
  }

  async recordLogin(principalId: string): Promise<void> {
    await this.principalRepository.update({ id: principalId }, { lastLoginAt: new Date() });
  }

  async markEmailVerified(principalId: string): Promise<void> {
    await this.principalRepository.update({ id: principalId }, { emailVerified: true });
  }

  async updatePassword(principalId: string, passwordHash: string): Promise<void> {
    await this.localCredentialRepository.update(
      { principalId },
      { passwordHash, passwordUpdatedAt: new Date(), failedAttempts: 0, lockedUntil: null },
    );
  }

  /** Increments the failed-attempt counter and locks the credential once a threshold is crossed by the caller. */
  async recordFailedLogin(principalId: string, lockUntil?: Date): Promise<void> {
    const credential = await this.getLocalCredential(principalId);
    if (!credential) return;
    await this.localCredentialRepository.update(
      { principalId },
      { failedAttempts: credential.failedAttempts + 1, ...(lockUntil ? { lockedUntil: lockUntil } : {}) },
    );
  }

  async resetFailedLogins(principalId: string): Promise<void> {
    await this.localCredentialRepository.update({ principalId }, { failedAttempts: 0 });
  }
}

export type { PrincipalType };
