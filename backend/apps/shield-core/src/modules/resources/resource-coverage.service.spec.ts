import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { ResourceCoverageService } from './resource-coverage.service';

describe('ResourceCoverageService (Category C governed acceptance)', () => {
  let service: ResourceCoverageService;
  let prismaMock: any;
  let approvalsMock: any;

  const observation = {
    id: 'obs-1',
    tenant_id: 'tenant-1',
    environment_id: 'env-1',
    resource_definition_id: 'def-1',
    resource_family: 'ENDPOINT',
    metric_family: 'MDR_ENDPOINT',
    physical_resource_id: 'physical-1',
    coverage_state: 'REVIEW_REQUIRED',
  };
  const policy = {
    id: 'policy-1',
    tenant_id: 'tenant-1',
    environment_id: 'env-1',
    resource_definition_id: 'def-1',
    resource_family: 'ENDPOINT',
    metric_family: 'MDR_ENDPOINT',
    meter_definition_id: 'meter-1',
    coverage_outcome: 'BILLABLE',
    disclosed_metric_families: '[]',
    disclosure_reference: null,
    cap_quantity: 100,
    status: 'APPROVED',
    effective_from: new Date('2026-01-01T00:00:00Z'),
    effective_to: null,
    resourceDefinition: { status: 'APPROVED' },
    meterDefinition: {
      status: 'APPROVED',
      effective_from: new Date('2026-01-01T00:00:00Z'),
      effective_to: null,
    },
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(prismaMock),
      ),
      resourceObservation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      resourceCoveragePolicy: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      resourceCoverageDecision: { create: jest.fn() },
      resourceEnrollmentNotice: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      protectedResourceDefinition: { findUnique: jest.fn() },
      meterDefinition: { findUnique: jest.fn() },
      commercialApproval: { update: jest.fn() },
    };
    approvalsMock = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ResourceCoverageService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommercialApprovalService, useValue: approvalsMock },
      ],
    }).compile();
    service = module.get(ResourceCoverageService);
  });

  it('routes discovery to REVIEW_REQUIRED/NON_BILLABLE when no auto policy exists', async () => {
    let persisted = {
      ...observation,
      coverage_state: 'DISCOVERED',
      billable_state: 'NON_BILLABLE',
    };
    prismaMock.resourceObservation.update.mockImplementation(({ data }: any) => {
      persisted = { ...persisted, ...data };
      return Promise.resolve(persisted);
    });
    prismaMock.resourceCoveragePolicy.findMany.mockResolvedValue([]);

    const result = await service.routeDiscoveredObservation({
      ...observation,
      coverage_state: 'DISCOVERED',
    });

    expect(result.observation.coverage_state).toBe('REVIEW_REQUIRED');
    expect((result.observation as any).billable_state).toBe('NON_BILLABLE');
    expect(prismaMock.resourceCoverageDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          from_state: 'DISCOVERED',
          to_state: 'REVIEW_REQUIRED',
        }),
      }),
    );
  });

  it('schedules notice but does not bill when explicit auto policy is under threshold/cap', async () => {
    prismaMock.resourceObservation.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...observation, ...data }),
    );
    prismaMock.resourceCoveragePolicy.findMany.mockResolvedValue([
      {
        ...policy,
        auto_enroll: true,
        threshold_quantity: 10,
        cap_quantity: 20,
      },
    ]);
    prismaMock.resourceObservation.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prismaMock.resourceEnrollmentNotice.create.mockResolvedValue({
      id: 'notice-1',
      status: 'PENDING_DELIVERY',
    });

    const result = await service.routeDiscoveredObservation({
      ...observation,
      coverage_state: 'DISCOVERED',
    });

    expect(result.notice!.status).toBe('PENDING_DELIVERY');
    expect((result.observation as any).auto_enrollment_status).toBe('NOTICE_PENDING');
    expect(
      prismaMock.resourceObservation.update.mock.calls.some(
        ([input]: any[]) => input.data.billable_state === 'BILLABLE',
      ),
    ).toBe(false);
  });

  it('requires all threshold, cap and notice controls for auto-enrollment', async () => {
    await expect(
      service.createPolicy('tenant-1', 'env-1', 'maker-1', {
        policyKey: 'endpoint-auto',
        resourceDefinitionId: 'def-1',
        meterDefinitionId: 'meter-1',
        coverageOutcome: 'BILLABLE',
        autoEnroll: true,
        effectiveFrom: new Date('2026-09-01T00:00:00Z'),
        reason: 'contracted scope',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('sets BILLABLE only through an effective matching approved policy', async () => {
    prismaMock.resourceObservation.findFirst.mockResolvedValue(observation);
    prismaMock.resourceCoveragePolicy.findFirst.mockResolvedValue(policy);
    prismaMock.resourceObservation.count.mockResolvedValue(1);
    prismaMock.resourceObservation.findMany.mockResolvedValue([]);
    prismaMock.resourceEnrollmentNotice.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.resourceObservation.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...observation, ...data }),
    );

    const result = await service.acceptResource(
      'tenant-1',
      'env-1',
      'obs-1',
      'commercial-owner-1',
      { policyId: 'policy-1', reason: 'Accepted contracted endpoint scope' },
    );

    expect(result.coverage_state).toBe('BILLABLE');
    expect((result as any).billable_state).toBe('BILLABLE');
    expect(result.coverage_policy_id).toBe('policy-1');
  });

  it('blocks accidental double counting when another metric lacks reciprocal disclosure', async () => {
    prismaMock.resourceObservation.findFirst.mockResolvedValue(observation);
    prismaMock.resourceCoveragePolicy.findFirst.mockResolvedValue(policy);
    prismaMock.resourceObservation.count.mockResolvedValue(1);
    prismaMock.resourceObservation.findMany.mockResolvedValue([
      {
        id: 'obs-identity',
        metric_family: 'PRIVILEGED_IDENTITY',
        coveragePolicy: {
          disclosed_metric_families: '[]',
          disclosure_reference: null,
        },
      },
    ]);

    await expect(
      service.acceptResource(
        'tenant-1',
        'env-1',
        'obs-1',
        'commercial-owner-1',
        { policyId: 'policy-1', reason: 'accept' },
      ),
    ).rejects.toThrow(ConflictException);
    expect(prismaMock.resourceObservation.update).not.toHaveBeenCalled();
  });

  it('computes the auto-enrollment effective time only after confirmed delivery', async () => {
    prismaMock.resourceEnrollmentNotice.findFirst.mockResolvedValue({
      id: 'notice-1',
      tenant_id: 'tenant-1',
      observation_id: 'obs-1',
      status: 'PENDING_DELIVERY',
      coveragePolicy: { notice_period_days: 3 },
      observation,
    });
    prismaMock.resourceEnrollmentNotice.update.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: 'notice-1', ...data }),
    );

    const result = await service.markNoticeDelivered('tenant-1', 'notice-1', {
      noticeReference: 'email-provider/message-123',
      deliveredAt: new Date('2026-08-01T00:00:00Z'),
    });

    expect(result.status).toBe('DELIVERED');
    expect(result.effective_at).toEqual(new Date('2026-08-04T00:00:00Z'));
  });

  it('exposes only pending notice work to the internal delivery outbox', async () => {
    prismaMock.resourceEnrollmentNotice.findMany.mockResolvedValue([
      { id: 'notice-1', status: 'PENDING_DELIVERY' },
    ]);

    const notices = await service.listPendingNoticeDeliveries('tenant-1');

    expect(notices).toHaveLength(1);
    expect(prismaMock.resourceEnrollmentNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: 'tenant-1', status: 'PENDING_DELIVERY' },
      }),
    );
  });
});
