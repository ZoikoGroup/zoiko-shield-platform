import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { ExportModule } from '../export/export.module';
import { DeveloperApiModule } from '../developer-api/developer-api.module';
import { OutboxService } from '../../outbox/outbox.service';
import { OffboardingController } from './offboarding.controller';
import { LegalHoldService } from './legal-hold/legal-hold.service';
import { DeletionRequestService } from './deletion/deletion-request.service';
import { DeletionTaskService } from './deletion/deletion-task.service';
import { BackupExpiryService } from './backup-expiry/backup-expiry.service';
import { DeletionAttestationService } from './attestation/deletion-attestation.service';
import { TenantOffboardingService } from './lifecycle/tenant-offboarding.service';

@Module({
  imports: [PrismaModule, EvidenceModule, AuthorizationDecisionModule, ExportModule, DeveloperApiModule],
  controllers: [OffboardingController],
  providers: [OutboxService, LegalHoldService, DeletionRequestService, DeletionTaskService, BackupExpiryService, DeletionAttestationService, TenantOffboardingService],
  exports: [LegalHoldService, DeletionRequestService, TenantOffboardingService],
})
export class OffboardingModule {}
