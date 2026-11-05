import {
  Controller,
  Sse,
  Headers,
  Query,
  Post,
  Body,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventStreamService, SseMessage } from './event-stream.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
} from 'class-validator';

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator.
export class PublishRealtimeEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  id!: string;

  // HEARTBEAT is deliberately absent: it is server-generated only.
  @IsIn([
    'ALERT_CREATED',
    'CASE_UPDATED',
    'MERKLE_EPOCH_SEALED',
    'ACTION_EXECUTED',
    'CORRELATION_MATCH',
    'ROLLBACK_PROGRESS',
    'AI_INCIDENT_DRIFT',
  ])
  type!:
    | 'ALERT_CREATED'
    | 'CASE_UPDATED'
    | 'MERKLE_EPOCH_SEALED'
    | 'ACTION_EXECUTED'
    | 'CORRELATION_MATCH'
    | 'ROLLBACK_PROGRESS'
    | 'AI_INCIDENT_DRIFT';

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  tenantId!: string;

  @IsISO8601()
  timestamp!: string;

  // Event payloads are type-specific and relayed to SSE clients as-is.
  @IsObject()
  data!: Record<string, unknown>;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/events')
export class EventStreamController {
  constructor(private readonly eventStreamService: EventStreamService) {}

  @Sse('stream')
  streamEvents(
    @Headers('x-tenant-id') headerTenantId?: string,
    @Headers('last-event-id') lastEventId?: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('lastEventId') queryLastEventId?: string,
  ): Observable<SseMessage> {
    const tenantId = headerTenantId || queryTenantId || 'tenant-bank-01';
    const effectiveLastEventId = lastEventId || queryLastEventId;
    return this.eventStreamService.getEventStreamForTenant(
      tenantId,
      effectiveLastEventId,
    );
  }

  @Post('publish')
  publishEvent(@Body() event: PublishRealtimeEventDto) {
    this.eventStreamService.publishEvent(event);
    return {
      statusCode: HttpStatus.ACCEPTED,
      message: 'Event broadcast queued',
    };
  }
}
