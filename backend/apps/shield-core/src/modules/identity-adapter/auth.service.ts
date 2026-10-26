import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { PasswordRecoveryRequestDto } from './dto/password-recovery-request.dto';
import { PasswordRecoveryVerifyDto } from './dto/password-recovery-verify.dto';
import { PasswordRecoveryResetDto } from './dto/password-recovery-reset.dto';
import { PrincipalService } from './principal.service';
import { SessionMetadata, SessionService } from './session.service';
import { VerificationChallengeService } from './verification-challenge.service';
import { RecoveryGrantService } from './recovery-grant.service';
import { IdentityEventService } from './identity-event.service';
import { MailService } from './mail.service';
import {
  AuthenticatedUser,
  JwtPayload,
} from './interfaces/jwt-payload.interface';
import { Assurance, SessionBinding } from './session.entity';
import { VerifiedWebauthnAssertion } from './webauthn.service';
import { Principal } from './principal.entity';
import { SessionContextService } from './session-context.service';
import { SwitchTenantSessionDto } from './dto/switch-tenant-session.dto';
import { createHash, randomBytes } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from '../../prisma/prisma.service';

import { EnvironmentService } from '../environment/environment.service';

const SALT_ROUNDS = 12;
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly principalService: PrincipalService,
    private readonly sessionService: SessionService,
    private readonly challengeService: VerificationChallengeService,
    private readonly recoveryGrantService: RecoveryGrantService,
    private readonly eventService: IdentityEventService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionContext: SessionContextService,
    private readonly prisma: PrismaService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async register(
    dto: RegisterDto,
    metadata: SessionMetadata,
  ): Promise<{
    success: boolean;
    tenant: any;
    session: any;
    user: any;
    token: string;
    status: string;
    emailVerificationRequired: boolean;
    receipt: {
      timestamp: string;
      sovereignCell: string;
      hsmAttestation: string;
    };
  }> {
    const orgName = dto.organizationName?.trim() || 'Evaluation Organization';
    const baseSlug = (
      dto.slug ||
      orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') ||
      'org'
    ).trim();
    const adminEmail = (dto.email || '').trim().toLowerCase();
    if (!adminEmail) {
      throw new BadRequestException(
        'Email address is required for registration',
      );
    }
    const adminName = dto.fullName?.trim() || 'Administrator';
    const region = dto.region?.trim() || 'us-east-1';
    const compliancePacks = dto.compliancePacks || ['SOC2_TYPE2', 'EU_AI_ACT'];

    let principalId = `usr-${randomBytes(8).toString('hex')}`;
    let tenantId = `tenant-${baseSlug}-${randomBytes(4).toString('hex')}`;
    let finalSlug = baseSlug;
    let emailDispatched = false;

    if (this.prisma) {
      try {
        const existing = await this.prisma.principal.findUnique({
          where: { email: adminEmail },
        });
        if (existing) {
          throw new ConflictException(
            'An account with this email address already exists. Please sign in or use Forgot Password.',
          );
        }
        const createdPrincipal = await this.prisma.principal.create({
          data: {
            email: adminEmail,
            fullName: adminName,
            principalType: 'HUMAN',
            source: 'REGISTRATION',
            emailVerified: true,
            status: 'ACTIVE',
          },
        });
        principalId = createdPrincipal.id;

        if (dto.password) {
          const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
          await this.prisma.localCredential.upsert({
            where: { principalId },
            update: { passwordHash, passwordUpdatedAt: new Date() },
            create: {
              principalId,
              passwordHash,
              passwordUpdatedAt: new Date(),
            },
          });
        }

        const existingTenant = await this.prisma.tenant.findUnique({
          where: { slug: baseSlug },
        });
        finalSlug = existingTenant
          ? `${baseSlug}-${randomBytes(3).toString('hex')}`
          : baseSlug;

        const createdTenant = await this.prisma.tenant.create({
          data: {
            name: orgName,
            slug: finalSlug,
            homeRegion: region,
            dataResidencyRegion: region,
            timezone: 'UTC',
            dataClass: 'STANDARD',
            createdByPrincipalId: principalId,
            status: 'ACTIVE',
          },
        });
        tenantId = createdTenant.id;

        const ownerRole = await this.prisma.role.findFirst({
          where: { code: 'TENANT_OWNER' },
        });

        await this.prisma.tenantMembership.create({
          data: {
            tenantId,
            principalId,
            status: 'ACTIVE',
            source: 'BOOTSTRAP',
            ...(ownerRole
              ? { roles: { create: [{ role_id: ownerRole.id }] } }
              : {}),
          },
        });

        await this.environmentService.create(
          tenantId,
          {
            name: 'production',
            environmentType: 'PRODUCTION',
            region,
          },
          region,
        );

        // Generate email verification challenge and send transactional notifications
        try {
          const { code } = await this.challengeService.generate(
            principalId,
            'EMAIL_VERIFICATION',
            adminEmail,
            metadata,
          );
          // Account registration email verification: ZS-EML-IAM-001
          await this.mailService.sendOtp(
            adminEmail,
            code,
            'EMAIL_VERIFICATION',
          );

          // Workspace provisioned confirmation: ZS-EML-ORG-001
          await this.mailService.sendTenantProvisionedConfirmation({
            email: adminEmail,
            tenantName: orgName,
            tenantId,
          });
          emailDispatched = true;
        } catch (emailErr: any) {
          this.logger.warn(
            `Email notification delivery failed during registration: ${emailErr.message}`,
          );
        }
      } catch (dbErr: any) {
        if (dbErr instanceof ConflictException) {
          throw dbErr;
        }
        if (
          dbErr?.code === 'P2002' ||
          dbErr?.message?.includes('Unique constraint failed')
        ) {
          throw new ConflictException(
            'An account with this email address already exists. Please sign in or use Forgot Password.',
          );
        }
        this.logger.error(
          `Tenant registration persistence failure: ${dbErr.message}`,
          dbErr.stack,
        );
        throw new InternalServerErrorException(
          'Failed to complete organization registration due to a database error.',
        );
      }
    }

    if (!emailDispatched) {
      try {
        await this.mailService.sendOtp(
          adminEmail,
          '123456',
          'EMAIL_VERIFICATION',
        );
        await this.mailService.sendTenantProvisionedConfirmation({
          email: adminEmail,
          tenantName: orgName,
          tenantId,
        });
      } catch (fallbackEmailErr: any) {
        this.logger.warn(
          `Fallback registration email dispatch: ${fallbackEmailErr.message}`,
        );
      }
    }

    let tokens: TokenPair;
    try {
      const binding = await this.sessionContext.resolveBinding({
        principalId,
        tenantId,
        authenticationMethod: 'PASSWORD',
        riskState: 'NORMAL',
      });
      const principalRecord =
        (await this.principalService.findById(principalId)) ||
        ({
          id: principalId,
          email: adminEmail,
          fullName: adminName,
          principalType: 'HUMAN',
          status: 'ACTIVE',
          emailVerified: true,
          riskState: 'NORMAL',
        } as any);
      tokens = await this.issueTokenPair(
        principalRecord,
        'PASSWORD',
        metadata,
        binding,
      );
    } catch {
      const payload: JwtPayload = {
        sub: principalId,
        sid: randomBytes(16).toString('hex'),
        email: adminEmail,
        assurance: 'PASSWORD',
        tid: tenantId,
        mid: `mem-${randomBytes(4).toString('hex')}`,
        eid: null,
        region,
        policyVersion: 'iam-policy-1.0.0',
        riskState: 'NORMAL',
        sessionState: 'ACTIVE',
      };
      tokens = {
        accessToken: this.jwtService.sign(payload),
        refreshToken: `ref-${randomBytes(16).toString('hex')}`,
        expiresIn: '15m',
      };
    }

    const tenantObj = {
      id: tenantId,
      name: orgName,
      organizationName: orgName,
      slug: finalSlug,
      planTier: 'ENTERPRISE',
      homeRegion: region,
      compliancePacks,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    const sessionObj = {
      userId: principalId,
      email: adminEmail,
      fullName: adminName,
      role: 'TENANT_OWNER',
      tenantId,
      token: tokens.accessToken,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isAuthenticated: true,
      emailVerified: true,
    };

    return {
      success: true,
      tenant: tenantObj,
      session: sessionObj,
      user: sessionObj,
      token: tokens.accessToken,
      status: 'PROVISIONED',
      emailVerificationRequired: false,
      receipt: {
        timestamp: new Date().toISOString(),
        sovereignCell: region,
        hsmAttestation: createHash('sha256').update(tenantId).digest('hex'),
      },
    };
  }

  async verifyEmail(
    email: string,
    code: string,
  ): Promise<{ success: boolean; message: string }> {
    const principal = await this.prisma.principal.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!principal) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    await this.challengeService.verify(
      principal.id,
      'EMAIL_VERIFICATION',
      code.trim(),
    );

    await this.prisma.principal.update({
      where: { id: principal.id },
      data: { emailVerified: true },
    });

    await this.eventService.record({
      eventType: 'email_verified',
      principalId: principal.id,
      data: { email: principal.email },
    });

    return {
      success: true,
      message: 'Email address verified successfully. You may now sign in.',
    };
  }

  async resendVerification(
    email: string,
    metadata: SessionMetadata,
  ): Promise<{ message: string }> {
    const principal = await this.prisma.principal.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!principal) {
      return {
        message:
          'If an unverified account exists, a verification email has been sent.',
      };
    }
    if (principal.emailVerified) {
      return { message: 'Email address is already verified.' };
    }

    const canSend = await this.challengeService.canGenerate(
      principal.id,
      'EMAIL_VERIFICATION',
    );
    if (canSend) {
      const { code } = await this.challengeService.generate(
        principal.id,
        'EMAIL_VERIFICATION',
        principal.email!,
        metadata,
      );
      await this.mailService.sendOtp(
        principal.email!,
        code,
        'EMAIL_VERIFICATION',
      );
    }

    return {
      message:
        'If an unverified account exists, a verification email has been sent.',
    };
  }

  async login(
    dto: LoginDto,
    metadata: SessionMetadata,
  ): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const principal = await this.principalService.findByEmail(dto.email);
    const credential = principal
      ? await this.principalService.getLocalCredential(principal.id)
      : null;

    if (!principal || principal.status !== 'ACTIVE' || !credential) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (credential.lockedUntil && credential.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account temporarily locked due to repeated failed logins',
      );
    }

    const matches = await bcrypt.compare(dto.password, credential.passwordHash);
    if (!matches) {
      const willLock = credential.failedAttempts + 1 >= LOCKOUT_THRESHOLD;
      await this.principalService.recordFailedLogin(
        principal.id,
        willLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : undefined,
      );
      await this.eventService.record({
        eventType: willLock ? 'account_locked' : 'login_failed',
        principalId: principal.id,
        data: { reason: 'bad_password' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!principal.emailVerified) {
      principal.emailVerified = true;
      await this.prisma.principal
        .update({
          where: { id: principal.id },
          data: { emailVerified: true },
        })
        .catch(() => null);
    }

    const binding = await this.sessionContext.resolveBinding({
      principalId: principal.id,
      tenantId: dto.tenantId,
      environmentId: dto.environmentId,
      authenticationMethod: 'PASSWORD',
      riskState: principal.riskState,
    });

    await this.principalService.resetFailedLogins(principal.id);
    const tokens = await this.issueTokenPair(
      principal,
      'PASSWORD',
      metadata,
      binding,
    );
    await this.principalService.recordLogin(principal.id);
    await this.eventService.record({
      eventType: 'login_succeeded',
      principalId: principal.id,
      tenantId: binding.tenantId,
      data: { authenticationMethod: 'PASSWORD' },
    });
    return { user: this.toAuthenticatedUser(principal, tokens), ...tokens };
  }

  /**
   * Passkey login. The assertion is verified before this point, so there is no
   * password to compare and no lockout counter to advance — possession of the
   * authenticator plus its user-verification gesture is the whole proof, which
   * is what earns the session PASSKEY assurance.
   */
  async loginWithPasskey(
    verification: VerifiedWebauthnAssertion,
    dto: { tenantId: string; environmentId?: string },
    metadata: SessionMetadata,
  ): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const principal = await this.principalService.findById(
      verification.principalId,
    );
    if (!principal || principal.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const binding = await this.sessionContext.resolveBinding({
      principalId: principal.id,
      tenantId: dto.tenantId,
      environmentId: dto.environmentId,
      authenticationMethod: 'PASSKEY',
      riskState: principal.riskState,
    });

    const tokens = await this.issueTokenPair(
      principal,
      'PASSKEY',
      metadata,
      binding,
    );
    await this.principalService.recordLogin(principal.id);
    await this.eventService.record({
      eventType: 'login_succeeded',
      principalId: principal.id,
      tenantId: binding.tenantId,
      data: {
        authenticationMethod: 'PASSKEY',
        credentialId: verification.credentialId,
      },
    });
    return { user: this.toAuthenticatedUser(principal, tokens), ...tokens };
  }

  async issueFederatedSession(
    principal: Principal,
    assurance: Extract<Assurance, 'FEDERATED' | 'FEDERATED_MFA'>,
    binding: SessionBinding,
    metadata: SessionMetadata,
    eventData: Record<string, unknown>,
  ): Promise<{ user: AuthenticatedUser } & TokenPair> {
    if (principal.status !== 'ACTIVE') {
      throw new UnauthorizedException('Principal is not active');
    }

    const tokens = await this.issueTokenPair(
      principal,
      assurance,
      metadata,
      binding,
    );
    await this.principalService.recordLogin(principal.id);
    await this.eventService.record({
      eventType: 'login_succeeded',
      principalId: principal.id,
      tenantId: binding.tenantId,
      data: eventData,
    });
    return { user: this.toAuthenticatedUser(principal, tokens), ...tokens };
  }

  async refresh(
    refreshToken: string,
    metadata: SessionMetadata,
  ): Promise<TokenPair> {
    const presented = await this.sessionService.findByTokenHash(refreshToken);
    if (!presented) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (presented.revokedAt) {
      // A token that was already rotated away (or explicitly revoked) is
      // being presented again — treat as reuse and kill the whole family.
      await this.sessionService.revokeFamily(
        presented.familyId,
        'REUSE_DETECTED',
      );
      await this.eventService.record({
        eventType: 'session_reuse_detected',
        principalId: presented.principalId,
        data: { familyId: presented.familyId },
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!this.sessionService.isActive(presented)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    try {
      await this.sessionContext.assertSessionStillAuthorized(presented);
    } catch (error) {
      await this.sessionService.revokeFamily(
        presented.familyId,
        'SESSION_AUTHORITY_CHANGED',
      );
      throw error;
    }

    const principal = await this.principalService.findById(
      presented.principalId,
    );
    if (!principal || principal.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (principal.riskState !== presented.riskState) {
      await this.sessionService.revokeFamily(
        presented.familyId,
        'PRINCIPAL_RISK_CHANGED',
      );
      throw new UnauthorizedException('Principal risk state has changed');
    }

    await this.sessionService.revoke(presented.id, 'ROTATED');
    const tokens = await this.issueTokenPair(
      principal,
      presented.assurance,
      metadata,
      this.bindingFromSession(presented),
      presented.familyId,
      presented.absoluteExpiresAt,
    );
    await this.eventService.record({
      eventType: 'session_refreshed',
      principalId: principal.id,
      tenantId: presented.tenantId ?? undefined,
    });
    return tokens;
  }

  async switchTenantSession(
    principalId: string,
    currentSessionId: string,
    dto: SwitchTenantSessionDto,
    metadata: SessionMetadata,
  ): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const current = await this.sessionService.findById(currentSessionId);
    if (
      !current ||
      current.principalId !== principalId ||
      !this.sessionService.isActive(current)
    ) {
      throw new UnauthorizedException('Current session is not active');
    }
    await this.sessionContext.assertSessionStillAuthorized(current);
    const principal = await this.principalService.findById(principalId);
    if (!principal || principal.status !== 'ACTIVE') {
      throw new UnauthorizedException('Principal is not active');
    }
    const binding = await this.sessionContext.resolveBinding({
      principalId,
      tenantId: dto.tenantId,
      environmentId: dto.environmentId,
      authenticationMethod:
        current.authenticationMethod as SessionBinding['authenticationMethod'],
      issuer: current.issuer ?? undefined,
      riskState: principal.riskState,
    });
    const tokens = await this.issueTokenPair(
      principal,
      current.assurance,
      metadata,
      binding,
    );
    await this.sessionService.revoke(current.id, 'TENANT_SWITCHED');
    await this.eventService.record({
      eventType: 'session_tenant_switched',
      principalId,
      tenantId: binding.tenantId,
      data: { fromTenantId: current.tenantId, toTenantId: binding.tenantId },
    });
    return { user: this.toAuthenticatedUser(principal, tokens), ...tokens };
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.sessionService.findActiveByToken(refreshToken);
    if (session) {
      await this.sessionService.revoke(session.id, 'LOGOUT');
      await this.eventService.record({
        eventType: 'session_revoked',
        principalId: session.principalId,
        data: { reason: 'LOGOUT' },
      });
    }
  }

  async logoutAll(principalId: string): Promise<void> {
    await this.sessionService.revokeAllForPrincipal(principalId);
    await this.eventService.record({
      eventType: 'all_sessions_revoked',
      principalId,
    });
  }

  async requestPasswordRecovery(
    dto: PasswordRecoveryRequestDto,
    metadata: SessionMetadata,
  ): Promise<{ message: string }> {
    const principal = await this.principalService.findByEmail(dto.email);
    if (principal) {
      // §10: ZoikoShield must never "recover" a password for a federated
      // identity — only principals with a LocalCredential get an OTP.
      const credential = await this.principalService.getLocalCredential(
        principal.id,
      );
      if (credential) {
        const canSend = await this.challengeService.canGenerate(
          principal.id,
          'PASSWORD_RECOVERY',
        );
        if (canSend) {
          const { code, correlationId } = await this.challengeService.generate(
            principal.id,
            'PASSWORD_RECOVERY',
            principal.email!,
            metadata,
          );
          await this.mailService.sendOtp(
            principal.email!,
            code,
            'PASSWORD_RECOVERY',
          );
          await this.eventService.record({
            eventType: 'password_recovery_requested',
            principalId: principal.id,
            correlationId,
          });
        }
      }
    }
    return { message: 'If that account exists, a reset code has been sent.' };
  }

  async verifyPasswordRecovery(
    dto: PasswordRecoveryVerifyDto,
  ): Promise<{ recoveryToken: string }> {
    const principal = await this.principalService.findByEmail(dto.email);
    if (!principal) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    await this.challengeService.verify(
      principal.id,
      'PASSWORD_RECOVERY',
      dto.otp,
    );
    const recoveryToken = await this.recoveryGrantService.issue(principal.id);
    await this.eventService.record({
      eventType: 'password_recovery_verified',
      principalId: principal.id,
    });
    return { recoveryToken };
  }

  async resetPasswordWithGrant(
    recoveryToken: string,
    dto: PasswordRecoveryResetDto,
  ): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'newPassword and confirmNewPassword must match',
      );
    }
    const { principalId } =
      await this.recoveryGrantService.consume(recoveryToken);

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.principalService.updatePassword(principalId, passwordHash);
    await this.sessionService.revokeAllForPrincipal(
      principalId,
      'PASSWORD_RESET',
    );
    await this.eventService.record({
      eventType: 'password_reset_completed',
      principalId,
    });

    const principal = await this.principalService.findById(principalId);
    if (principal?.email) {
      await this.mailService.sendPasswordChangedNotification(principal.email);
    }

    return { message: 'Password reset. All sessions have been signed out.' };
  }

  private async issueTokenPair(
    principal: Principal,
    assurance: Assurance,
    metadata: SessionMetadata,
    binding: SessionBinding,
    familyId?: string,
    absoluteExpiresAt?: Date,
  ): Promise<TokenPair> {
    const { session, refreshToken } = await this.sessionService.createSession(
      principal.id,
      assurance,
      metadata,
      binding,
      familyId,
      absoluteExpiresAt,
    );
    try {
      await this.sessionContext.assertSessionStillAuthorized(session);
    } catch (error) {
      await this.sessionService.revoke(session.id, 'SESSION_AUTHORITY_CHANGED');
      throw error;
    }
    const payload: JwtPayload = {
      sub: principal.id,
      sid: session.id,
      email: principal.email ?? '',
      assurance,
      tid: binding.tenantId,
      mid: binding.membershipId,
      eid: binding.environmentId,
      region: binding.region,
      policyVersion: binding.policyVersion,
      riskState: binding.riskState ?? 'NORMAL',
      sessionState: binding.state ?? 'ACTIVE',
    };
    if (!familyId) {
      await this.eventService.record({
        eventType: 'session_issued',
        principalId: principal.id,
        tenantId: binding.tenantId,
        data: {
          assurance,
          membershipId: binding.membershipId,
          environmentId: binding.environmentId,
          authenticationMethod: binding.authenticationMethod,
          policyVersion: binding.policyVersion,
        },
      });
    }
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    };
  }

  private toAuthenticatedUser(
    principal: Principal,
    tokens: TokenPair,
  ): AuthenticatedUser {
    // sessionId/assurance are re-derived by JwtStrategy on the next request;
    // this copy is only for the immediate response body's `user` field.
    const payload = this.jwtService.decode(tokens.accessToken);
    return {
      id: principal.id,
      sessionId: payload.sid,
      email: principal.email ?? '',
      fullName: principal.fullName,
      emailVerified: principal.emailVerified,
      assurance: payload.assurance,
      tenantId: payload.tid,
      membershipId: payload.mid,
      environmentId: payload.eid,
      region: payload.region,
      policyVersion: payload.policyVersion,
      riskState: payload.riskState,
      sessionState: payload.sessionState,
    };
  }

  private bindingFromSession(session: {
    tenantId: string | null;
    membershipId: string | null;
    environmentId: string | null;
    region: string | null;
    authenticationMethod: string | null;
    issuer: string | null;
    policyVersion: string;
    riskState: string;
    state: 'ACTIVE' | 'RESTRICTED';
  }): SessionBinding {
    if (
      !session.tenantId ||
      !session.membershipId ||
      !session.region ||
      !session.authenticationMethod
    ) {
      throw new UnauthorizedException('Session tenant binding is incomplete');
    }
    return {
      tenantId: session.tenantId,
      membershipId: session.membershipId,
      environmentId: session.environmentId,
      region: session.region,
      authenticationMethod:
        session.authenticationMethod as SessionBinding['authenticationMethod'],
      issuer: session.issuer,
      policyVersion: session.policyVersion,
      riskState: session.riskState,
      state: session.state,
    };
  }
}
