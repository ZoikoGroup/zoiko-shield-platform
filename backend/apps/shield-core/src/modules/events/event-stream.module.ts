import { Module } from '@nestjs/common';
import { EventStreamService } from './event-stream.service';
import { EventStreamController } from './event-stream.controller';

@Module({
  controllers: [EventStreamController],
  providers: [EventStreamService],
  exports: [EventStreamService],
})
export class EventStreamModule {}
