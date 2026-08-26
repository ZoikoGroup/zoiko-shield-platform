import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DiscountApprovalService } from './discount-approval.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { AuthorizationService } from '../authorization/authorization.service';

describe('DiscountApprovalService (Category I3 margin authority)', () => {
  let service: DiscountApprovalService;
  let prisma: any;
  let approvals: any;
  let authorization: any;

  const policy = {
    id: 'policy-1',
    policy_key: 'managed-defense-usd',
    version: 1,
    service_class: 'MANAGED_DEFENSE',
    region: 'US',
    currency: 'USD',
    standard_margin_floor_percent: 50,
    finance_margin_floor_percent: 30,
    absolute_margin_floor_percent: 10,
    status: 'APPROVED',
    effective_from: new Date(Date.now() - 60_000),
    effective_to: null,
    requested_by: 'policy-maker',
  };

  beforeEach(async () => {
    prisma = {
      discountAuthorityPolicy: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([policy]),
        update: jest.fn(),
      },
      costRecord: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cost-1',
          quantity: 100,
          unit_cost: 50,
          total_cost: 5000,
          source: 'finance-ledger-2026-07',
        }),
      },
      commercialQuote: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      quoteDiscountReview: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((callback) => callback(prisma)),
    };
    approvals = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
    };
    authorization = { getMembershipForPrincipal: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscountApprovalService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommercialApprovalService, useValue: approvals },
        { provide: AuthorizationService, useValue: authorization },
      ],
    }).compile();
    service = module.get(DiscountApprovalService);
  });

  const input = (overrides: Record<string, unknown> = {}) => ({
    tenantId: 'tenant-1',
    environmentId: 'production',
    region: 'US',
    currency: 'USD',
    termMonths: 12,
    quoteExpiresAt: new Date(Date.now() + 172_800_000),
    technicalAuthorityHash: 'a'.repeat(64),
    requestedBy: 'sales-maker',
    lines: [
      {
        sku: 'MDR-1',
        offerFamily: 'MANAGED_DEFENSE',
        quantity: 1,
        unitPrice: 100,
        discountPercent: 20,
        priceBookMinimumCommit: 500,
      },
    ],
    partnerEconomics: { route: 'DIRECT' as const },
    terms: {
      reason: 'Annual committed deployment',
      rampSchedule: [
        { startMonth: 1, endMonth: 3, quantityPercent: 50 },
        { startMonth: 4, endMonth: 12, quantityPercent: 100 },
      ],
      minimumCommitAmount: 1000,
      discountExpiresAt: new Date(Date.now() + 86_400_000),
    },
    ...overrides,
  });

  it('calculates service-class gross margin and escalates below the standard floor to Finance', async () => {
    const result = await service.analyze(input());

    expect(result.required_approval_role).toBe('FINANCE_COMMERCIAL_APPROVER');
    expect(result.authority_rank).toBe(2);
    expect(JSON.parse(result.gross_margin_by_service_class)).toEqual([
      expect.objectContaining({
        serviceClass: 'MANAGED_DEFENSE',
        costRecordId: 'cost-1',
        grossMarginPercent: 37.5,
        requiredAuthorityRank: 2,
      }),
    ]);
    expect(result.term_months).toBe(12);
    expect(JSON.parse(result.ramp_schedule)).toHaveLength(2);
    expect(result.minimum_commit_amount).toBe(1000);
  });

  it('includes approved partner pass-through economics in the margin and approval snapshot', async () => {
    const result = await service.analyze(
      input({
        partnerEconomics: {
          route: 'PARTNER',
          partnerAgreementId: 'partner-agreement-1',
          commissionPercent: 10,
          marginPercent: 5,
        },
      }),
    );

    const partner = JSON.parse(result.partner_pass_through);
    expect(partner).toEqual(
      expect.objectContaining({
        route: 'PARTNER',
        partnerAgreementId: 'partner-agreement-1',
        commissionPercent: 10,
      }),
    );
    expect(partner.amount).toBeGreaterThan(0);
  });

  it('rejects a discount below the policy absolute margin floor', async () => {
    prisma.costRecord.findFirst.mockResolvedValue({
      id: 'cost-1',
      quantity: 100,
      unit_cost: 75,
      source: 'ledger',
    });

    await expect(service.analyze(input())).rejects.toThrow(
      'below absolute floor',
    );
  });

  it('fails closed when no approved policy or cost basis exists', async () => {
    prisma.discountAuthorityPolicy.findMany.mockResolvedValue([]);
    await expect(service.analyze(input())).rejects.toThrow(
      'No approved effective discount authority policy',
    );

    prisma.discountAuthorityPolicy.findMany.mockResolvedValue([policy]);
    prisma.costRecord.findFirst.mockResolvedValue(null);
    await expect(service.analyze(input())).rejects.toThrow(
      'No usable current cost basis',
    );
  });

  it('requires a contiguous full-term ramp ending at full quantity and the catalog minimum', async () => {
    await expect(
      service.analyze(
        input({
          terms: {
            reason: 'Bad ramp',
            rampSchedule: [
              { startMonth: 2, endMonth: 12, quantityPercent: 100 },
            ],
            minimumCommitAmount: 1000,
            discountExpiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.analyze(
        input({
          terms: {
            reason: 'Below minimum',
            rampSchedule: [
              { startMonth: 1, endMonth: 12, quantityPercent: 100 },
            ],
            minimumCommitAmount: 100,
            discountExpiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('prevents a lower authority role from approving a Finance-tier review', async () => {
    prisma.quoteDiscountReview.findFirst.mockResolvedValue({
      id: 'review-1',
      quote_id: 'quote-1',
      tenant_id: 'tenant-1',
      environment_id: 'production',
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
      authority_rank: 2,
      required_approval_role: 'FINANCE_COMMERCIAL_APPROVER',
      approval: { status: 'PENDING_APPROVAL' },
    });
    authorization.getMembershipForPrincipal.mockResolvedValue({
      roles: [{ code: 'COMMERCIAL_APPROVER' }],
    });

    await expect(
      service.decideQuote(
        'quote-1',
        'tenant-1',
        'production',
        'commercial-approver',
        { decision: 'APPROVED', reason: 'approved' },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(approvals.decideApproval).not.toHaveBeenCalled();
  });

  it('atomically records a decision from an authority at or above the required tier', async () => {
    prisma.quoteDiscountReview.findFirst.mockResolvedValue({
      id: 'review-1',
      quote_id: 'quote-1',
      tenant_id: 'tenant-1',
      environment_id: 'production',
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
      authority_rank: 2,
      required_approval_role: 'FINANCE_COMMERCIAL_APPROVER',
      approval: { status: 'PENDING_APPROVAL' },
    });
    authorization.getMembershipForPrincipal.mockResolvedValue({
      roles: [{ code: 'EXECUTIVE_COMMERCIAL_APPROVER' }],
    });
    prisma.quoteDiscountReview.update.mockResolvedValue({
      id: 'review-1',
      status: 'APPROVED',
    });

    const result = await service.decideQuote(
      'quote-1',
      'tenant-1',
      'production',
      'executive-approver',
      { decision: 'APPROVED', reason: 'Margin exception accepted' },
    );

    expect(result.status).toBe('APPROVED');
    expect(approvals.decideApproval).toHaveBeenCalledWith(
      'approval-1',
      'executive-approver',
      'APPROVED',
      'Margin exception accepted',
      prisma,
    );
  });

  it('enforces maker-checker and descending floors for threshold policies', async () => {
    await expect(
      service.createPolicy(
        {
          serviceClass: 'MANAGED_DEFENSE',
          region: 'US',
          currency: 'USD',
          standardMarginFloorPercent: 20,
          financeMarginFloorPercent: 40,
          absoluteMarginFloorPercent: 0,
          effectiveFrom: new Date(Date.now() + 86_400_000),
        },
        'maker',
      ),
    ).rejects.toThrow(BadRequestException);

    prisma.discountAuthorityPolicy.findUnique.mockResolvedValue({
      ...policy,
      status: 'PENDING_APPROVAL',
      requested_by: 'maker',
      supersedes_policy_id: null,
    });
    await expect(
      service.decidePolicy('policy-1', 'maker', {
        decision: 'APPROVED',
        reason: 'self approval',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
