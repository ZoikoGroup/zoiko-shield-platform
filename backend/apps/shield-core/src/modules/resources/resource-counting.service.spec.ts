import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ResourceCountingService } from './resource-counting.service';

describe('ResourceCountingService (Category C count previews)', () => {
  let service: ResourceCountingService;
  let prismaMock: any;

  const policy = {
    id: 'policy-1',
    tenant_id: 'tenant-1',
    environment_id: 'env-1',
    policy_key: 'endpoint-scope',
    version: 2,
    resource_definition_id: 'def-1',
    resource_family: 'ENDPOINT',
    metric_family: 'MDR_ENDPOINT',
    meter_definition_id: 'meter-1',
    coverage_outcome: 'BILLABLE',
    aggregation_method: 'HIGH_WATER',
    observation_window: 'MONTHLY',
    minimum_duration_seconds: 0,
    committed_quantity: null,
    status: 'APPROVED',
    effective_from: new Date('2026-01-01T00:00:00Z'),
    effective_to: null,
    resourceDefinition: { id: 'def-1', version: 3, status: 'APPROVED' },
    meterDefinition: {
      id: 'meter-1',
      meter_key: 'protected.endpoint',
      version: 4,
      unit: 'RESOURCES',
      status: 'APPROVED',
      effective_from: new Date('2026-01-01T00:00:00Z'),
      effective_to: null,
    },
  };
  const observation = {
    id: 'obs-1',
    tenant_id: 'tenant-1',
    environment_id: 'env-1',
    resource_definition_id: 'def-1',
    physical_resource_id: 'physical-1',
    canonical_resource_id: 'canonical-1',
    metric_family: 'MDR_ENDPOINT',
    coverage_state: 'BILLABLE',
    billable_state: 'BILLABLE',
    coverage_policy_id: 'policy-1',
    first_seen_at: new Date('2026-08-01T00:00:00Z'),
    last_seen_at: new Date('2026-08-02T00:00:00Z'),
    exclusion_reason: null,
    windows: [
      {
        id: 'window-1',
        source_connector_id: 'crowdstrike',
        observed_from: new Date('2026-08-01T00:00:00Z'),
        observed_to: new Date('2026-08-02T00:00:00Z'),
        raw_basis_hash: 'raw-hash-1',
      },
    ],
  };

  beforeEach(async () => {
    prismaMock = {
      resourceCoveragePolicy: { findMany: jest.fn() },
      resourceObservation: { findMany: jest.fn() },
      resourceCountPreview: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ResourceCountingService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(ResourceCountingService);
  });

  async function makePreview() {
    prismaMock.resourceCoveragePolicy.findMany.mockResolvedValue([policy]);
    prismaMock.resourceObservation.findMany
      .mockResolvedValueOnce([observation])
      .mockResolvedValueOnce([]);
    prismaMock.resourceCountPreview.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'preview-1', previewed_at: new Date(), ...data }),
    );
    return service.createPreview('tenant-1', 'env-1', 'billing-1', {
      policyIds: ['policy-1'],
      windowStart: new Date('2026-08-01T00:00:00Z'),
      windowEnd: new Date('2026-08-02T00:00:00Z'),
    });
  }

  it('stores meter/definition versions, observation windows and reconciled raw basis', async () => {
    const preview = await makePreview();
    const result = JSON.parse(preview.metric_results)[0];
    const rawBasis = JSON.parse(preview.raw_basis);

    expect(result.meterVersion).toBe(4);
    expect(result.resourceDefinitionVersion).toBe(3);
    expect(result.highWaterQuantity).toBe(1);
    expect(result.billingPreviewQuantity).toBe(1);
    expect(rawBasis.resources[0].windows[0]).toEqual(
      expect.objectContaining({
        id: 'window-1',
        rawBasisHash: 'raw-hash-1',
      }),
    );
    expect(preview.reconciliation_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('retains minimum-duration exclusions instead of manually guessing seasonal usage', async () => {
    prismaMock.resourceCoveragePolicy.findMany.mockResolvedValue([
      { ...policy, minimum_duration_seconds: 172800 },
    ]);
    prismaMock.resourceObservation.findMany
      .mockResolvedValueOnce([observation])
      .mockResolvedValueOnce([]);
    prismaMock.resourceCountPreview.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'preview-1', ...data }),
    );

    const preview = await service.createPreview(
      'tenant-1',
      'env-1',
      'billing-1',
      {
        policyIds: ['policy-1'],
        windowStart: new Date('2026-08-01T00:00:00Z'),
        windowEnd: new Date('2026-08-02T00:00:00Z'),
      },
    );

    expect(JSON.parse(preview.metric_results)[0].billingPreviewQuantity).toBe(0);
    expect(JSON.parse(preview.exclusions)[0].reason).toBe(
      'MINIMUM_DURATION_NOT_MET',
    );
  });

  it('shows and blocks undisclosed overlap with another commercial metric', async () => {
    prismaMock.resourceCoveragePolicy.findMany.mockResolvedValue([policy]);
    prismaMock.resourceObservation.findMany
      .mockResolvedValueOnce([observation])
      .mockResolvedValueOnce([
        {
          ...observation,
          windows: undefined,
          coveragePolicy: {
            disclosed_metric_families: '[]',
            disclosure_reference: null,
          },
        },
        {
          ...observation,
          id: 'obs-2',
          metric_family: 'EXPOSURE_ENDPOINT',
          coverage_policy_id: 'policy-2',
          windows: undefined,
          coveragePolicy: {
            disclosed_metric_families: '[]',
            disclosure_reference: null,
          },
        },
      ]);
    prismaMock.resourceCountPreview.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'preview-1', ...data }),
    );

    const preview = await service.createPreview(
      'tenant-1',
      'env-1',
      'billing-1',
      {
        policyIds: ['policy-1'],
        windowStart: new Date('2026-08-01T00:00:00Z'),
        windowEnd: new Date('2026-08-02T00:00:00Z'),
      },
    );

    expect(preview.validation_status).toBe('BLOCKED_UNDISCLOSED_OVERLAP');
    expect(JSON.parse(preview.overlaps)[0].disclosed).toBe(false);
  });

  it('finalizes a checksum-valid PASS preview as an immutable billing basis', async () => {
    const preview = await makePreview();
    prismaMock.resourceCountPreview.findFirst.mockResolvedValue(preview);
    prismaMock.resourceCountPreview.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...preview, ...data }),
    );

    const finalized = await service.finalizePreview(
      'preview-1',
      'tenant-1',
      'env-1',
      'approver-1',
    );

    expect(finalized.status).toBe('FINALIZED');
    expect(finalized.finalized_by).toBe('approver-1');
  });

  it('will not finalize a blocked preview', async () => {
    prismaMock.resourceCountPreview.findFirst.mockResolvedValue({
      id: 'preview-1',
      tenant_id: 'tenant-1',
      environment_id: 'env-1',
      status: 'PREVIEW',
      validation_status: 'BLOCKED_UNDISCLOSED_OVERLAP',
    });

    await expect(
      service.finalizePreview(
        'preview-1',
        'tenant-1',
        'env-1',
        'approver-1',
      ),
    ).rejects.toThrow(ConflictException);
  });
});
