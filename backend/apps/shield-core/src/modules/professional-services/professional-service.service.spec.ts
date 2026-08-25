import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProfessionalServiceService } from './professional-service.service';

describe('ProfessionalServiceService Category G controls', () => {
  let prisma: any;
  let approvals: any;
  let service: ProfessionalServiceService;

  const now = Date.now();
  const termStart = new Date(now - 5 * 86_400_000);
  const termEnd = new Date(now + 60 * 86_400_000);
  const serviceObligation = {
    id: 'obligation-1',
    tenant_id: 'tenant-1',
    environment_id: 'prod',
    contract_id: 'contract-1',
    obligation_type: 'PROFESSIONAL_SERVICE',
    status: 'ACTIVE',
  };
  const engagement = {
    id: 'engagement-1',
    tenant_id: 'tenant-1',
    environment_id: 'prod',
    commercial_account_id: 'account-1',
    contract_id: 'contract-1',
    service_obligation_id: serviceObligation.id,
    serviceObligation,
    engagement_key: 'engagement-key',
    service_type: 'GENERAL_PROFESSIONAL_SERVICE',
    status: 'ACTIVE',
    term_start: termStart,
    term_end: termEnd,
    hours_expire_at: termEnd,
    allocation_period: 'PROJECT',
    included_hours: 10,
    consumed_hours: 0,
    overage_hours: 0,
    forecast_hours: 0,
    warning_threshold_percent: 80,
    overage_policy: 'TRACK_ONLY',
    overage_cap_hours: null,
    rollover_policy: 'NONE',
    rollover_cap_hours: null,
    hourly_rate: null,
    deliverable_definitions: JSON.stringify([
      {
        key: 'report',
        title: 'Final report',
        acceptanceEvidence: 'customer-signoff',
      },
    ]),
    acceptance_criteria: JSON.stringify([
      { key: 'complete', description: 'All SOW scope completed' },
    ]),
    correction_retest_policy: JSON.stringify({
      allowCorrections: true,
      retestRequiredOnFailure: true,
      maxRounds: 2,
    }),
    rules_of_engagement: '{}',
    provider_responsibilities: '["deliver report"]',
  };

  const vcisoDto: any = {
    engagementKey: 'vciso-annual-1',
    serviceType: 'VCISO',
    commercialAccountId: 'account-1',
    contractId: 'contract-1',
    serviceObligationId: 'obligation-vciso',
    priceBookId: 'price-1',
    sowReference: 'sow-vciso-1',
    termStart,
    termEnd,
    scope: {
      objectives: ['security governance'],
      inScope: ['quarterly risk reviews'],
      outOfScope: ['legal advice'],
    },
    requiredInputs: ['risk register'],
    customerResponsibilities: ['provide stakeholders'],
    providerResponsibilities: ['facilitate governance reviews'],
    deliverables: [
      {
        key: 'quarterly-review',
        title: 'Quarterly security review',
        acceptanceEvidence: 'meeting-minutes',
      },
    ],
    acceptanceCriteria: [
      { key: 'complete', description: 'Review and actions delivered' },
    ],
    correctionRetestPolicy: {
      allowCorrections: true,
      retestRequiredOnFailure: false,
      maxRounds: 2,
    },
    pricingMode: 'HOUR_BANK',
    allocationPeriod: 'MONTHLY',
    includedHours: 10,
    warningThresholdPercent: 80,
    overagePolicy: 'REQUIRE_APPROVAL',
    overageCapHours: 5,
    rolloverPolicy: 'CAPPED',
    rolloverCapHours: 3,
    hoursExpireAt: termEnd,
    meetingCadence: 'MONTHLY',
    reviewCadence: 'QUARTERLY',
    limitations: ['advisory only'],
    reason: 'Approved annual vCISO SOW',
  };

  beforeEach(() => {
    prisma = {
      professionalServiceEngagement: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      professionalServiceActivity: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      professionalServiceDeliverable: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      professionalServiceAcceptanceEvent: {
        count: jest.fn(),
        create: jest.fn(),
      },
      contract: { findUnique: jest.fn() },
      serviceObligation: { findFirst: jest.fn(), update: jest.fn() },
      commercialAccountTenantBinding: { findFirst: jest.fn() },
      priceBook: { findUnique: jest.fn() },
      commercialApproval: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    approvals = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
    };
    service = new ProfessionalServiceService(prisma, approvals);
  });

  function prepareCreate() {
    prisma.contract.findUnique.mockResolvedValue({
      id: 'contract-1',
      status: 'ACTIVE',
      commercial_account_id: 'account-1',
      catalog_version_id: 'catalog-1',
      term_start: new Date(termStart.getTime() - 86_400_000),
      term_end: new Date(termEnd.getTime() + 86_400_000),
    });
    prisma.serviceObligation.findFirst.mockResolvedValue({
      ...serviceObligation,
      id: 'obligation-vciso',
      obligation_type: 'VCISO',
    });
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
      region: 'GB',
    });
    prisma.priceBook.findUnique.mockResolvedValue({
      id: 'price-1',
      status: 'APPROVED',
      catalog_version_id: 'catalog-1',
      commercial_account_id: 'account-1',
      region: 'GB',
      currency: 'GBP',
      unit_price: 200,
      minimum_commit: 1000,
      overage_rate: 250,
      effective_from: new Date(termStart.getTime() - 86_400_000),
      effective_to: new Date(termEnd.getTime() + 86_400_000),
      product: { offer_family: 'PROFESSIONAL_SERVICE' },
    });
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue(null);
    prisma.professionalServiceEngagement.create.mockResolvedValue({
      id: 'engagement-vciso',
      status: 'PENDING_APPROVAL',
    });
    approvals.requestApproval.mockResolvedValue({ id: 'approval-vciso' });
    prisma.professionalServiceEngagement.update.mockResolvedValue({
      id: 'engagement-vciso',
      approval_id: 'approval-vciso',
    });
  }

  it('creates vCISO pricing from the approved price book and requests maker/checker approval', async () => {
    prepareCreate();

    await service.create('tenant-1', 'prod', 'maker-1', vcisoDto);

    expect(prisma.professionalServiceEngagement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        service_type: 'VCISO',
        pricing_mode: 'HOUR_BANK',
        allocation_period: 'MONTHLY',
        contracted_amount: 2000,
        hourly_rate: 250,
        currency: 'GBP',
      }),
    });
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'PROFESSIONAL_SERVICE_PROFILE',
        financialImpact: 3250,
        proposedSnapshot: expect.objectContaining({
          noAutomaticInvoice: true,
        }),
      }),
      prisma,
    );
  });

  it('rejects vCISO without explicit meeting and review cadence', async () => {
    await expect(
      service.create('tenant-1', 'prod', 'maker-1', {
        ...vcisoDto,
        meetingCadence: undefined,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.professionalServiceEngagement.create).not.toHaveBeenCalled();
  });

  it('rejects penetration testing without independent qualified testers', async () => {
    const testAt = new Date(now + 2 * 86_400_000);
    const windowStart = new Date(now + 86_400_000);
    const windowEnd = new Date(now + 3 * 86_400_000);
    await expect(
      service.create('tenant-1', 'prod', 'maker-1', {
        ...vcisoDto,
        serviceType: 'PENETRATION_TEST',
        pricingMode: 'FIXED_FEE',
        allocationPeriod: 'PROJECT',
        overagePolicy: 'TRACK_ONLY',
        overageCapHours: undefined,
        rolloverPolicy: 'NONE',
        rolloverCapHours: undefined,
        scheduledServiceAt: testAt,
        meetingCadence: undefined,
        reviewCadence: undefined,
        penTestAuthorization: {
          customerAuthorizer: 'customer-ciso',
          authorizationReference: 'auth-1',
          allowedTargets: ['app.example.test'],
          validFrom: termStart.toISOString(),
          validUntil: termEnd.toISOString(),
        },
        rulesOfEngagement: {
          permittedTechniques: ['web testing'],
          prohibitedActions: ['denial of service'],
          testWindowStart: windowStart.toISOString(),
          testWindowEnd: windowEnd.toISOString(),
          emergencyStopContact: 'customer-ciso',
          dataHandlingReference: 'handling-1',
        },
        testerAssurance: {
          independent: false,
          testerReference: 'tester-1',
          qualificationReferences: ['crest-1'],
          conflictCheckReference: 'conflict-check-1',
        },
        reportTreatment: {
          classification: 'CONFIDENTIAL',
          distribution: 'NAMED_RECIPIENTS',
          retentionPolicyReference: 'retention-1',
          redactionRequired: true,
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects audit/evidence projects without explicit limitations', async () => {
    await expect(
      service.create('tenant-1', 'prod', 'maker-1', {
        ...vcisoDto,
        serviceType: 'AUDIT_EVIDENCE_PROJECT',
        pricingMode: 'FIXED_FEE',
        allocationPeriod: 'PROJECT',
        overagePolicy: 'TRACK_ONLY',
        overageCapHours: undefined,
        rolloverPolicy: 'NONE',
        rolloverCapHours: undefined,
        meetingCadence: undefined,
        reviewCadence: undefined,
        frameworkKey: 'ISO_27001',
        frameworkVersion: '2022',
        sourceDataResponsibilities: {
          customer: ['confirm audit scope'],
          provider: ['assemble evidence references'],
        },
        limitations: [],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('fails closed when activation has no approved engagement and active obligation', async () => {
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue({
      ...engagement,
      status: 'PENDING_APPROVAL',
    });

    await expect(
      service.activate('engagement-1', 'tenant-1', 'prod', 'operator-1', {
        activationReference: 'kickoff-1',
        readinessEvidenceRefs: ['readiness-1'],
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.professionalServiceEngagement.update).not.toHaveBeenCalled();
  });

  it('activates an approved current SOW with immutable readiness evidence', async () => {
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue({
      ...engagement,
      status: 'APPROVED',
    });
    prisma.professionalServiceEngagement.update.mockResolvedValue({
      ...engagement,
      activation_reference: 'kickoff-1',
    });

    await service.activate('engagement-1', 'tenant-1', 'prod', 'operator-1', {
      activationReference: 'kickoff-1',
      readinessEvidenceRefs: ['readiness-1'],
    });

    expect(prisma.professionalServiceEngagement.update).toHaveBeenCalledWith({
      where: { id: 'engagement-1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        activated_by: 'operator-1',
        activation_reference: 'kickoff-1',
        readiness_evidence_refs: '["readiness-1"]',
      }),
    });
  });

  it('tracks fixed-fee hours above allowance as internal variance without creating a charge', async () => {
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue(
      engagement,
    );
    prisma.professionalServiceActivity.findMany.mockResolvedValue([]);
    prisma.professionalServiceActivity.create.mockResolvedValue({
      id: 'activity-1',
      entry_type: 'INTERNAL_VARIANCE',
    });
    prisma.professionalServiceEngagement.update.mockResolvedValue({
      ...engagement,
      consumed_hours: 12,
      overage_hours: 2,
    });

    await service.logActivity(
      'engagement-1',
      'tenant-1',
      'prod',
      'consultant-1',
      {
        activityType: 'DELIVERY_WORK',
        hours: 12,
        summary: 'Completed SOW delivery work',
        evidenceReference: 'timesheet://1',
      },
    );

    expect(prisma.professionalServiceActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'INTERNAL_VARIANCE',
        overage_period_after: 2,
      }),
    });
    expect((prisma as any).commercialInvoice).toBeUndefined();
  });

  it('applies only the contracted capped rollover from the previous vCISO period', async () => {
    const monthlyStart = new Date('2026-07-01T00:00:00.000Z');
    const monthlyEnd = new Date('2026-09-30T00:00:00.000Z');
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue({
      ...engagement,
      service_type: 'VCISO',
      term_start: monthlyStart,
      term_end: monthlyEnd,
      hours_expire_at: monthlyEnd,
      allocation_period: 'MONTHLY',
      included_hours: 10,
      consumed_hours: 6,
      overage_policy: 'BLOCK',
      rollover_policy: 'CAPPED',
      rollover_cap_hours: 3,
    });
    prisma.professionalServiceActivity.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          hours: 6,
          included_available_after: 10,
          occurred_at: new Date('2026-07-10T00:00:00.000Z'),
        },
      ]);
    prisma.professionalServiceActivity.create.mockResolvedValue({
      id: 'activity-rollover',
    });
    prisma.professionalServiceEngagement.update.mockResolvedValue({
      ...engagement,
      consumed_hours: 18,
    });

    await service.logActivity(
      'engagement-1',
      'tenant-1',
      'prod',
      'consultant-1',
      {
        activityType: 'MEETING',
        hours: 12,
        summary: 'Monthly governance working sessions',
        evidenceReference: 'timesheet://rollover',
        occurredAt: new Date('2026-08-10T00:00:00.000Z'),
      },
    );

    expect(prisma.professionalServiceActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        allocation_period_start: new Date('2026-08-01T00:00:00.000Z'),
        included_available_after: 13,
        consumed_period_after: 12,
        overage_period_after: 0,
      }),
    });
  });

  it('blocks unapproved customer overage before appending activity', async () => {
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue({
      ...engagement,
      overage_policy: 'BLOCK',
    });
    prisma.professionalServiceActivity.findMany.mockResolvedValue([]);

    await expect(
      service.logActivity('engagement-1', 'tenant-1', 'prod', 'consultant-1', {
        activityType: 'DELIVERY_WORK',
        hours: 12,
        summary: 'Attempted out-of-scope hours',
        evidenceReference: 'timesheet://blocked',
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.professionalServiceActivity.create).not.toHaveBeenCalled();
  });

  it('uses only a matching unexpired period approval for cumulative overage', async () => {
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue({
      ...engagement,
      consumed_hours: 9,
      overage_policy: 'REQUIRE_APPROVAL',
      hourly_rate: 300,
    });
    prisma.professionalServiceActivity.findMany.mockResolvedValue([
      {
        hours: 9,
        included_available_after: 10,
        occurred_at: new Date(termStart.getTime() + 1000),
      },
    ]);
    prisma.commercialApproval.findMany.mockResolvedValue([
      {
        id: 'approved-overage-1',
        proposed_snapshot: JSON.stringify({
          allocationPeriodStart: termStart.toISOString(),
          maxOverageHours: 3,
        }),
      },
    ]);
    prisma.professionalServiceActivity.create.mockResolvedValue({
      id: 'activity-approved-overage',
    });
    prisma.professionalServiceEngagement.update.mockResolvedValue({
      ...engagement,
      consumed_hours: 12,
      overage_hours: 2,
    });

    await service.logActivity(
      'engagement-1',
      'tenant-1',
      'prod',
      'consultant-1',
      {
        activityType: 'DELIVERY_WORK',
        hours: 3,
        summary: 'Named-approved additional work',
        evidenceReference: 'timesheet://approved-overage',
      },
    );

    expect(prisma.professionalServiceActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entry_type: 'APPROVED_OVERAGE',
        overage_approval_id: 'approved-overage-1',
        overage_period_after: 2,
      }),
    });
  });

  it('binds overage approval to one allocation period and named customer authority', async () => {
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue({
      ...engagement,
      overage_policy: 'REQUIRE_APPROVAL',
      hourly_rate: 300,
    });
    approvals.requestApproval.mockResolvedValue({ id: 'overage-approval-1' });

    await service.requestOverage(
      'engagement-1',
      'tenant-1',
      'prod',
      'maker-1',
      {
        maxOverageHours: 4,
        namedCustomerAuthorizer: 'customer-ciso',
        customerApprovalReference: 'approval-email-1',
        reason: 'Additional contracted workshop',
      },
    );

    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'PROFESSIONAL_SERVICE_OVERAGE',
        financialImpact: 1200,
        proposedSnapshot: expect.objectContaining({
          namedCustomerAuthorizer: 'customer-ciso',
          customerApprovalReference: 'approval-email-1',
          noAutomaticInvoice: true,
        }),
      }),
    );
  });

  it('rejects a deliverable outside the approved SOW', async () => {
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue(
      engagement,
    );

    await expect(
      service.submitDeliverable(
        'engagement-1',
        'tenant-1',
        'prod',
        'consultant-1',
        {
          deliverableKey: 'unapproved-report',
          title: 'Unapproved report',
          contentReference: 'vault://report',
          evidenceReferences: ['evidence-1'],
          limitations: [],
        },
      ),
    ).rejects.toThrow(ConflictException);
    expect(prisma.professionalServiceDeliverable.create).not.toHaveBeenCalled();
  });

  it('submits the contracted deliverable and opens named customer acceptance', async () => {
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue(
      engagement,
    );
    prisma.professionalServiceDeliverable.findFirst.mockResolvedValue(null);
    prisma.professionalServiceDeliverable.create.mockResolvedValue({
      id: 'deliverable-1',
      deliverable_key: 'report',
      version: 1,
    });
    prisma.professionalServiceDeliverable.findMany.mockResolvedValue([
      { id: 'deliverable-1', deliverable_key: 'report', version: 1 },
    ]);
    prisma.professionalServiceEngagement.update.mockResolvedValue({
      ...engagement,
      status: 'AWAITING_ACCEPTANCE',
    });

    await service.submitDeliverable(
      'engagement-1',
      'tenant-1',
      'prod',
      'consultant-1',
      {
        deliverableKey: 'report',
        title: 'Final report',
        contentReference: 'vault://report-v1',
        evidenceReferences: ['evidence-1'],
        limitations: ['Point-in-time assessment'],
        submissionComplete: true,
      },
    );

    expect(prisma.professionalServiceDeliverable.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deliverable_key: 'report',
        version: 1,
        title: 'Final report',
      }),
    });
    expect(prisma.professionalServiceEngagement.update).toHaveBeenCalledWith({
      where: { id: 'engagement-1' },
      data: { status: 'AWAITING_ACCEPTANCE' },
    });
  });

  it('requires the contracted retest evidence for a corrected deliverable', async () => {
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue({
      ...engagement,
      status: 'CORRECTION_REQUIRED',
    });
    prisma.professionalServiceDeliverable.findFirst.mockResolvedValue({
      id: '747515f6-b9ca-463d-b330-31264090d230',
      engagement_id: 'engagement-1',
      deliverable_key: 'report',
      version: 1,
    });

    await expect(
      service.submitDeliverable(
        'engagement-1',
        'tenant-1',
        'prod',
        'consultant-1',
        {
          deliverableKey: 'report',
          title: 'Final report',
          contentReference: 'vault://report-v2',
          evidenceReferences: ['evidence-2'],
          limitations: [],
          correctionOfId: '747515f6-b9ca-463d-b330-31264090d230',
        },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('accepts only the latest deliverables against every criterion and closes the obligation', async () => {
    const deliverableId = '747515f6-b9ca-463d-b330-31264090d230';
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue({
      ...engagement,
      status: 'AWAITING_ACCEPTANCE',
    });
    prisma.professionalServiceDeliverable.findMany.mockResolvedValue([
      {
        id: deliverableId,
        deliverable_key: 'report',
        version: 1,
      },
    ]);
    prisma.professionalServiceAcceptanceEvent.count.mockResolvedValue(0);
    prisma.professionalServiceAcceptanceEvent.create.mockResolvedValue({
      id: 'acceptance-1',
      decision: 'ACCEPTED',
    });
    prisma.professionalServiceEngagement.update.mockResolvedValue({
      ...engagement,
      status: 'ACCEPTED',
    });
    prisma.serviceObligation.update.mockResolvedValue({
      ...serviceObligation,
      status: 'DELIVERED',
    });

    await service.decideAcceptance(
      'engagement-1',
      'tenant-1',
      'prod',
      'operator-1',
      {
        decision: 'ACCEPTED',
        reviewedDeliverableIds: [deliverableId],
        criteriaResults: {
          complete: { met: true, evidenceReference: 'acceptance-check-1' },
        },
        namedCustomerAuthorizer: 'customer-ciso',
        customerDecisionReference: 'customer-acceptance-1',
      },
    );

    expect(
      prisma.professionalServiceAcceptanceEvent.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        decision: 'ACCEPTED',
        named_customer_authorizer: 'customer-ciso',
      }),
    });
    expect(prisma.serviceObligation.update).toHaveBeenCalledWith({
      where: { id: serviceObligation.id },
      data: expect.objectContaining({
        status: 'DELIVERED',
        evidence_ref: 'customer-acceptance-1',
      }),
    });
    expect((prisma as any).commercialInvoice).toBeUndefined();
  });

  it('enforces contracted retest policy on customer correction decisions', async () => {
    const deliverableId = '747515f6-b9ca-463d-b330-31264090d230';
    prisma.professionalServiceEngagement.findFirst.mockResolvedValue({
      ...engagement,
      status: 'AWAITING_ACCEPTANCE',
    });
    prisma.professionalServiceDeliverable.findMany.mockResolvedValue([
      { id: deliverableId, deliverable_key: 'report', version: 1 },
    ]);
    prisma.professionalServiceAcceptanceEvent.count.mockResolvedValue(0);

    await expect(
      service.decideAcceptance(
        'engagement-1',
        'tenant-1',
        'prod',
        'operator-1',
        {
          decision: 'CORRECTION_REQUIRED',
          reviewedDeliverableIds: [deliverableId],
          criteriaResults: {
            complete: { met: false, evidenceReference: 'gap-1' },
          },
          namedCustomerAuthorizer: 'customer-ciso',
          customerDecisionReference: 'correction-request-1',
          correctionScope: 'Correct missing scope section',
          retestRequired: false,
        },
      ),
    ).rejects.toThrow(ConflictException);
    expect(
      prisma.professionalServiceAcceptanceEvent.create,
    ).not.toHaveBeenCalled();
  });
});
