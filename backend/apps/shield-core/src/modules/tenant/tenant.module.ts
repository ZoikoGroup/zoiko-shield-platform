import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { InternalTenantController } from './internal/internal-tenant.controller';
import { TenantService } from './tenant.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityAdapterModule } from '../identity-adapter/identity-adapter.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrivacyModule } from '../privacy/privacy.module';

@Module({
  imports: [
    PrismaModule,
    IdentityAdapterModule,
    AuthorizationModule,
    PrivacyModule,
  ],
  controllers: [TenantController, InternalTenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
