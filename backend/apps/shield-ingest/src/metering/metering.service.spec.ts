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
    prismaMock.usageRecord.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'u-1', ...data }));

    const record = await service.recordUsageObservation({
      tenantId: 'tenant-1',
      sourceType: 'WEBHOOK',
      usageState: 'DUPLICATE',
      acceptedQuantity: 1,
      billableQuantity: 1, // Intentional attempt to bill duplicate
    });

    expect(record.usage_state).toBe('NON_BILLABLE');
    expect(record.billable_quantity).toBe(0);
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
      canonicalResourceId: 'host-100',
      resourceType: 'ENDPOINT',
      sourceConnectorId: 'conn-1',
    });

    expect(resource.coverage_state).toBe('DISCOVERED');
    expect(resource.billable_state).toBe('NON_BILLABLE');
    expect(prismaMock.resourceObservation.create).toHaveBeenCalled();
  });
});
