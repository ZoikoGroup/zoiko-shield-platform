import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { OnboardingService } from './onboarding.service';
import { PolicyService } from '../identity-adapter/policy.service';
import { OnboardingReadinessService } from './onboarding-readiness.service';
import { EvidenceService } from '../evidence/services/evidence.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Generic fake TypeORM repository — enough for OnboardingService's create/save/findOne usage. */
function fakeRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  let counter = 0;
  return {
    create: jest.fn((data: any) => data),
    save: jest.fn((entity: any) =>
      Promise.resolve({ id: entity.id ?? `generated-${counter++}`, ...entity }),
    ),
    findOne: jest.fn().mockResolvedValue(null),
    findOneByOrFail: jest.fn(),
    ...overrides,
  };
}

const baseDto = {
  orderId: 'order-1',
  tenantName: 'Acme Corp',
  tenantSlug: 'acme-corp',
  homeRegion: 'us-east-1',
  timezone: 'America/New_York',
  dataClass: 'INTERNAL',
  retentionPolicyRef: 'default',
  legalEntity: { legalName: 'Acme Corp Ltd' },
  accessDisclosureVersion: '1',
};

/**
 * Spec §7.2: a tenant may only enter PROVISIONING against an approved,
 * provisioned commercial order — never a self-granted entitlement. These
 * tests exercise the gate itself (fail closed before any tenant row is
 * touched) and the happy path (order claimed exactly once, entitlements
 * derived from the order's own product lines).
 */
describe('OnboardingService (spec §7.2 order gate)', () => {
  let service: OnboardingService;
  let prismaMock: any;
  let dataSourceMock: any;
  let policyMock: any;
  let readinessMock: any;
  let evidenceMock: any;
  let ownerRoleRepo: any;
  let tenantRepo: any;

  const activeDisclosure = {
    id: 'policy-1',
    version: '1',
    contentHash: 'hash-1',
  };

  beforeEach(async () => {
    ownerRoleRepo = fakeRepo({
      findOne: jest.fn().mockResolvedValue({ id: 'role-owner' }),
    });
    tenantRepo = fakeRepo({
      findOne: jest.fn().mockResolvedValue(null), // slug not taken
      findOneByOrFail: jest
        .fn()
        .mockImplementation((where: any) =>
          Promise.resolve({ id: where.id, status: 'PROVISIONING' }),
        ),
    });
    const repos: Record<string, any> = {
      Tenant: tenantRepo,
      LegalEntity: fakeRepo(),
      Environment: fakeRepo(),
      TenantMembership: fakeRepo(),
      Role: ownerRoleRepo,
      PolicyAcceptance: fakeRepo(),
      IdentityEvent: fakeRepo(),
    };

    dataSourceMock = {
      getRepository: jest.fn((entity: { name: string }) => {
        const repo = repos[entity.name];
        if (!repo)
          throw new Error(`No fake repo registered for ${entity.name}`);
        return repo;
      }),
      transaction: jest.fn(async (cb: (manager: any) => Promise<any>) =>
        cb({ getRepository: dataSourceMock.getRepository }),
      ),
    };

    prismaMock = {
      commercialOrder: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: { findMany: jest.fn() },
      entitlement: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(prismaMock)),
    };

    policyMock = { findActive: jest.fn().mockResolvedValue(activeDisclosure) };
    readinessMock = { assertReady: jest.fn() };
    evidenceMock = {
      createEvidence: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getDataSourceToken(), useValue: dataSourceMock },
        { provide: PolicyService, useValue: policyMock },
        { provide: OnboardingReadinessService, useValue: readinessMock },
        { provide: EvidenceService, useValue: evidenceMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('rejects onboarding when the order does not exist, before touching any tenant repository', async () => {
    prismaMock.commercialOrder.findUnique.mockResolvedValue(null);

    await expect(
      service.onboard(baseDto as any, 'principal-1', {} as any),
    ).rejects.toThrow(NotFoundException);
    expect(dataSourceMock.transaction).not.toHaveBeenCalled();
  });

  it('rejects onboarding when the order is not PROVISIONED', async () => {
    prismaMock.commercialOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'CREATED',
      tenant_id: null,
      commercial_account_id: 'acct-1',
      lines: [{ product_id: 'prod-1' }],
    });

    await expect(
      service.onboard(baseDto as any, 'principal-1', {} as any),
    ).rejects.toThrow(ConflictException);
    expect(dataSourceMock.transaction).not.toHaveBeenCalled();
  });

  it('rejects onboarding when the order has already provisioned a tenant', async () => {
    prismaMock.commercialOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PROVISIONED',
      tenant_id: 'some-other-tenant',
      commercial_account_id: 'acct-1',
      lines: [{ product_id: 'prod-1' }],
    });

    await expect(
      service.onboard(baseDto as any, 'principal-1', {} as any),
    ).rejects.toThrow(ConflictException);
    expect(dataSourceMock.transaction).not.toHaveBeenCalled();
  });

  it('rejects onboarding when the order has no product lines to derive an entitlement from', async () => {
    prismaMock.commercialOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PROVISIONED',
      tenant_id: null,
      commercial_account_id: 'acct-1',
      lines: [],
    });
    prismaMock.product.findMany.mockResolvedValue([]);

    await expect(
      service.onboard(baseDto as any, 'principal-1', {} as any),
    ).rejects.toThrow(ConflictException);
    expect(dataSourceMock.transaction).not.toHaveBeenCalled();
  });

  it('provisions the tenant from an approved order, claims it exactly once, and grants entitlements derived from its product lines — never a self-granted offer type', async () => {
    prismaMock.commercialOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PROVISIONED',
      tenant_id: null,
      commercial_account_id: 'acct-1',
      lines: [{ product_id: 'prod-1' }, { product_id: 'prod-2' }],
    });
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'prod-1', offer_family: 'MANAGED_DEFENSE' },
      { id: 'prod-2', offer_family: 'CONTINUOUS_ASSURANCE' },
    ]);

    const result = await service.onboard(baseDto, 'principal-1', {});

    expect(prismaMock.commercialOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', tenant_id: null },
      data: { tenant_id: expect.any(String) },
    });
    expect(prismaMock.entitlement.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          commercial_account_id: 'acct-1',
          offer_type: 'MANAGED_DEFENSE',
          status: 'ACTIVE',
        }),
        expect.objectContaining({
          commercial_account_id: 'acct-1',
          offer_type: 'CONTINUOUS_ASSURANCE',
          status: 'ACTIVE',
        }),
      ]),
    });
    expect(result.orderId).toBe('order-1');
    expect(result.commercialAccountId).toBe('acct-1');
  });

  it('fails the onboard when the order is claimed concurrently by another tenant', async () => {
    prismaMock.commercialOrder.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PROVISIONED',
      tenant_id: null,
      commercial_account_id: 'acct-1',
      lines: [{ product_id: 'prod-1' }],
    });
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'prod-1', offer_family: 'MANAGED_DEFENSE' },
    ]);
    prismaMock.commercialOrder.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.onboard(baseDto as any, 'principal-1', {} as any),
    ).rejects.toThrow(ConflictException);
  });
});
