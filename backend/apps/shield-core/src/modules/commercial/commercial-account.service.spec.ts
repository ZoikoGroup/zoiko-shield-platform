import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialAccountService } from './commercial-account.service';

describe('CommercialAccountService (ZS-COM-BILL-001 A)', () => {
  let service: CommercialAccountService;
  let prismaMock: any;

  const bindingInput = {
    tenantId: 'tenant-1',
    legalEntityId: 'legal-1',
    businessUnitId: 'business-1',
    environmentId: 'prod-eu',
    region: 'EU',
    residencyPolicy: 'EU_ONLY',
    serviceScope: ['MANAGED_DEFENSE'],
    isPrimary: true,
  };

  beforeEach(async () => {
    prismaMock = {
      commercialAccount: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      commercialAccountTenantBinding: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      groupAccount: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      commercialEvent: { create: jest.fn() },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommercialAccountService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(CommercialAccountService);
  });

  it('creates complete account master data, an explicit binding and an audit event atomically', async () => {
    prismaMock.commercialAccount.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'account-1',
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
      }),
    );
    prismaMock.commercialAccountTenantBinding.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'binding-1', ...data }),
    );
    prismaMock.commercialEvent.create.mockResolvedValue({ id: 'event-1' });

    const result = await service.createCommercialAccount(
      {
        name: 'Acme',
        customerLegalName: 'Acme Holdings Limited',
        billingAddress: {
          line1: '1 High Street',
          city: 'London',
          postalCode: 'SW1A 1AA',
          countryCode: 'GB',
        },
        taxFacts: { countryCode: 'GB', taxRegistrationId: 'GB123' },
        currency: 'GBP',
        contacts: [
          { type: 'BILLING', name: 'Pat Lee', email: 'billing@acme.test' },
        ],
        billingSource: 'DIRECT',
        initialBinding: bindingInput,
      },
      'platform-user-1',
    );

    expect(result.customer_legal_name).toBe('Acme Holdings Limited');
    expect(result.billing_address).toEqual(
      expect.objectContaining({ countryCode: 'GB' }),
    );
    expect(result.tenantBindings[0].service_scope).toEqual(['MANAGED_DEFENSE']);
    expect(prismaMock.commercialAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contract_owner_id: 'platform-user-1',
          environment_id: 'prod-eu',
        }),
      }),
    );
    expect(prismaMock.commercialEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: 'commercial_account.created',
          actor: 'platform-user-1',
        }),
      }),
    );
  });

  it('does not reveal an account that has no binding to the current tenant', async () => {
    prismaMock.commercialAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.getCommercialAccountForTenant(
        'account-foreign',
        'tenant-1',
        'prod-eu',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.commercialAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantBindings: {
            some: { tenant_id: 'tenant-1', environment_id: 'prod-eu' },
          },
        }),
      }),
    );
  });

  it('rejects a duplicate tenant/environment binding', async () => {
    prismaMock.commercialAccount.findUnique.mockResolvedValue({
      id: 'account-1',
    });
    prismaMock.commercialAccountTenantBinding.findUnique.mockResolvedValue({
      id: 'binding-existing',
    });

    await expect(
      service.createBinding('account-1', bindingInput, 'platform-user-1'),
    ).rejects.toThrow(ConflictException);
    expect(
      prismaMock.commercialAccountTenantBinding.create,
    ).not.toHaveBeenCalled();
  });

  it('records a guarded ACTIVE to ENDED binding transition', async () => {
    prismaMock.commercialAccountTenantBinding.findUnique.mockResolvedValue({
      id: 'binding-1',
      commercial_account_id: 'account-1',
      tenant_id: 'tenant-1',
      status: 'ACTIVE',
      effective_to: null,
    });
    prismaMock.commercialAccountTenantBinding.update.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'binding-1', ...data }),
    );
    prismaMock.commercialEvent.create.mockResolvedValue({ id: 'event-1' });

    const result = await service.updateBindingStatus(
      'account-1',
      'binding-1',
      { status: 'ENDED' },
      'platform-user-1',
    );

    expect(result.status).toBe('ENDED');
    expect(result.effective_to).toBeInstanceOf(Date);
    expect(prismaMock.commercialEvent.create).toHaveBeenCalled();
  });

  it('creates an explicit group-account master and audit event', async () => {
    prismaMock.groupAccount.create.mockResolvedValue({
      id: 'group-1',
      name: 'Acme Group',
      customer_legal_name: 'Acme Holdings plc',
      status: 'ACTIVE',
    });

    const result = await service.createGroupAccount(
      {
        name: 'Acme Group',
        customerLegalName: 'Acme Holdings plc',
      },
      'platform-user-1',
    );

    expect(result.id).toBe('group-1');
    expect(prismaMock.commercialEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_type: 'commercial_group_account.created',
        actor: 'platform-user-1',
      }),
    });
  });

  it('returns a group summary containing only accounts independently visible to the current tenant boundary', async () => {
    prismaMock.commercialAccount.findFirst.mockResolvedValue({
      group_account_id: 'group-1',
    });
    prismaMock.groupAccount.findFirst.mockResolvedValue({
      id: 'group-1',
      name: 'Acme Group',
      customer_legal_name: 'Acme Holdings plc',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
      commercialAccounts: [
        {
          id: 'account-1',
          billing_address: '{}',
          tax_facts: '{}',
          contacts: '[]',
          currency: 'GBP',
          tenantBindings: [
            { tenant_id: 'tenant-1', region: 'GB', service_scope: '[]' },
          ],
          entitlements: [],
        },
      ],
    });

    const result = await service.getGroupSummaryForTenant(
      'account-1',
      'tenant-1',
      'prod-eu',
    );

    expect(result.accountCount).toBe(1);
    expect(result.regions).toEqual(['GB']);
    expect(prismaMock.groupAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          commercialAccounts: expect.objectContaining({
            where: {
              tenantBindings: {
                some: expect.objectContaining({
                  tenant_id: 'tenant-1',
                  environment_id: 'prod-eu',
                  status: 'ACTIVE',
                }),
              },
            },
          }),
        }),
      }),
    );
  });
});
