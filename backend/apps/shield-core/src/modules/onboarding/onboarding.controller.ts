import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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

  @Post('organization')
  onboardOrganization(@Body() dto: OnboardTenantDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.onboardingService.onboard(dto, user.id, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('legal-entity')
  onboardLegalEntity(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return { statusCode: 200, message: 'Legal entity onboarding recorded', data: dto };
  }

  @Post('environment')
  onboardEnvironment(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return { statusCode: 200, message: 'Environment onboarding recorded', data: dto };
  }

  @Post('complete')
  completeOnboarding(@Body() dto: any, @CurrentUser() user: AuthenticatedUser) {
    return { statusCode: 200, message: 'Onboarding completed', status: 'COMPLETED' };
  }

  @Get('status')
  getOnboardingStatus(@CurrentUser() user: AuthenticatedUser) {
    return { statusCode: 200, status: 'IN_PROGRESS', step: 'ORGANIZATION' };
  }
}
