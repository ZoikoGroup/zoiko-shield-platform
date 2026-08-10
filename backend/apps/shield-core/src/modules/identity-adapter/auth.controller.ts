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
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { PasswordRecoveryRequestDto } from './dto/password-recovery-request.dto';
import { PasswordRecoveryVerifyDto } from './dto/password-recovery-verify.dto';
import { PasswordRecoveryResetDto } from './dto/password-recovery-reset.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { MicrosoftAuthGuard } from './guards/microsoft-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import type { OAuthProfile } from './interfaces/oauth-profile.interface';
import type { SessionMetadata } from './session.service';
import {
  REFRESH_TOKEN_COOKIE,
  RECOVERY_GRANT_COOKIE,
  clearAuthCookies,
  clearRecoveryGrantCookie,
  setAuthCookies,
  setRecoveryGrantCookie,
} from './auth-cookies';

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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, sessionMetadataFrom(req));
  }

  @Post('verify-email')
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, ...tokens } = await this.authService.verifyEmail(dto, sessionMetadataFrom(req));
    setAuthCookies(res, tokens);
    return { user };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto, @Req() req: Request) {
    return this.authService.resendVerification(dto, sessionMetadataFrom(req));
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('password-recovery/request')
  requestPasswordRecovery(@Body() dto: PasswordRecoveryRequestDto, @Req() req: Request) {
    return this.authService.requestPasswordRecovery(dto, sessionMetadataFrom(req));
  }

  @Post('password-recovery/verify')
  async verifyPasswordRecovery(@Body() dto: PasswordRecoveryVerifyDto, @Res({ passthrough: true }) res: Response) {
    const { recoveryToken } = await this.authService.verifyPasswordRecovery(dto);
    setRecoveryGrantCookie(res, recoveryToken);
    return { message: 'Code verified. You may now set a new password.' };
  }

  @Post('password-recovery/reset')
  async resetPassword(
    @Body() dto: PasswordRecoveryResetDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetPasswordWithGrant(recoveryGrantFrom(req), dto);
    clearRecoveryGrantCookie(res);
    return result;
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, ...tokens } = await this.authService.login(dto, sessionMetadataFrom(req));
    setAuthCookies(res, tokens);
    return { user };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refresh(refreshTokenFrom(req), sessionMetadataFrom(req));
    setAuthCookies(res, tokens);
    return { success: true };
  }

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
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAll(user.id);
    clearAuthCookies(res);
    return { success: true };
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleLogin() {
    // Handled by GoogleAuthGuard: redirects to Google's consent screen.
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const profile = req.user as OAuthProfile;
    const { user, ...tokens } = await this.authService.loginWithOAuthAssertion(
      'GOOGLE',
      {
        issuer: profile.issuer,
        subject: profile.providerUserId,
        email: profile.email,
        fullName: profile.fullName,
        avatarUrl: profile.avatarUrl,
        claimProfile: profile.claimProfile,
      },
      sessionMetadataFrom(req),
    );
    setAuthCookies(res, tokens);
    return { user };
  }

  @UseGuards(MicrosoftAuthGuard)
  @Get('microsoft')
  microsoftLogin() {
    // Handled by MicrosoftAuthGuard: redirects to Microsoft's consent screen.
  }

  @UseGuards(MicrosoftAuthGuard)
  @Get('microsoft/callback')
  async microsoftCallback(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const profile = req.user as OAuthProfile;
    const { user, ...tokens } = await this.authService.loginWithOAuthAssertion(
      'MICROSOFT',
      {
        issuer: profile.issuer,
        subject: profile.providerUserId,
        email: profile.email,
        fullName: profile.fullName,
        avatarUrl: profile.avatarUrl,
        claimProfile: profile.claimProfile,
      },
      sessionMetadataFrom(req),
    );
    setAuthCookies(res, tokens);
    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
