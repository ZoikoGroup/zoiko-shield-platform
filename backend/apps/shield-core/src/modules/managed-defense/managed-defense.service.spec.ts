import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ManagedDefenseService } from './managed-defense.service';

describe('ManagedDefenseService (Category E1-E3)', () => {
  let prisma: any;
  let approvals: any;
  let service: ManagedDefenseService;

  const activeProfile = {
    id: 'profile-1',
    tenant_id: 'tenant-1',
    environment_id: 'prod',
    contract_id: 'contract-1',
    requested_by: 'maker-1',
    approved_by: 'checker-1',
    status: 'ACTIVE',
    coverage_window: '24X7',
    service_tier: 'MDR_PREMIUM',
    review_cadence: 'QUARTERLY',
    response_authority: 'R1',
    customer_dependencies: '[]',
    exclusions: '[]',
    credit_eligible_capabilities: JSON.stringify(['EDR_MONITORING']),
    sla_definition_ids: JSON.stringify(['sla-1']),
    technology_scope: JSON.stringify({ connectors: ['supported-edr'] }),
    contract: { status: 'ACTIVE' },
    readiness: { status: 'VERIFIED' },
  };

  beforeEach(() => {
    prisma = {
      managedDefenseProfile: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      managedDefenseReadinessAssessment: { upsert: jest.fn() },
      managedDefenseDeliveryEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      managedDefenseCapacityException: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      managedDefenseCapabilityImpact: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      contract: { findUnique: jest.fn() },
      commercialAccountTenantBinding: { findFirst: jest.fn() },
      priceBook: { findUnique: jest.fn() },
      resourceCoveragePolicy: { findMany: jest.fn() },
      meterAuthorizationPolicy: { findMany: jest.fn() },
      entitlement: { findMany: jest.fn() },
      slaDefinition: { findMany: jest.fn(), findUnique: jest.fn() },
      serviceObligation: { findFirst: jest.fn(), findMany: jest.fn() },
      commercialApproval: { update: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    approvals = { requestApproval: jest.fn(), decideApproval: jest.fn() };
    service = new ManagedDefenseService(prisma, approvals);
  });

  const profileDto = {
    profileKey: 'mdr-primary',
    commercialAccountId: 'account-1',
    contractId: 'contract-1',
    serviceTier: 'MDR_PREMIUM',
    recurringPricingMetric: 'PROTECTED_RESOURCE_SERVICE_TIER' as const,
    priceBookId: 'price-1',
    protectedScopePolicyIds: ['coverage-1'],
    technologyScope: {
      offerTypes: ['MANAGED_DEFENSE'],
      capabilities: ['DETECTIONS', 'CASES', 'EVIDENCE'],
      connectors: ['supported-edr'],
      responseTools: ['isolation-proposal'],
      releaseScope: '2026.3',
    },
    meterPolicyIds: ['meter-policy-1'],
    coverageWindow: '24X7' as const,
    triageScope: { severities: ['HIGH', 'CRITICAL'] },
    investigationScope: { depth: 'STANDARD' },
    escalationPolicy: { path: ['SOC_L1', 'SOC_L2', 'CUSTOMER'] },
    responseSupport: { authority: 'R1' },
    reviewCadence: 'QUARTERLY',
    customerDependencies: ['Maintain EDR access'],
    exclusions: ['Unsupported connectors'],
    responseAuthority: 'R1' as const,
    creditEligibleCapabilities: ['EDR_MONITORING'],
    slaDefinitionIds: ['sla-1'],
    effectiveFrom: new Date('2026-09-01T00:00:00Z'),
    effectiveTo: new Date('2027-09-01T00:00:00Z'),
    reason: 'Contracted managed defense scope',
  };

  it('rejects R2-R4 authority without certification and named customer authorization', async () => {
    await expect(
      service.createProfile('tenant-1', 'prod', 'maker-1', {
        ...profileDto,
        responseAuthority: 'R3',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.managedDefenseProfile.create).not.toHaveBeenCalled();
  });

  it('creates a protected-scope/service-tier profile only from approved commercial dependencies', async () => {
    prisma.contract.findUnique.mockResolvedValue({
      id: 'contract-1',
      status: 'ACTIVE',
      commercial_account_id: 'account-1',
      catalog_version_id: 'catalog-1',
      term_start: new Date('2026-08-01T00:00:00Z'),
      term_end: new Date('2027-10-01T00:00:00Z'),
    });
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
    });
    prisma.priceBook.findUnique.mockResolvedValue({
      id: 'price-1',
      status: 'APPROVED',
      catalog_version_id: 'catalog-1',
      commercial_account_id: 'account-1',
      effective_from: new Date('2026-08-01T00:00:00Z'),
      effective_to: new Date('2027-10-01T00:00:00Z'),
    });
    prisma.resourceCoveragePolicy.findMany.mockResolvedValue([
      { id: 'coverage-1', status: 'APPROVED' },
    ]);
    prisma.meterAuthorizationPolicy.findMany.mockResolvedValue([
      {
        id: 'meter-policy-1',
        authorized_source_scope: '["edr.telemetry"]',
        retention_policy: '{"days":90}',
        visible_customer_policy: '{"overage":"NO_OVERAGE"}',
      },
    ]);
    prisma.entitlement.findMany.mockResolvedValue([
      { offer_type: 'MANAGED_DEFENSE' },
    ]);
    prisma.slaDefinition.findMany.mockResolvedValue([
      { id: 'sla-1', status: 'APPROVED', service_tier: 'MDR_PREMIUM' },
    ]);
    prisma.managedDefenseProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ version: 1 });
    prisma.managedDefenseProfile.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'profile-2', ...data }),
    );
    approvals.requestApproval.mockResolvedValue({ id: 'approval-1' });
    prisma.managedDefenseProfile.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'profile-2', ...data }),
    );

    const result = await service.createProfile(
      'tenant-1',
      'prod',
      'maker-1',
      profileDto,
    );

    expect(result.approval_id).toBe('approval-1');
    expect(prisma.managedDefenseProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 2,
        recurring_pricing_metric: 'PROTECTED_RESOURCE_SERVICE_TIER',
        coverage_window: '24X7',
      }),
    });
  });

  it('keeps commercial approval pending on independent operational readiness', async () => {
    prisma.managedDefenseProfile.findFirst.mockResolvedValue({
      ...activeProfile,
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
      readiness: null,
    });
    prisma.managedDefenseProfile.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'profile-1', ...data }),
    );

    const result = await service.decideProfile(
      'profile-1',
      'tenant-1',
      'prod',
      'checker-1',
      { decision: 'APPROVED', reason: 'Commercial scope approved' },
    );

    expect(result.status).toBe('PENDING_READINESS');
    expect(approvals.decideApproval).toHaveBeenCalled();
  });

  it('blocks 24X7 activation until every readiness dimension has evidence', async () => {
    prisma.managedDefenseProfile.findFirst.mockResolvedValue({
      ...activeProfile,
      status: 'PENDING_READINESS',
      readiness: null,
    });

    await expect(
      service.verifyReadiness('profile-1', 'tenant-1', 'prod', 'ops-1', {
        staffingReady: true,
        onCallReady: false,
        escalationReady: true,
        runbooksReady: true,
        measuredPerformanceReady: true,
        staffingEvidenceRefs: ['staffing-1'],
        onCallEvidenceRefs: ['on-call-1'],
        escalationEvidenceRefs: ['escalation-1'],
        runbookEvidenceRefs: ['runbook-1'],
        performanceEvidenceRefs: ['performance-1'],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('requires readiness verification to be independent', async () => {
    prisma.managedDefenseProfile.findFirst.mockResolvedValue({
      ...activeProfile,
      status: 'PENDING_READINESS',
      readiness: null,
    });

    await expect(
      service.verifyReadiness('profile-1', 'tenant-1', 'prod', 'maker-1', {
        staffingReady: true,
        onCallReady: true,
        escalationReady: true,
        runbooksReady: true,
        measuredPerformanceReady: true,
        staffingEvidenceRefs: ['staffing-1'],
        onCallEvidenceRefs: ['on-call-1'],
        escalationEvidenceRefs: ['escalation-1'],
        runbookEvidenceRefs: ['runbook-1'],
        performanceEvidenceRefs: ['performance-1'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('activates only after an independent verifier evidences every readiness dimension', async () => {
    prisma.managedDefenseProfile.findFirst.mockResolvedValue({
      ...activeProfile,
      status: 'PENDING_READINESS',
      readiness: null,
    });
    prisma.managedDefenseReadinessAssessment.upsert.mockResolvedValue({
      id: 'readiness-1',
      status: 'VERIFIED',
    });
    prisma.managedDefenseProfile.update.mockResolvedValue({
      ...activeProfile,
      status: 'ACTIVE',
    });

    const result = await service.verifyReadiness(
      'profile-1',
      'tenant-1',
      'prod',
      'ops-1',
      {
        staffingReady: true,
        onCallReady: true,
        escalationReady: true,
        runbooksReady: true,
        measuredPerformanceReady: true,
        staffingEvidenceRefs: ['staffing-1'],
        onCallEvidenceRefs: ['on-call-1'],
        escalationEvidenceRefs: ['escalation-1'],
        runbookEvidenceRefs: ['runbook-1'],
        performanceEvidenceRefs: ['performance-1'],
      },
    );

    expect(result.profile.status).toBe('ACTIVE');
    expect(result.readiness.status).toBe('VERIFIED');
  });

  it('opens paid overflow only with named authorization while preserving security handling', async () => {
    prisma.managedDefenseProfile.findFirst.mockResolvedValue(activeProfile);
    prisma.managedDefenseCapacityException.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'capacity-1', ...data }),
    );
    approvals.requestApproval.mockResolvedValue({ id: 'approval-1' });
    prisma.managedDefenseCapacityException.update.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'capacity-1', ...data }),
    );
    prisma.managedDefenseDeliveryEvent.create.mockResolvedValue({
      id: 'delivery-1',
    });

    const result = await service.openCapacityException(
      'tenant-1',
      'prod',
      'soc-worker',
      {
        managedDefenseProfileId: 'profile-1',
        currentVolume: 5000,
        forecastVolume: 8000,
        capacityBasis: 'cases-per-hour',
        reason: 'Coordinated attack volume spike',
        overflowPolicy: 'CUSTOMER_AUTHORIZED_PAID_WORK',
        namedCustomerAuthorizer: 'customer-ciso',
        customerAuthorizationRef: 'auth-incident-42',
        customerAuthorizedAt: new Date(),
        estimatedThirdPartyCost: 2500,
      },
    );

    expect(result.approval_id).toBe('approval-1');
    expect(prisma.managedDefenseCapacityException.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_processing_preserved: true,
        critical_response_preserved: true,
        paid_work_status: 'PENDING_APPROVAL',
      }),
    });
  });

  it('marks unsupported connector failure ineligible without touching invoices', async () => {
    prisma.managedDefenseProfile.findFirst.mockResolvedValue(activeProfile);
    prisma.managedDefenseCapabilityImpact.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'impact-1', ...data }),
    );

    const impact = await service.recordCapabilityImpact('tenant-1', 'prod', {
      managedDefenseProfileId: 'profile-1',
      capabilityKey: 'EDR_MONITORING',
      affectedScope: 'endpoint-group-a',
      connectorReference: 'unsupported-edr',
      failureType: 'UNSUPPORTED_CONNECTOR',
      slaDefinitionId: 'sla-1',
      evidenceRefs: ['evidence-1'],
      recordedBy: 'connector-worker',
      occurredAt: new Date(),
    });

    expect(impact.claim_eligibility).toBe(false);
    expect(impact.eligibility_reason).toBe(
      'EXCLUDED_FAILURE_TYPE_UNSUPPORTED_CONNECTOR',
    );
    expect(prisma.commercialInvoice).toBeUndefined();
  });

  it('marks only a contracted capability with an approved tier SLA eligible', async () => {
    prisma.managedDefenseProfile.findFirst.mockResolvedValue(activeProfile);
    prisma.slaDefinition.findUnique.mockResolvedValue({
      id: 'sla-1',
      status: 'APPROVED',
      service_tier: 'MDR_PREMIUM',
    });
    prisma.managedDefenseCapabilityImpact.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'impact-1', ...data }),
    );

    const impact = await service.recordCapabilityImpact('tenant-1', 'prod', {
      managedDefenseProfileId: 'profile-1',
      capabilityKey: 'EDR_MONITORING',
      affectedScope: 'endpoint-group-a',
      connectorReference: 'supported-edr',
      failureType: 'SUPPORTED_CONNECTOR_FAILURE',
      slaDefinitionId: 'sla-1',
      evidenceRefs: ['evidence-1'],
      recordedBy: 'connector-worker',
      occurredAt: new Date(),
    });

    expect(impact.claim_eligibility).toBe(true);
    expect(impact.sla_definition_id).toBe('sla-1');
  });

  it('rejects credit eligibility when the connector is outside approved contract scope', async () => {
    prisma.managedDefenseProfile.findFirst.mockResolvedValue(activeProfile);
    prisma.slaDefinition.findUnique.mockResolvedValue({
      id: 'sla-1',
      status: 'APPROVED',
      service_tier: 'MDR_PREMIUM',
    });
    prisma.managedDefenseCapabilityImpact.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'impact-1', ...data }),
    );

    const impact = await service.recordCapabilityImpact('tenant-1', 'prod', {
      managedDefenseProfileId: 'profile-1',
      capabilityKey: 'EDR_MONITORING',
      affectedScope: 'endpoint-group-a',
      connectorReference: 'unapproved-edr',
      failureType: 'SUPPORTED_CONNECTOR_FAILURE',
      slaDefinitionId: 'sla-1',
      evidenceRefs: ['evidence-1'],
      recordedBy: 'connector-worker',
      occurredAt: new Date(),
    });

    expect(impact.claim_eligibility).toBe(false);
    expect(impact.eligibility_reason).toBe(
      'CONNECTOR_NOT_APPROVED_IN_CONTRACT_SCOPE',
    );
  });
});
