import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerDelegationService } from './partner-delegation.service';
import { PartnerOperationsService } from './partner-operations.service';

describe('PartnerOperationsService (account-bound delegated effects)', () => {
  let service: PartnerOperationsService;
  let prismaMock: any;
  let delegationMock: any;

  const boundary = {
    tenantId: 'tenant-1',
    environmentId: 'prod-eu',
    principalId: 'partner-user-1',
    managingOrganizationId: 'mssp-org-1',
    commercialAccountId: 'account-1',
  };

  beforeEach(async () => {
    prismaMock = {
      usageRecord: { findMany: jest.fn().mockResolvedValue([]) },
      commercialInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      entitlement: { findMany: jest.fn().mockResolvedValue([]) },
      partnerSupportCase: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      commercialEvent: { create: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prismaMock)),
    };
    delegationMock = {
      requireActiveDelegation: jest
        .fn()
        .mockResolvedValue({ id: 'delegation-1' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerOperationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PartnerDelegationService, useValue: delegationMock },
      ],
    }).compile();
    service = module.get(PartnerOperationsService);
  });

  it('queries usage only after VIEW_USAGE authorization and within the tenant environment', async () => {
    await service.getUsage(boundary);

    expect(delegationMock.requireActiveDelegation).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      environmentId: 'prod-eu',
      partnerPrincipalId: 'partner-user-1',
      managingOrganizationId: 'mssp-org-1',
      commercialAccountId: 'account-1',
      requiredScope: 'VIEW_USAGE',
    });
    expect(prismaMock.usageRecord.findMany).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1', environment_id: 'prod-eu' },
      orderBy: { recorded_at: 'desc' },
    });
  });

  it('filters invoices and entitlements by the delegated account, never the tenant alone', async () => {
    await service.getInvoices(boundary);
    await service.getEntitlements(boundary);

    expect(prismaMock.commercialInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { commercial_account_id: 'account-1' },
      }),
    );
    expect(prismaMock.entitlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          commercial_account_id: 'account-1',
          tenant_id: 'tenant-1',
        },
      }),
    );
  });

  it('does not query operational data when the required customer scope is absent', async () => {
    delegationMock.requireActiveDelegation.mockRejectedValue(
      new ForbiddenException('scope missing'),
    );

    await expect(service.getInvoices(boundary)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prismaMock.commercialInvoice.findMany).not.toHaveBeenCalled();
  });

  it('creates a customer-bound support case with its authorizing delegation and audit event', async () => {
    prismaMock.partnerSupportCase.create.mockImplementation(
      ({ data }: any) => ({
        id: 'support-1',
        ...data,
      }),
    );

    await service.createSupportCase(boundary, {
      subject: 'Connector assistance',
      description: 'Connector is not synchronizing',
      priority: 'HIGH',
    });

    expect(prismaMock.partnerSupportCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commercial_account_id: 'account-1',
        tenant_id: 'tenant-1',
        environment_id: 'prod-eu',
        created_by: 'partner-user-1',
        created_via_delegation_id: 'delegation-1',
      }),
    });
    expect(prismaMock.commercialEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_type: 'partner_support_case.created',
      }),
    });
  });

  it('fails closed on an illegal support-case state transition', async () => {
    prismaMock.partnerSupportCase.findFirst.mockResolvedValue({
      id: 'support-1',
      status: 'CLOSED',
    });

    await expect(
      service.updateSupportCase(boundary, 'support-1', {
        status: 'IN_PROGRESS',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.partnerSupportCase.update).not.toHaveBeenCalled();
  });
});
