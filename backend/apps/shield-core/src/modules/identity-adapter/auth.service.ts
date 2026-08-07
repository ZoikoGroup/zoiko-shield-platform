import {
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
import { AuthenticatedUser, JwtPayload } from './interfaces/jwt-payload.interface';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthenticatedUser> {
    const existing = await this.userService.findByTenantAndEmail(
      dto.tenantId,
      dto.email,
    );
    if (existing) {
      throw new ConflictException('A user with this email already exists for this tenant');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.userService.create({
      tenantId: dto.tenantId,
      email: dto.email,
      passwordHash,
      roles: dto.roles?.length ? dto.roles : ['member'],
    });

    return this.toAuthenticatedUser(user);
  }

  async validateCredentials(dto: LoginDto): Promise<AuthenticatedUser> {
    const user = await this.userService.findByTenantAndEmail(dto.tenantId, dto.email);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.toAuthenticatedUser(user);
  }

  issueToken(user: AuthenticatedUser): { accessToken: string; expiresIn: string } {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: user.roles,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    };
  }

  private toAuthenticatedUser(user: {
    id: string;
    tenantId: string;
    email: string;
    roles: string[];
  }): AuthenticatedUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: user.roles,
    };
  }
}
