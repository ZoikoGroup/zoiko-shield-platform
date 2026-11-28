import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test } from '@nestjs/testing';
import {
  AlertRulesController,
  buildDefinition,
  toAlertRuleView,
} from './alert-rules.controller';
import {
  CreateAlertRuleDto,
  PreviewAlertRuleDto,
  UpdateAlertRuleDto,
} from './alert-rules.dto';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const RULE = '33333333-3333-4333-8333-333333333333';
const user: any = { id: 'user-1', tenantId: TENANT };

const row = (over: object = {}) => ({
  id: RULE,
  tenant_id: TENANT,
  name: 'Push to payments',
  description: null,
  severity: 'HIGH',
  status: 'ACTIVE',
  current_version: 2,
  condition_definition: JSON.stringify({
    ruleType: 'MATCH',
    conditions: [
      { field: 'resource_id', operator: 'EQUALS', value: 'acme/payments' },
    ],
  }),
  created_at: 'c',
  updated_at: 'u',
  ...over,
});
const cond = {
  field: 'resource_id',
  operator: 'EQUALS',
  value: 'acme/payments',
};

const errors = async (cls: any, body: object) =>
  (await validate(plainToInstance(cls, body) as object)).flatMap((e) => [
    e.property,
    ...(e.children ?? []).flatMap((c) => [
      c.property,
      ...(c.children ?? []).map((g) => g.property),
    ]),
  ]);

describe('AlertRulesController', () => {
  let ctl: AlertRulesController;
  let ingest: Record<string, jest.Mock>;

  beforeEach(async () => {
    ingest = {
      listAlertRules: jest.fn().mockResolvedValue({
        data: [
          row(),
          row({ id: 'g', tenant_id: null }),
          row({ id: 'x', tenant_id: OTHER }),
        ],
      }),
      createAlertRule: jest.fn().mockResolvedValue({ data: row() }),
      updateAlertRule: jest.fn().mockResolvedValue({ data: row() }),
      setAlertRuleEnabled: jest
        .fn()
        .mockResolvedValue({ data: row({ status: 'DISABLED' }) }),
      previewAlertRule: jest
        .fn()
        .mockResolvedValue({ data: { evaluated: 1, matched: 1, samples: [] } }),
    };
    const mod = await Test.createTestingModule({
      controllers: [AlertRulesController],
      providers: [{ provide: ShieldIngestClient, useValue: ingest }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    ctl = mod.get(AlertRulesController);
  });

  describe('list', () => {
    it("returns only this tenant's own rules, never shared or other tenants'", async () => {
      const { data } = await ctl.list(TENANT, user);
      expect(data.map((r: any) => r.id)).toEqual([RULE]);
    });

    it('shows conditions already parsed, and a plain on/off flag', async () => {
      const [r] = (await ctl.list(TENANT, user)).data;
      expect(r).toMatchObject({
        enabled: true,
        severity: 'HIGH',
        conditions: [cond],
        threshold: null,
        version: 2,
      });
      expect(r).not.toHaveProperty('condition_definition');
      expect(r).not.toHaveProperty('tenant_id');
    });

    it('survives a stored rule it cannot read', () => {
      expect(
        toAlertRuleView(row({ condition_definition: '{nope' })).conditions,
      ).toEqual([]);
    });
  });

  describe('create', () => {
    const dto: any = {
      name: '  Push to payments ',
      severity: 'HIGH',
      conditions: [cond],
    };

    it('always uses the signed-in tenant and user, and builds the definition itself', async () => {
      await ctl.create(TENANT, user, dto);
      expect(ingest.createAlertRule).toHaveBeenCalledWith(TENANT, {
        tenantId: TENANT,
        name: 'Push to payments',
        description: undefined,
        severity: 'HIGH',
        ruleType: 'MATCH',
        conditionDefinition: { ruleType: 'MATCH', conditions: [cond] },
        createdBy: 'user-1',
      });
    });

    it('cannot be pointed at another tenant through the body', async () => {
      await ctl.create(TENANT, user, {
        ...dto,
        tenantId: OTHER,
        status: 'DISABLED',
      });
      expect(ingest.createAlertRule.mock.calls[0][0]).toBe(TENANT);
      expect(ingest.createAlertRule.mock.calls[0][1]).toMatchObject({
        tenantId: TENANT,
      });
      expect(ingest.createAlertRule.mock.calls[0][1]).not.toHaveProperty(
        'status',
      );
    });

    it('makes a threshold rule when both numbers are given', async () => {
      await ctl.create(TENANT, user, {
        ...dto,
        threshold: 5,
        windowMinutes: 10,
      });
      expect(
        ingest.createAlertRule.mock.calls[0][1].conditionDefinition,
      ).toEqual({
        ruleType: 'THRESHOLD',
        conditions: [cond],
        threshold: 5,
        windowMinutes: 10,
      });
    });

    it('refuses half a threshold rather than silently doing something else', async () => {
      await expect(
        ctl.create(TENANT, user, { ...dto, threshold: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        ctl.create(TENANT, user, { ...dto, windowMinutes: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ingest.createAlertRule).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('changes only what was sent and keeps the rest of the condition', async () => {
      ingest.listAlertRules.mockResolvedValue({
        data: [
          row({
            condition_definition: JSON.stringify({
              ruleType: 'THRESHOLD',
              conditions: [cond],
              threshold: 3,
              windowMinutes: 15,
            }),
          }),
        ],
      });
      await ctl.update(TENANT, user, RULE, { threshold: 9 } as any);
      expect(ingest.updateAlertRule).toHaveBeenCalledWith(TENANT, RULE, {
        conditionDefinition: {
          ruleType: 'THRESHOLD',
          conditions: [cond],
          threshold: 9,
          windowMinutes: 15,
        },
      });
    });

    it('a name-only change leaves the condition alone', async () => {
      await ctl.update(TENANT, user, RULE, { name: ' Renamed ' } as any);
      expect(ingest.updateAlertRule).toHaveBeenCalledWith(TENANT, RULE, {
        name: 'Renamed',
      });
    });

    it("will not touch a shared rule or another tenant's rule", async () => {
      ingest.listAlertRules.mockResolvedValue({
        data: [row({ tenant_id: null }), row({ tenant_id: OTHER })],
      });
      await expect(
        ctl.update(TENANT, user, RULE, { name: 'abc' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        ctl.setEnabled(TENANT, user, RULE, { enabled: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(ingest.updateAlertRule).not.toHaveBeenCalled();
      expect(ingest.setAlertRuleEnabled).not.toHaveBeenCalled();
    });
  });

  it('turns a rule off and on', async () => {
    expect(
      (await ctl.setEnabled(TENANT, user, RULE, { enabled: false })).data
        .enabled,
    ).toBe(false);
    expect(ingest.setAlertRuleEnabled).toHaveBeenCalledWith(
      TENANT,
      RULE,
      false,
    );
  });

  it('previews with the tenant from the session, as a match rule', async () => {
    await ctl.preview(TENANT, user, { conditions: [cond], limit: 20 } as any);
    expect(ingest.previewAlertRule).toHaveBeenCalledWith(TENANT, {
      conditionDefinition: { ruleType: 'MATCH', conditions: [cond] },
      limit: 20,
    });
  });

  it('builds a plain match when no threshold is given', () => {
    expect(buildDefinition({ conditions: [cond as any] })).toEqual({
      ruleType: 'MATCH',
      conditions: [cond],
    });
  });
});

describe('alert rule request validation', () => {
  const ok = {
    name: 'Push to payments',
    severity: 'HIGH',
    conditions: [{ field: 'resource_id', operator: 'EQUALS', value: 'x' }],
  };

  it('accepts a well-formed rule', async () => {
    expect(await errors(CreateAlertRuleDto, ok)).toEqual([]);
  });

  it.each([
    [
      'unknown field',
      {
        conditions: [
          { field: 'password_hash', operator: 'EQUALS', value: 'x' },
        ],
      },
    ],
    [
      'unsupported operator',
      { conditions: [{ field: 'outcome', operator: 'REGEX', value: 'x' }] },
    ],
    ['no conditions', { conditions: [] }],
    ['too many conditions', { conditions: Array(11).fill(ok.conditions[0]) }],
    [
      'overlong value',
      {
        conditions: [
          { field: 'outcome', operator: 'EQUALS', value: 'x'.repeat(201) },
        ],
      },
    ],
    [
      'empty value',
      { conditions: [{ field: 'outcome', operator: 'EQUALS', value: '' }] },
    ],
    [
      'non-text value',
      {
        conditions: [
          { field: 'outcome', operator: 'EQUALS', value: { $gt: 1 } },
        ],
      },
    ],
    [
      'IN without a list',
      { conditions: [{ field: 'outcome', operator: 'IN', value: 'a' }] },
    ],
    [
      'IN with too many',
      {
        conditions: [
          { field: 'outcome', operator: 'IN', value: Array(26).fill('a') },
        ],
      },
    ],
    [
      'list for EQUALS',
      { conditions: [{ field: 'outcome', operator: 'EQUALS', value: ['a'] }] },
    ],
    ['bad severity', { severity: 'URGENT' }],
    ['short name', { name: 'ab' }],
    ['long name', { name: 'n'.repeat(121) }],
    ['threshold of one', { threshold: 1, windowMinutes: 5 }],
    ['window over a day', { threshold: 3, windowMinutes: 1441 }],
  ])('rejects %s', async (_label, patch) => {
    expect(
      (await errors(CreateAlertRuleDto, { ...ok, ...patch })).length,
    ).toBeGreaterThan(0);
  });

  it('accepts IN with a list', async () => {
    expect(
      await errors(CreateAlertRuleDto, {
        ...ok,
        conditions: [{ field: 'outcome', operator: 'IN', value: ['a', 'b'] }],
      }),
    ).toEqual([]);
  });

  it('allows partial updates but still checks what is sent', async () => {
    expect(await errors(UpdateAlertRuleDto, {})).toEqual([]);
    expect(
      (await errors(UpdateAlertRuleDto, { severity: 'NOPE' })).length,
    ).toBeGreaterThan(0);
  });

  it('limits how much a preview looks at', async () => {
    expect(
      await errors(PreviewAlertRuleDto, {
        conditions: ok.conditions,
        limit: 200,
      }),
    ).toEqual([]);
    expect(
      (
        await errors(PreviewAlertRuleDto, {
          conditions: ok.conditions,
          limit: 201,
        })
      ).length,
    ).toBeGreaterThan(0);
  });
});
