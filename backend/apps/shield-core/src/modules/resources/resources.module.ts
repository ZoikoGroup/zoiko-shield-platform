import { Module } from '@nestjs/common';
import {
  ResourceDefinitionController,
  ResourceObservationController,
} from './resources.controller';
import { ProtectedResourceDefinitionService } from './protected-resource-definition.service';
import { ResourceObservationService } from './resource-observation.service';
import { ResourceDeduplicationService } from './resource-deduplication.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ResourceDefinitionController, ResourceObservationController],
  providers: [
    ProtectedResourceDefinitionService,
    ResourceObservationService,
    ResourceDeduplicationService,
  ],
  exports: [
    ProtectedResourceDefinitionService,
    ResourceObservationService,
    ResourceDeduplicationService,
  ],
})
export class ResourcesModule {}

