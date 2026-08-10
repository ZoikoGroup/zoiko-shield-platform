import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { KafkaModule } from './kafka/kafka.module';
import { ShieldActionController } from './shield-action.controller';

import { ContentHashService } from './hashing/content-hash.service';
import { ShieldCoreClient } from './internal-client/shield-core.client';
import { OutboxService } from './outbox/outbox.service';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { FreezeControllerService } from './freeze-controller/freeze-controller.service';
import { RateControlService } from './rate-control/rate-control.service';
import { DevSimulationSigner } from './command-signing/dev-simulation-signer.service';
import { DispatcherService } from './dispatcher/dispatcher.service';
import { PolicyReauthorizationService } from './policy/policy-reauthorization.service';
import { ApprovalReauthorizationService } from './approval/approval-reauthorization.service';
import { ReceiptVerificationService } from './receipt-verification/receipt-verification.service';
import { ReconciliationService } from './reconciliation/reconciliation.service';
import { RollbackService } from './rollback/rollback.service';
import { CredentialExchangeService } from './credential-exchange/credential-exchange.service';
import { SimulationService } from './simulation/simulation.service';
import { ActionApprovedConsumer } from './proposals/action-approved.consumer';

@Module({
  imports: [PrismaModule, KafkaModule, ScheduleModule.forRoot()],
  controllers: [ShieldActionController],
  providers: [
    ContentHashService,
    ShieldCoreClient,
    OutboxService,
    OutboxPublisherService,
    FreezeControllerService,
    RateControlService,
    DevSimulationSigner,
    DispatcherService,
    PolicyReauthorizationService,
    ApprovalReauthorizationService,
    ReceiptVerificationService,
    ReconciliationService,
    RollbackService,
    CredentialExchangeService,
    SimulationService,
    ActionApprovedConsumer,
  ],
})
export class ShieldActionModule {}
