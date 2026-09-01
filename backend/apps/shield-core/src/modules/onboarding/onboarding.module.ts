import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { IdentityAdapterModule } from '../identity-adapter/identity-adapter.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { OnboardingReadinessService } from './onboarding-readiness.service';
import { OwnerActivationController } from './owner-activation.controller';
import { OwnerActivationService } from './owner-activation.service';

@Module({
  imports: [IdentityAdapterModule, PrismaModule],
  controllers: [OnboardingController, OwnerActivationController],
  providers: [
    OnboardingService,
    OnboardingReadinessService,
    OwnerActivationService,
  ],
})
export class OnboardingModule {}
