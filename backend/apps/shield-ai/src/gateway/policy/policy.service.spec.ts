import { Test } from '@nestjs/testing';
import { ModelRegistryService } from '../../model-registry/model-registry.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiUseCaseRegistryService } from './ai-use-case-registry.service';
import { PolicyService } from './policy.service';

describe('PolicyService Category H tenant AI entitlement', () => {
  let service: PolicyService;
  let prisma: any;
  let models: any;
  let useCases: any;

  const input = {
    tenantId: 'tenant-1',
    environmentId: 'prod',
    region: 'eu-west-2',
    dataClass: 'INTERNAL',
    purpose: 'INVESTIGATION',
  };

  beforeEach(async () => {
    prisma = {
      aiGovernanceProfile: { findMany: jest.fn() },
      aiUsageRecord: { findMany: jest.fn().mockResolvedValue([]) },
      entitlement: { findFirst: jest.fn() },
    };
    models = { findEligible: jest.fn() };
    useCases = {
      getByKey: jest.fn().mockResolvedValue({
        id: 'use-case-1',
        status: 'ACTIVE',
        expires_at: null,
        allowed_data_classes: JSON.stringify(['INTERNAL']),
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        PolicyService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModelRegistryService, useValue: models },
        { provide: AiUseCaseRegistryService, useValue: useCases },
      ],
    }).compile();
    service = module.get(PolicyService);
  });

  it('denies AI when plan/SKU tenant configuration is absent', async () => {
    prisma.aiGovernanceProfile.findMany.mockResolvedValue([]);
    const result = await service.evaluate('CASE_SUMMARY', input);
    expect(result).toEqual(
      expect.objectContaining({ allowed: false, denialCode: 'POLICY_DENIED' }),
    );
    expect(models.findEligible).not.toHaveBeenCalled();
  });

  it('constrains provider selection to models named by the active tenant profile', async () => {
    prisma.aiGovernanceProfile.findMany.mockResolvedValue([
      {
        id: 'profile-1',
        allowed_use_case_keys: JSON.stringify(['CASE_SUMMARY']),
        allowed_regions: JSON.stringify(['eu-west-2']),
        allowed_model_profile_ids: JSON.stringify(['model-allowed']),
        billable_metric: 'WORKFLOW_CLASS',
        included_allowance: 100,
        warning_threshold_percent: 80,
        rate_limit_at_percent: 100,
        overage_policy: 'BLOCK',
        overage_cap: null,
        effective_from: new Date(Date.now() - 60_000),
        effective_to: null,
        commercialAccount: { status: 'ACTIVE' },
        contract: {
          status: 'ACTIVE',
          term_start: new Date(Date.now() - 60_000),
          term_end: new Date(Date.now() + 60_000),
          catalog_version_id: 'catalog-1',
        },
        priceBook: {
          status: 'ACTIVE',
          effective_from: new Date(Date.now() - 60_000),
          effective_to: null,
          catalog_version_id: 'catalog-1',
        },
        catalog_version_id: 'catalog-1',
      },
    ]);
    prisma.entitlement.findFirst.mockResolvedValue({
      commercialAccount: { status: 'ACTIVE' },
    });
    models.findEligible.mockResolvedValue({
      id: 'model-allowed',
      provider: 'MOCK',
      model: 'mock',
      region: 'eu-west-2',
      status: 'ACTIVE',
      approved_data_classes: JSON.stringify(['INTERNAL']),
    });

    const result = await service.evaluate('CASE_SUMMARY', input);

    expect(models.findEligible).toHaveBeenCalledWith({
      region: 'eu-west-2',
      allowedProfileIds: ['model-allowed'],
    });
    expect(result).toEqual(
      expect.objectContaining({
        allowed: true,
        governanceProfile: expect.objectContaining({ id: 'profile-1' }),
      }),
    );
  });

  it('uses the same allowance policy to block runtime admission', async () => {
    prisma.aiGovernanceProfile.findMany.mockResolvedValue([
      {
        id: 'profile-1',
        allowed_use_case_keys: JSON.stringify(['CASE_SUMMARY']),
        allowed_regions: JSON.stringify(['eu-west-2']),
        allowed_model_profile_ids: JSON.stringify(['model-allowed']),
        billable_metric: 'WORKFLOW_CLASS',
        included_allowance: 1,
        warning_threshold_percent: 80,
        rate_limit_at_percent: 100,
        overage_policy: 'RATE_LIMIT',
        overage_cap: null,
        effective_from: new Date(Date.now() - 60_000),
        effective_to: null,
        commercialAccount: { status: 'ACTIVE' },
        contract: {
          status: 'ACTIVE',
          term_start: new Date(Date.now() - 60_000),
          term_end: new Date(Date.now() + 60_000),
          catalog_version_id: 'catalog-1',
        },
        priceBook: {
          status: 'ACTIVE',
          effective_from: new Date(Date.now() - 60_000),
          effective_to: null,
          catalog_version_id: 'catalog-1',
        },
        catalog_version_id: 'catalog-1',
      },
    ]);
    prisma.aiUsageRecord.findMany.mockResolvedValue([
      { contracted_usage_units: 0 },
    ]);

    const result = await service.evaluate('CASE_SUMMARY', input);

    expect(result).toEqual(
      expect.objectContaining({ allowed: false, denialCode: 'AI_UNAVAILABLE' }),
    );
    expect(models.findEligible).not.toHaveBeenCalled();
  });
});
