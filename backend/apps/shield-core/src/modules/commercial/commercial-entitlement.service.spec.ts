import { Test, TestingModule } from '@nestjs/testing';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

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
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      claimRegister: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      commercialApproval: {
        findFirst: jest.fn(),
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

  it('allows ACTIVE -> SUSPENDED (Part 20 state-machine hardening)', async () => {
    prismaMock.entitlement.findUnique.mockResolvedValue({ id: 'ent-1', status: 'ACTIVE' });
    prismaMock.entitlement.update.mockResolvedValue({ id: 'ent-1', status: 'SUSPENDED' });

    const updated = await service.updateEntitlementStatus('ent-1', 'SUSPENDED');

    expect(updated.status).toBe('SUSPENDED');
  });

  it('rejects an illegal entitlement transition EXPIRED -> ACTIVE', async () => {
    prismaMock.entitlement.findUnique.mockResolvedValue({ id: 'ent-1', status: 'EXPIRED' });

    await expect(service.updateEntitlementStatus('ent-1', 'ACTIVE')).rejects.toThrow(
      ConflictException,
    );
  });

  describe('ONE-01: Zoiko One vs direct charging collision prevention', () => {
    it('blocks activating a direct entitlement over an existing Zoiko-One-bundled entitlement for the same tenant/capability', async () => {
      prismaMock.commercialAccount.findUnique.mockResolvedValue({ id: 'acct-direct', billing_source: 'DIRECT' });
      prismaMock.entitlement.findMany.mockResolvedValue([
        { commercial_account_id: 'acct-bundle', commercialAccount: { billing_source: 'ZOIKO_ONE_BUNDLE' } },
      ]);
      prismaMock.commercialApproval.findFirst.mockResolvedValue(null);

      await expect(
        service.grantEntitlement({
          commercialAccountId: 'acct-direct',
          tenantId: 't-1',
          offerType: 'MANAGED_DEFENSE',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.entitlement.create).not.toHaveBeenCalled();
    });

    it('allows the activation when an approved split-billing exception exists for that tenant/capability', async () => {
      prismaMock.commercialAccount.findUnique.mockResolvedValue({ id: 'acct-direct', billing_source: 'DIRECT' });
      prismaMock.entitlement.findMany.mockResolvedValue([
        { commercial_account_id: 'acct-bundle', commercialAccount: { billing_source: 'ZOIKO_ONE_BUNDLE' } },
      ]);
      prismaMock.commercialApproval.findFirst.mockResolvedValue({ id: 'appr-1', status: 'APPROVED' });
      prismaMock.entitlement.create.mockResolvedValue({ id: 'ent-new' });

      await service.grantEntitlement({
        commercialAccountId: 'acct-direct',
        tenantId: 't-1',
        offerType: 'MANAGED_DEFENSE',
      });

      expect(prismaMock.entitlement.create).toHaveBeenCalled();
    });

    it('does not block a second entitlement from the same billing_source (no collision when sources match)', async () => {
      prismaMock.commercialAccount.findUnique.mockResolvedValue({ id: 'acct-direct-2', billing_source: 'DIRECT' });
      prismaMock.entitlement.findMany.mockResolvedValue([
        { commercial_account_id: 'acct-direct-1', commercialAccount: { billing_source: 'DIRECT' } },
      ]);
      prismaMock.entitlement.create.mockResolvedValue({ id: 'ent-new' });

      await service.grantEntitlement({
        commercialAccountId: 'acct-direct-2',
        tenantId: 't-1',
        offerType: 'MANAGED_DEFENSE',
      });

      expect(prismaMock.entitlement.create).toHaveBeenCalled();
      expect(prismaMock.commercialApproval.findFirst).not.toHaveBeenCalled();
    });
  });
});
