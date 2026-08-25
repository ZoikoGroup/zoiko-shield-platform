import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SectorPackService } from './sector-pack.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

describe('SectorPackService (ZS-COM-BILL-001 REG-01: unsupported combinations fail closed)', () => {
  let service: SectorPackService;
  let prismaMock: any;
  let approvalsMock: any;

  beforeEach(async () => {
    prismaMock = {
      sectorPack: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      marketAvailability: { upsert: jest.fn(), findUnique: jest.fn() },
      commercialApproval: { update: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prismaMock)),
    };
    approvalsMock = {
      requestApproval: jest.fn(),
      decideApproval: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectorPackService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommercialApprovalService, useValue: approvalsMock },
      ],
    }).compile();

    service = module.get<SectorPackService>(SectorPackService);
  });

  it('refuses to submit release before the complete rights/review/test evidence exists', async () => {
    prismaMock.sectorPack.findUnique.mockResolvedValue({
      id: 'pack-1',
      content_license_status: 'PENDING',
      release_status: 'DRAFT',
    });

    await expect(
      service.submitRelease('pack-1', 'maker-1', 'Release reviewed content'),
    ).rejects.toThrow(ConflictException);
  });

  it('submits a fully evidenced pack to maker-checker approval without releasing it', async () => {
    prismaMock.sectorPack.findUnique.mockResolvedValue({
      id: 'pack-1',
      pack_key: 'dora-eu',
      version: 2,
      jurisdiction: 'EU',
      source_reference: 'source-1',
      source_version: '2026',
      content_license_status: 'LICENSED',
      license_reference: 'license-1',
      display_rights: true,
      legal_interpretation_ref: 'legal-1',
      sme_review_ref: 'sme-1',
      mapping_test_status: 'PASSED',
      mapping_test_report_ref: 'mapping-1',
      approved_claim_wording: 'Supports DORA evidence mapping.',
      release_status: 'DRAFT',
      approval_id: null,
    });
    approvalsMock.requestApproval.mockResolvedValue({ id: 'approval-1' });
    prismaMock.sectorPack.update.mockResolvedValue({
      id: 'pack-1',
      release_status: 'PENDING_APPROVAL',
    });

    const result = await service.submitRelease(
      'pack-1',
      'maker-1',
      'Release reviewed content',
    );

    expect(result.release_status).toBe('PENDING_APPROVAL');
    expect(approvalsMock.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'ASSURANCE_CONTENT_RELEASE',
        objectType: 'SectorPack',
      }),
      prismaMock,
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
