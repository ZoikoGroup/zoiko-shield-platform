import { Test, TestingModule } from '@nestjs/testing';
import { LiveTelemetryStreamService } from './live-telemetry-stream.service';
import { LiveTelemetryStreamController } from './live-telemetry-stream.controller';
import { firstValueFrom, take, toArray } from 'rxjs';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('LiveTelemetryStreamModule Suite', () => {
  let service: LiveTelemetryStreamService;
  let controller: LiveTelemetryStreamController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiveTelemetryStreamController],
      providers: [LiveTelemetryStreamService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    service = module.get<LiveTelemetryStreamService>(
      LiveTelemetryStreamService,
    );
    controller = module.get<LiveTelemetryStreamController>(
      LiveTelemetryStreamController,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });

  describe('LiveTelemetryStreamService', () => {
    it('should deliver events to matching tenant and filter out unrelated tenant events', async () => {
      const tenantA = 'tenant-acme';
      const tenantB = 'tenant-other';

      const stream$ = service.subscribeTenantStream(tenantA, false);

      // Collect first 2 emitted events (excluding heartbeats)
      const promise = firstValueFrom(stream$);

      // Publish event for Tenant B (should be filtered out for Tenant A)
      service.publishEvent({
        eventType: 'ALERT_DISPATCHED',
        tenantId: tenantB,
        payload: { alertId: 'INC-B', title: 'Tenant B Alert' },
      });

      // Publish event for Tenant A (should be received)
      service.publishEvent({
        eventType: 'ALERT_DISPATCHED',
        tenantId: tenantA,
        payload: { alertId: 'INC-A', title: 'Tenant A Alert' },
      });

      const message = await promise;
      expect(message.data.type).toBe('ALERT_DISPATCHED');
      expect(message.data.tenantId).toBe(tenantA);
      expect(message.data.payload.alertId).toBe('INC-A');
    });

    it('should deliver global events without tenantId to all subscribers', async () => {
      const tenant = 'tenant-global-test';
      const stream$ = service.subscribeTenantStream(tenant, false);
      const promise = firstValueFrom(stream$);

      service.publishEvent({
        eventType: 'EMERGENCY_FREEZE_TOGGLED',
        payload: { isFrozen: true },
      });

      const message = await promise;
      expect(message.data.type).toBe('EMERGENCY_FREEZE_TOGGLED');
      expect(message.data.payload.isFrozen).toBe(true);
    });

    it('should deliver all tenant events when isSuperAdmin is true', async () => {
      const stream$ = service.subscribeTenantStream('admin-context', true);
      const promise = firstValueFrom(stream$);

      service.publishEvent({
        eventType: 'ALERT_DISPATCHED',
        tenantId: 'tenant-any-corp',
        payload: { alertId: 'INC-SUPER' },
      });

      const message = await promise;
      expect(message.data.tenantId).toBe('tenant-any-corp');
      expect(message.data.payload.alertId).toBe('INC-SUPER');
    });
  });

  describe('LiveTelemetryStreamController', () => {
    it('should broadcast an event via POST /api/v1/streaming/broadcast', () => {
      const res = controller.broadcastEvent({
        eventType: 'JIT_ELEVATION_STATE_CHANGE',
        tenantId: 'tenant-finance',
        payload: { requestId: 'jit-123', status: 'APPROVED' },
      });

      expect(res.status).toBe('BROADCAST_SUCCESS');
      expect(res.eventId).toBeDefined();
    });

    it('should simulate an alert via POST /api/v1/streaming/simulate', () => {
      const res = controller.simulateLiveEvent({
        eventType: 'ALERT',
        tenantId: 'tenant-bank',
      });

      expect(res.status).toBe('SIMULATED');
      expect(res.event.eventType).toBe('ALERT_DISPATCHED');
      expect(res.event.payload.severity).toBe('CRITICAL');
    });

    it('should return streaming health status', () => {
      const health = controller.getStreamingHealth();
      expect(health.status).toBe('HEALTHY');
      expect(health.protocol).toContain('Server-Sent Events');
    });
  });
});
