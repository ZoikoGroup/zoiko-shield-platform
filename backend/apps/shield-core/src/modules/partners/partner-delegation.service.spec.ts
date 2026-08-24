import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../identity-adapter/session.service';
import { PartnerDelegationService } from './partner-delegation.service';

describe('PartnerDelegationService (explicit, customer-visible, non-transitive)', () => {
  let service: PartnerDelegationService;
  let prismaMock: any;
  let sessionMock: any;

  const dto = () => ({
    partnerId: 'partner-1',
    managingOrganizationId: 'mssp-org-1',
    partnerPrincipalId: 'partner-user-1',
    commercialAccountId: 'account-1',
    scope: ['VIEW_USAGE', 'VIEW_INVOICES'],
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });

  beforeEach(async () => {
    prismaMock = {
      partnerDelegation: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      partnerPrincipalContext: {
        findFirst: jest.fn().mockResolvedValue({ id: 'context-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'context-1',
          status: 'ACTIVE',
          managing_organization_id: 'mssp-org-1',
        }),
      },
      partner: { findFirst: jest.fn().mockResolvedValue({ id: 'partner-1' }) },
      commercialAccountTenantBinding: {
        findFirst: jest.fn().mockResolvedValue({ id: 'binding-1' }),
        count: jest.fn().mockResolvedValue(1),
      },
      commercialEvent: { create: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prismaMock)),
    };
    sessionMock = {
      revokeForPrincipalTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerDelegationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SessionService, useValue: sessionMock },
      ],
    }).compile();
    service = module.get(PartnerDelegationService);
  });

  it('refuses any commercial or pricing scope before touching persistence', async () => {
    await expect(
      service.grantDelegation('tenant-1', 'prod-eu', 'customer-owner', {
        ...dto(),
        scope: ['VIEW_USAGE', 'MODIFY_PRICING'],
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('persists tenant, environment, managing organization, principal, expiry and the JWT actor', async () => {
    prismaMock.partnerDelegation.create.mockImplementation(({ data }: any) => ({
      id: 'delegation-1',
      created_at: new Date(),
      ...data,
    }));

    const result = await service.grantDelegation(
      'tenant-1',
      'prod-eu',
      'customer-owner',
      dto(),
    );

    expect(result.scope).toEqual(['VIEW_USAGE', 'VIEW_INVOICES']);
    expect(prismaMock.partnerDelegation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: 'tenant-1',
        environment_id: 'prod-eu',
        managing_organization_id: 'mssp-org-1',
        partner_principal_id: 'partner-user-1',
        partner_principal_context_id: 'context-1',
        granted_by: 'customer-owner',
        customer_visible: true,
      }),
    });
    expect(prismaMock.commercialEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_type: 'partner_delegation.granted',
        actor: 'customer-owner',
      }),
    });
  });

  it('blocks a delegated actor from creating a second-level delegation', async () => {
    prismaMock.partnerDelegation.findFirst.mockResolvedValueOnce({
      id: 'actor-delegation',
    });

    await expect(
      service.grantDelegation('tenant-1', 'prod-eu', 'delegated-actor', dto()),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.partnerDelegation.create).not.toHaveBeenCalled();
  });

  it('lists only customer-visible grants in the current tenant and environment and materializes expiry', async () => {
    prismaMock.partnerDelegation.findMany.mockImplementation(
      ({ where }: any) =>
        where.expires_at
          ? []
          : [{ id: 'delegation-1', scope: '["VIEW_USAGE"]' }],
    );

    const result = await service.listForCustomer(
      'tenant-1',
      'prod-eu',
      'account-1',
    );

    expect(result[0].scope).toEqual(['VIEW_USAGE']);
    expect(prismaMock.partnerDelegation.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenant_id: 'tenant-1',
        environment_id: 'prod-eu',
        status: 'ACTIVE',
        expires_at: expect.anything(),
      }),
      select: expect.any(Object),
    });
    expect(prismaMock.partnerDelegation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customer_visible: true }),
      }),
    );
  });

  it('checks all identity and customer-boundary dimensions and denies a missing scope', async () => {
    prismaMock.partnerDelegation.findFirst.mockResolvedValue({
      id: 'delegation-1',
      scope: '["VIEW_USAGE"]',
      expires_at: new Date(Date.now() + 86_400_000),
    });

    const allowed = await service.checkDelegation({
      tenantId: 'tenant-1',
      environmentId: 'prod-eu',
      partnerPrincipalId: 'partner-user-1',
      managingOrganizationId: 'mssp-org-1',
      commercialAccountId: 'account-1',
      requiredScope: 'VIEW_INVOICES',
    });

    expect(allowed).toBe(false);
    expect(prismaMock.partnerDelegation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: 'tenant-1',
          environment_id: 'prod-eu',
          partner_principal_id: 'partner-user-1',
          managing_organization_id: 'mssp-org-1',
          commercial_account_id: 'account-1',
        }),
      }),
    );
  });

  it('fails closed and marks an elapsed delegation expired at check time', async () => {
    prismaMock.partnerDelegation.findFirst.mockResolvedValue({
      id: 'delegation-1',
      partner_principal_id: 'partner-user-1',
      tenant_id: 'tenant-1',
      scope: '["VIEW_USAGE"]',
      expires_at: new Date(Date.now() - 1_000),
    });
    prismaMock.partnerDelegation.findMany.mockResolvedValue([
      {
        id: 'delegation-1',
        partner_principal_id: 'partner-user-1',
        tenant_id: 'tenant-1',
      },
    ]);

    const allowed = await service.checkDelegation({
      tenantId: 'tenant-1',
      environmentId: 'prod-eu',
      partnerPrincipalId: 'partner-user-1',
      managingOrganizationId: 'mssp-org-1',
      commercialAccountId: 'account-1',
      requiredScope: 'VIEW_USAGE',
    });

    expect(allowed).toBe(false);
    expect(prismaMock.partnerDelegation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['delegation-1'] }, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
    expect(sessionMock.revokeForPrincipalTenant).toHaveBeenCalledWith(
      'partner-user-1',
      'tenant-1',
      'PARTNER_DELEGATION_EXPIRED',
    );
  });

  it('revokes only a customer-visible grant in the current boundary and records actor and reason', async () => {
    prismaMock.partnerDelegation.findFirst.mockResolvedValue({
      id: 'delegation-1',
      status: 'ACTIVE',
      partner_principal_id: 'partner-user-1',
      scope: '["VIEW_USAGE"]',
    });
    prismaMock.partnerDelegation.update.mockImplementation(({ data }: any) => ({
      id: 'delegation-1',
      partner_principal_id: 'partner-user-1',
      scope: '["VIEW_USAGE"]',
      ...data,
    }));

    await service.revoke(
      'delegation-1',
      'tenant-1',
      'prod-eu',
      'customer-owner',
      'Supplier offboarded',
    );

    expect(prismaMock.partnerDelegation.update).toHaveBeenCalledWith({
      where: { id: 'delegation-1' },
      data: expect.objectContaining({
        status: 'REVOKED',
        revoked_by: 'customer-owner',
        revocation_reason: 'Supplier offboarded',
      }),
    });
    expect(sessionMock.revokeForPrincipalTenant).toHaveBeenCalledWith(
      'partner-user-1',
      'tenant-1',
      'PARTNER_DELEGATION_REVOKED',
    );
  });
});
