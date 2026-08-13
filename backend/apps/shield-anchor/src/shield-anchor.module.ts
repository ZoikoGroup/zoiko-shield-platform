import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { KafkaModule } from './kafka/kafka.module';
import { ShieldAnchorController } from './shield-anchor.controller';
import { CheckpointController } from './verification-receipts/checkpoint.controller';

import { OutboxService } from './outbox/outbox.service';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { TenantAnchorHeadService } from './tenant-chain-head/tenant-anchor-head.service';
import { MerkleTreeService } from './merkle/merkle-tree.service';
import { DevCheckpointSigner } from './signing/dev-checkpoint-signer.service';
import { SigningKeyService } from './key-management/signing-key.service';
import { MockWitnessProvider } from './witnesses/mock-witness-provider.service';
import { WitnessService } from './witnesses/witness.service';
import { CheckpointBuilderService } from './checkpoint-builder/checkpoint-builder.service';
import { CHECKPOINT_SIGNER } from './signing/checkpoint-signer.token';
import { ProductionCheckpointSigner } from './signing/production-checkpoint-signer.service';
import { HttpWitnessProvider } from './witnesses/http-witness-provider.service';

@Module({
  imports: [PrismaModule, KafkaModule, ScheduleModule.forRoot()],
  controllers: [ShieldAnchorController, CheckpointController],
  providers: [
    OutboxService,
    OutboxPublisherService,
    TenantAnchorHeadService,
    MerkleTreeService,
    {
      provide: CHECKPOINT_SIGNER,
      useFactory: () =>
        process.env.NODE_ENV === 'production'
          ? new ProductionCheckpointSigner()
          : new DevCheckpointSigner(),
    },
    SigningKeyService,
    MockWitnessProvider,
    WitnessService,
    HttpWitnessProvider,
    CheckpointBuilderService,
  ],
})
export class ShieldAnchorModule {}
