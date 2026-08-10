import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService (Step 20)', () => {
  let service: DashboardService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      connectorInstance: {
        count: jest.fn().mockResolvedValue(5),
        findMany: jest.fn().mockResolvedValue([]),
      },
      rawEvent: {
        count: jest.fn().mockResolvedValue(100),
      },
      alert: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([]),
      },
      case: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should return overview metrics for tenant', async () => {
    const overview = await service.getOverview('tenant-1');

    expect(overview.connectors.total).toBe(5);
    expect(overview.events.received24h).toBe(100);
    expect(overview.alerts.open).toBe(3);
    expect(overview.cases.open).toBe(2);
  });
});
