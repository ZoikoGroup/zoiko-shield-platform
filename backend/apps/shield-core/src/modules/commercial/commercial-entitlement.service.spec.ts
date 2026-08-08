import { Test, TestingModule } from '@nestjs/testing';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('CommercialEntitlementService (ZS-COM-BILL-001)', () => {
  let service: CommercialEntitlementService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialAccount: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      entitlement: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      claimRegister: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommercialEntitlementService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CommercialEntitlementService>(CommercialEntitlementService);
  });

  it('should create commercial account with classification', async () => {
    prismaMock.commercialAccount.create.mockResolvedValue({
      id: 'comm-1',
      name: 'Acme Corp',
      billing_classification: 'COMMERCIAL_DIRECT',
      status: 'ACTIVE',
    });

    const account = await service.createCommercialAccount({
      name: 'Acme Corp',
      billingClassification: 'COMMERCIAL_DIRECT',
    });

    expect(account.id).toBe('comm-1');
    expect(prismaMock.commercialAccount.create).toHaveBeenCalled();
  });

  it('should fail closed (return false) for unapproved or expired entitlement', async () => {
    prismaMock.entitlement.findFirst.mockResolvedValue(null);

    const isEntitled = await service.checkEntitlement('tenant-1', 'MANAGED_DEFENSE');

    expect(isEntitled).toBe(false);
  });

  it('should return true when tenant has active non-expired entitlement', async () => {
    prismaMock.entitlement.findFirst.mockResolvedValue({
      id: 'ent-1',
      tenant_id: 'tenant-1',
      offer_type: 'MANAGED_DEFENSE',
      status: 'ACTIVE',
      commercialAccount: { status: 'ACTIVE' },
    });

    const isEntitled = await service.checkEntitlement('tenant-1', 'MANAGED_DEFENSE');

    expect(isEntitled).toBe(true);
  });

  it('should verify claim eligibility against ClaimRegister and entitlements', async () => {
    prismaMock.claimRegister.findUnique.mockResolvedValue({
      claim_key: 'CLAIM_24_7_SOC',
      approved_wording: '24/7 Managed SOC Response',
      status: 'APPROVED',
    });

    prismaMock.entitlement.findFirst.mockResolvedValue({
      id: 'ent-1',
      tenant_id: 'tenant-1',
      offer_type: 'MANAGED_DEFENSE',
      status: 'ACTIVE',
      commercialAccount: { status: 'ACTIVE' },
    });

    const result = await service.verifyClaimEligibility('tenant-1', 'CLAIM_24_7_SOC');

    expect(result.eligible).toBe(true);
    expect(result.approvedWording).toBe('24/7 Managed SOC Response');
  });
});
