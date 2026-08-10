import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { AuthorizationDecisionModule } from '../authorization-decision/authorization-decision.module';
import { ControlsController } from './controls.controller';
import { FrameworkRegistryService } from './frameworks/framework-registry.service';
import { RequirementService } from './requirements/requirement.service';
import { ControlObjectiveService } from './objectives/control-objective.service';
import { ControlMappingService } from './mappings/control-mapping.service';
import { ControlImplementationStateMachineService } from './implementations/control-implementation-state-machine.service';
import { ControlImplementationService } from './implementations/control-implementation.service';
import { ControlScopeService } from './scopes/control-scope.service';
import { ControlTestService } from './tests/control-test.service';

@Module({
  imports: [PrismaModule, EvidenceModule, AuthorizationDecisionModule],
  controllers: [ControlsController],
  providers: [
    FrameworkRegistryService,
    RequirementService,
    ControlObjectiveService,
    ControlMappingService,
    ControlImplementationStateMachineService,
    ControlImplementationService,
    ControlScopeService,
    ControlTestService,
  ],
  exports: [
    FrameworkRegistryService,
    RequirementService,
    ControlObjectiveService,
    ControlMappingService,
    ControlImplementationService,
    ControlScopeService,
    ControlTestService,
  ],
})
export class ControlsModule {}
