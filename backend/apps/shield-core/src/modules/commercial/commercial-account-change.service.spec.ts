import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { CommercialAccountChangeService } from './commercial-account-change.service';

describe('CommercialAccountChangeService (Category A3)', () => {
  let service: CommercialAccountChangeService;
  let prismaMock: any;
  let approvalMock: any;

  const accountUpdatedAt = new Date('2026-08-24T12:00:00.000Z');
  const account = {
    id: 'account-1',
    customer_legal_name: 'Acme Limited',
    billing_address: '{"countryCode":"GB"}',
    tax_facts: '{"countryCode":"GB"}',
    currency: 'GBP',
    contacts: '[{"type":"BILLING"}]',
    billing_source_reference: null,
    contract_owner_id: 'owner-1',
    processor_customer_ref: null,
    group_account_id: null,
    default_payment_method_reference_id: null,
    updated_at: accountUpdatedAt,
  };

  beforeEach(async () => {
    prismaMock = {
      commercialAccount: {
        findFirst: jest.fn().mockResolvedValue(account),
        findUnique: jest.fn().mockResolvedValue(account),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      commercialAccountTenantBinding: {
        findFirst: jest.fn().mockResolvedValue({ id: 'binding-1' }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentMethodReference: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      groupAccount: { findFirst: jest.fn() },
      commercialApproval: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commercialEvent: { create: jest.fn() },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };
    approvalMock = {
      requestApproval: jest.fn().mockImplementation((dto) => ({
        id: 'approval-1',
        status: 'PENDING_APPROVAL',
        before_snapshot: JSON.stringify(dto.beforeSnapshot),
        proposed_snapshot: JSON.stringify(dto.proposedSnapshot),
      })),
      decideApproval: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommercialAccountChangeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommercialApprovalService, useValue: approvalMock },
      ],
    }).compile();
    service = module.get(CommercialAccountChangeService);
  });

  it('creates a tenant-bound profile approval using the authenticated actor', async () => {
    const result = await service.requestChange(
      'account-1',
      'tenant-1',
      'prod-eu',
      'billing-admin-1',
      {
        changeType: 'ACCOUNT_PROFILE_CHANGE',
        reason: 'Legal-name correction',
        accountChanges: { customerLegalName: 'Acme Holdings Limited' },
      },
    );

    expect(result.proposed_snapshot).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        changes: { customerLegalName: 'Acme Holdings Limited' },
      }),
    );
    expect(approvalMock.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        requestedBy: 'billing-admin-1',
        requiredApprovalRole: 'COMMERCIAL_ACCOUNT_OWNER',
      }),
      prismaMock,
    );
  });

  it('stores a payment token only on the pending payment-method row, never in the approval snapshot', async () => {
    prismaMock.paymentMethodReference.create.mockResolvedValue({
      id: 'method-1',
      provider: 'stripe',
      brand: 'visa',
      last4: '4242',
    });

    const result = await service.requestChange(
      'account-1',
      'tenant-1',
      null,
      'billing-admin-1',
      {
        changeType: 'PAYMENT_METHOD_CHANGE',
        reason: 'Replace expired card',
        paymentMethod: {
          provider: 'stripe',
          providerToken: 'pm_provider_token_123',
          brand: 'visa',
          last4: '4242',
        },
      },
    );

    expect(prismaMock.paymentMethodReference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider_token: 'pm_provider_token_123',
          status: 'PENDING_APPROVAL',
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('pm_provider_token_123');
  });

  it('treats group membership as a material, approved account change and validates the group boundary', async () => {
    prismaMock.groupAccount.findFirst.mockResolvedValue({ id: 'group-1' });

    const result = await service.requestChange(
      'account-1',
      'tenant-1',
      'prod-eu',
      'billing-admin-1',
      {
        changeType: 'ACCOUNT_PROFILE_CHANGE',
        reason: 'Join verified holding group',
        accountChanges: { groupAccountId: 'group-1' },
      },
    );

    expect(result.proposed_snapshot.changes).toEqual({
      groupAccountId: 'group-1',
    });
    expect(prismaMock.groupAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'group-1', status: 'ACTIVE' },
      select: { id: true },
    });
  });

  it('rejects a raw card number instead of persisting it as a token', async () => {
    await expect(
      service.requestChange('account-1', 'tenant-1', null, 'billing-admin-1', {
        changeType: 'PAYMENT_METHOD_CHANGE',
        reason: 'unsafe input',
        paymentMethod: {
          provider: 'stripe',
          providerToken: '4242 4242 4242 4242',
        },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.paymentMethodReference.create).not.toHaveBeenCalled();
  });

  it('applies an independently approved profile change and records an audit event', async () => {
    prismaMock.commercialApproval.findFirst.mockResolvedValue({
      id: 'approval-1',
      object_type: 'CommercialAccount',
      object_id: 'account-1',
      tenant_id: 'tenant-1',
      change_type: 'ACCOUNT_PROFILE_CHANGE',
      status: 'APPROVED',
      proposed_snapshot: JSON.stringify({
        expectedAccountUpdatedAt: accountUpdatedAt.toISOString(),
        changes: { currency: 'USD' },
      }),
    });
    prismaMock.commercialApproval.update.mockResolvedValue({
      id: 'approval-1',
      status: 'APPLIED',
      before_snapshot: '{}',
      proposed_snapshot: '{}',
    });

    const result = await service.applyChange(
      'account-1',
      'approval-1',
      'tenant-1',
      'prod-eu',
      'billing-admin-1',
    );

    expect(result.resource.currency).toBe('USD');
    expect(prismaMock.commercialAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'account-1' }),
        data: { currency: 'USD' },
      }),
    );
    expect(prismaMock.commercialEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: 'commercial_account.change.applied',
          tenant_id: 'tenant-1',
        }),
      }),
    );
  });

  it('rejects an approved change when its optimistic-lock snapshot is stale', async () => {
    prismaMock.commercialApproval.findFirst.mockResolvedValue({
      id: 'approval-1',
      change_type: 'ACCOUNT_PROFILE_CHANGE',
      status: 'APPROVED',
      proposed_snapshot: JSON.stringify({
        expectedAccountUpdatedAt: '2026-08-20T00:00:00.000Z',
        changes: { currency: 'USD' },
      }),
    });

    await expect(
      service.applyChange(
        'account-1',
        'approval-1',
        'tenant-1',
        null,
        'billing-admin-1',
      ),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialAccount.updateMany).not.toHaveBeenCalled();
  });

  it('activates an approved payment-method reference without exposing its provider token', async () => {
    prismaMock.commercialApproval.findFirst.mockResolvedValue({
      id: 'approval-payment',
      change_type: 'PAYMENT_METHOD_CHANGE',
      status: 'APPROVED',
      proposed_snapshot: JSON.stringify({
        expectedAccountUpdatedAt: accountUpdatedAt.toISOString(),
        paymentMethodReferenceId: 'method-1',
      }),
    });
    prismaMock.paymentMethodReference.findFirst.mockResolvedValue({
      id: 'method-1',
      commercial_account_id: 'account-1',
      provider: 'stripe',
      provider_token: 'pm_secret_provider_token',
      status: 'PENDING_APPROVAL',
    });
    prismaMock.paymentMethodReference.update.mockResolvedValue({
      id: 'method-1',
      status: 'ACTIVE',
    });
    prismaMock.commercialApproval.update.mockResolvedValue({
      id: 'approval-payment',
      status: 'APPLIED',
      before_snapshot: '{}',
      proposed_snapshot: '{}',
    });

    const result = await service.applyChange(
      'account-1',
      'approval-payment',
      'tenant-1',
      null,
      'billing-admin-1',
    );

    expect(prismaMock.paymentMethodReference.update).toHaveBeenCalledWith({
      where: { id: 'method-1' },
      data: { status: 'ACTIVE' },
    });
    expect(prismaMock.commercialAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { default_payment_method_reference_id: 'method-1' },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('pm_secret_provider_token');
    expect(
      JSON.stringify(prismaMock.commercialEvent.create.mock.calls),
    ).not.toContain('pm_secret_provider_token');
  });
});
