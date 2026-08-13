import { Module } from '@nestjs/common';
import {
  ResourceDefinitionController,
  ResourceObservationController,
} from './resources.controller';
import { ProtectedResourceDefinitionService } from './protected-resource-definition.service';
import { ResourceObservationService } from './resource-observation.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ResourceDefinitionController, ResourceObservationController],
  providers: [ProtectedResourceDefinitionService, ResourceObservationService],
  exports: [ProtectedResourceDefinitionService, ResourceObservationService],
})
export class ResourcesModule {}
