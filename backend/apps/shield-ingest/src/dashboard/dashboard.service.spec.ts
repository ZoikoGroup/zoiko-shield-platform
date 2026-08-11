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
      controlImplementation: {
        count: jest.fn().mockResolvedValue(8),
        findMany: jest.fn().mockResolvedValue([
          { effectiveness: 'EFFECTIVE', status: 'ACTIVE' },
          { effectiveness: 'PARTIAL', status: 'ACTIVE' },
          { effectiveness: 'UNKNOWN', status: 'DRAFT' },
        ]),
      },
      controlDeficiency: {
        count: jest.fn().mockResolvedValue(2),
      },
      controlTest: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'test-1', result: 'PASS', created_at: new Date() },
        ]),
      },
      evidenceRecord: {
        count: jest.fn().mockResolvedValue(20),
        findMany: jest.fn().mockResolvedValue([
          { id: 'ev-1', source_type: 'AUTOMATED', integrity_state: 'VERIFIED', collected_at: new Date() },
        ]),
      },
      evidenceGap: {
        count: jest.fn().mockResolvedValue(3),
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

  it('should return overview metrics including controls and evidence for tenant', async () => {
    const overview = await service.getOverview('tenant-1');

    expect(overview.connectors.total).toBe(5);
    expect(overview.events.received24h).toBe(100);
    expect(overview.alerts.open).toBe(3);
    expect(overview.cases.open).toBe(2);
    expect(overview.controls).toBeDefined();
    expect(overview.controls.effective).toBe(8);
    expect(overview.evidence).toBeDefined();
    expect(overview.evidence.current).toBe(20);
    expect(overview.evidence.missing).toBe(3);
  });

  it('should return control health breakdown', async () => {
    const health = await service.getControlHealth('tenant-1');

    expect(health.total).toBe(3);
    expect(health.openDeficiencies).toBe(2);
    expect(health.byEffectiveness).toBeDefined();
    expect(health.byEffectiveness['EFFECTIVE']).toBe(1);
    expect(health.byEffectiveness['PARTIAL']).toBe(1);
    expect(health.byEffectiveness['UNKNOWN']).toBe(1);
    expect(health.recentTests).toHaveLength(1);
  });

  it('should return evidence health status', async () => {
    const health = await service.getEvidenceHealth('tenant-1');

    expect(health.current).toBe(20);
    expect(health.stale).toBe(20);
    expect(health.missing).toBe(3);
    expect(health.total).toBe(40);
    expect(health.recentRecords).toHaveLength(1);
    expect(health.recentRecords[0].source_type).toBe('AUTOMATED');
  });
});
