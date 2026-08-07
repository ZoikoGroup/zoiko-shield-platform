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
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { MicrosoftAuthGuard } from './guards/microsoft-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import type { OAuthProfile } from './interfaces/oauth-profile.interface';
import type { SessionMetadata } from './session.service';
import { REFRESH_TOKEN_COOKIE, clearAuthCookies, setAuthCookies } from './auth-cookies';

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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
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

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

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
    const { user, ...tokens } = await this.authService.loginWithOAuthProfile(
      'GOOGLE',
      profile,
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
    const { user, ...tokens } = await this.authService.loginWithOAuthProfile(
      'MICROSOFT',
      profile,
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
