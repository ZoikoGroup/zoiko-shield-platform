import { Test, TestingModule } from '@nestjs/testing';
import { PilotLifecycleService } from './pilot-lifecycle.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PilotLifecycleService (ZS-COM-BILL-001 COM-04 Pilot & Conversion Engine)', () => {
  let service: PilotLifecycleService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PilotLifecycleService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PilotLifecycleService>(PilotLifecycleService);
  });

  it('creates an active pilot program with explicit duration and data boundaries', async () => {
    const pilot = await service.createPilotProgram({
      tenantId: 'tenant-pilot-01',
      programName: 'Fintech Design Partner Pilot',
      durationDays: 30,
      allowedDataClasses: ['security_telemetry'],
      maxConnectors: 3,
      syntheticDataOnly: false,
      sponsorName: 'Jane Doe',
      sponsorEmail: 'jane@fintech.com',
    });

    expect(pilot.id).toBeDefined();
    expect(pilot.status).toBe('ACTIVE');
    expect(pilot.durationDays).toBe(30);
    expect(pilot.expiryDate.getTime()).toBeGreaterThan(
      pilot.startDate.getTime(),
    );
  });

  it('rejects invalid pilot duration (<1 or >90 days)', async () => {
    await expect(
      service.createPilotProgram({
        tenantId: 'tenant-pilot-01',
        programName: 'Invalid Pilot',
        durationDays: 120, // > 90 days limit
        allowedDataClasses: [],
        maxConnectors: 1,
        syntheticDataOnly: true,
        sponsorName: 'Jane',
        sponsorEmail: 'jane@fintech.com',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('fails closed and transitions to EXPIRED when evaluation occurs past expiry date (no auto-conversion)', async () => {
    const pilot = await service.createPilotProgram({
      tenantId: 'tenant-pilot-02',
      programName: 'Expiring Pilot',
      durationDays: 1,
      allowedDataClasses: ['telemetry'],
      maxConnectors: 2,
      syntheticDataOnly: true,
      sponsorName: 'John',
      sponsorEmail: 'john@acme.com',
    });

    // Manually force expiry date in the past
    pilot.expiryDate = new Date(Date.now() - 10000);

    const access = await service.evaluatePilotAccess(pilot.id);
    expect(access.isEligible).toBe(false);
    expect(access.reason).toBe('PILOT_EXPIRED_NO_AUTO_CONVERSION');
    expect(access.pilot.status).toBe('EXPIRED');
  });

  it('converts pilot to live commercial contract under explicit authorization', async () => {
    const pilot = await service.createPilotProgram({
      tenantId: 'tenant-pilot-03',
      programName: 'Conversion Pilot',
      durationDays: 30,
      allowedDataClasses: ['telemetry'],
      maxConnectors: 5,
      syntheticDataOnly: false,
      sponsorName: 'Alice',
      sponsorEmail: 'alice@bank.com',
    });

    const converted = await service.convertPilotToContract({
      pilotId: pilot.id,
      contractId: 'contract-ga-001',
      approvedBy: 'commercial-admin-1',
    });

    expect(converted.status).toBe('CONVERTED');
    expect(converted.convertedContractId).toBe('contract-ga-001');
  });
});
