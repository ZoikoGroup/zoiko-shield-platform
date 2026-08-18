import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrincipalService } from '../principal.service';
import { SessionService } from '../session.service';
import { SessionContextService } from '../session-context.service';
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
    private readonly sessionContext: SessionContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      issuer: config.get<string>('JWT_ISSUER', 'zoikoshield'),
      audience: config.get<string>('JWT_AUDIENCE', 'zoikoshield-api'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (
      !payload.sub ||
      !payload.sid ||
      !payload.tid ||
      !payload.mid ||
      !payload.region ||
      !payload.policyVersion ||
      !payload.riskState ||
      !payload.sessionState
    ) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const session = await this.sessionService.findById(payload.sid);
    if (
      !session ||
      session.principalId !== payload.sub ||
      session.tenantId !== payload.tid ||
      session.membershipId !== payload.mid ||
      session.environmentId !== payload.eid ||
      session.region !== payload.region ||
      session.policyVersion !== payload.policyVersion ||
      session.riskState !== payload.riskState ||
      session.state !== payload.sessionState ||
      !this.sessionService.isActive(session)
    ) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    try {
      await this.sessionContext.assertSessionStillAuthorized(session);
    } catch (error) {
      await this.sessionService.revoke(session.id, 'SESSION_AUTHORITY_CHANGED');
      throw error;
    }

    const principal = await this.principalService.findById(payload.sub);
    if (!principal || principal.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (principal.riskState !== session.riskState) {
      await this.sessionService.revoke(session.id, 'PRINCIPAL_RISK_CHANGED');
      throw new UnauthorizedException('Principal risk state has changed');
    }

    return {
      id: principal.id,
      sessionId: session.id,
      email: principal.email ?? '',
      fullName: principal.fullName,
      emailVerified: principal.emailVerified,
      assurance: session.assurance,
      tenantId: session.tenantId,
      membershipId: session.membershipId,
      environmentId: session.environmentId,
      region: session.region,
      policyVersion: session.policyVersion,
      riskState: session.riskState,
      sessionState: session.state,
    };
  }
}
