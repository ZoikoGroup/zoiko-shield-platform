import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SectorPackService } from '../sector-packs/sector-pack.service';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import {
  ClaimRegisterService,
  RegisterClaimDto,
} from './claim-register.service';

describe('ClaimRegisterService (R17 claim governance)', () => {
  let service: ClaimRegisterService;
  let prismaMock: any;
  let entitlementMock: any;
  let sectorPackMock: any;

  const registration: RegisterClaimDto = {
    claimKey: 'CLAIM_24_7_SOC',
    approvedWording: '24/7 managed SOC coverage',
    channels: ['PRODUCT_UI', 'CONTRACT'],
    scope: { regions: ['ap-south-1'] },
    evidenceRefs: ['release-evidence:rel-42'],
    prohibitedVariants: ['certified secure'],
    limitations: ['Subject to the contracted service scope'],
    requiredOfferType: 'MANAGED_DEFENSE',
    evidenceMaxAgeHours: 24,
    monitoringReference: 'slo:soc-coverage-v2',
    expiresAt: '2099-01-01T00:00:00.000Z',
    changeReason: 'Initial controlled wording',
  };

  const approvedClaim = {
    id: 'claim-1',
    claim_key: 'CLAIM_24_7_SOC',
    version: 2,
    approved_wording: '24/7 managed SOC coverage',
    channels: JSON.stringify(['PRODUCT_UI', 'CONTRACT']),
    scope: JSON.stringify({ regions: ['ap-south-1'] }),
    evidence_refs: JSON.stringify(['release-evidence:rel-42']),
    prohibited_variants: JSON.stringify(['certified secure']),
    limitations: JSON.stringify(['Subject to contracted scope']),
    required_offer_type: 'MANAGED_DEFENSE',
    sector_pack_key: null,
    evidence_max_age_hours: 24,
    monitoring_reference: 'slo:soc-coverage-v2',
    status: 'APPROVED',
    requested_by: 'author-1',
    effective_from: new Date('2026-01-01T00:00:00.000Z'),
    expires_at: new Date('2099-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prismaMock = {
      claimRegister: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      claimApproval: { create: jest.fn() },
      claimEligibility: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      claimEvaluation: { findFirst: jest.fn() },
      evidenceRecord: { findMany: jest.fn() },
      commercialEvent: { create: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((callback) => callback(prismaMock)),
    };
    entitlementMock = { checkEntitlement: jest.fn() };
    sectorPackMock = { isAvailable: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimRegisterService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: CommercialEntitlementService,
          useValue: entitlementMock,
        },
        { provide: SectorPackService, useValue: sectorPackMock },
      ],
    }).compile();

    service = module.get(ClaimRegisterService);
  });

  it('creates an immutable pending version instead of auto-approving or overwriting', async () => {
    prismaMock.claimRegister.findFirst.mockResolvedValue({
      id: 'claim-v1',
      version: 1,
      status: 'SUPERSEDED',
    });
    prismaMock.claimRegister.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'claim-v2', ...data }),
    );

    const result = (await service.registerClaim(
      registration,
      'author-1',
    )) as any;

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.version).toBe(2);
    expect(prismaMock.claimRegister.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supersedes_id: 'claim-v1',
          requested_by: 'author-1',
          status: 'PENDING_APPROVAL',
        }),
      }),
    );
    expect(prismaMock.claimRegister.update).not.toHaveBeenCalled();
    expect(prismaMock.commercialEvent.create).toHaveBeenCalled();
  });

  it('enforces maker-checker separation', async () => {
    prismaMock.claimRegister.findUnique.mockResolvedValue({
      ...approvedClaim,
      status: 'PENDING_APPROVAL',
      approvals: [],
    });

    await expect(
      service.decideClaim('claim-1', 'LEGAL', 'author-1', {
        decision: 'APPROVED',
        reason: 'Legally accurate',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires Legal and Compliance approvals from different principals', async () => {
    prismaMock.claimRegister.findUnique.mockResolvedValue({
      ...approvedClaim,
      status: 'PENDING_APPROVAL',
      approvals: [
        {
          reviewer_role: 'LEGAL',
          reviewer_id: 'reviewer-1',
          decision: 'APPROVED',
        },
      ],
    });

    await expect(
      service.decideClaim('claim-1', 'COMPLIANCE', 'reviewer-1', {
        decision: 'APPROVED',
        reason: 'Compliance evidence is sufficient',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('approves only after the second independent approval and supersedes the old version', async () => {
    const pending = {
      ...approvedClaim,
      status: 'PENDING_APPROVAL',
      approvals: [
        {
          reviewer_role: 'LEGAL',
          reviewer_id: 'legal-1',
          decision: 'APPROVED',
        },
      ],
    };
    prismaMock.claimRegister.findUnique
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({
        ...pending,
        status: 'APPROVED',
        approvals: [
          ...pending.approvals,
          {
            reviewer_role: 'COMPLIANCE',
            reviewer_id: 'compliance-1',
            decision: 'APPROVED',
          },
        ],
      });

    const result = (await service.decideClaim(
      'claim-1',
      'COMPLIANCE',
      'compliance-1',
      { decision: 'APPROVED', reason: 'Evidence and scope are sufficient' },
    )) as any;

    expect(result.status).toBe('APPROVED');
    expect(prismaMock.claimRegister.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SUPERSEDED' } }),
    );
    expect(prismaMock.claimRegister.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
  });

  it('fails closed when no effective approved claim exists', async () => {
    prismaMock.claimRegister.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'claim-1',
        version: 2,
        status: 'PENDING_APPROVAL',
      });

    const result = await service.verifyClaimEligibility({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      region: 'ap-south-1',
      claimKey: 'CLAIM_24_7_SOC',
      channel: 'PRODUCT_UI',
    });

    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe('CLAIM_PENDING_APPROVAL');
    expect(prismaMock.claimEligibility.upsert).toHaveBeenCalled();
  });

  it('returns eligible only with entitlement and fresh integrity-verified runtime evidence', async () => {
    prismaMock.claimRegister.findFirst.mockResolvedValue(approvedClaim);
    entitlementMock.checkEntitlement.mockResolvedValue(true);
    prismaMock.claimEvaluation.findFirst.mockResolvedValue({
      id: 'evaluation-1',
      evidence_ids: JSON.stringify(['evidence-1']),
      evaluated_at: new Date(),
    });
    prismaMock.evidenceRecord.findMany.mockResolvedValue([
      { id: 'evidence-1' },
    ]);

    const result = await service.verifyClaimEligibility({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      region: 'ap-south-1',
      claimKey: 'CLAIM_24_7_SOC',
      channel: 'PRODUCT_UI',
    });

    expect(result.eligible).toBe(true);
    expect(result.approvedWording).toBe('24/7 managed SOC coverage');
    expect(result.runtimeEvaluationId).toBe('evaluation-1');
    expect(prismaMock.evidenceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: 'tenant-1',
          integrity_state: 'VERIFIED',
          freshness_state: 'CURRENT',
        }),
      }),
    );
  });

  it('fails closed when runtime evidence is not integrity verified', async () => {
    prismaMock.claimRegister.findFirst.mockResolvedValue(approvedClaim);
    entitlementMock.checkEntitlement.mockResolvedValue(true);
    prismaMock.claimEvaluation.findFirst.mockResolvedValue({
      id: 'evaluation-1',
      evidence_ids: JSON.stringify(['evidence-1']),
      evaluated_at: new Date(),
    });
    prismaMock.evidenceRecord.findMany.mockResolvedValue([]);

    const result = await service.verifyClaimEligibility({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      region: 'ap-south-1',
      claimKey: 'CLAIM_24_7_SOC',
      channel: 'PRODUCT_UI',
    });

    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe('RUNTIME_EVIDENCE_UNVERIFIED');
  });

  it('rejects a second pending version for the same claim key', async () => {
    prismaMock.claimRegister.findFirst.mockResolvedValue({
      id: 'pending-1',
      version: 3,
      status: 'PENDING_APPROVAL',
    });

    await expect(
      service.registerClaim(registration, 'author-2'),
    ).rejects.toThrow(ConflictException);
  });
});
