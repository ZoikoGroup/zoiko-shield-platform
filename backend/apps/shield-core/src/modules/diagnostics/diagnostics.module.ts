import { Module } from '@nestjs/common';
import { PlatformDiagnosticsService } from './platform-diagnostics.service';

@Module({
  providers: [PlatformDiagnosticsService],
  exports: [PlatformDiagnosticsService],
})
export class DiagnosticsModule {}
