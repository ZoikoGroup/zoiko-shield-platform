import { BadRequestException } from '@nestjs/common';
import { IncidentResponseRetainerService } from './incident-response-retainer.service';

describe('IncidentResponseRetainerService Category G commercial boundary', () => {
  let prisma: any;
  let approvals: any;
  let service: IncidentResponseRetainerService;

  const validDto = {
    retainerKey: 'annual-ir',
    commercialAccountId: '3b1610e6-81cb-40dc-a137-aa74b7b014e8',
    contractId: 'cbb6656a-e385-4be6-9763-6e84416d7e49',
    serviceObligationId: '97b7829a-8ba1-45d2-85c3-c54c0560891b',
    priceBookId: '601b7dab-56d6-4296-b38c-7f36d790f450',
    termStart: new Date('2026-09-01T00:00:00.000Z'),
    termEnd: new Date('2027-09-01T00:00:00.000Z'),
    includedHours: 40,
    includedServices: ['containment', 'forensics'],
    responseWindow: {
      coverage: '24X7',
      acknowledgementTargetMinutes: 30,
      activationResponseMinutes: 60,
    },
    readinessObligations: {
      namedContacts: { required: true },
      accessProvisioning: { required: true },
      evidencePreservation: { required: true },
      escalationPath: { required: true },
    },
    exclusions: ['legal advice'],
    maximumResponseAuthority: 'R2',
    overagePolicy: 'REQUIRE_APPROVAL',
    overageCapHours: 20,
    overageRate: 300,
    warningThresholdPercent: 80,
    rolloverPolicy: 'CAPPED',
    rolloverCapHours: 10,
    namedActivationPath: {
      role: 'customer-ciso',
      contactReference: 'contact://ciso',
      method: 'hotline',
    },
    emergencyProvision: {
      enabled: true,
      contractReference: 'emergency-clause-1',
      reconciliationRequired: true,
    },
    thirdPartyCostPolicy: {
      enabled: true,
      contractReference: 'pass-through-1',
      maxMarkupPercent: 10,
      requiresNamedApproval: true,
    },
    legalServiceScope: { included: false, counselControlled: false },
    reason: 'Annual IR retainer order',
  };

  beforeEach(() => {
    prisma = {
      incidentResponseRetainer: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      contract: { findUnique: jest.fn() },
      serviceObligation: { findFirst: jest.fn() },
      commercialAccountTenantBinding: { findFirst: jest.fn() },
      priceBook: { findUnique: jest.fn() },
      commercialApproval: { update: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    approvals = { requestApproval: jest.fn(), decideApproval: jest.fn() };
    service = new IncidentResponseRetainerService(prisma, approvals);
  });

  it('rejects a non-annual retainer term before commercial persistence', async () => {
    await expect(
      service.create('tenant-1', 'prod', 'maker-1', {
        ...validDto,
        termEnd: new Date('2026-10-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.incidentResponseRetainer.create).not.toHaveBeenCalled();
  });

  it('creates a maker-checker retainer with explicit no-legal-conclusion wording', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      id: validDto.contractId,
      status: 'ACTIVE',
      commercial_account_id: validDto.commercialAccountId,
      catalog_version_id: 'catalog-1',
      term_start: new Date('2026-01-01T00:00:00.000Z'),
      term_end: new Date('2028-01-01T00:00:00.000Z'),
    });
    prisma.serviceObligation.findFirst.mockResolvedValue({
      id: validDto.serviceObligationId,
    });
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
      region: 'EU',
    });
    prisma.priceBook.findUnique.mockResolvedValue({
      id: validDto.priceBookId,
      status: 'APPROVED',
      catalog_version_id: 'catalog-1',
      commercial_account_id: null,
      region: 'GLOBAL',
      effective_from: new Date('2026-01-01T00:00:00.000Z'),
      effective_to: null,
      unit_price: 100,
    });
    prisma.incidentResponseRetainer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.incidentResponseRetainer.create.mockResolvedValue({
      id: 'retainer-1',
    });
    approvals.requestApproval.mockResolvedValue({ id: 'approval-1' });
    prisma.incidentResponseRetainer.update.mockResolvedValue({
      id: 'retainer-1',
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
    });

    const result = await service.create(
      'tenant-1',
      'prod',
      'maker-1',
      validDto,
    );

    expect(result.approval_id).toBe('approval-1');
    expect(prisma.incidentResponseRetainer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: 'tenant-1',
        included_hours: 40,
        overage_policy: 'REQUIRE_APPROVAL',
        no_legal_conclusion_wording: expect.stringContaining(
          'does not establish legal privilege',
        ),
      }),
    });
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'IR_RETAINER_PROFILE',
        requiredApprovalRole: 'COMMERCIAL_APPROVER',
      }),
      prisma,
    );
  });
});
