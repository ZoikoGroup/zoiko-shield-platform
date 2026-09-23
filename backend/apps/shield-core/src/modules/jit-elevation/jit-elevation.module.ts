import { Module } from '@nestjs/common';
import { JitElevationService } from './jit-elevation.service';
import { JitElevationController } from './jit-elevation.controller';

@Module({
  controllers: [JitElevationController],
  providers: [JitElevationService],
  exports: [JitElevationService],
})
export class JitElevationModule {}
