import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { ConcessionService } from './concession.service';

describe('ConcessionService Category B6 controls', () => {
  let service: ConcessionService;
  let prisma: any;
  let approvals: any;

  const subscription = {
    id: '5cb65e47-bc13-46b8-a7a8-163acb4d6331',
    commercial_account_id: 'account-1',
    status: 'ACTIVE',
  };
  const concession = {
    id: 'concession-1',
    subscription_id: subscription.id,
    subscription,
    commercial_account_id: 'account-1',
    tenant_id: 'tenant-1',
    environment_id: 'env-1',
    scope: JSON.stringify(['AI_SECURITY']),
    starts_at: new Date(Date.now() - 1_000),
    ends_at: new Date(Date.now() + 86_400_000),
    commercial_reason: 'Design-partner launch support',
    margin_impact: 100,
    renewal_treatment: 'REVIEW_AT_RENEWAL',
    status: 'APPROVED',
    approval_id: 'approval-1',
    requested_by: 'sales-1',
    entitlements: [],
  };

  beforeEach(async () => {
    prisma = {
      commercialConcession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commercialSubscription: { findUnique: jest.fn() },
      commercialAccount: { findUnique: jest.fn() },
      commercialAccountTenantBinding: { findFirst: jest.fn() },
      commercialApproval: { update: jest.fn() },
      commercialEvent: { create: jest.fn() },
      entitlement: {
        findFirst: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    approvals = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
      getApprovalById: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ConcessionService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommercialApprovalService, useValue: approvals },
      ],
    }).compile();
    service = module.get(ConcessionService);
    prisma.commercialAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      status: 'ACTIVE',
    });
  });

  const request = {
    subscriptionId: subscription.id,
    tenantId: 'tenant-1',
    environmentId: 'env-1',
    offerTypes: ['AI_SECURITY'],
    startsAt: new Date(Date.now() + 1_000),
    endsAt: new Date(Date.now() + 86_400_000),
    commercialReason: 'Design-partner launch support',
    marginImpact: 100,
    renewalTreatment: 'REVIEW_AT_RENEWAL' as const,
  };

  it('rejects a concession without a valid hard end', async () => {
    await expect(
      service.requestConcession(
        { ...request, endsAt: new Date(Date.now() - 1_000) },
        'sales-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records scope, dates, reason, margin and renewal treatment before approval', async () => {
    prisma.commercialSubscription.findUnique.mockResolvedValue(subscription);
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
    });
    prisma.commercialConcession.create.mockResolvedValue({
      id: 'concession-1',
      status: 'PENDING_APPROVAL',
    });
    approvals.requestApproval.mockResolvedValue({ id: 'approval-1' });
    prisma.commercialConcession.update.mockResolvedValue({
      id: 'concession-1',
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
    });

    await service.requestConcession(request, 'sales-1');

    expect(prisma.commercialConcession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: JSON.stringify(['AI_SECURITY']),
        commercial_reason: request.commercialReason,
        margin_impact: 100,
        renewal_treatment: 'REVIEW_AT_RENEWAL',
        status: 'PENDING_APPROVAL',
      }),
    });
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'FREE_MONTHS',
        requestedBy: 'sales-1',
        marginImpact: 100,
      }),
      prisma,
    );
  });

  it('delegates the decision to maker-checker approval', async () => {
    prisma.commercialConcession.findUnique.mockResolvedValue({
      ...concession,
      status: 'PENDING_APPROVAL',
    });
    approvals.decideApproval.mockResolvedValue({ status: 'APPROVED' });
    prisma.commercialConcession.update.mockResolvedValue({
      ...concession,
      status: 'APPROVED',
    });

    await service.decideConcession('concession-1', 'finance-1', {
      decision: 'APPROVED',
      reason: 'Margin accepted',
    });
    expect(approvals.decideApproval).toHaveBeenCalledWith(
      'approval-1',
      'finance-1',
      'APPROVED',
      'Margin accepted',
    );
  });

  it('creates source-tagged temporary entitlements only after approval', async () => {
    prisma.commercialConcession.findUnique.mockResolvedValue(concession);
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
    });
    approvals.getApprovalById.mockResolvedValue({
      id: 'approval-1',
      status: 'APPROVED',
      object_type: 'CommercialConcession',
      object_id: 'concession-1',
    });
    prisma.entitlement.findFirst.mockResolvedValue(null);
    prisma.commercialConcession.update.mockResolvedValue({
      ...concession,
      status: 'ACTIVE',
    });

    await service.activateConcession('concession-1', 'sales-ops-1');
    expect(prisma.entitlement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          offer_type: 'AI_SECURITY',
          source_type: 'COMMERCIAL_CONCESSION',
          concession_id: 'concession-1',
          effective_to: concession.ends_at,
        }),
      ],
    });
  });

  it('expires concession entitlements without deleting history', async () => {
    prisma.commercialConcession.findUnique.mockResolvedValue({
      ...concession,
      status: 'ACTIVE',
    });
    prisma.commercialConcession.update.mockResolvedValue({
      ...concession,
      status: 'EXPIRED',
    });

    await service.expireConcession('concession-1');
    expect(prisma.entitlement.updateMany).toHaveBeenCalledWith({
      where: { concession_id: 'concession-1', status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'EXPIRED' }),
    });
  });

  it('fails activation closed when the same scope is already active', async () => {
    prisma.commercialConcession.findUnique.mockResolvedValue(concession);
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
    });
    approvals.getApprovalById.mockResolvedValue({
      id: 'approval-1',
      status: 'APPROVED',
      object_type: 'CommercialConcession',
      object_id: 'concession-1',
    });
    prisma.entitlement.findFirst.mockResolvedValue({
      offer_type: 'AI_SECURITY',
    });

    await expect(
      service.activateConcession('concession-1', 'sales-ops-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
