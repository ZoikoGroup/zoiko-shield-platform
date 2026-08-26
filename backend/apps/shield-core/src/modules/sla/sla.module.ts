import { Module } from '@nestjs/common';
import {
  SlaDefinitionController,
  SlaMeasurementController,
  ServiceCreditController,
} from './sla.controller';
import { SlaDefinitionService } from './sla-definition.service';
import { SlaMeasurementService } from './sla-measurement.service';
import { ServiceCreditService } from './service-credit.service';
import { SocSlaClockService } from './soc-sla-clock.service';
import { ServiceCreditLedgerService } from './service-credit-ledger.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, ApprovalsModule, BillingModule],
  controllers: [
    SlaDefinitionController,
    SlaMeasurementController,
    ServiceCreditController,
  ],
  providers: [
    SlaDefinitionService,
    SlaMeasurementService,
    ServiceCreditService,
    SocSlaClockService,
    ServiceCreditLedgerService,
  ],
  exports: [
    SlaDefinitionService,
    SlaMeasurementService,
    ServiceCreditService,
    SocSlaClockService,
    ServiceCreditLedgerService,
  ],
})
export class SlaModule {}
