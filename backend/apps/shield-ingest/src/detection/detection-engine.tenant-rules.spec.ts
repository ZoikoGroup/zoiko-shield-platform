import { BadRequestException } from '@nestjs/common';
import { DetectionEngineService } from './detection-engine.service';

const T = 'tenant-1';
const event = (over: object = {}) => ({
  id: 'ev-1',
  tenant_id: T,
  event_class: 'SOURCE_CONTROL_AUDIT',
  event_activity: 'GIT_PUSH',
  actor_user_id: 'alice',
  resource_id: 'acme/payments',
  outcome: 'SUCCESS',
  recorded_at: new Date(),
  ...over,
});
const matchRule = (
  over: object = {},
  conditions: object[] = [
    { field: 'resource_id', operator: 'EQUALS', value: 'acme/payments' },
  ],
) => ({
  id: 'rule-1',
  tenant_id: T,
  name: 'Push to payments',
  severity: 'HIGH',
  status: 'ACTIVE',
  current_version: 1,
  required_fields: '[]',
  condition_definition: JSON.stringify({ ruleType: 'MATCH', conditions }),
  ...over,
});

function build(
  rules: any[] = [],
  opts: {
    events?: any[];
    recentMatch?: any;
    thresholdCount?: number;
    ownedRules?: number;
  } = {},
) {
  let runSeq = 0;
  const prisma: any = {
    detectionRule: {
      findMany: jest.fn().mockResolvedValue(rules),
      count: jest.fn().mockResolvedValue(opts.ownedRules ?? 0),
      create: jest
        .fn()
        .mockImplementation(async ({ data }: any) => ({ id: 'new', ...data })),
    },
    detectionRun: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: `run-${++runSeq}`,
        ...data,
      })),
      findFirst: jest.fn().mockResolvedValue(opts.recentMatch ?? null),
    },
    normalizedEvent: {
      findMany: jest.fn().mockResolvedValue(opts.events ?? []),
      count: jest.fn().mockResolvedValue(opts.thresholdCount ?? 0),
    },
  };
  const alerts: any = {
    createAlertFromDetectionRun: jest.fn().mockResolvedValue({}),
  };
  return {
    service: new DetectionEngineService(prisma, alerts),
    prisma,
    alerts,
  };
}

describe('DetectionEngineService.evaluateTenantRules (live)', () => {
  it("runs only the tenant's own ACTIVE rules (never the shared platform ones), up to a cap", async () => {
    const { service, prisma } = build([]);
    await service.evaluateTenantRules(event());
    expect(prisma.detectionRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', tenant_id: T },
        take: 50,
      }),
    );
  });

  it('raises an alert for a rule that matches, and records the match', async () => {
    const { service, prisma, alerts } = build([matchRule()]);
    const matched = await service.evaluateTenantRules(event());
    expect(matched).toHaveLength(1);
    expect(prisma.detectionRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: 'MATCHED',
          rule_id: 'rule-1',
          event_id: 'ev-1',
          tenant_id: T,
        }),
      }),
    );
    expect(alerts.createAlertFromDetectionRun).toHaveBeenCalledWith('run-1');
  });

  it('writes NOTHING for a rule that does not match (no row per rule per event, forever)', async () => {
    const { service, prisma, alerts } = build([
      matchRule(),
      matchRule({ id: 'r2' }, [
        { field: 'resource_id', operator: 'EQUALS', value: 'someone/else' },
      ]),
    ]);
    const matched = await service.evaluateTenantRules(
      event({ resource_id: 'unrelated/repo' }),
    );
    expect(matched).toEqual([]);
    expect(prisma.detectionRun.create).not.toHaveBeenCalled();
    expect(alerts.createAlertFromDetectionRun).not.toHaveBeenCalled();
  });

  it('does not record a skipped rule either (a required field is missing on the event)', async () => {
    const { service, prisma } = build([
      matchRule({ required_fields: '["source_ip"]' }),
    ]);
    await service.evaluateTenantRules(event());
    expect(prisma.detectionRun.create).not.toHaveBeenCalled();
  });

  it('still records a rule that is broken, so the mistake is visible', async () => {
    const { service, prisma } = build([
      matchRule({ condition_definition: '{not json' }),
    ]);
    await service.evaluateTenantRules(event());
    expect(prisma.detectionRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ result: 'ERROR' }),
      }),
    );
  });

  it('one rule failing does not stop the others, or throw', async () => {
    const { service, alerts, prisma } = build([
      matchRule({ id: 'bad' }),
      matchRule({ id: 'good' }),
    ]);
    let calls = 0;
    prisma.detectionRun.create.mockImplementation(async ({ data }: any) => {
      if (++calls === 1) throw new Error('db hiccup');
      return { id: 'run-ok', ...data };
    });
    const matched = await service.evaluateTenantRules(event());
    expect(matched).toHaveLength(1);
    expect(alerts.createAlertFromDetectionRun).toHaveBeenCalledTimes(1);
  });

  it('matches case-insensitively and supports every operator', async () => {
    const cases: Array<[any, boolean]> = [
      [{ field: 'actor_user_id', operator: 'EQUALS', value: 'ALICE' }, true],
      [{ field: 'actor_user_id', operator: 'NOT_EQUALS', value: 'bob' }, true],
      [
        { field: 'actor_user_id', operator: 'NOT_EQUALS', value: 'alice' },
        false,
      ],
      [{ field: 'resource_id', operator: 'CONTAINS', value: 'PAYMENTS' }, true],
      [{ field: 'resource_id', operator: 'CONTAINS', value: 'billing' }, false],
      [
        { field: 'actor_user_id', operator: 'IN', value: ['bob', 'Alice'] },
        true,
      ],
      [{ field: 'actor_user_id', operator: 'IN', value: ['bob'] }, false],
      [{ field: 'source_ip', operator: 'EQUALS', value: '1.2.3.4' }, false], // field absent on the event
    ];
    for (const [cond, expected] of cases) {
      const { service } = build([matchRule({}, [cond])]);
      const got = (await service.evaluateTenantRules(event())).length > 0;
      if (got !== expected)
        throw new Error(
          `${JSON.stringify(cond)}: expected ${expected}, got ${got}`,
        );
    }
  });

  it('requires ALL conditions (AND)', async () => {
    const { service } = build([
      matchRule({}, [
        { field: 'resource_id', operator: 'EQUALS', value: 'acme/payments' },
        { field: 'outcome', operator: 'EQUALS', value: 'FAILURE' },
      ]),
    ]);
    expect(await service.evaluateTenantRules(event())).toEqual([]);
  });

  describe('threshold rules', () => {
    const threshold = matchRule({
      id: 'thr',
      condition_definition: JSON.stringify({
        ruleType: 'THRESHOLD',
        conditions: [
          { field: 'outcome', operator: 'EQUALS', value: 'SUCCESS' },
        ],
        windowMinutes: 10,
        threshold: 3,
      }),
    });

    it('alerts once the threshold is reached', async () => {
      const { service, alerts } = build([threshold], { thresholdCount: 3 });
      expect(await service.evaluateTenantRules(event())).toHaveLength(1);
      expect(alerts.createAlertFromDetectionRun).toHaveBeenCalledTimes(1);
    });

    it('stays quiet below the threshold', async () => {
      const { service, prisma } = build([threshold], { thresholdCount: 2 });
      expect(await service.evaluateTenantRules(event())).toEqual([]);
      expect(prisma.detectionRun.create).not.toHaveBeenCalled();
    });

    it('stays quiet for the rest of the window after it has fired (no alert per further event)', async () => {
      const { service, prisma, alerts } = build([threshold], {
        thresholdCount: 9,
        recentMatch: { id: 'earlier-run' },
      });
      expect(await service.evaluateTenantRules(event())).toEqual([]);
      expect(alerts.createAlertFromDetectionRun).not.toHaveBeenCalled();
      const [{ where }] = prisma.detectionRun.findFirst.mock.calls[0];
      expect(where).toMatchObject({
        rule_id: 'thr',
        tenant_id: T,
        result: 'MATCHED',
      });
      expect(Date.now() - where.executed_at.gte.getTime()).toBeGreaterThan(
        9 * 60_000,
      );
    });
  });
});

describe('DetectionEngineService.previewRule', () => {
  const definition: any = {
    ruleType: 'MATCH',
    conditions: [
      { field: 'actor_user_id', operator: 'EQUALS', value: 'alice' },
    ],
  };
  const events = [
    event({ id: 'a' }),
    event({ id: 'b', actor_user_id: 'bob' }),
    event({ id: 'c' }),
  ];

  it('reports how many recent events would match, with a few samples, and records nothing', async () => {
    const { service, prisma, alerts } = build([], { events });
    const r = await service.previewRule(T, definition);
    expect(r).toMatchObject({ evaluated: 3, matched: 2 });
    expect(r.samples.map((s) => s.id)).toEqual(['a', 'c']);
    expect(r.samples[0]).toMatchObject({
      activity: 'GIT_PUSH',
      resource: 'acme/payments',
      actor: 'alice',
      outcome: 'SUCCESS',
    });
    expect(prisma.detectionRun.create).not.toHaveBeenCalled();
    expect(alerts.createAlertFromDetectionRun).not.toHaveBeenCalled();
  });

  it("looks only at the caller's tenant, newest first", async () => {
    const { service, prisma } = build([], { events });
    await service.previewRule('tenant-xyz', definition, 80);
    expect(prisma.normalizedEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: 'tenant-xyz' },
        orderBy: { recorded_at: 'desc' },
        take: 80,
      }),
    );
  });

  it('bounds how much it looks at', async () => {
    const { service, prisma } = build([], { events });
    for (const [asked, expected] of [
      [undefined, 50],
      [0, 1],
      [-4, 1],
      [9999, 200],
      [Number.NaN, 50],
    ] as const) {
      prisma.normalizedEvent.findMany.mockClear();
      await service.previewRule(T, definition, asked as number);
      expect(prisma.normalizedEvent.findMany.mock.calls[0][0].take).toBe(
        expected,
      );
    }
  });

  it('caps the samples at five', async () => {
    const many = Array.from({ length: 9 }, (_, i) => event({ id: `e${i}` }));
    const { service } = build([], { events: many });
    const r = await service.previewRule(T, definition);
    expect(r.matched).toBe(9);
    expect(r.samples).toHaveLength(5);
  });

  it('is honest about an empty history, and refuses rule types it cannot preview', async () => {
    const { service } = build([], { events: [] });
    expect(await service.previewRule(T, definition)).toMatchObject({
      evaluated: 0,
      matched: 0,
      samples: [],
    });
    await expect(
      service.previewRule(T, { ...definition, ruleType: 'THRESHOLD' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('DetectionEngineService.createRule: per-tenant limit', () => {
  const dto: any = {
    tenantId: T,
    name: 'r',
    conditionDefinition: { ruleType: 'MATCH', conditions: [] },
  };

  it('allows a rule below the limit', async () => {
    const { service, prisma } = build([], { ownedRules: 99 });
    await service.createRule(dto);
    expect(prisma.detectionRule.create).toHaveBeenCalled();
    expect(prisma.detectionRule.count).toHaveBeenCalledWith({
      where: { tenant_id: T },
    });
  });

  it('refuses the 101st rule, and says what to do', async () => {
    const { service, prisma } = build([], { ownedRules: 100 });
    await expect(service.createRule(dto)).rejects.toThrow(/at most 100 rules/);
    expect(prisma.detectionRule.create).not.toHaveBeenCalled();
  });
});

describe('replays are unchanged: they still record every evaluation', () => {
  it('records a NO_MATCH run when replaying a rule over events', async () => {
    const { service, prisma } = build([matchRule()], {
      events: [event({ resource_id: 'unrelated/repo' })],
    });
    prisma.detectionRule.findFirst = jest
      .fn()
      .mockResolvedValue({ ...matchRule(), detectionRuns: [] });
    await service.replayDetections(T, 'rule-1');
    expect(prisma.detectionRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ result: 'NO_MATCH' }),
      }),
    );
  });
});
