import { Module } from '@nestjs/common';
import { RequirementsRegisterService } from './services/requirements-register.service';
import { TraceabilityGraphService } from './services/traceability-graph.service';
import { RequirementsReconciliationWorker } from './workers/requirements-reconciliation.worker';
import { RequirementsQualityGuard } from './guards/requirements-quality.guard';
import { RequirementsRegisterController } from './controllers/requirements-register.controller';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [AuthorizationModule],
  controllers: [RequirementsRegisterController],
  providers: [
    RequirementsRegisterService,
    TraceabilityGraphService,
    RequirementsReconciliationWorker,
    RequirementsQualityGuard,
  ],
  exports: [
    RequirementsRegisterService,
    TraceabilityGraphService,
    RequirementsReconciliationWorker,
    RequirementsQualityGuard,
  ],
})
export class RequirementsRegisterModule {}
