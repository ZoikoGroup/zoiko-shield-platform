import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

/** A tenant with 20 events in all: 3 in the last day, 10 in the last week, 2 quarantined, 15 accepted. */
function build() {
  const count = jest.fn(async ({ where }: any) => {
    if (where.received_at) {
      const hours = Math.round((Date.now() - where.received_at.gte.getTime()) / 3_600_000);
      return hours <= 24 ? 3 : hours <= 168 ? 10 : 20;
    }
    if (where.processing_status === 'ACCEPTED') return 15;
    if (where.processing_status === 'QUARANTINED') return 2;
    return 20;
  });
  const prisma: any = { rawEvent: { count } };
  return { service: new DashboardService(prisma), count };
}

describe('DashboardService.getEventMetrics: events received in a window', () => {
  it('defaults to 24 hours and keeps the existing fields', async () => {
    const { service } = build();
    expect(await service.getEventMetrics('t1')).toEqual({
      totalRaw: 20,
      accepted: 15,
      quarantined: 2,
      received24h: 3,
      windowHours: 24,
      receivedInWindow: 3,
    });
  });

  it('counts the last 24 hours only once when that is the window', async () => {
    const { service, count } = build();
    await service.getEventMetrics('t1', 24);
    expect(count).toHaveBeenCalledTimes(4);
  });

  it('answers a 7-day window, leaving received24h as the last 24 hours', async () => {
    const { service } = build();
    const r = await service.getEventMetrics('t1', 168);
    expect(r.windowHours).toBe(168);
    expect(r.receivedInWindow).toBe(10);
    expect(r.received24h).toBe(3);
  });

  it('only ever counts the caller\'s tenant', async () => {
    const { service, count } = build();
    await service.getEventMetrics('tenant-xyz', 168);
    for (const [arg] of count.mock.calls) expect(arg.where.tenant_id).toBe('tenant-xyz');
  });

  it('clamps a silly window instead of trusting it', async () => {
    const { service } = build();
    expect((await service.getEventMetrics('t1', 0)).windowHours).toBe(1);
    expect((await service.getEventMetrics('t1', -50)).windowHours).toBe(1);
    expect((await service.getEventMetrics('t1', 999_999)).windowHours).toBe(24 * 90);
    expect((await service.getEventMetrics('t1', 36.9)).windowHours).toBe(36);
    expect((await service.getEventMetrics('t1', Number.NaN)).windowHours).toBe(24);
  });
});

describe('DashboardController.getEventMetrics: the hours parameter', () => {
  const run = async (hours?: string) => {
    const getEventMetrics = jest.fn().mockResolvedValue({});
    const controller = new DashboardController({ getEventMetrics } as any);
    await controller.getEventMetrics('tenant-1', undefined, hours);
    return getEventMetrics.mock.calls[0];
  };

  it('passes a number through and defaults to 24 when absent', async () => {
    expect(await run('168')).toEqual(['tenant-1', 168]);
    expect(await run(undefined)).toEqual(['tenant-1', 24]);
  });

  it('falls back to 24 for blank or non-numeric values (a blank must not become 1 hour)', async () => {
    for (const bad of ['', '   ', 'abc', 'NaN', 'Infinity', '1e999x']) {
      expect((await run(bad))[1]).toBe(24);
    }
  });
});
