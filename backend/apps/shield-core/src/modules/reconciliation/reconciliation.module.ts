import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { PeriodicReconciliationWorker } from './periodic-reconciliation.worker';
import { FinancialPeriodCloseController } from './financial-period-close.controller';
import { FinancialPeriodCloseService } from './financial-period-close.service';
import { GoLiveSignoffService } from './go-live-signoff.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReconciliationController, FinancialPeriodCloseController],
  providers: [
    ReconciliationService,
    PeriodicReconciliationWorker,
    FinancialPeriodCloseService,
    GoLiveSignoffService,
  ],
  exports: [
    ReconciliationService,
    PeriodicReconciliationWorker,
    FinancialPeriodCloseService,
    GoLiveSignoffService,
  ],
})
export class ReconciliationModule {}



