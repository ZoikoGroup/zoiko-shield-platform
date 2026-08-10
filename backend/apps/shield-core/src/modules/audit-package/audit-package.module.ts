import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { ShieldAnchorClient } from '../../internal-client/shield-anchor.client';
import { OutboxService } from '../../outbox/outbox.service';
import { AuditPackageController } from './audit-package.controller';
import { AuditPackageService } from './audit-package.service';
import { AuditPackageStateMachineService } from './audit-package-state-machine.service';
import { AuditPackageBuilderService } from './builder/audit-package-builder.service';
import { AuditPackageValidatorService } from './validator/audit-package-validator.service';
import { AuditPackageApprovalService } from './approval/audit-package-approval.service';
import { AuditPackageFreezeService } from './freeze/audit-package-freeze.service';
import { AuditPackageSupersessionService } from './supersession/audit-package-supersession.service';
import { AuditPackageExportService } from './export/audit-package-export.service';

@Module({
  imports: [PrismaModule, EvidenceModule, AuthorizationDecisionModule],
  controllers: [AuditPackageController],
  providers: [
    ShieldAnchorClient,
    OutboxService,
    AuditPackageService,
    AuditPackageStateMachineService,
    AuditPackageBuilderService,
    AuditPackageValidatorService,
    AuditPackageApprovalService,
    AuditPackageFreezeService,
    AuditPackageSupersessionService,
    AuditPackageExportService,
  ],
  exports: [AuditPackageService, AuditPackageBuilderService, AuditPackageValidatorService, AuditPackageApprovalService, AuditPackageFreezeService, AuditPackageSupersessionService],
})
export class AuditPackageModule {}
