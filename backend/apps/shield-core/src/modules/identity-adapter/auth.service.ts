import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserService } from './user.service';
import { SessionMetadata, SessionService } from './session.service';
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
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, metadata: SessionMetadata): Promise<{ user: AuthenticatedUser } & TokenPair> {
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

    const tokens = await this.issueTokenPair(user, metadata);
    return { user: this.toAuthenticatedUser(user), ...tokens };
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

    await this.userService.recordLogin(user.id);
    const tokens = await this.issueTokenPair(user, metadata);
    return { user: this.toAuthenticatedUser(user), ...tokens };
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
