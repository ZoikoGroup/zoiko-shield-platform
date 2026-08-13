import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OnboardingService } from './onboarding.service';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard)
@Controller(['api/v1/onboarding', 'onboarding'])
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post()
  onboard(@Body() dto: OnboardTenantDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.onboardingService.onboard(dto, user.id, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

}
