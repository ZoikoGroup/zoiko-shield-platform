import { Module } from '@nestjs/common';
import { BreakGlassQuorumService } from './break-glass-quorum.service';

@Module({
  providers: [BreakGlassQuorumService],
  exports: [BreakGlassQuorumService],
})
export class BreakGlassModule {}
