import { Module } from '@nestjs/common';
import { InvestigateAlertWorkflowService } from './investigate-alert-workflow.service';

@Module({
  providers: [InvestigateAlertWorkflowService],
  exports: [InvestigateAlertWorkflowService],
})
export class WorkflowModule {}
