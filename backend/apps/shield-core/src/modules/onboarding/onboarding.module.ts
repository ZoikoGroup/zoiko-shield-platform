import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { IdentityAdapterModule } from '../identity-adapter/identity-adapter.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { OnboardingReadinessService } from './onboarding-readiness.service';

@Module({
  imports: [IdentityAdapterModule, EvidenceModule, PrismaModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingReadinessService],
})
export class OnboardingModule {}
