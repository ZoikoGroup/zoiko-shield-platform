import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { MeteringService } from '../metering/metering.service';
import { AiGovernanceProfileService } from './ai-governance-profile.service';
import { AiUsageService } from './ai-usage.service';

describe('AiUsageService (Category H AI-01/AI-02)', () => {
  let service: AiUsageService;
  let prisma: any;
  let profiles: any;
  let metering: any;

  const activeProfile = {
    id: 'profile-1',
    status: 'ACTIVE',
    tenant_enabled: true,
    billable_metric: 'CONTRACTED_USAGE',
    meter_key: 'ai.contracted-workflow-units',
    usage_authorization_id: '9f698357-29ad-4b6c-902d-832e41e90018',
    catalog_version_id: 'catalog-7',
    customer_authorization_ref: 'order-form-ai-2026',
    fallback_customer_charge_allowed: false,
    fallback_authorization_ref: null,
    included_allowance: 100,
    warning_threshold_percent: 80,
    rate_limit_at_percent: 100,
    overage_policy: 'BLOCK',
    overage_cap: null,
    effective_from: new Date(Date.now() - 86_400_000),
    effective_to: new Date(Date.now() + 86_400_000),
    profile_key: 'case-ai',
    version: 1,
    plan_sku: 'AI-SECURITY-1',
  };

  const dto = {
    tenantId: 'tenant-1',
    environmentId: 'prod',
    governanceProfileId: 'profile-1',
    useCaseKey: 'CASE_SUMMARY',
    workflow: 'case-summary',
    workflowClass: 'INVESTIGATION',
    region: 'eu-west-2',
    provider: 'anthropic',
    model: 'claude',
    modelProfileId: 'model-1',
    modelClass: 'STANDARD',
    inputTokens: 9000,
    outputTokens: 4000,
    retrievalCalls: 1,
    retrievalUnits: 4,
    storageByteHours: 1024,
    contractedUsageUnits: 3,
    complexityUnits: 99,
    internalCost: 4.5,
    internalCostSource: 'provider-invoice-v4',
    providerPriceVersion: '2026-08-01',
  };

  beforeEach(async () => {
    prisma = {
      modelProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'model-1' }),
      },
      aiUsageRecord: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      costRecord: { create: jest.fn() },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    profiles = {
      requireActiveForUsage: jest.fn().mockResolvedValue(activeProfile),
      get: jest.fn(),
    };
    metering = { recordEvent: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        AiUsageService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiGovernanceProfileService, useValue: profiles },
        { provide: MeteringService, useValue: metering },
      ],
    }).compile();
    service = module.get(AiUsageService);
  });

  it('attributes cost, retrieval, tools and storage but starts non-billable', async () => {
    prisma.aiUsageRecord.create.mockImplementation(async ({ data }: any) => ({
      id: 'usage-1',
      ...data,
    }));
    prisma.costRecord.create.mockResolvedValue({ id: 'cost-1' });

    const result = await service.recordUsage(dto);

    expect(result.billable).toBe(false);
    expect(result.billing_classification).toBe(
      'CONTRACT_AUTHORIZED_PENDING_METER',
    );
    expect(prisma.costRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usage_class: 'AI:prod:CASE_SUMMARY:INVESTIGATION:STANDARD',
        total_cost: 4.5,
        allocation_method: 'DIRECT_AI_WORKFLOW',
      }),
    });
  });

  it('fails closed before writing usage when the governed profile rejects it', async () => {
    profiles.requireActiveForUsage.mockRejectedValue(
      new ConflictException('use case not approved'),
    );

    await expect(service.recordUsage(dto)).rejects.toThrow(ConflictException);
    expect(prisma.aiUsageRecord.create).not.toHaveBeenCalled();
  });

  it('keeps an unapproved premium fallback internal-only', async () => {
    prisma.aiUsageRecord.create.mockImplementation(async ({ data }: any) => ({
      id: 'usage-fallback',
      ...data,
    }));
    const result = await service.recordUsage({
      ...dto,
      modelProfileId: 'fallback-model',
      fallbackUsed: true,
      fallbackFromModelProfileId: 'model-1',
    });
    expect(result.billing_classification).toBe(
      'PREMIUM_FALLBACK_INTERNAL_ONLY',
    );
  });

  it('derives quantity from the approved metric, never raw tokens or complexity', async () => {
    prisma.aiUsageRecord.findFirst.mockResolvedValue({
      id: 'usage-1',
      tenant_id: 'tenant-1',
      environment_id: 'prod',
      billable: false,
      contracted_usage_units: 3,
      input_tokens: 9000,
      output_tokens: 4000,
      complexity_units: 99,
      occurred_at: new Date(),
      workflow_class: 'INVESTIGATION',
      model_class: 'STANDARD',
      fallback_used: false,
      governanceProfile: activeProfile,
    });
    metering.recordEvent.mockResolvedValue({
      event: { id: 'meter-event-1' },
      usageRecord: { billable_quantity: 3 },
    });
    prisma.aiUsageRecord.update.mockResolvedValue({ billable: true });

    await service.markBillable('tenant-1', 'prod', 'usage-1');

    expect(metering.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        meterKey: 'ai.contracted-workflow-units',
        source: 'ai-governance',
        quantity: 3,
        metadata: expect.objectContaining({
          rawTokensExcludedFromBilling: true,
          complexityExcludedUnlessContractMetric: true,
        }),
      }),
    );
  });

  it('refuses a fallback premium charge without explicit fallback authorization', async () => {
    prisma.aiUsageRecord.findFirst.mockResolvedValue({
      id: 'usage-1',
      billable: false,
      fallback_used: true,
      governanceProfile: activeProfile,
    });
    await expect(
      service.markBillable('tenant-1', 'prod', 'usage-1'),
    ).rejects.toThrow(ConflictException);
    expect(metering.recordEvent).not.toHaveBeenCalled();
  });

  it("does not expose another tenant or environment's usage", async () => {
    prisma.aiUsageRecord.findFirst.mockResolvedValue(null);
    await expect(
      service.getUsageById('tenant-b', 'dev', 'usage-1'),
    ).rejects.toThrow();
    expect(prisma.aiUsageRecord.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'usage-1',
        tenant_id: 'tenant-b',
        environment_id: 'dev',
      },
    });
  });

  it('shows allowance, forecast and degraded/rate-limited state before overage', async () => {
    profiles.get.mockResolvedValue({
      ...activeProfile,
      billable_metric: 'WORKFLOW_CLASS',
      included_allowance: 2,
      rate_limit_at_percent: 100,
      overage_policy: 'RATE_LIMIT',
    });
    prisma.aiUsageRecord.findMany.mockResolvedValue([
      { contracted_usage_units: 0 },
      { contracted_usage_units: 0 },
    ]);
    const result = await service.visibility('tenant-1', 'prod', 'profile-1');
    expect(result).toEqual(
      expect.objectContaining({
        includedAllowance: 2,
        currentUsage: 2,
        thresholdState: 'OVERAGE',
        runtimeState: 'RATE_LIMITED',
        rawTokenBilling: false,
      }),
    );
  });
});
