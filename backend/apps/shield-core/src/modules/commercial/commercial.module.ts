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
import { TrustCenterController } from './trust-center.controller';
import { TrustCenterService } from './trust-center.service';
import { ZoikoOneBundlingController } from './zoiko-one-bundling.controller';
import { ZoikoOneBundlingService } from './zoiko-one-bundling.service';

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
    TrustCenterController,
    ZoikoOneBundlingController,
  ],
  providers: [
    CommercialAccountService,
    CommercialAccountChangeService,
    CorporateTransferService,
    CorporateTransferScheduler,
    CommercialEntitlementService,
    ClaimRegisterService,
    PilotLifecycleService,
    TrustCenterService,
    ZoikoOneBundlingService,
  ],
  exports: [
    CommercialAccountService,
    CommercialAccountChangeService,
    CorporateTransferService,
    CommercialEntitlementService,
    ClaimRegisterService,
    PilotLifecycleService,
    TrustCenterService,
    ZoikoOneBundlingService,
  ],
})
export class CommercialModule {}



