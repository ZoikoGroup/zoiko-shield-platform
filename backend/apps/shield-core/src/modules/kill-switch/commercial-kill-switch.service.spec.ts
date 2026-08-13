import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CommercialKillSwitchService } from './commercial-kill-switch.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CommercialKillSwitchService (ZS-COM-BILL-001 OPS-01)', () => {
  let service: CommercialKillSwitchService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialKillSwitch: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommercialKillSwitchService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CommercialKillSwitchService>(
      CommercialKillSwitchService,
    );
  });

  it('requires a scopeValue for a non-GLOBAL scope', async () => {
    await expect(
      service.activate({
        scopeType: 'CUSTOMER',
        blockedActions: ['ORDER_CREATION'],
        reason: 'fraud',
        activatedBy: 'ciso',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('a GLOBAL switch blocks the action everywhere, regardless of the caller-supplied scope', async () => {
    prismaMock.commercialKillSwitch.findMany.mockResolvedValue([
      {
        scope_type: 'GLOBAL',
        scope_value: null,
        blocked_actions: '["INVOICE_FINALIZATION"]',
      },
    ]);

    const blocked = await service.isBlocked(
      'INVOICE_FINALIZATION',
      'CUSTOMER',
      'acct-anything',
    );

    expect(blocked).toBe(true);
  });

  it('a CUSTOMER-scoped switch only blocks that specific customer', async () => {
    prismaMock.commercialKillSwitch.findMany.mockResolvedValue([
      {
        scope_type: 'CUSTOMER',
        scope_value: 'acct-1',
        blocked_actions: '["ORDER_CREATION"]',
      },
    ]);

    const blockedForTarget = await service.isBlocked(
      'ORDER_CREATION',
      'CUSTOMER',
      'acct-1',
    );
    const blockedForOther = await service.isBlocked(
      'ORDER_CREATION',
      'CUSTOMER',
      'acct-2',
    );

    expect(blockedForTarget).toBe(true);
    expect(blockedForOther).toBe(false);
  });

  it('a switch that does not list the action being checked does not block it', async () => {
    prismaMock.commercialKillSwitch.findMany.mockResolvedValue([
      {
        scope_type: 'GLOBAL',
        scope_value: null,
        blocked_actions: '["USAGE_BILLING_EXPORT"]',
      },
    ]);

    const blocked = await service.isBlocked('ORDER_CREATION');

    expect(blocked).toBe(false);
  });

  it('assertNotBlocked throws with the standard error shape when blocked', async () => {
    prismaMock.commercialKillSwitch.findMany.mockResolvedValue([
      {
        scope_type: 'GLOBAL',
        scope_value: null,
        blocked_actions: '["QUOTE_APPROVAL"]',
      },
    ]);

    await expect(service.assertNotBlocked('QUOTE_APPROVAL')).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects deactivating a switch that is not ACTIVE', async () => {
    prismaMock.commercialKillSwitch.findUnique.mockResolvedValue({
      id: 'ks-1',
      status: 'DEACTIVATED',
    });

    await expect(service.deactivate('ks-1', 'admin')).rejects.toThrow(
      ConflictException,
    );
  });
});
