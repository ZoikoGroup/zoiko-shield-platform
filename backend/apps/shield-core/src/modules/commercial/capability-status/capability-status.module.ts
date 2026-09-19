import { Module } from '@nestjs/common';
import { CapabilityStatusService } from './capability-status.service';
import { CapabilityStatusController } from './capability-status.controller';

@Module({
  controllers: [CapabilityStatusController],
  providers: [CapabilityStatusService],
  exports: [CapabilityStatusService],
})
export class CapabilityStatusModule {}
