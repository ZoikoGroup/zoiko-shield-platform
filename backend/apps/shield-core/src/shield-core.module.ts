import { Module } from '@nestjs/common';
import { ShieldCoreController } from './shield-core.controller';
import { ShieldCoreService } from './shield-core.service';
import { TenantModule } from './modules/tenant/tenant.module';
import { CustomerModule } from './modules/customer/customer.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { LegalEntityModule } from './modules/legal-entity/legal-entity.module';
import { EnvironmentModule } from './modules/environment/environment.module';
import { CommercialModule } from './modules/commercial/commercial.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { ObligationsModule } from './modules/obligations/obligations.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    TenantModule, 
    CustomerModule,
    OrganizationModule,
    LegalEntityModule,
    EnvironmentModule,
    CommercialModule,
    CatalogModule,
    CommerceModule,
    ObligationsModule,
    BillingModule,
  ],
  controllers: [ShieldCoreController],
  providers: [ShieldCoreService],
})
export class ShieldCoreModule {}
