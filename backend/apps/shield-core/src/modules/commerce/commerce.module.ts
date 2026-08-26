import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractStateService } from './contract-state.service';
import { ContractRenewalWorker } from './contract-renewal.worker';
import { CommercialEventPublisherService } from './commercial-event-publisher.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [PrismaModule, IdempotencyModule],
  controllers: [ContractController],
  providers: [
    ContractStateService,
    ContractRenewalWorker,
    CommercialEventPublisherService,
  ],
  exports: [ContractStateService, ContractRenewalWorker],
})
export class CommerceModule {}
