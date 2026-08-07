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
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserService } from './user.service';
import { SessionMetadata, SessionService } from './session.service';
import { OtpService } from './otp.service';
import { MailService } from './mail.service';
import { AuthenticatedUser, JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthenticationProvider, User } from './user.entity';

const SALT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ userId: string; email: string; message: string }> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('password and confirmPassword must match');
    }

    const existing = await this.userService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.userService.create({
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
      authenticationProvider: 'LOCAL',
    });

    await this.sendVerificationCode(user);
    return {
      userId: user.id,
      email: user.email,
      message: 'Registered. Check your email for a verification code.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto, metadata: SessionMetadata): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.otpService.verify(user.id, 'EMAIL_VERIFICATION', dto.otp);
    await this.userService.markEmailVerified(user.id);
    user.emailVerified = true;

    await this.userService.recordLogin(user.id);
    const tokens = await this.issueTokenPair(user, metadata);
    return { user: this.toAuthenticatedUser(user), ...tokens };
  }

  async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
    const user = await this.userService.findByEmail(dto.email);
    if (user && !user.emailVerified) {
      await this.sendVerificationCode(user);
    }
    return { message: 'If that account needs verification, a new code has been sent.' };
  }

  async login(dto: LoginDto, metadata: SessionMetadata): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user || user.status !== 'ACTIVE' || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('Email not verified');
    }

    await this.userService.recordLogin(user.id);
    const tokens = await this.issueTokenPair(user, metadata);
    return { user: this.toAuthenticatedUser(user), ...tokens };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userService.findByEmail(dto.email);
    if (user && user.passwordHash) {
      const code = await this.otpService.generate(user.id, 'PASSWORD_RESET');
      await this.mailService.sendOtp(user.email, code, 'PASSWORD_RESET');
    }
    return { message: 'If that account exists, a reset code has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('newPassword and confirmNewPassword must match');
    }

    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.otpService.verify(user.id, 'PASSWORD_RESET', dto.otp);

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.userService.updatePassword(user.id, passwordHash);
    await this.sessionService.revokeAllForUser(user.id);

    return { message: 'Password reset. All sessions have been signed out.' };
  }

  private async sendVerificationCode(user: User): Promise<void> {
    const code = await this.otpService.generate(user.id, 'EMAIL_VERIFICATION');
    await this.mailService.sendOtp(user.email, code, 'EMAIL_VERIFICATION');
  }

  async loginWithOAuthProfile(
    provider: AuthenticationProvider,
    profile: { providerUserId: string; email: string; fullName?: string; avatarUrl?: string },
    metadata: SessionMetadata,
  ): Promise<{ user: AuthenticatedUser } & TokenPair> {
    let user = await this.userService.findByProvider(provider, profile.providerUserId);
    if (!user) {
      user = await this.userService.findByEmail(profile.email);
    }
    if (!user) {
      user = await this.userService.create({
        email: profile.email,
        fullName: profile.fullName,
        avatarUrl: profile.avatarUrl,
        authenticationProvider: provider,
        providerUserId: profile.providerUserId,
        emailVerified: true,
      });
    }

    await this.userService.recordLogin(user.id);
    const tokens = await this.issueTokenPair(user, metadata);
    return { user: this.toAuthenticatedUser(user), ...tokens };
  }

  async refresh(refreshToken: string, metadata: SessionMetadata): Promise<TokenPair> {
    const session = await this.sessionService.findActiveByToken(refreshToken);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userService.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.sessionService.revoke(session.id);
    return this.issueTokenPair(user, metadata);
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.sessionService.findActiveByToken(refreshToken);
    if (session) {
      await this.sessionService.revoke(session.id);
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.revokeAllForUser(userId);
  }

  private async issueTokenPair(user: User, metadata: SessionMetadata): Promise<TokenPair> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const { refreshToken } = await this.sessionService.createSession(user.id, metadata);
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    };
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
    };
  }
}
