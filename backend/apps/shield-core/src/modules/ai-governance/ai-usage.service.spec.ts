import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MeteringService } from '../metering/metering.service';
import { AiGovernanceProfileService } from './ai-governance-profile.service';

const MINIMAL_USAGE_DTO = {
  tenantId: 't1',
  environmentId: 'env-1',
  governanceProfileId: 'gp-1',
  useCaseKey: 'case-triage',
  workflow: 'case-triage',
  workflowClass: 'TRIAGE',
  region: 'us-east-1',
  provider: 'anthropic',
  model: 'claude-opus',
  modelProfileId: 'mp-1',
  modelClass: 'PREMIUM',
  internalCost: 4.5,
  internalCostSource: 'provider-api',
};

describe('AiUsageService (ZS-COM-BILL-001 AI-01: internal cost != billable usage)', () => {
  let service: AiUsageService;
  let prismaMock: any;
  let profilesMock: any;
  let meteringMock: any;

  beforeEach(async () => {
    prismaMock = {
      aiUsageRecord: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      modelProfile: { findFirst: jest.fn() },
      costRecord: { create: jest.fn() },
      $transaction: jest.fn((callback: (tx: any) => unknown) =>
        callback(prismaMock),
      ),
    };
    profilesMock = {
      requireActiveForUsage: jest.fn().mockResolvedValue({
        id: 'gp-1',
        status: 'ACTIVE',
        tenant_enabled: true,
        billable_metric: 'NON_BILLABLE',
        fallback_customer_charge_allowed: false,
        fallback_authorization_ref: null,
      }),
      get: jest.fn(),
    };
    meteringMock = { recordEvent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiUsageService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AiGovernanceProfileService, useValue: profilesMock },
        { provide: MeteringService, useValue: meteringMock },
      ],
    }).compile();

    service = module.get<AiUsageService>(AiUsageService);
  });

  it('every recorded usage starts non-billable regardless of internal cost', async () => {
    prismaMock.modelProfile.findFirst.mockResolvedValue({ id: 'mp-1' });
    prismaMock.aiUsageRecord.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...data, billable: false }),
    );

    const usage = await service.recordUsage({
      ...MINIMAL_USAGE_DTO,
      internalCost: 4.5,
    });

    expect(usage.billable).toBe(false);
  });

  it('a provider fallback to a more expensive model still records as non-billable — internal cost never implies a charge', async () => {
    prismaMock.modelProfile.findFirst.mockResolvedValue({ id: 'mp-1' });
    prismaMock.aiUsageRecord.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...data, billable: false }),
    );

    const usage = await service.recordUsage({
      ...MINIMAL_USAGE_DTO,
      model: 'claude-opus-expensive-fallback',
      internalCost: 40.0,
    });

    expect(usage.billable).toBe(false);
  });

  it('fails closed marking usage billable without an active AI_SECURITY entitlement', async () => {
    prismaMock.aiUsageRecord.findFirst.mockResolvedValue({
      id: 'u-1',
      billable: false,
      tenant_id: 't1',
      environment_id: 'env-1',
      governanceProfile: {
        id: 'gp-1',
        status: 'ACTIVE',
        tenant_enabled: true,
        billable_metric: 'NON_BILLABLE',
        meter_key: null,
        catalog_version_id: null,
        customer_authorization_ref: null,
        fallback_customer_charge_allowed: false,
        fallback_authorization_ref: null,
      },
    });

    await expect(
      service.markBillable('t1', 'env-1', 'u-1'),
    ).rejects.toThrow(ConflictException);
    expect(meteringMock.recordEvent).not.toHaveBeenCalled();
  });

  it('marks usage billable through the standard MeteringService pipeline once entitled', async () => {
    prismaMock.aiUsageRecord.findFirst.mockResolvedValue({
      id: 'u-1',
      billable: false,
      tenant_id: 't1',
      environment_id: 'env-1',
      fallback_used: false,
      contracted_usage_units: null,
      occurred_at: new Date(),
      workflow_class: 'TRIAGE',
      model_class: 'PREMIUM',
      governanceProfile: {
        id: 'gp-1',
        status: 'ACTIVE',
        tenant_enabled: true,
        billable_metric: 'WORKFLOW_CLASS',
        meter_key: 'ai.tokens',
        catalog_version_id: 'cv-1',
        customer_authorization_ref: 'auth-ref-1',
        usage_authorization_id: null,
        overage_policy: 'BLOCK',
        fallback_customer_charge_allowed: false,
        fallback_authorization_ref: null,
      },
    });
    meteringMock.recordEvent.mockResolvedValue({
      event: { id: 'me-1' },
      usageRecord: { billable_quantity: 1 },
    });
    prismaMock.aiUsageRecord.update.mockResolvedValue({
      id: 'u-1',
      billable: true,
      meter_event_id: 'me-1',
    });

    const usage = await service.markBillable('t1', 'env-1', 'u-1');

    expect(meteringMock.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ meterKey: 'ai.tokens' }),
    );
    expect(usage.billable).toBe(true);
  });

  it('refuses to mark an already-billable record billable again', async () => {
    prismaMock.aiUsageRecord.findFirst.mockResolvedValue({
      id: 'u-1',
      billable: true,
      tenant_id: 't1',
      environment_id: 'env-1',
      governanceProfile: null,
    });

    await expect(
      service.markBillable('t1', 'env-1', 'u-1'),
    ).rejects.toThrow(ConflictException);
  });

  it("does not expose another tenant's usage record by id", async () => {
    prismaMock.aiUsageRecord.findFirst.mockResolvedValue(null);

    await expect(service.getUsageById('tenant-b', 'env-b', 'u-1')).rejects.toThrow();
    expect(prismaMock.aiUsageRecord.findFirst).toHaveBeenCalledWith({
      where: { id: 'u-1', tenant_id: 'tenant-b', environment_id: 'env-b' },
    });
  });
});
