import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { PolicyService } from '../identity-adapter/policy.service';
import { OnboardingReadinessService } from './onboarding-readiness.service';
import { MailService } from '../identity-adapter/mail.service';
import { ZoikoIdProviderBootstrapService } from '../identity-adapter/zoikoid-provider-bootstrap.service';
import { PrismaService } from '../../prisma/prisma.service';

let counter = 0;

/** A Prisma model delegate whose `create` echoes its data with a generated id. */
function fakeDelegate(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    create: jest.fn(({ data }: any) =>
      Promise.resolve({ id: data.id ?? `generated-${counter++}`, ...data }),
    ),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
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
  ownerEmail: 'owner@example.com',
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
  let policyMock: any;
  let readinessMock: any;
  let mailMock: any;
  let zoikoIdProvidersMock: any;

  const activeDisclosure = {
    id: 'policy-1',
    version: '1',
    contentHash: 'hash-1',
  };
  const ownerRole = { id: 'role-owner', code: 'TENANT_OWNER' };

  beforeEach(async () => {
    prismaMock = {
      commercialOrder: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: { findMany: jest.fn() },
      entitlement: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      // No existing principal owns the owner email.
      $queryRaw: jest.fn().mockResolvedValue([]),
      principal: fakeDelegate(),
      // slug not taken
      tenant: fakeDelegate({ findUnique: jest.fn().mockResolvedValue(null) }),
      legalEntity: fakeDelegate(),
      environment: fakeDelegate(),
      role: fakeDelegate({ findFirst: jest.fn().mockResolvedValue(ownerRole) }),
      tenantMembership: fakeDelegate({
        create: jest.fn(({ data }: any) => {
          const { roles: _roles, ...fields } = data;
          return Promise.resolve({
            id: `generated-${counter++}`,
            ...fields,
            roles: [{ role_id: ownerRole.id, role: ownerRole }],
          });
        }),
      }),
      invitation: fakeDelegate(),
      identityEvent: fakeDelegate(),
    };
    prismaMock.$transaction = jest.fn((cb: (tx: any) => Promise<any>) =>
      cb(prismaMock),
    );

    policyMock = { findActive: jest.fn().mockResolvedValue(activeDisclosure) };
    readinessMock = { assertReady: jest.fn() };
    mailMock = {
      sendOwnerInvitation: jest
        .fn()
        .mockResolvedValue(
          'http://localhost:3000/accept-invite?token=development-token',
        ),
    };
    zoikoIdProvidersMock = {
      provisionForTenant: jest.fn().mockResolvedValue({
        id: 'zoikoid-provider-1',
        name: 'ZoikoID',
        protocol: 'OIDC',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PolicyService, useValue: policyMock },
        { provide: OnboardingReadinessService, useValue: readinessMock },
        { provide: MailService, useValue: mailMock },
        {
          provide: ZoikoIdProviderBootstrapService,
          useValue: zoikoIdProvidersMock,
        },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('rejects onboarding when the order does not exist, before touching any tenant table', async () => {
    prismaMock.commercialOrder.findUnique.mockResolvedValue(null);

    await expect(
      service.onboard(baseDto as any, 'principal-1', {} as any),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.tenant.create).not.toHaveBeenCalled();
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
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.tenant.create).not.toHaveBeenCalled();
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
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.tenant.create).not.toHaveBeenCalled();
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
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.tenant.create).not.toHaveBeenCalled();
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
    expect(zoikoIdProvidersMock.provisionForTenant).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ actorId: 'principal-1' }),
    );
    expect(result.orderId).toBe('order-1');
    expect(result.commercialAccountId).toBe('acct-1');
    expect(result.tenant.status).toBe('PROVISIONING');
    expect(result.membership.status).toBe('PENDING');
    expect(result.membership.roles).toEqual([ownerRole]);
    expect(result.identityProvider).toEqual({
      id: 'zoikoid-provider-1',
      name: 'ZoikoID',
      protocol: 'OIDC',
    });
    expect(result.ownerInvitation).toEqual(
      expect.objectContaining({
        invitationId: expect.any(String),
        delivery: 'EMAIL',
      }),
    );
    expect(mailMock.sendOwnerInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@example.com',
        tenantName: 'Acme Corp',
        token: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    );
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
    expect(mailMock.sendOwnerInvitation).not.toHaveBeenCalled();
  });
});
