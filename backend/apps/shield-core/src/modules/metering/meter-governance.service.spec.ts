import { ConflictException } from '@nestjs/common';
import { MeterGovernanceService } from './meter-governance.service';

describe('MeterGovernanceService (Category D1-D4)', () => {
  let prisma: any;
  let approvals: any;
  let service: MeterGovernanceService;

  const policy = {
    id: 'policy-1',
    tenant_id: 'tenant-1',
    environment_id: 'prod',
    contract_id: 'contract-1',
    meter_definition_id: 'meter-1',
    billing_period: 'MONTHLY',
    pricing_model: 'INCLUDED_WITH_OVERAGE',
    included_quantity: 100,
    committed_quantity: null,
    warning_thresholds: JSON.stringify([50, 80, 100]),
    overage_behavior: 'PROTECTED_OVERAGE',
    cap_quantity: null,
    criticality: 'CRITICAL_SECURITY',
    requires_usage_authorization: false,
    overage_rate: 0.25,
  } as any;

  beforeEach(() => {
    prisma = {
      usageRecord: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      meterUsageAuthorization: { findFirst: jest.fn() },
      meterThresholdEvent: { upsert: jest.fn(), findMany: jest.fn() },
      meterAuthorizationPolicy: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      meterBillingExport: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      meterCorrectionRequest: { findFirst: jest.fn(), update: jest.fn() },
      meterEvent: {
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      commercialApproval: { update: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    approvals = { decideApproval: jest.fn(), requestApproval: jest.fn() };
    service = new MeterGovernanceService(prisma, approvals);
  });

  it('bills only incremental overage from accepted evidence', async () => {
    prisma.usageRecord.aggregate.mockResolvedValue({
      _sum: { accepted_quantity: 98, billable_quantity: 0 },
    });

    const result = await service.evaluate(policy, 5, new Date('2026-08-20'));

    expect(result.billableQuantity).toBe(3);
    expect(result.overageQuantity).toBe(3);
    expect(result.classification).toBe('CONTRACT_AUTHORIZED_BILLABLE');
  });

  it('never invents usage charges for a committed minimum', async () => {
    prisma.usageRecord.aggregate.mockResolvedValue({
      _sum: { accepted_quantity: 80, billable_quantity: 0 },
    });

    const result = await service.evaluate(
      {
        ...policy,
        pricing_model: 'COMMITTED_CAPACITY',
        committed_quantity: 100,
      },
      5,
      new Date('2026-08-20'),
    );

    expect(result.billableQuantity).toBe(0);
    expect(result.classification).toBe('COMMITTED_CONTRACT_NO_SYNTHETIC_USAGE');
  });

  it('fails closed when a billing export finds billable usage backed by processing loss', async () => {
    const exportPolicy = {
      ...policy,
      status: 'APPROVED',
      tenant_id: 'tenant-1',
      environment_id: 'prod',
      commercial_account_id: 'account-1',
      meterDefinition: { version: 1, unit: 'EVENTS' },
      contract: { status: 'ACTIVE' },
    };
    prisma.meterAuthorizationPolicy.findFirst.mockResolvedValue(exportPolicy);
    prisma.meterBillingExport.findFirst.mockResolvedValue(null);
    prisma.usageRecord.findMany.mockResolvedValue([
      {
        id: 'usage-failed',
        tenant_id: 'tenant-1',
        environment_id: 'prod',
        meter_definition_id: 'meter-1',
        meter_authorization_id: 'policy-1',
        contract_id: 'contract-1',
        raw_event_id: 'event-failed',
        accepted_quantity: 5,
        billable_quantity: 5,
        overage_quantity: 0,
        usage_state: 'ACCEPTED',
        usage_classification: 'CONTRACT_AUTHORIZED_BILLABLE',
        immutable_hash: 'usage-hash',
      },
    ]);
    prisma.meterEvent.findMany.mockResolvedValue([
      {
        id: 'event-failed',
        tenant_id: 'tenant-1',
        environment_id: 'prod',
        meter_definition_id: 'meter-1',
        meter_authorization_id: 'policy-1',
        contract_id: 'contract-1',
        accepted_state: 'PROCESSING_LOSS',
        validation_state: 'VALID',
        dedupe_state: 'UNIQUE',
        billable_state: 'NON_BILLABLE',
        correction_type: 'ORIGINAL',
        source: 'crowdstrike',
        is_platform_generated: false,
        immutable_hash: 'event-hash',
      },
    ]);

    await expect(
      service.createBillingExport('tenant-1', 'prod', 'billing-maker', {
        meterAuthorizationId: 'policy-1',
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-01T00:00:00.000Z'),
        reason: 'monthly usage',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: 'FAILED_INGESTION_BILLING_ATTEMPT',
      }),
    });
    expect(prisma.meterBillingExport.create).not.toHaveBeenCalled();
  });

  it('exports only accepted validated deduplicated evidence and records exclusions without a commitment fee', async () => {
    const exportPolicy = {
      ...policy,
      status: 'APPROVED',
      tenant_id: 'tenant-1',
      environment_id: 'prod',
      commercial_account_id: 'account-1',
      meterDefinition: { version: 1, unit: 'EVENTS' },
      contract: { status: 'ACTIVE' },
    };
    prisma.meterAuthorizationPolicy.findFirst.mockResolvedValue(exportPolicy);
    prisma.meterBillingExport.findFirst.mockResolvedValue(null);
    prisma.usageRecord.findMany.mockResolvedValue([
      {
        id: 'usage-accepted',
        tenant_id: 'tenant-1',
        environment_id: 'prod',
        meter_definition_id: 'meter-1',
        meter_authorization_id: 'policy-1',
        contract_id: 'contract-1',
        raw_event_id: 'event-accepted',
        accepted_quantity: 5,
        billable_quantity: 3,
        overage_quantity: 3,
        usage_state: 'ACCEPTED',
        usage_classification: 'CONTRACT_AUTHORIZED_BILLABLE',
        immutable_hash: 'usage-hash',
      },
    ]);
    prisma.meterEvent.findMany.mockResolvedValue([
      {
        id: 'event-accepted',
        tenant_id: 'tenant-1',
        environment_id: 'prod',
        meter_definition_id: 'meter-1',
        meter_authorization_id: 'policy-1',
        contract_id: 'contract-1',
        accepted_state: 'ACCEPTED',
        validation_state: 'VALID',
        dedupe_state: 'UNIQUE',
        billable_state: 'BILLABLE',
        correction_type: 'ORIGINAL',
        source: 'crowdstrike',
        is_platform_generated: false,
        immutable_hash: 'event-hash',
      },
      {
        id: 'event-quarantined',
        accepted_state: 'QUARANTINED',
        validation_state: 'INVALID',
        dedupe_state: 'UNIQUE',
        billable_state: 'NON_BILLABLE',
        correction_type: 'ORIGINAL',
        source: 'crowdstrike',
        is_platform_generated: false,
        immutable_hash: 'failed-hash',
      },
    ]);
    prisma.meterBillingExport.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'export-accepted', ...data }),
    );
    prisma.meterBillingExport.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'export-accepted', ...data }),
    );
    approvals.requestApproval.mockResolvedValue({ id: 'approval-1' });

    await service.createBillingExport(
      'tenant-1',
      'prod',
      'billing-maker',
      {
        meterAuthorizationId: 'policy-1',
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-01T00:00:00.000Z'),
        reason: 'monthly usage',
      },
    );

    const created = prisma.meterBillingExport.create.mock.calls[0][0].data;
    const frozen = JSON.parse(created.immutable_snapshot);
    expect(JSON.parse(created.event_ids)).toEqual(['event-accepted']);
    expect(JSON.parse(created.excluded_event_ids)).toEqual([
      'event-quarantined',
    ]);
    expect(created.billing_basis).toBe('ACCEPTED_DATA_USAGE');
    expect(created.committed_capacity_included).toBe(false);
    expect(frozen.committedCapacityChargeIncluded).toBe(false);
    expect(frozen.totals).toEqual({ accepted: 5, billable: 3, overage: 3 });
  });

  it('fails closed when customer authorization is required but absent', async () => {
    prisma.usageRecord.aggregate.mockResolvedValue({
      _sum: { accepted_quantity: 100, billable_quantity: 0 },
    });

    const result = await service.evaluate(
      { ...policy, requires_usage_authorization: true },
      10,
      new Date('2026-08-20'),
    );

    expect(result.billableQuantity).toBe(0);
    expect(result.classification).toBe('CUSTOMER_AUTHORIZATION_REQUIRED');
  });

  it('persists every crossed warning with current and forecast usage', async () => {
    prisma.usageRecord.aggregate.mockResolvedValue({
      _sum: { accepted_quantity: 85 },
    });
    prisma.meterThresholdEvent.upsert.mockImplementation((args: any) =>
      Promise.resolve(args.create),
    );

    const warnings = await service.recordThresholds(
      policy,
      new Date('2026-08-20T12:00:00Z'),
    );

    expect(warnings).toHaveLength(2);
    expect(prisma.meterThresholdEvent.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.meterThresholdEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          threshold_percent: 80,
          current_quantity: 85,
          forecast_quantity: expect.any(Number),
        }),
      }),
    );
  });

  it('detects an immutable export checksum mismatch', async () => {
    prisma.meterBillingExport.findFirst.mockResolvedValue({
      id: 'export-1',
      immutable_snapshot: '{"original":true}',
      checksum: 'tampered-checksum',
      event_ids: '[]',
      usage_record_ids: '[]',
      accepted_quantity: 0,
      billable_quantity: 0,
      overage_quantity: 0,
    });
    prisma.usageRecord.findMany.mockResolvedValue([]);
    prisma.meterEvent.findMany.mockResolvedValue([]);

    const result = await service.reconcileBillingExport(
      'export-1',
      'tenant-1',
      'prod',
    );

    expect(result.status).toBe('MISMATCH');
    expect(result.checksumValid).toBe(false);
  });

  it('applies an approved replacement as reversal plus replacement without mutating the original', async () => {
    prisma.meterCorrectionRequest.findFirst.mockResolvedValue({
      id: 'correction-1',
      tenant_id: 'tenant-1',
      environment_id: 'prod',
      original_event_id: 'event-1',
      correction_type: 'REPLACEMENT',
      replacement_quantity: 6,
      adjustment_quantity: null,
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
    });
    prisma.meterEvent.findUniqueOrThrow.mockResolvedValue({
      id: 'event-1',
      tenant_id: 'tenant-1',
      environment_id: 'prod',
      meter_definition_id: 'meter-1',
      meter_authorization_id: 'policy-1',
      usage_authorization_id: null,
      contract_id: 'contract-1',
      quantity: 10,
      unit: 'EVENTS',
    });
    prisma.usageRecord.findFirst.mockResolvedValue({
      accepted_quantity: 10,
      billable_quantity: 4,
      overage_quantity: 4,
    });
    let eventNumber = 0;
    prisma.meterEvent.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: `generated-${++eventNumber}`,
        occurred_at: new Date(),
        ...data,
      }),
    );
    prisma.usageRecord.create.mockResolvedValue({});
    prisma.meterCorrectionRequest.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'correction-1', ...data }),
    );

    const result = await service.decideCorrection(
      'correction-1',
      'tenant-1',
      'prod',
      'checker-1',
      { decision: 'APPROVED', reason: 'Evidence verified' },
    );

    expect(result.status).toBe('APPLIED');
    expect(prisma.meterEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.meterEvent.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          correction_type: 'REVERSAL',
          quantity: -10,
          correction_of_event_id: 'event-1',
        }),
      }),
    );
    expect(prisma.meterEvent.update).toBeUndefined();
  });

  it('refuses approval of an export whose frozen snapshot was altered', async () => {
    prisma.meterBillingExport.findFirst.mockResolvedValue({
      id: 'export-1',
      status: 'PENDING_APPROVAL',
      approval_id: 'approval-1',
      immutable_snapshot: '{"original":true}',
      checksum: 'tampered-checksum',
    });

    await expect(
      service.decideBillingExport('export-1', 'tenant-1', 'prod', 'checker-1', {
        decision: 'APPROVED',
        reason: 'approve',
      }),
    ).rejects.toThrow(ConflictException);
    expect(approvals.decideApproval).not.toHaveBeenCalled();
  });
});
