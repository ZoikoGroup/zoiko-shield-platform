import { BadRequestException } from '@nestjs/common';
import { ContinuousAssuranceService } from './continuous-assurance.service';

describe('ContinuousAssuranceService commercial guardrails', () => {
  let prisma: any;
  let approvals: any;
  let service: ContinuousAssuranceService;

  beforeEach(() => {
    prisma = {
      continuousAssuranceProfile: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      contract: { findUnique: jest.fn() },
      commercialAccountTenantBinding: { findFirst: jest.fn() },
      priceBook: { findUnique: jest.fn() },
      entitlement: { findFirst: jest.fn() },
      frameworkVersion: { findMany: jest.fn() },
      sectorPack: { findMany: jest.fn() },
      connectorInstance: { findMany: jest.fn() },
      controlImplementation: { findMany: jest.fn() },
      commercialApproval: { update: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    approvals = { requestApproval: jest.fn(), decideApproval: jest.fn() };
    service = new ContinuousAssuranceService(prisma, approvals);
  });

  it('rejects pricing based on control failures or adverse outcomes', async () => {
    await expect(
      service.createProfile('tenant-1', 'prod', 'maker-1', {
        profileKey: 'assurance-primary',
        commercialAccountId: 'account-1',
        contractId: 'contract-1',
        serviceTier: 'ENTERPRISE',
        recurringPricingMetric: 'CONTROL_FAILURE_COUNT',
        priceBookId: 'price-1',
        legalEntityIds: ['entity-1'],
        businessUnitIds: [],
        frameworkVersionIds: ['framework-version-1'],
        sectorPackIds: [],
        connectorIds: [],
        controlScope: { allContractedControls: true },
        evidenceRetentionPolicy: {
          customerVisible: true,
          profileRef: 'legal-7y',
          historicalTreatment: 'PRESERVE_BY_ORIGINAL_POLICY',
        },
        auditorSeats: 2,
        workspaceCount: 1,
        region: 'EU',
        deploymentClass: 'SAAS',
        humanObligations: {
          onboarding: { purchased: true },
          mappingReview: { purchased: true },
          evidenceQualityReview: { purchased: true },
          assessmentCycles: { purchased: true },
          auditPackageProduction: { purchased: false },
          advisorySupport: { purchased: false },
        },
        effectiveFrom: new Date(),
        reason: 'Contracted assurance scope',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.continuousAssuranceProfile.create).not.toHaveBeenCalled();
  });

  it('rejects an opaque control scope that selects neither all contracted controls nor implementation IDs', async () => {
    await expect(
      service.createProfile('tenant-1', 'prod', 'maker-1', {
        profileKey: 'assurance-primary',
        commercialAccountId: '4b3ada2e-ee2e-45f7-b0ed-a5adb402cf5e',
        contractId: '4fd66a1d-d48e-44dc-85fa-8f594d4b65bd',
        serviceTier: 'ENTERPRISE',
        recurringPricingMetric: 'COMMITTED_ASSURANCE_SCOPE',
        priceBookId: '55cda2d6-374b-45cf-8894-ad61e939b56e',
        legalEntityIds: ['entity-1'],
        businessUnitIds: [],
        frameworkVersionIds: ['d34becdf-3122-4dd7-8758-89344c7051ce'],
        sectorPackIds: [],
        connectorIds: [],
        controlScope: { label: 'all the important controls' },
        evidenceRetentionPolicy: {
          customerVisible: true,
          profileRef: 'legal-7y',
          historicalTreatment: 'PRESERVE_BY_ORIGINAL_POLICY',
        },
        auditorSeats: 2,
        workspaceCount: 1,
        region: 'EU',
        deploymentClass: 'SAAS',
        humanObligations: {},
        effectiveFrom: new Date(),
        reason: 'Contracted assurance scope',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.controlImplementation.findMany).not.toHaveBeenCalled();
  });

  it('creates an approval-gated profile only after validating exact contracted content and control scope', async () => {
    const effectiveFrom = new Date('2026-09-01T00:00:00.000Z');
    const frameworkVersionId = 'd34becdf-3122-4dd7-8758-89344c7051ce';
    const controlImplementationId = '42f967fa-3117-4984-a9a6-81f21cbc1816';
    const dto = {
      profileKey: 'assurance-primary',
      commercialAccountId: '4b3ada2e-ee2e-45f7-b0ed-a5adb402cf5e',
      contractId: '4fd66a1d-d48e-44dc-85fa-8f594d4b65bd',
      serviceTier: 'ENTERPRISE',
      recurringPricingMetric: 'COMMITTED_ASSURANCE_SCOPE',
      priceBookId: '55cda2d6-374b-45cf-8894-ad61e939b56e',
      legalEntityIds: ['entity-1'],
      businessUnitIds: [],
      frameworkVersionIds: [frameworkVersionId],
      sectorPackIds: [],
      connectorIds: [],
      controlScope: { controlImplementationIds: [controlImplementationId] },
      evidenceRetentionPolicy: {
        customerVisible: true,
        profileRef: 'legal-7y',
        historicalTreatment: 'PRESERVE_BY_ORIGINAL_POLICY',
      },
      auditorSeats: 2,
      workspaceCount: 1,
      region: 'EU',
      deploymentClass: 'SAAS',
      humanObligations: {
        onboarding: { purchased: true },
        mappingReview: { purchased: true },
        evidenceQualityReview: { purchased: true },
        assessmentCycles: { purchased: true },
        auditPackageProduction: { purchased: false },
        advisorySupport: { purchased: false },
      },
      effectiveFrom,
      reason: 'Contracted assurance scope',
    };
    prisma.contract.findUnique.mockResolvedValue({
      id: dto.contractId,
      status: 'ACTIVE',
      commercial_account_id: dto.commercialAccountId,
      catalog_version_id: 'catalog-1',
      term_start: new Date('2026-01-01T00:00:00.000Z'),
      term_end: new Date('2027-01-01T00:00:00.000Z'),
    });
    prisma.commercialAccountTenantBinding.findFirst.mockResolvedValue({
      id: 'binding-1',
    });
    prisma.priceBook.findUnique.mockResolvedValue({
      id: dto.priceBookId,
      status: 'APPROVED',
      catalog_version_id: 'catalog-1',
      commercial_account_id: null,
      region: 'GLOBAL',
      effective_from: new Date('2026-01-01T00:00:00.000Z'),
      effective_to: null,
    });
    prisma.entitlement.findFirst.mockResolvedValue({ id: 'entitlement-1' });
    prisma.frameworkVersion.findMany.mockResolvedValue([
      {
        id: frameworkVersionId,
        source_reference: 'publisher://framework',
        source_version: '2026',
        license_reference: 'license://display',
        legal_interpretation_ref: 'review://legal',
        sme_review_ref: 'review://sme',
        mapping_test_report_ref: 'test://mapping',
        approved_claim_wording: 'Supports assessment against the stated scope.',
      },
    ]);
    prisma.sectorPack.findMany.mockResolvedValue([]);
    prisma.connectorInstance.findMany.mockResolvedValue([]);
    prisma.controlImplementation.findMany.mockResolvedValue([
      { id: controlImplementationId },
    ]);
    prisma.continuousAssuranceProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.continuousAssuranceProfile.create.mockResolvedValue({
      id: 'profile-1',
    });
    approvals.requestApproval.mockResolvedValue({ id: 'approval-1' });
    prisma.continuousAssuranceProfile.update.mockResolvedValue({
      id: 'profile-1',
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
    });

    const result = await service.createProfile(
      'tenant-1',
      'prod',
      'maker-1',
      dto,
    );

    expect(result.approval_id).toBe('approval-1');
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'CONTINUOUS_ASSURANCE_PROFILE',
        objectId: 'profile-1',
        requiredApprovalRole: 'COMMERCIAL_APPROVER',
      }),
      prisma,
    );
    expect(prisma.continuousAssuranceProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recurring_pricing_metric: 'COMMITTED_ASSURANCE_SCOPE',
        control_scope: JSON.stringify(dto.controlScope),
        no_guarantee_wording: expect.stringContaining(
          'does not constitute certification',
        ),
      }),
    });
  });
});
