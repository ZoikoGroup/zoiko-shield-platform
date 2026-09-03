import {
  Controller,
  Sse,
  Headers,
  Query,
  Post,
  Body,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventStreamService } from './event-stream.service';

export class PublishRealtimeEventDto {
  id!: string;
  type!:
    | 'ALERT_CREATED'
    | 'CASE_UPDATED'
    | 'MERKLE_EPOCH_SEALED'
    | 'ACTION_EXECUTED'
    | 'CORRELATION_MATCH';
  tenantId!: string;
  timestamp!: string;
  data!: Record<string, unknown>;
}

@Controller('api/v1/events')
export class EventStreamController {
  constructor(private readonly eventStreamService: EventStreamService) {}

  @Sse('stream')
  streamEvents(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ): Observable<MessageEvent> {
    const tenantId = headerTenantId || queryTenantId || 'tenant-bank-01';
    return this.eventStreamService.getEventStreamForTenant(tenantId);
  }

  @Post('publish')
  publishEvent(@Body() event: PublishRealtimeEventDto) {
    this.eventStreamService.publishEvent(event);
    return { statusCode: HttpStatus.ACCEPTED, message: 'Event broadcast queued' };
  }
}
