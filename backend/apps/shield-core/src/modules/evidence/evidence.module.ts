import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { EvidenceController } from './controllers/evidence.controller';
import { EvidenceService } from './services/evidence.service';
import { EvidenceRepository } from './repositories/evidence.repository';
import { ContentHashService } from './hashing/content-hash.service';
import { ObjectStorageService } from './storage/object-storage.service';
import { EvidenceLineageService } from './lineage/evidence-lineage.service';
import { EvidenceVerificationService } from './verification/evidence-verification.service';
import { EvidenceLedgerService } from './ledger/evidence-ledger.service';
import { EvidenceAutoCreationService } from './evidence-auto-creation.service';
import { OutboxService } from '../../outbox/outbox.service';
import { CollectorSignatureService } from './signing/collector-signature.service';
import { COLLECTOR_SIGNER } from './signing/collector-signer.interface';
import { DevCollectorSigner } from './signing/dev-collector-signer.service';
import { ProductionCollectorSigner } from './signing/production-collector-signer.service';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [EvidenceController],
  providers: [
    EvidenceService,
    EvidenceRepository,
    ContentHashService,
    ObjectStorageService,
    EvidenceLineageService,
    EvidenceVerificationService,
    EvidenceLedgerService,
    EvidenceAutoCreationService,
    OutboxService,
    CollectorSignatureService,
    {
      // Chosen at wiring time, not by a runtime flag: a production deploy
      // gets the KMS signer or fails to boot.
      provide: COLLECTOR_SIGNER,
      useFactory: () =>
        process.env.NODE_ENV === 'production'
          ? new ProductionCollectorSigner()
          : new DevCollectorSigner(),
    },
  ],
  exports: [
    EvidenceService,
    EvidenceLedgerService,
    EvidenceLineageService,
    EvidenceAutoCreationService,
    ContentHashService,
    ObjectStorageService,
  ],
})
export class EvidenceModule {}
