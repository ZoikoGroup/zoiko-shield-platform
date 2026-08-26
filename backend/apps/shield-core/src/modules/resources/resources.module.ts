import { Module } from '@nestjs/common';
import {
  ResourceAutoEnrollmentController,
  ResourceDefinitionController,
  ResourceObservationController,
  TenantResourceCoverageController,
} from './resources.controller';
import { ProtectedResourceDefinitionService } from './protected-resource-definition.service';
import { ResourceObservationService } from './resource-observation.service';
import { ResourceCoverageService } from './resource-coverage.service';
import { ResourceCountingService } from './resource-counting.service';
import { ResourceDeduplicationService } from './resource-deduplication.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [PrismaModule, ApprovalsModule],
  controllers: [
    ResourceDefinitionController,
    ResourceObservationController,
    ResourceAutoEnrollmentController,
    TenantResourceCoverageController,
  ],
  providers: [
    ProtectedResourceDefinitionService,
    ResourceObservationService,
    ResourceCoverageService,
    ResourceCountingService,
    ResourceDeduplicationService,
  ],
  exports: [
    ProtectedResourceDefinitionService,
    ResourceObservationService,
    ResourceCoverageService,
    ResourceCountingService,
    ResourceDeduplicationService,
  ],
})
export class ResourcesModule {}
