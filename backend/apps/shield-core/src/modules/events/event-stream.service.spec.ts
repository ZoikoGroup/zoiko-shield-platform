import { Test, TestingModule } from '@nestjs/testing';
import { EventStreamService, ShieldRealtimeEvent } from './event-stream.service';
import {
  EventStreamController,
  PublishRealtimeEventDto,
} from './event-stream.controller';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { firstValueFrom, toArray, take } from 'rxjs';

describe('EventStreamService & EventStreamController', () => {
  let service: EventStreamService;
  let controller: EventStreamController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventStreamController],
      providers: [EventStreamService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    service = module.get<EventStreamService>(EventStreamService);
    controller = module.get<EventStreamController>(EventStreamController);
    service.clearBuffer();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });

  it('should stream published events for matching tenant', async () => {
    const tenantId = 'tenant-test-01';
    const stream$ = service.getEventStreamForTenant(tenantId);

    const eventPayload: PublishRealtimeEventDto = {
      id: 'evt-test-101',
      type: 'ALERT_CREATED',
      tenantId,
      timestamp: new Date().toISOString(),
      data: { severity: 'HIGH', title: 'Suspicious Execution' },
    };

    const promise = firstValueFrom(stream$);
    service.publishEvent(eventPayload);

    const received = await promise;
    expect(received.type).toBe('ALERT_CREATED');
    expect(received.id).toBe('evt-test-101');
    expect((received.data as ShieldRealtimeEvent).data).toEqual(
      eventPayload.data,
    );
  });

  it('should publish event via controller endpoint', () => {
    const eventPayload: PublishRealtimeEventDto = {
      id: 'evt-test-102',
      type: 'CORRELATION_MATCH',
      tenantId: 'tenant-test-02',
      timestamp: new Date().toISOString(),
      data: { pattern: 'ZS-CORR-RANSOMWARE-001' },
    };

    const response = controller.publishEvent(eventPayload);
    expect(response.statusCode).toBe(202);
    expect(response.message).toBe('Event broadcast queued');
  });

  it('should filter out events for different tenants (zero cross-tenant leaks)', (done) => {
    const targetTenant = 'tenant-target';
    const otherTenant = 'tenant-other';
    const stream$ = service.getEventStreamForTenant(targetTenant);

    const sub = stream$.subscribe((event) => {
      const data = event.data as ShieldRealtimeEvent;
      expect(data.tenantId).toBe(targetTenant);
      expect(event.id).toBe('evt-target');
      sub.unsubscribe();
      done();
    });

    service.publishEvent({
      id: 'evt-other',
      type: 'CASE_UPDATED',
      tenantId: otherTenant,
      timestamp: new Date().toISOString(),
      data: {},
    });

    service.publishEvent({
      id: 'evt-target',
      type: 'CASE_UPDATED',
      tenantId: targetTenant,
      timestamp: new Date().toISOString(),
      data: {},
    });
  });

  it('should replay buffered events when Last-Event-ID is provided', async () => {
    const tenantId = 'tenant-replay-01';

    // Publish 3 events
    service.publishEvent({
      id: 'evt-1',
      type: 'ALERT_CREATED',
      tenantId,
      timestamp: new Date().toISOString(),
      data: { seq: 1 },
    });
    service.publishEvent({
      id: 'evt-2',
      type: 'CASE_UPDATED',
      tenantId,
      timestamp: new Date().toISOString(),
      data: { seq: 2 },
    });
    service.publishEvent({
      id: 'evt-3',
      type: 'ROLLBACK_PROGRESS',
      tenantId,
      timestamp: new Date().toISOString(),
      data: { seq: 3 },
    });

    // Client reconnects asking for events after evt-1
    const stream$ = service.getEventStreamForTenant(tenantId, 'evt-1');
    const replayed = await firstValueFrom(stream$.pipe(take(2), toArray()));

    expect(replayed.length).toBe(2);
    expect(replayed[0].id).toBe('evt-2');
    expect(replayed[1].id).toBe('evt-3');
  });

  it('should support controller stream invocation with headers and query params', () => {
    const stream = controller.streamEvents('tenant-hdr-01', 'evt-prev');
    expect(stream).toBeDefined();
  });
});
