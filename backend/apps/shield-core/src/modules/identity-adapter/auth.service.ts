import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
import { Principal } from './principal.entity';
import { SessionContextService } from './session-context.service';
import { SwitchTenantSessionDto } from './dto/switch-tenant-session.dto';

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
  ) {}

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
      throw new ForbiddenException('Email not verified');
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
