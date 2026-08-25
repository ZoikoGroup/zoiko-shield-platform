import { Module } from '@nestjs/common';
import { CommercialEntitlementController } from './commercial-entitlement.controller';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import { CommercialPortalController } from './commercial-portal.controller';
import { PilotLifecycleService } from './pilot-lifecycle.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SectorPacksModule } from '../sector-packs/sector-packs.module';
import { KillSwitchModule } from '../kill-switch/kill-switch.module';
import { ClaimRegisterController } from './claim-register.controller';
import { ClaimRegisterService } from './claim-register.service';
import {
  PlatformCommercialAccountController,
  PlatformCommercialGroupAccountController,
  TenantCommercialAccountController,
} from './commercial-account.controller';
import { CommercialAccountService } from './commercial-account.service';
import { CommercialAccountChangeService } from './commercial-account-change.service';
import { ApprovalsModule } from '../approvals/approvals.module';
import { CorporateTransferController } from './corporate-transfer.controller';
import { CorporateTransferService } from './corporate-transfer.service';
import { CorporateTransferScheduler } from './corporate-transfer.scheduler';

@Module({
  imports: [PrismaModule, SectorPacksModule, KillSwitchModule, ApprovalsModule],
  controllers: [
    PlatformCommercialAccountController,
    PlatformCommercialGroupAccountController,
    TenantCommercialAccountController,
    CorporateTransferController,
    CommercialEntitlementController,
    ClaimRegisterController,
    CommercialPortalController,
  ],
  providers: [
    CommercialAccountService,
    CommercialAccountChangeService,
    CorporateTransferService,
    CorporateTransferScheduler,
    CommercialEntitlementService,
    ClaimRegisterService,
    PilotLifecycleService,
  ],
  exports: [
    CommercialAccountService,
    CommercialAccountChangeService,
    CorporateTransferService,
    CommercialEntitlementService,
    ClaimRegisterService,
    PilotLifecycleService,
  ],
})
export class CommercialModule {}


