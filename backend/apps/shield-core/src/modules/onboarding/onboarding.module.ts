import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { IdentityAdapterModule } from '../identity-adapter/identity-adapter.module';

@Module({
  imports: [IdentityAdapterModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
