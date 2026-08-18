import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SectorPackService } from './sector-pack.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SectorPackService (ZS-COM-BILL-001 REG-01: unsupported combinations fail closed)', () => {
  let service: SectorPackService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      sectorPack: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      marketAvailability: { upsert: jest.fn(), findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectorPackService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<SectorPackService>(SectorPackService);
  });

  it('refuses to approve release before content is licensed', async () => {
    prismaMock.sectorPack.findUnique.mockResolvedValue({
      id: 'pack-1',
      content_license_status: 'PENDING',
      release_status: 'DRAFT',
    });

    await expect(service.approveRelease('pack-1', 'legal')).rejects.toThrow(
      ConflictException,
    );
  });

  it('is unavailable (fails closed) for a pack that has never been approved/licensed', async () => {
    prismaMock.sectorPack.findFirst.mockResolvedValue(null);

    const available = await service.isAvailable('dora-eu', 'EU');

    expect(available).toBe(false);
  });

  it('is unavailable (fails closed) for an approved/licensed pack with no explicit region availability row', async () => {
    prismaMock.sectorPack.findFirst.mockResolvedValue({
      id: 'pack-1',
      release_status: 'APPROVED',
      content_license_status: 'LICENSED',
    });
    prismaMock.marketAvailability.findUnique.mockResolvedValue(null);

    const available = await service.isAvailable('dora-eu', 'US');

    expect(available).toBe(false);
  });

  it('is available only when approved, licensed, AND explicitly marked available for that region', async () => {
    prismaMock.sectorPack.findFirst.mockResolvedValue({
      id: 'pack-1',
      release_status: 'APPROVED',
      content_license_status: 'LICENSED',
    });
    prismaMock.marketAvailability.findUnique.mockResolvedValue({
      available: true,
    });

    const available = await service.isAvailable('dora-eu', 'EU');

    expect(available).toBe(true);
  });

  it('never invents claim wording for an unavailable pack/region combination', async () => {
    prismaMock.sectorPack.findFirst.mockResolvedValue(null);

    const wording = await service.getApprovedClaimWording('dora-eu', 'US');

    expect(wording).toBeNull();
  });
});
