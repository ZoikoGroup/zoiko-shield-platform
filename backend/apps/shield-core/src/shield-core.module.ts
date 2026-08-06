import { Module } from '@nestjs/common';
import { ShieldCoreController } from './shield-core.controller';
import { ShieldCoreService } from './shield-core.service';
import { TenantModule } from './modules/tenant/tenant.module';
import { CustomerModule } from './modules/customer/customer.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { LegalEntityModule } from './modules/legal-entity/legal-entity.module';
import { EnvironmentModule } from './modules/environment/environment.module';

@Module({
  imports: [
    TenantModule, 
    CustomerModule,
    OrganizationModule,
    LegalEntityModule,
    EnvironmentModule
  ],
  controllers: [ShieldCoreController],
  providers: [ShieldCoreService],
})
export class ShieldCoreModule {}
