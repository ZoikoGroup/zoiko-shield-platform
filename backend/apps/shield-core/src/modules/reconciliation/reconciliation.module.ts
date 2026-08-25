import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { PeriodicReconciliationWorker } from './periodic-reconciliation.worker';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, PeriodicReconciliationWorker],
  exports: [ReconciliationService, PeriodicReconciliationWorker],
})
export class ReconciliationModule {}

