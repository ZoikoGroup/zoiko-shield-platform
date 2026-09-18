import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { ExportModule } from '../export/export.module';
import { DeveloperApiModule } from '../developer-api/developer-api.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { OutboxService } from '../../outbox/outbox.service';
import { OffboardingController } from './offboarding.controller';
import { PrivacyOperationsController } from './privacy-operations.controller';
import { LegalHoldService } from './legal-hold/legal-hold.service';
import { DeletionRequestService } from './deletion/deletion-request.service';
import { DeletionTaskService } from './deletion/deletion-task.service';
import { DeletionRetryService } from './deletion/deletion-retry.service';
import { BackupExpiryService } from './backup-expiry/backup-expiry.service';
import { DeletionAttestationService } from './attestation/deletion-attestation.service';
import { RetentionPolicyService } from './retention/retention-policy.service';
import { DeletionVerificationService } from './verification/deletion-verification.service';
import { TenantOffboardingService } from './lifecycle/tenant-offboarding.service';

@Module({
  imports: [
    PrismaModule,
    EvidenceModule,
    AuthorizationDecisionModule,
    ExportModule,
    DeveloperApiModule,
    PrivacyModule,
  ],
  controllers: [OffboardingController, PrivacyOperationsController],
  providers: [
    OutboxService,
    LegalHoldService,
    RetentionPolicyService,
    DeletionVerificationService,
    DeletionRequestService,
    DeletionTaskService,
    DeletionRetryService,
    BackupExpiryService,
    DeletionAttestationService,
    TenantOffboardingService,
  ],
  exports: [
    LegalHoldService,
    RetentionPolicyService,
    DeletionRequestService,
    DeletionVerificationService,
    TenantOffboardingService,
  ],
})
export class OffboardingModule {}
