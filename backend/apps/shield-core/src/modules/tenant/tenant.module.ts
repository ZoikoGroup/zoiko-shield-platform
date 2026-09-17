import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantController } from './tenant.controller';
import { InternalTenantController } from './internal/internal-tenant.controller';
import { TenantService } from './tenant.service';
import { TenantOffboardingOrchestratorService } from './tenant-offboarding-orchestrator.service';
import { Tenant } from './tenant.entity';
import { IdentityAdapterModule } from '../identity-adapter/identity-adapter.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrivacyModule } from '../privacy/privacy.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    IdentityAdapterModule,
    AuthorizationModule,
    PrivacyModule,
  ],
  controllers: [TenantController, InternalTenantController],
  providers: [TenantService, TenantOffboardingOrchestratorService],
  exports: [TenantService, TenantOffboardingOrchestratorService],
})
export class TenantModule {}
