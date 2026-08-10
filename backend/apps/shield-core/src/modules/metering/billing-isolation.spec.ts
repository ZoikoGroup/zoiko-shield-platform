import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { MeteringService } from './metering.service';
import { MeterDefinitionService } from './meter-definition.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * ZS-COM-BILL-001 MET-04 / Principle 10: "ZoikoShield must never
 * automatically earn more merely because the customer becomes less
 * secure." No default recurring per-alert/per-incident/per-failed-control
 * charge may exist.
 */
describe('MET-04: alert/incident/control-failure isolation from billing', () => {
  const securityPlaneRoots = [
    'apps/shield-core/src/modules/detection',
    'apps/shield-core/src/modules/case-management',
    'apps/shield-core/src/modules/controls',
    'apps/shield-core/src/modules/risk',
  ];

  function findSourceFiles(dir: string): string[] {
    const absolute = path.resolve(__dirname, '../../../../../../', dir);
    if (!fs.existsSync(absolute)) return [];
    const out: string[] = [];
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const full = path.join(absolute, entry.name);
      if (entry.isDirectory()) {
        out.push(...findSourceFiles(path.join(dir, entry.name)));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  it('no Alert/Case/Detection/Controls/Risk source file imports the billing/metering/usage domain', () => {
    const forbidden = /MeteringService|MeterDefinitionService|UsageRecord|MeterEvent|CommercialInvoice|InvoiceSkeletonService/;
    const offenders: string[] = [];

    for (const root of securityPlaneRoots) {
      for (const file of findSourceFiles(root)) {
        const content = fs.readFileSync(file, 'utf-8');
        if (forbidden.test(content)) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  describe('behavioral: an alert-storm-sized volume of events never becomes billable without an explicit, approved, STANDARD meter', () => {
    let service: MeteringService;
    let prismaMock: any;
    let definitionMock: any;

    beforeEach(async () => {
      prismaMock = {
        meterEvent: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
        usageRecord: { create: jest.fn() },
      };
      definitionMock = { getActiveDefinition: jest.fn() };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MeteringService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: MeterDefinitionService, useValue: definitionMock },
        ],
      }).compile();

      service = module.get<MeteringService>(MeteringService);
    });

    it('a storm of platform-generated (e.g. detection-engine-emitted) events stays NON_BILLABLE regardless of volume', async () => {
      definitionMock.getActiveDefinition.mockResolvedValue({ id: 'def-1', unit: 'EVENTS', billable_policy: 'STANDARD' });
      prismaMock.meterEvent.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `me-${data.source_event_id}`, ...data }),
      );

      const stormSize = 5000;
      let billableRecordCount = 0;
      prismaMock.usageRecord.create.mockImplementation(({ data }: any) => {
        if (data.billable_quantity > 0) billableRecordCount++;
        return Promise.resolve({ id: 'ur', ...data });
      });

      for (let i = 0; i < stormSize; i++) {
        await service.recordEvent({
          tenantId: 't1',
          meterKey: 'incident.alert_volume',
          source: 'detection-engine',
          sourceEventId: `alert-storm-${i}`,
          occurredAt: new Date(),
          quantity: 1,
          isPlatformGenerated: true,
        });
      }

      expect(billableRecordCount).toBe(0);
    });

    it('a NEVER_BILLABLE meter (e.g. one deliberately scoped to alert/incident counts) stays at zero billable quantity across a storm', async () => {
      definitionMock.getActiveDefinition.mockResolvedValue({ id: 'def-2', unit: 'EVENTS', billable_policy: 'NEVER_BILLABLE' });
      prismaMock.meterEvent.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'me', ...data }));

      let totalBillable = 0;
      prismaMock.usageRecord.create.mockImplementation(({ data }: any) => {
        totalBillable += data.billable_quantity;
        return Promise.resolve({ id: 'ur', ...data });
      });

      for (let i = 0; i < 1000; i++) {
        await service.recordEvent({
          tenantId: 't1',
          meterKey: 'alert.count',
          source: 'detection-engine',
          sourceEventId: `incident-${i}`,
          occurredAt: new Date(),
          quantity: 1,
        });
      }

      expect(totalBillable).toBe(0);
    });
  });
});
