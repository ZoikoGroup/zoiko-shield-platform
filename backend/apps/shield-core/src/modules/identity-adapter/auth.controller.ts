import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { MicrosoftAuthGuard } from './guards/microsoft-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import type { OAuthProfile } from './interfaces/oauth-profile.interface';
import type { SessionMetadata } from './session.service';

function sessionMetadataFrom(req: Request): SessionMetadata {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, sessionMetadataFrom(req));
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, sessionMetadataFrom(req));
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, sessionMetadataFrom(req));
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logoutAll(user.id);
    return { success: true };
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleLogin() {
    // Handled by GoogleAuthGuard: redirects to Google's consent screen.
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  googleCallback(@Req() req: Request) {
    const profile = req.user as OAuthProfile;
    return this.authService.loginWithOAuthProfile('GOOGLE', profile, sessionMetadataFrom(req));
  }

  @UseGuards(MicrosoftAuthGuard)
  @Get('microsoft')
  microsoftLogin() {
    // Handled by MicrosoftAuthGuard: redirects to Microsoft's consent screen.
  }

  @UseGuards(MicrosoftAuthGuard)
  @Get('microsoft/callback')
  microsoftCallback(@Req() req: Request) {
    const profile = req.user as OAuthProfile;
    return this.authService.loginWithOAuthProfile('MICROSOFT', profile, sessionMetadataFrom(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
