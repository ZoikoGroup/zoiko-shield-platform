import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SocSlaClockService } from './soc-sla-clock.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Backed by a small in-memory stand-in for the CaseSlaClock delegate so the
 * elapsed/pause/breach arithmetic is exercised for real rather than asserted
 * against canned return values.
 */
function makePrismaMock() {
  const rows = new Map<string, any>();
  return {
    rows,
    caseSlaClock: {
      findUnique: jest.fn(
        async ({ where }: any) => rows.get(where.case_id) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          paused_at: null,
          pause_reason: null,
          stopped_at: null,
          active_triage_minutes: null,
          breached_at: null,
          coverage_tier: '24_7',
          ...data,
        };
        rows.set(data.case_id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = { ...rows.get(where.case_id), ...data };
        rows.set(where.case_id, row);
        return row;
      }),
    },
  } as any;
}

describe('SocSlaClockService (ZS-COM-BILL-001 SVC-01/04 SOC Response Clock)', () => {
  let service: SocSlaClockService;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocSlaClockService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SocSlaClockService>(SocSlaClockService);
  });

  it('starts a 15-minute triage clock for CRITICAL severity incidents', async () => {
    const clock = await service.startTriageClock({
      caseId: 'case-critical-01',
      tenantId: 'tenant-001',
      severity: 'CRITICAL',
      coverageTier: '24_7',
    });

    expect(clock.caseId).toBe('case-critical-01');
    expect(clock.targetResponseMinutes).toBe(15);
    expect(clock.status).toBe('RUNNING');
  });

  it('starts a 60-minute triage clock for HIGH severity incidents', async () => {
    const clock = await service.startTriageClock({
      caseId: 'case-high-01',
      tenantId: 'tenant-001',
      severity: 'HIGH',
    });

    expect(clock.targetResponseMinutes).toBe(60);
    expect(clock.status).toBe('RUNNING');
  });

  it('does not restart an already-running clock', async () => {
    const first = await service.startTriageClock({
      caseId: 'case-idempotent-01',
      tenantId: 'tenant-001',
      severity: 'HIGH',
    });
    const second = await service.startTriageClock({
      caseId: 'case-idempotent-01',
      tenantId: 'tenant-001',
      severity: 'CRITICAL',
    });

    expect(second.startedAt).toEqual(first.startedAt);
    expect(second.targetResponseMinutes).toBe(60);
    expect(prismaMock.caseSlaClock.create).toHaveBeenCalledTimes(1);
  });

  it('pauses and resumes clock when customer action is required', async () => {
    await service.startTriageClock({
      caseId: 'case-paused-01',
      tenantId: 'tenant-001',
      severity: 'HIGH',
    });

    const paused = await service.pauseClock(
      'case-paused-01',
      'CUSTOMER_ACTION_REQUIRED',
    );
    expect(paused.status).toBe('PAUSED');
    expect(paused.pauseReason).toBe('CUSTOMER_ACTION_REQUIRED');

    const resumed = await service.resumeClock('case-paused-01');
    expect(resumed.status).toBe('RUNNING');
    expect(resumed.pauseReason).toBeUndefined();
  });

  it('excludes paused time from the measured triage duration', async () => {
    await service.startTriageClock({
      caseId: 'case-pause-math-01',
      tenantId: 'tenant-001',
      severity: 'CRITICAL',
    });

    // Started 30 minutes ago but paused for 25 of them: 5 active minutes,
    // comfortably inside the 15-minute CRITICAL target.
    const row = prismaMock.rows.get('case-pause-math-01');
    row.started_at = new Date(Date.now() - 30 * 60 * 1000);
    row.total_paused_ms = 25 * 60 * 1000;

    const result = await service.stopClock('case-pause-math-01');
    expect(result.activeTriageMinutes).toBe(5);
    expect(result.isBreached).toBe(false);
    expect(result.clock.status).toBe('COMPLETED');
  });

  it('counts a trailing pause that was still open when the clock stopped', async () => {
    await service.startTriageClock({
      caseId: 'case-trailing-pause-01',
      tenantId: 'tenant-001',
      severity: 'CRITICAL',
    });
    await service.pauseClock('case-trailing-pause-01', 'THIRD_PARTY');

    const row = prismaMock.rows.get('case-trailing-pause-01');
    row.started_at = new Date(Date.now() - 60 * 60 * 1000);
    row.paused_at = new Date(Date.now() - 55 * 60 * 1000);

    // 60 minutes elapsed, 55 of them paused and never resumed -> 5 active.
    const result = await service.stopClock('case-trailing-pause-01');
    expect(result.activeTriageMinutes).toBe(5);
    expect(result.isBreached).toBe(false);
  });

  it('marks a clock BREACHED when net active time exceeds the target', async () => {
    await service.startTriageClock({
      caseId: 'case-breach-01',
      tenantId: 'tenant-001',
      severity: 'CRITICAL',
    });

    const row = prismaMock.rows.get('case-breach-01');
    row.started_at = new Date(Date.now() - 45 * 60 * 1000);

    const result = await service.stopClock('case-breach-01');
    expect(result.isBreached).toBe(true);
    expect(result.clock.status).toBe('BREACHED');
    expect(result.clock.breachedAt).toBeDefined();
  });

  it('computes net active triage duration and marks COMPLETED when within target', async () => {
    await service.startTriageClock({
      caseId: 'case-completed-01',
      tenantId: 'tenant-001',
      severity: 'HIGH',
    });

    const result = await service.stopClock('case-completed-01');
    expect(result.isBreached).toBe(false);
    expect(result.clock.status).toBe('COMPLETED');
  });

  it('flags an overdue clock as breached while it is still running', async () => {
    await service.startTriageClock({
      caseId: 'case-overdue-01',
      tenantId: 'tenant-001',
      severity: 'CRITICAL',
    });
    const row = prismaMock.rows.get('case-overdue-01');
    row.started_at = new Date(Date.now() - 45 * 60 * 1000);

    const clock = await service.markBreachedIfOverdue('case-overdue-01');
    expect(clock.status).toBe('BREACHED');
    expect(clock.activeTriageDurationMinutes).toBe(45);
  });

  it('leaves a running clock alone when it is still inside its target', async () => {
    await service.startTriageClock({
      caseId: 'case-ontime-01',
      tenantId: 'tenant-001',
      severity: 'LOW',
    });

    const clock = await service.markBreachedIfOverdue('case-ontime-01');
    expect(clock.status).toBe('RUNNING');
  });

  it('throws when a clock does not exist for the case', async () => {
    await expect(service.pauseClock('case-missing', 'reason')).rejects.toThrow(
      NotFoundException,
    );
  });
});
