import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  Sse,
  HttpCode,
  HttpStatus,
  MessageEvent,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { LiveTelemetryStreamService } from './live-telemetry-stream.service';
import {
  BroadcastStreamEventDto,
  TriggerSimulatedEventDto,
} from './dto/streaming.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/streaming')
export class LiveTelemetryStreamController {
  constructor(
    private readonly streamService: LiveTelemetryStreamService,
  ) {}

  /**
   * SSE Stream Endpoint: GET /api/v1/streaming/events
   * Delivers real-time tenant-isolated security telemetry, alerts, and JIT state changes.
   */
  @Sse('events')
  streamEvents(
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('superAdmin') isSuperAdminQuery?: string,
  ): Observable<MessageEvent> {
    const tenantId = headerTenantId || queryTenantId || 'tenant-default';
    const isSuperAdmin = isSuperAdminQuery === 'true';

    return this.streamService.subscribeTenantStream(
      tenantId,
      isSuperAdmin,
    ) as Observable<MessageEvent>;
  }

  /**
   * POST /api/v1/streaming/broadcast
   * Internal ingestion gateway for microservices to broadcast real-time events.
   */
  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  broadcastEvent(@Body() dto: BroadcastStreamEventDto) {
    const published = this.streamService.publishEvent({
      eventType: dto.eventType,
      tenantId: dto.tenantId,
      payload: dto.payload,
    });

    return {
      status: 'BROADCAST_SUCCESS',
      eventId: published.eventId,
      timestamp: published.timestamp,
    };
  }

  /**
   * POST /api/v1/streaming/simulate
   * Triggers synthetic real-time event simulation for live demonstrations.
   */
  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  simulateLiveEvent(@Body() dto: TriggerSimulatedEventDto) {
    const tenantId = dto.tenantId || 'tenant-commercial-bank';

    let event;
    switch (dto.eventType) {
      case 'ALERT':
        event = this.streamService.simulateAlertStream(tenantId, {
          alertId: `INC-STREAM-${Date.now().toString().slice(-4)}`,
          title: 'Real-Time EDR Lateral Movement Detected on srv-prod-db-02',
          severity: 'CRITICAL',
          ...(dto.customPayload || {}),
        });
        break;

      case 'JIT':
        event = this.streamService.simulateJitStream(tenantId, {
          requestId: `jit-live-${Date.now().toString().slice(-4)}`,
          requester: 'admin-lead-ops',
          status: 'APPROVED',
          durationMinutes: 60,
          ...(dto.customPayload || {}),
        });
        break;

      case 'MERKLE':
        event = this.streamService.simulateMerkleCommitStream(tenantId, {
          epochBlockNumber: 1044,
          merkleRootHex: '9f8e7d6c5b4a3210fedcba9876543210abcdef0123456789abcdef0123456789',
          leafCount: 48,
          ...(dto.customPayload || {}),
        });
        break;

      case 'FREEZE':
        event = this.streamService.publishEvent({
          eventType: 'EMERGENCY_FREEZE_TOGGLED',
          tenantId,
          payload: {
            isFrozen: true,
            actor: 'secops-emergency-commander',
            reason: 'Synthetic Kill-Switch Drill',
            ...(dto.customPayload || {}),
          },
        });
        break;
    }

    return {
      status: 'SIMULATED',
      event,
    };
  }

  /**
   * GET /api/v1/streaming/health
   */
  @Get('health')
  getStreamingHealth() {
    return {
      status: 'HEALTHY',
      service: 'shield-core-streaming',
      protocol: 'Server-Sent Events (SSE) / RFC 8895',
      timestamp: new Date().toISOString(),
    };
  }
}
