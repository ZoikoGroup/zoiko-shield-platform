import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { RegisterDto } from './dto/register.dto';
import {
  VerifyEmailDto,
  ResendVerificationDto,
} from './dto/verify-email.dto';
import { PasswordRecoveryRequestDto } from './dto/password-recovery-request.dto';
import { PasswordRecoveryVerifyDto } from './dto/password-recovery-verify.dto';
import { PasswordRecoveryResetDto } from './dto/password-recovery-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import type { SessionMetadata } from './session.service';
import { SwitchTenantSessionDto } from './dto/switch-tenant-session.dto';
import { WebauthnService } from './webauthn.service';
import {
  PasskeyLoginDto,
  PasskeyStepUpDto,
  VerifyWebauthnRegistrationDto,
  WebauthnAuthenticationOptionsDto,
} from './dto/webauthn.dto';
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
  constructor(
    private readonly authService: AuthService,
    private readonly webauthnService: WebauthnService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @PublicEndpoint()
  @Post(['register', 'register-org'])
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(
      dto,
      sessionMetadataFrom(req),
    );
    res.cookie('zoiko_shield_access_token', result.token, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    res.cookie('zoiko_shield_tenant_id', result.tenant.id, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    res.cookie('zoiko_shield_user_email', result.session.email, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    res.cookie('shield_access_token', result.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    res.cookie('zoiko_auth', 'true', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    return result;
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @PublicEndpoint()
  @Post(['verify-email', 'email-verification/verify'])
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @PublicEndpoint()
  @Post(['resend-verification', 'email-verification/resend'])
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() req: Request,
  ) {
    return this.authService.resendVerification(
      dto.email,
      sessionMetadataFrom(req),
    );
  }

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

    res.cookie('zoiko_shield_access_token', tokens.accessToken, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    res.cookie('zoiko_shield_tenant_id', user.tenantId, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    res.cookie('zoiko_shield_user_email', user.email, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    res.cookie('shield_access_token', tokens.accessToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    res.cookie('zoiko_auth', 'true', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });

    return {
      user,
      accessToken: tokens.accessToken,
      token: tokens.accessToken,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      role: (user as any).role || 'TENANT_OWNER',
    };
  }

  // --- WebAuthn / passkey ---------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @AuthenticationOnlyEndpoint()
  @Post('passkeys/registration/options')
  passkeyRegistrationOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.webauthnService.createRegistrationOptions(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @AuthenticationOnlyEndpoint()
  @Post('passkeys/registration')
  registerPasskey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyWebauthnRegistrationDto,
  ) {
    return this.webauthnService.verifyRegistration(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @AuthenticationOnlyEndpoint()
  @Get('passkeys')
  listPasskeys(@CurrentUser() user: AuthenticatedUser) {
    return this.webauthnService.listCredentials(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @AuthenticationOnlyEndpoint()
  @Delete('passkeys/:id')
  async revokePasskey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.webauthnService.revokeCredential(user.id, id);
    return { success: true };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @PublicEndpoint()
  @Post('passkeys/authentication/options')
  passkeyAuthenticationOptions(@Body() dto: WebauthnAuthenticationOptionsDto) {
    return this.webauthnService.createAuthenticationOptions(dto.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @PublicEndpoint()
  @Post('passkeys/authentication')
  async loginWithPasskey(
    @Body() dto: PasskeyLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const verification = await this.webauthnService.verifyAssertion(
      dto,
      'AUTHENTICATION',
    );
    const { user, ...tokens } = await this.authService.loginWithPasskey(
      verification,
      dto,
      sessionMetadataFrom(req),
    );
    setAuthCookies(res, tokens);

    res.cookie('zoiko_shield_access_token', tokens.accessToken, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    res.cookie('zoiko_shield_tenant_id', user.tenantId, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    res.cookie('zoiko_shield_user_email', user.email, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    res.cookie('shield_access_token', tokens.accessToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    res.cookie('zoiko_auth', 'true', {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });

    return {
      user,
      accessToken: tokens.accessToken,
      token: tokens.accessToken,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      role: (user as any).role || 'TENANT_OWNER',
    };
  }

  /**
   * Re-asserts a passkey on an existing session to raise its assurance to
   * PASSKEY, which is what unlocks endpoints gated by @RequireAssurance.
   */
  @UseGuards(JwtAuthGuard)
  @AuthenticationOnlyEndpoint()
  @Post('passkeys/step-up/options')
  passkeyStepUpOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.webauthnService.createStepUpOptions(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @AuthenticationOnlyEndpoint()
  @Post('passkeys/step-up')
  async passkeyStepUp(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: PasskeyStepUpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const verification = await this.webauthnService.verifyAssertion(
      dto,
      'STEP_UP',
      currentUser.id,
    );
    const { user, ...tokens } = await this.authService.loginWithPasskey(
      verification,
      { tenantId: currentUser.tenantId, environmentId: dto.environmentId },
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
      await this.authService.logout(token).catch(() => null);
    }
    clearAuthCookies(res);
    return { success: true, message: 'Session terminated successfully' };
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
  // 'me' alone: the controller already carries the 'api/v1/auth' prefix, so a
  // '/api/v1/me' suffix produced /api/v1/auth/api/v1/me and /auth/api/v1/me.
  // Both were malformed, undocumented and uncalled.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
