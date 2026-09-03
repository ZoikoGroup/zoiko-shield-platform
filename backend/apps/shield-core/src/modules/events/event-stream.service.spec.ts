import { Test, TestingModule } from '@nestjs/testing';
import { EventStreamService } from './event-stream.service';
import { EventStreamController, PublishRealtimeEventDto } from './event-stream.controller';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { firstValueFrom } from 'rxjs';

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
    expect(received.data).toEqual(eventPayload);
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

  it('should filter out events for different tenants', (done) => {
    const targetTenant = 'tenant-target';
    const otherTenant = 'tenant-other';
    const stream$ = service.getEventStreamForTenant(targetTenant);

    const sub = stream$.subscribe((event) => {
      expect((event.data as PublishRealtimeEventDto).tenantId).toBe(targetTenant);
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
});
