import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { PasswordRecoveryRequestDto } from './dto/password-recovery-request.dto';
import { PasswordRecoveryVerifyDto } from './dto/password-recovery-verify.dto';
import { PasswordRecoveryResetDto } from './dto/password-recovery-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import type { SessionMetadata } from './session.service';
import { SwitchTenantSessionDto } from './dto/switch-tenant-session.dto';
import {
  REFRESH_TOKEN_COOKIE,
  RECOVERY_GRANT_COOKIE,
  clearAuthCookies,
  clearRecoveryGrantCookie,
  setAuthCookies,
  setRecoveryGrantCookie,
} from './auth-cookies';
import {
  AuthenticationOnlyEndpoint,
  PublicEndpoint,
} from '../../security/endpoint-access.decorator';

function sessionMetadataFrom(req: Request): SessionMetadata {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function refreshTokenFrom(req: Request): string {
  const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!token) {
    throw new UnauthorizedException('No refresh token cookie present');
  }
  return token;
}

function recoveryGrantFrom(req: Request): string {
  const token = req.cookies?.[RECOVERY_GRANT_COOKIE];
  if (!token) {
    throw new UnauthorizedException('No recovery grant cookie present');
  }
  return token;
}

@Controller(['api/v1/auth', 'auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @PublicEndpoint()
  @Post(['password-recovery/request', 'forgot-password'])
  requestPasswordRecovery(
    @Body() dto: PasswordRecoveryRequestDto,
    @Req() req: Request,
  ) {
    return this.authService.requestPasswordRecovery(
      dto,
      sessionMetadataFrom(req),
    );
  }

  @PublicEndpoint()
  @Post('password-recovery/verify')
  async verifyPasswordRecovery(
    @Body() dto: PasswordRecoveryVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { recoveryToken } =
      await this.authService.verifyPasswordRecovery(dto);
    setRecoveryGrantCookie(res, recoveryToken);
    return { message: 'Code verified. You may now set a new password.' };
  }

  @PublicEndpoint()
  @Post(['password-recovery/reset', 'reset-password'])
  async resetPassword(
    @Body() dto: PasswordRecoveryResetDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetPasswordWithGrant(
      recoveryGrantFrom(req),
      dto,
    );
    clearRecoveryGrantCookie(res);
    return result;
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @PublicEndpoint()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, ...tokens } = await this.authService.login(
      dto,
      sessionMetadataFrom(req),
    );
    setAuthCookies(res, tokens);
    return { user };
  }

  @PublicEndpoint()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refresh(
      refreshTokenFrom(req),
      sessionMetadataFrom(req),
    );
    setAuthCookies(res, tokens);
    return { success: true };
  }

  @PublicEndpoint()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (token) {
      await this.authService.logout(token);
    }
    clearAuthCookies(res);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @AuthenticationOnlyEndpoint()
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.id);
    clearAuthCookies(res);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @AuthenticationOnlyEndpoint()
  @Post('switch-tenant')
  async switchTenant(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: SwitchTenantSessionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, ...tokens } = await this.authService.switchTenantSession(
      currentUser.id,
      currentUser.sessionId,
      dto,
      sessionMetadataFrom(req),
    );
    setAuthCookies(res, tokens);
    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @AuthenticationOnlyEndpoint()
  @Get(['me', '/api/v1/me'])
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
