import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { CommercialEntitlementService } from '../commercial/commercial-entitlement.service';
import { AiGovernanceProfileService } from './ai-governance-profile.service';

describe('AiGovernanceProfileService (Category H commercial authority)', () => {
  let service: AiGovernanceProfileService;
  let prisma: any;
  let approvals: any;
  let entitlements: any;

  const start = new Date(Date.now() + 60_000);
  const end = new Date(Date.now() + 86_400_000);
  const dto: any = {
    commercialAccountId: 'account-1',
    contractId: 'contract-1',
    priceBookId: 'price-1',
    profileKey: 'case-ai',
    planSku: 'AI-SECURITY-1',
    tenantEnabled: true,
    allowedUseCaseKeys: ['CASE_SUMMARY'],
    allowedRegions: ['eu-west-2'],
    allowedModelProfileIds: ['model-1'],
    billableMetric: 'WORKFLOW_CLASS',
    meterKey: 'ai.workflow-class',
    usageAuthorizationId: '9f698357-29ad-4b6c-902d-832e41e90018',
    customerAuthorizationRef: 'signed-order-form-2026',
    includedAllowance: 100,
    warningThresholdPercent: 80,
    overagePolicy: 'CONTRACT_AUTHORIZED',
    overageCap: 25,
    rateLimitAtPercent: 100,
    fallbackAllowed: false,
    fallbackModelProfileIds: [],
    fallbackCustomerChargeAllowed: false,
    effectiveFrom: start,
    effectiveTo: end,
    reason: 'Approved AI add-on order',
  };

  beforeEach(async () => {
    prisma = {
      commercialAccountTenantBinding: {
        findFirst: jest.fn().mockResolvedValue({ id: 'binding-1' }),
      },
      contract: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contract-1',
          catalog_version_id: 'catalog-1',
          term_start: new Date(Date.now() - 86_400_000),
          term_end: new Date(Date.now() + 172_800_000),
        }),
      },
      priceBook: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'price-1',
          catalog_version_id: 'catalog-1',
          status: 'ACTIVE',
          margin_gate_passed: true,
          approval_id: 'price-approval',
          public_disclosure_approved: true,
          minimum_commit: 10,
          overage_rate: 2,
          catalogVersion: { status: 'APPROVED' },
          product: {
            sku: 'AI-SECURITY-1',
            offer_family: 'AI_SECURITY',
            release_status: 'RELEASED',
          },
        }),
      },
      modelProfile: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'model-1', region: 'eu-west-2', status: 'ACTIVE' },
          ]),
      },
      aiGovernanceProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'profile-1',
          status: 'PENDING_APPROVAL',
          ...data,
        })),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'profile-1',
          ...data,
        })),
      },
      commercialApproval: { update: jest.fn() },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    approvals = {
      requestApproval: jest.fn().mockResolvedValue({ id: 'approval-1' }),
      decideApproval: jest.fn(),
    };
    entitlements = { checkEntitlement: jest.fn().mockResolvedValue(true) };
    const module = await Test.createTestingModule({
      providers: [
        AiGovernanceProfileService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommercialApprovalService, useValue: approvals },
        { provide: CommercialEntitlementService, useValue: entitlements },
      ],
    }).compile();
    service = module.get(AiGovernanceProfileService);
  });

  it('creates a versioned pending profile and maker/checker approval snapshot', async () => {
    const result = await service.create('tenant-1', 'prod', 'maker-1', dto);
    expect(result).toEqual(
      expect.objectContaining({ approval_id: 'approval-1' }),
    );
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'AI_GOVERNANCE_PROFILE',
        tenantId: 'tenant-1',
        requestedBy: 'maker-1',
        proposedSnapshot: expect.objectContaining({
          billableMetric: 'WORKFLOW_CLASS',
          rawTokensAreInternalCostOnly: true,
        }),
      }),
      prisma,
    );
  });

  it('rejects customer billing without a disclosed approved price book', async () => {
    prisma.priceBook.findFirst.mockResolvedValue({
      ...(await prisma.priceBook.findFirst()),
      public_disclosure_approved: false,
    });
    await expect(
      service.create('tenant-1', 'prod', 'maker-1', dto),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects silent premium fallback charging without named authorization', async () => {
    await expect(
      service.create('tenant-1', 'prod', 'maker-1', {
        ...dto,
        fallbackAllowed: true,
        fallbackModelProfileIds: ['model-2'],
        fallbackCustomerChargeAllowed: true,
        fallbackAuthorizationRef: undefined,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not permit raw-token billing as an approved metric', async () => {
    await expect(
      service.create('tenant-1', 'prod', 'maker-1', {
        ...dto,
        billableMetric: 'RAW_TOKENS',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('fails closed activating when the AI entitlement has ended', async () => {
    prisma.aiGovernanceProfile.findFirst.mockResolvedValueOnce({
      id: 'profile-1',
      tenant_id: 'tenant-1',
      environment_id: 'prod',
      profile_key: 'case-ai',
      status: 'APPROVED',
      tenant_enabled: true,
      effective_from: new Date(Date.now() - 60_000),
      effective_to: new Date(Date.now() + 60_000),
    });
    entitlements.checkEntitlement.mockResolvedValue(false);
    await expect(
      service.activate('profile-1', 'tenant-1', 'prod', 'operator-1', {
        activationReference: 'change-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('persists immutable activation/change evidence', async () => {
    prisma.aiGovernanceProfile.findFirst
      .mockResolvedValueOnce({
        id: 'profile-1',
        tenant_id: 'tenant-1',
        environment_id: 'prod',
        commercial_account_id: 'account-1',
        contract_id: 'contract-1',
        price_book_id: 'price-1',
        catalog_version_id: 'catalog-1',
        profile_key: 'case-ai',
        status: 'APPROVED',
        tenant_enabled: true,
        effective_from: new Date(Date.now() - 60_000),
        effective_to: new Date(Date.now() + 60_000),
        allowed_model_profile_ids: JSON.stringify(['model-1']),
        fallback_model_profile_ids: '[]',
      })
      .mockResolvedValueOnce(null);
    entitlements.checkEntitlement.mockResolvedValue(true);

    await service.activate('profile-1', 'tenant-1', 'prod', 'operator-1', {
      activationReference: 'change-ticket-44',
    });

    expect(prisma.aiGovernanceProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        activated_by: 'operator-1',
        activation_reference: 'change-ticket-44',
      }),
    });
  });
});
