import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialEntitlementService } from '../commercial/commercial-entitlement.service';
import { MeteringService } from '../metering/metering.service';

describe('AiUsageService (ZS-COM-BILL-001 AI-01: internal cost != billable usage)', () => {
  let service: AiUsageService;
  let prismaMock: any;
  let entitlementMock: any;
  let meteringMock: any;

  beforeEach(async () => {
    prismaMock = {
      aiUsageRecord: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };
    entitlementMock = { checkEntitlement: jest.fn() };
    meteringMock = { recordEvent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiUsageService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommercialEntitlementService, useValue: entitlementMock },
        { provide: MeteringService, useValue: meteringMock },
      ],
    }).compile();

    service = module.get<AiUsageService>(AiUsageService);
  });

  it('every recorded usage starts non-billable regardless of internal cost', async () => {
    prismaMock.aiUsageRecord.create.mockImplementation(({ data }: any) => Promise.resolve(data));

    const usage = await service.recordUsage({
      tenantId: 't1',
      workflow: 'case-triage',
      provider: 'anthropic',
      model: 'claude-opus',
      internalCost: 4.5,
    });

    expect(usage.billable).toBe(false);
  });

  it('a provider fallback to a more expensive model still records as non-billable — internal cost never implies a charge', async () => {
    prismaMock.aiUsageRecord.create.mockImplementation(({ data }: any) => Promise.resolve(data));

    const usage = await service.recordUsage({
      tenantId: 't1',
      workflow: 'case-triage',
      provider: 'anthropic',
      model: 'claude-opus-expensive-fallback',
      internalCost: 40.0,
    });

    expect(usage.billable).toBe(false);
  });

  it('fails closed marking usage billable without an active AI_SECURITY entitlement', async () => {
    prismaMock.aiUsageRecord.findFirst.mockResolvedValue({ id: 'u-1', billable: false, tenant_id: 't1' });
    entitlementMock.checkEntitlement.mockResolvedValue(false);

    await expect(service.markBillable('t1', 'u-1', 'ai.tokens', 100)).rejects.toThrow(ConflictException);
    expect(meteringMock.recordEvent).not.toHaveBeenCalled();
  });

  it('marks usage billable through the standard MeteringService pipeline once entitled', async () => {
    prismaMock.aiUsageRecord.findFirst.mockResolvedValue({ id: 'u-1', billable: false, tenant_id: 't1', provider: 'anthropic', model: 'claude', occurred_at: new Date() });
    entitlementMock.checkEntitlement.mockResolvedValue(true);
    meteringMock.recordEvent.mockResolvedValue({ event: { id: 'me-1' } });
    prismaMock.aiUsageRecord.update.mockResolvedValue({ id: 'u-1', billable: true, meter_event_id: 'me-1' });

    const usage = await service.markBillable('t1', 'u-1', 'ai.tokens', 100);

    expect(meteringMock.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ meterKey: 'ai.tokens', quantity: 100 }));
    expect(usage.billable).toBe(true);
  });

  it('refuses to mark an already-billable record billable again', async () => {
    prismaMock.aiUsageRecord.findFirst.mockResolvedValue({ id: 'u-1', billable: true });

    await expect(service.markBillable('t1', 'u-1', 'ai.tokens', 100)).rejects.toThrow(ConflictException);
  });

  it('does not expose another tenant\'s usage record by id', async () => {
    prismaMock.aiUsageRecord.findFirst.mockResolvedValue(null);

    await expect(service.getUsageById('tenant-b', 'u-1')).rejects.toThrow();
    expect(prismaMock.aiUsageRecord.findFirst).toHaveBeenCalledWith({
      where: { id: 'u-1', tenant_id: 'tenant-b' },
    });
  });
});
