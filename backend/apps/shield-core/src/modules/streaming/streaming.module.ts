import { Global, Module } from '@nestjs/common';
import { LiveTelemetryStreamService } from './live-telemetry-stream.service';
import { LiveTelemetryStreamController } from './live-telemetry-stream.controller';

@Global()
@Module({
  controllers: [LiveTelemetryStreamController],
  providers: [LiveTelemetryStreamService],
  exports: [LiveTelemetryStreamService],
})
export class StreamingModule {}
