import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { PasswordRecoveryRequestDto } from './dto/password-recovery-request.dto';
import { PasswordRecoveryVerifyDto } from './dto/password-recovery-verify.dto';
import { PasswordRecoveryResetDto } from './dto/password-recovery-reset.dto';
import { PrincipalService } from './principal.service';
import { SessionMetadata, SessionService } from './session.service';
import { VerificationChallengeService } from './verification-challenge.service';
import { RecoveryGrantService } from './recovery-grant.service';
import { PolicyService } from './policy.service';
import { IdentityEventService } from './identity-event.service';
import { MailService } from './mail.service';
import { AuthenticatedUser, JwtPayload } from './interfaces/jwt-payload.interface';
import { Assurance } from './session.entity';
import { ExternalIdentityProvider } from './external-identity.entity';
import { Principal } from './principal.entity';

const SALT_ROUNDS = 12;
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface OAuthAssertion {
  issuer: string;
  subject: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  claimProfile?: Record<string, unknown>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly principalService: PrincipalService,
    private readonly sessionService: SessionService,
    private readonly challengeService: VerificationChallengeService,
    private readonly recoveryGrantService: RecoveryGrantService,
    private readonly policyService: PolicyService,
    private readonly eventService: IdentityEventService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private localRegistrationEnabled(): boolean {
    return this.configService.get<string>('LOCAL_REGISTRATION_ENABLED', 'true') !== 'false';
  }

  async register(dto: RegisterDto, metadata: SessionMetadata): Promise<{ principalId: string; email: string; message: string }> {
    if (!this.localRegistrationEnabled()) {
      throw new ForbiddenException('Local password registration is not enabled');
    }
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('password and confirmPassword must match');
    }

    const activeTerms = await this.policyService.findActive('TERMS_OF_SERVICE');
    if (!activeTerms || activeTerms.version !== dto.termsOfServiceVersion) {
      throw new BadRequestException(
        `termsOfServiceVersion must match the currently active version${activeTerms ? ` (${activeTerms.version})` : ''}`,
      );
    }

    const existing = await this.principalService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A principal with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const principal = await this.principalService.createLocal({
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
    });

    await this.policyService.recordAcceptance(principal.id, activeTerms.id, metadata);
    await this.eventService.record({
      eventType: 'principal_created',
      principalId: principal.id,
      data: { source: 'LOCAL' },
    });
    await this.sendVerificationChallenge(principal, metadata);

    return {
      principalId: principal.id,
      email: principal.email!,
      message: 'Registered. Check your email for a verification code.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto, metadata: SessionMetadata): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const principal = await this.principalService.findByEmail(dto.email);
    if (!principal) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.challengeService.verify(principal.id, 'EMAIL_VERIFICATION', dto.otp);
    await this.principalService.markEmailVerified(principal.id);
    principal.emailVerified = true;

    await this.eventService.record({ eventType: 'email_verified', principalId: principal.id });
    await this.principalService.recordLogin(principal.id);
    const tokens = await this.issueTokenPair(principal, 'PASSWORD', metadata);
    return { user: this.toAuthenticatedUser(principal, tokens), ...tokens };
  }

  async resendVerification(dto: ResendVerificationDto, metadata: SessionMetadata): Promise<{ message: string }> {
    const principal = await this.principalService.findByEmail(dto.email);
    if (principal && !principal.emailVerified) {
      const canSend = await this.challengeService.canGenerate(principal.id, 'EMAIL_VERIFICATION');
      if (canSend) {
        await this.sendVerificationChallenge(principal, metadata);
      }
    }
    return { message: 'If that account needs verification, a new code has been sent.' };
  }

  async login(dto: LoginDto, metadata: SessionMetadata): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const principal = await this.principalService.findByEmail(dto.email);
    const credential = principal ? await this.principalService.getLocalCredential(principal.id) : null;

    if (!principal || principal.status !== 'ACTIVE' || !credential) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (credential.lockedUntil && credential.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked due to repeated failed logins');
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

    await this.principalService.resetFailedLogins(principal.id);
    await this.principalService.recordLogin(principal.id);
    await this.eventService.record({ eventType: 'login_succeeded', principalId: principal.id });
    const tokens = await this.issueTokenPair(principal, 'PASSWORD', metadata);
    return { user: this.toAuthenticatedUser(principal, tokens), ...tokens };
  }

  async loginWithOAuthAssertion(
    provider: ExternalIdentityProvider,
    assertion: OAuthAssertion,
    metadata: SessionMetadata,
  ): Promise<{ user: AuthenticatedUser } & TokenPair> {
    let principal = await this.principalService.findByExternalIdentity(assertion.issuer, assertion.subject);
    let created = false;
    if (!principal) {
      // Deliberately does NOT fall back to email lookup — see IAM Spec §8.2:
      // account linking by email alone is prohibited. A different principal
      // is created even if a LOCAL account shares this email address.
      principal = await this.principalService.createFederated({
        email: assertion.email,
        fullName: assertion.fullName,
        avatarUrl: assertion.avatarUrl,
        provider,
        issuer: assertion.issuer,
        subject: assertion.subject,
        claimProfile: assertion.claimProfile,
      });
      created = true;
    }

    if (principal.status !== 'ACTIVE') {
      throw new UnauthorizedException('Principal is not active');
    }

    await this.principalService.recordLogin(principal.id);
    await this.eventService.record({
      eventType: created ? 'principal_created' : 'login_succeeded',
      principalId: principal.id,
      data: { source: provider },
    });
    const tokens = await this.issueTokenPair(principal, 'FEDERATED', metadata);
    return { user: this.toAuthenticatedUser(principal, tokens), ...tokens };
  }

  async refresh(refreshToken: string, metadata: SessionMetadata): Promise<TokenPair> {
    const presented = await this.sessionService.findByTokenHash(refreshToken);
    if (!presented) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (presented.revokedAt) {
      // A token that was already rotated away (or explicitly revoked) is
      // being presented again — treat as reuse and kill the whole family.
      await this.sessionService.revokeFamily(presented.familyId, 'REUSE_DETECTED');
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

    const principal = await this.principalService.findById(presented.principalId);
    if (!principal || principal.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.sessionService.revoke(presented.id, 'ROTATED');
    const tokens = await this.issueTokenPair(principal, presented.assurance, metadata, presented.familyId, presented.absoluteExpiresAt);
    await this.eventService.record({ eventType: 'session_refreshed', principalId: principal.id });
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.sessionService.findActiveByToken(refreshToken);
    if (session) {
      await this.sessionService.revoke(session.id, 'LOGOUT');
      await this.eventService.record({ eventType: 'session_revoked', principalId: session.principalId, data: { reason: 'LOGOUT' } });
    }
  }

  async logoutAll(principalId: string): Promise<void> {
    await this.sessionService.revokeAllForPrincipal(principalId);
    await this.eventService.record({ eventType: 'all_sessions_revoked', principalId });
  }

  async requestPasswordRecovery(dto: PasswordRecoveryRequestDto, metadata: SessionMetadata): Promise<{ message: string }> {
    const principal = await this.principalService.findByEmail(dto.email);
    if (principal) {
      // §10: ZoikoShield must never "recover" a password for a federated
      // identity — only principals with a LocalCredential get an OTP.
      const credential = await this.principalService.getLocalCredential(principal.id);
      if (credential) {
        const canSend = await this.challengeService.canGenerate(principal.id, 'PASSWORD_RECOVERY');
        if (canSend) {
          const { code, correlationId } = await this.challengeService.generate(
            principal.id,
            'PASSWORD_RECOVERY',
            principal.email!,
            metadata,
          );
          await this.mailService.sendOtp(principal.email!, code, 'PASSWORD_RECOVERY');
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

  async verifyPasswordRecovery(dto: PasswordRecoveryVerifyDto): Promise<{ recoveryToken: string }> {
    const principal = await this.principalService.findByEmail(dto.email);
    if (!principal) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    await this.challengeService.verify(principal.id, 'PASSWORD_RECOVERY', dto.otp);
    const recoveryToken = await this.recoveryGrantService.issue(principal.id);
    await this.eventService.record({ eventType: 'password_recovery_verified', principalId: principal.id });
    return { recoveryToken };
  }

  async resetPasswordWithGrant(recoveryToken: string, dto: PasswordRecoveryResetDto): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('newPassword and confirmNewPassword must match');
    }
    const { principalId } = await this.recoveryGrantService.consume(recoveryToken);

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.principalService.updatePassword(principalId, passwordHash);
    await this.sessionService.revokeAllForPrincipal(principalId, 'PASSWORD_RESET');
    await this.eventService.record({ eventType: 'password_reset_completed', principalId });

    return { message: 'Password reset. All sessions have been signed out.' };
  }

  private async sendVerificationChallenge(principal: Principal, metadata: SessionMetadata): Promise<void> {
    const { code, correlationId } = await this.challengeService.generate(
      principal.id,
      'EMAIL_VERIFICATION',
      principal.email!,
      metadata,
    );
    await this.mailService.sendOtp(principal.email!, code, 'EMAIL_VERIFICATION');
    await this.eventService.record({
      eventType: 'email_verification_requested',
      principalId: principal.id,
      correlationId,
    });
  }

  private async issueTokenPair(
    principal: Principal,
    assurance: Assurance,
    metadata: SessionMetadata,
    familyId?: string,
    absoluteExpiresAt?: Date,
  ): Promise<TokenPair> {
    const { session, refreshToken } = await this.sessionService.createSession(
      principal.id,
      assurance,
      metadata,
      familyId,
      absoluteExpiresAt,
    );
    const payload: JwtPayload = {
      sub: principal.id,
      sid: session.id,
      email: principal.email ?? '',
      assurance,
    };
    if (!familyId) {
      await this.eventService.record({ eventType: 'session_issued', principalId: principal.id, data: { assurance } });
    }
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    };
  }

  private toAuthenticatedUser(principal: Principal, tokens: TokenPair): AuthenticatedUser {
    // sessionId/assurance are re-derived by JwtStrategy on the next request;
    // this copy is only for the immediate response body's `user` field.
    const payload = this.jwtService.decode(tokens.accessToken) as JwtPayload;
    return {
      id: principal.id,
      sessionId: payload.sid,
      email: principal.email ?? '',
      fullName: principal.fullName,
      emailVerified: principal.emailVerified,
      assurance: payload.assurance,
    };
  }
}
