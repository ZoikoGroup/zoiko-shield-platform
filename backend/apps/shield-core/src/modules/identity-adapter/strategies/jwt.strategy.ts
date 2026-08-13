import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrincipalService } from '../principal.service';
import { SessionService } from '../session.service';
import { ACCESS_TOKEN_COOKIE } from '../auth-cookies';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../interfaces/jwt-payload.interface';

function fromCookie(req: Request): string | null {
  return req?.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly principalService: PrincipalService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const session = await this.sessionService.findById(payload.sid);
    if (
      !session ||
      session.principalId !== payload.sub ||
      !this.sessionService.isActive(session)
    ) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    const principal = await this.principalService.findById(payload.sub);
    if (!principal || principal.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: principal.id,
      sessionId: session.id,
      email: principal.email ?? '',
      fullName: principal.fullName,
      emailVerified: principal.emailVerified,
      assurance: session.assurance,
    };
  }
}
