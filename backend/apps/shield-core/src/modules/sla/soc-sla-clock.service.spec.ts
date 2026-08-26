import { Test, TestingModule } from '@nestjs/testing';
import { SocSlaClockService } from './soc-sla-clock.service';
import { SlaMeasurementService } from './sla-measurement.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SocSlaClockService (ZS-COM-BILL-001 SVC-01/04 SOC Response Clock)', () => {
  let service: SocSlaClockService;
  let measurementServiceMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    measurementServiceMock = {};
    prismaMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocSlaClockService,
        { provide: SlaMeasurementService, useValue: measurementServiceMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SocSlaClockService>(SocSlaClockService);
  });

  it('starts a 15-minute triage clock for CRITICAL severity incidents', () => {
    const clock = service.startTriageClock({
      caseId: 'case-critical-01',
      tenantId: 'tenant-001',
      severity: 'CRITICAL',
      coverageTier: '24_7',
    });

    expect(clock.caseId).toBe('case-critical-01');
    expect(clock.targetResponseMinutes).toBe(15);
    expect(clock.status).toBe('RUNNING');
  });

  it('starts a 60-minute triage clock for HIGH severity incidents', () => {
    const clock = service.startTriageClock({
      caseId: 'case-high-01',
      tenantId: 'tenant-001',
      severity: 'HIGH',
    });

    expect(clock.targetResponseMinutes).toBe(60);
    expect(clock.status).toBe('RUNNING');
  });

  it('pauses and resumes clock when customer action is required', () => {
    const clock = service.startTriageClock({
      caseId: 'case-paused-01',
      tenantId: 'tenant-001',
      severity: 'HIGH',
    });

    const paused = service.pauseClock(
      'case-paused-01',
      'CUSTOMER_ACTION_REQUIRED',
    );
    expect(paused.status).toBe('PAUSED');
    expect(paused.pauseReason).toBe('CUSTOMER_ACTION_REQUIRED');

    const resumed = service.resumeClock('case-paused-01');
    expect(resumed.status).toBe('RUNNING');
    expect(resumed.pauseReason).toBeUndefined();
  });

  it('computes net active triage duration and marks COMPLETED when within target', () => {
    service.startTriageClock({
      caseId: 'case-completed-01',
      tenantId: 'tenant-001',
      severity: 'HIGH',
    });

    const result = service.stopClock('case-completed-01');
    expect(result.isBreached).toBe(false);
    expect(result.clock.status).toBe('COMPLETED');
  });
});
