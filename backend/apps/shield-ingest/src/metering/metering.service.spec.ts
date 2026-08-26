import { Test, TestingModule } from '@nestjs/testing';
import { MeteringService } from './metering.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MeteringService (ZS-COM-BILL-001)', () => {
  let service: MeteringService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      usageRecord: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      resourceObservation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      entitlement: {
        findFirst: jest.fn(),
      },
      commercialAccount: {
        findFirst: jest.fn(),
      },
      meterDefinition: {
        findFirst: jest.fn(),
      },
      meterAuthorizationPolicy: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeteringService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<MeteringService>(MeteringService);
  });

  it('should force billableQuantity to 0 and usageState to NON_BILLABLE for duplicate events', async () => {
    prismaMock.usageRecord.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'u-1', ...data }),
    );

    const record = await service.recordUsageObservation({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      sourceType: 'WEBHOOK',
      usageState: 'DUPLICATE',
      acceptedQuantity: 1,
      billableQuantity: 1, // Intentional attempt to bill duplicate
    });

    expect(record.usage_state).toBe('NON_BILLABLE');
    expect(record.billable_quantity).toBe(0);
    expect(record.accepted_quantity).toBe(0);
    expect(record.usage_classification).toBe(
      'INGESTION_DUPLICATE_NON_BILLABLE',
    );
  });

  it('should force NON_BILLABLE when no active contract or approved meter definition exists (Doctrine D1)', async () => {
    prismaMock.entitlement.findFirst.mockResolvedValue(null);
    prismaMock.commercialAccount.findFirst.mockResolvedValue(null);
    prismaMock.meterDefinition.findFirst.mockResolvedValue(null);
    prismaMock.usageRecord.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'u-2', ...data }),
    );

    const record = await service.recordUsageObservation({
      tenantId: 'unauthorized-tenant',
      environmentId: 'env-1',
      sourceType: 'WEBHOOK',
      usageState: 'ACCEPTED',
      acceptedQuantity: 1,
      billableQuantity: 1,
    });

    expect(record.usage_state).toBe('NON_BILLABLE');
    expect(record.billable_quantity).toBe(0);
  });

  it('never treats raw receipt as billable even when an entitlement and meter definition exist', async () => {
    prismaMock.entitlement.findFirst.mockResolvedValue({
      id: 'ent-1',
      status: 'ACTIVE',
    });
    prismaMock.meterDefinition.findFirst.mockResolvedValue({
      id: 'm-1',
      billable_policy: 'STANDARD',
    });
    prismaMock.usageRecord.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'u-3', ...data }),
    );

    const record = await service.recordUsageObservation({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      sourceType: 'WEBHOOK',
      usageState: 'ACCEPTED',
      acceptedQuantity: 1,
      billableQuantity: 1,
    });

    expect(record.usage_state).toBe('NON_BILLABLE');
    expect(record.billable_quantity).toBe(0);
    expect(record.accepted_quantity).toBe(1);
    expect(record.usage_classification).toBe(
      'INGESTION_PENDING_GOVERNED_VALIDATION',
    );
  });

  it('records provider processing loss with zero accepted and billable quantity', async () => {
    prismaMock.usageRecord.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'u-loss', ...data }),
    );

    const record = await service.recordUsageObservation({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      sourceType: 'WEBHOOK',
      usageState: 'PROCESSING_LOSS',
      acceptedQuantity: 50,
      billableQuantity: 50,
    });

    expect(record.accepted_quantity).toBe(0);
    expect(record.billable_quantity).toBe(0);
    expect(record.usage_classification).toBe(
      'INGESTION_PROCESSING_LOSS_NON_BILLABLE',
    );
  });

  it('should return committedQuantity, warningThresholds, projectedForecast, and overageRatePolicy in getUsageSummary (MET-03)', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 3600 * 1000);
    prismaMock.usageRecord.findMany.mockResolvedValue([
      {
        accepted_quantity: 50,
        billable_quantity: 50,
        usage_state: 'BILLABLE',
        recorded_at: now,
      },
      {
        accepted_quantity: 50,
        billable_quantity: 50,
        usage_state: 'BILLABLE',
        recorded_at: past,
      },
    ]);

    const summary = await service.getUsageSummary('tenant-1');

    expect(summary.tenantId).toBe('tenant-1');
    expect(summary.acceptedTotal).toBe(100);
    expect(summary.billableTotal).toBe(100);
    expect(summary.committedQuantity).toBeDefined();
    expect(summary.projectedForecast).toBeGreaterThanOrEqual(100);
    expect(summary.warningThresholds).toBeDefined();
    expect(summary.warningThresholds.status).toBe('NOT_CONFIGURED');
    expect(summary.overageRatePolicy).toBeDefined();
    expect(summary.overageRatePolicy.capEnforcement).toBe(
      'NO_INVENTED_OVERAGE_POLICY',
    );
  });

  it('should create new resource observation with DISCOVERED and NON_BILLABLE state', async () => {
    prismaMock.resourceObservation.findFirst.mockResolvedValue(null);
    prismaMock.resourceObservation.create.mockResolvedValue({
      id: 'res-1',
      tenant_id: 'tenant-1',
      canonical_resource_id: 'host-100',
      coverage_state: 'DISCOVERED',
      billable_state: 'NON_BILLABLE',
    });

    const resource = await service.observeProtectedResource({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      canonicalResourceId: 'host-100',
      resourceType: 'ENDPOINT',
      sourceConnectorId: 'conn-1',
    });

    expect(resource.coverage_state).toBe('DISCOVERED');
    expect(resource.billable_state).toBe('NON_BILLABLE');
    expect(prismaMock.resourceObservation.create).toHaveBeenCalled();
  });
});
