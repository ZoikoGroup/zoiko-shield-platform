import { Global, Module } from '@nestjs/common';
import { WorkloadTokenBrokerService } from './workload-token-broker.service';

@Global()
@Module({
  providers: [WorkloadTokenBrokerService],
  exports: [WorkloadTokenBrokerService],
})
export class WorkloadIdentityModule {}
