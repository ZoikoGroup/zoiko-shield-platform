import { Module } from '@nestjs/common';
import { InvestigateAlertWorkflowService } from './investigate-alert-workflow.service';
import { TemporalWorkflowChaosService } from './temporal-workflow-chaos.service';

@Module({
  providers: [InvestigateAlertWorkflowService, TemporalWorkflowChaosService],
  exports: [InvestigateAlertWorkflowService, TemporalWorkflowChaosService],
})
export class WorkflowModule {}

