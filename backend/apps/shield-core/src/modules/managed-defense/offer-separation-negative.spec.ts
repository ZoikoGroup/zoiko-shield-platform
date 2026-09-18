import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import {
  OfferEntitlementService,
  CommercialOfferType,
} from '../commercial/offer-entitlement.service';
import { CommercialEntitlementService } from '../commercial/commercial-entitlement.service';
import { ManagedDefenseService } from './managed-defense.service';
import { ContinuousAssuranceService } from '../continuous-assurance/continuous-assurance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';

describe('Commercial Offer Separation & Entitlement Gating (ERB-01 & Spec §2)', () => {
  let offerEntitlementService: OfferEntitlementService;
  let commercialEntitlementService: CommercialEntitlementService;
  let managedDefenseService: ManagedDefenseService;
  let continuousAssuranceService: ContinuousAssuranceService;

  let prismaMock: any;
  let approvalsMock: any;
  let killSwitchMock: any;

  const CA_ONLY_TENANT = 'tenant-continuous-assurance-only';
  const MD_ONLY_TENANT = 'tenant-managed-defense-only';
  const DUAL_TENANT = 'tenant-dual-subscribed';
  const UNENTITLED_TENANT = 'tenant-unentitled';
  const SUSPENDED_TENANT = 'tenant-commercial-suspended';

  beforeEach(async () => {
    prismaMock = {
      commercialAccount: {
        findUnique: jest.fn(),
      },
      commercialAccountTenantBinding: {
        findFirst: jest.fn(),
      },
      entitlement: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      contract: {
        findUnique: jest.fn(),
      },
      priceBook: {
        findUnique: jest.fn(),
      },
      resourceCoveragePolicy: {
        findMany: jest.fn(),
      },
      meterAuthorizationPolicy: {
        findMany: jest.fn(),
      },
      slaDefinition: {
        findMany: jest.fn(),
      },
      managedDefenseProfile: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      continuousAssuranceProfile: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      frameworkVersion: {
        findMany: jest.fn(),
      },
      sectorPack: {
        findMany: jest.fn(),
      },
      connectorInstance: {
        findMany: jest.fn(),
      },
      controlImplementation: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
    };

    approvalsMock = {
      requestApproval: jest.fn().mockResolvedValue({ id: 'approval-123' }),
      decideApproval: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
    };

    killSwitchMock = {
      assertNotBlocked: jest.fn().mockResolvedValue(undefined),
    };

    // Entitlement mock router based on tenantId and offerType
    prismaMock.entitlement.findFirst.mockImplementation(
      async ({ where }: { where: { tenant_id: string; offer_type: string; status: string } }) => {
        const { tenant_id, offer_type } = where;

        if (tenant_id === CA_ONLY_TENANT && offer_type === 'CONTINUOUS_ASSURANCE') {
          return {
            id: 'ent-ca-1',
            tenant_id: CA_ONLY_TENANT,
            offer_type: 'CONTINUOUS_ASSURANCE',
            status: 'ACTIVE',
            commercial_account_id: 'comm-acct-ca',
            commercialAccount: { id: 'comm-acct-ca', status: 'ACTIVE', billing_source: 'DIRECT_INVOICE' },
          };
        }

        if (tenant_id === MD_ONLY_TENANT && offer_type === 'MANAGED_DEFENSE') {
          return {
            id: 'ent-md-1',
            tenant_id: MD_ONLY_TENANT,
            offer_type: 'MANAGED_DEFENSE',
            status: 'ACTIVE',
            commercial_account_id: 'comm-acct-md',
            commercialAccount: { id: 'comm-acct-md', status: 'ACTIVE', billing_source: 'DIRECT_INVOICE' },
          };
        }

        if (tenant_id === DUAL_TENANT && ['MANAGED_DEFENSE', 'CONTINUOUS_ASSURANCE'].includes(offer_type)) {
          return {
            id: `ent-dual-${offer_type}`,
            tenant_id: DUAL_TENANT,
            offer_type,
            status: 'ACTIVE',
            commercial_account_id: 'comm-acct-dual',
            commercialAccount: { id: 'comm-acct-dual', status: 'ACTIVE', billing_source: 'ZOIKO_ONE_BUNDLE' },
          };
        }

        if (tenant_id === SUSPENDED_TENANT) {
          return {
            id: 'ent-suspended-1',
            tenant_id: SUSPENDED_TENANT,
            offer_type,
            status: 'ACTIVE',
            commercial_account_id: 'comm-acct-suspended',
            commercialAccount: { id: 'comm-acct-suspended', status: 'SUSPENDED', billing_source: 'DIRECT_INVOICE' },
          };
        }

        return null; // Fail closed for any unentitled combination
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        CommercialEntitlementService,
        OfferEntitlementService,
        ManagedDefenseService,
        ContinuousAssuranceService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CommercialApprovalService, useValue: approvalsMock },
        { provide: CommercialKillSwitchService, useValue: killSwitchMock },
      ],
    }).compile();

    offerEntitlementService = module.get<OfferEntitlementService>(OfferEntitlementService);
    commercialEntitlementService = module.get<CommercialEntitlementService>(CommercialEntitlementService);
    managedDefenseService = module.get<ManagedDefenseService>(ManagedDefenseService);
    continuousAssuranceService = module.get<ContinuousAssuranceService>(ContinuousAssuranceService);
  });

  describe('1. Continuous-Assurance-Only Tenant Boundary Enforcement', () => {
    it('MUST permit Continuous Assurance operations for CA-only tenant', async () => {
      const isCAEntitled = await offerEntitlementService.checkEntitlement(
        CA_ONLY_TENANT,
        'CONTINUOUS_ASSURANCE',
      );
      expect(isCAEntitled).toBe(true);
      await expect(
        offerEntitlementService.assertContinuousAssuranceEntitled(CA_ONLY_TENANT),
      ).resolves.not.toThrow();
    });

    it('MUST block Managed Defense operations for CA-only tenant with 403 Forbidden', async () => {
      const isMDEntitled = await offerEntitlementService.checkEntitlement(
        CA_ONLY_TENANT,
        'MANAGED_DEFENSE',
      );
      expect(isMDEntitled).toBe(false);

      await expect(
        offerEntitlementService.assertManagedDefenseEntitled(CA_ONLY_TENANT, {
          action: 'DISPATCH_SOAR_PLAYBOOK',
        }),
      ).rejects.toThrow(ForbiddenException);

      try {
        await offerEntitlementService.assertManagedDefenseEntitled(CA_ONLY_TENANT);
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({
          statusCode: 403,
          error: 'OFFER_ENTITLEMENT_REQUIRED',
          offerType: 'MANAGED_DEFENSE',
          tenantId: CA_ONLY_TENANT,
        });
      }
    });

    it('MUST reject Managed Defense profile creation when tenant has no MANAGED_DEFENSE entitlement', async () => {
      const dummyDto: any = {
        profileKey: 'md-profile-1',
        commercialAccountId: 'comm-acct-ca',
        contractId: '00000000-0000-4000-8000-000000000001',
        serviceTier: 'TIER_1',
        recurringPricingMetric: 'PROTECTED_RESOURCE_SERVICE_TIER',
        priceBookId: '00000000-0000-4000-8000-000000000002',
        protectedScopePolicyIds: ['00000000-0000-4000-8000-000000000003'],
        technologyScope: {
          offerTypes: ['MANAGED_DEFENSE'],
          capabilities: ['DETECTIONS', 'CASES', 'EVIDENCE'],
          connectors: ['conn-1'],
          responseTools: ['tool-1'],
          releaseScope: 'PROD',
        },
        meterPolicyIds: ['00000000-0000-4000-8000-000000000004'],
        coverageWindow: '24X7',
        triageScope: { automated: true },
        investigationScope: { deepDive: true },
        escalationPolicy: { level: 'P1' },
        responseSupport: { authority: 'R1' },
        reviewCadence: 'MONTHLY',
        customerDependencies: ['none'],
        exclusions: ['legacy'],
        responseAuthority: 'R1',
        effectiveFrom: new Date(),
        reason: 'Attempting MD profile without entitlement',
      };

      await expect(
        managedDefenseService.createProfile(
          CA_ONLY_TENANT,
          'env-prod',
          'user-1',
          dummyDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Managed-Defense-Only Tenant Boundary Enforcement', () => {
    it('MUST permit Managed Defense operations for MD-only tenant', async () => {
      const isMDEntitled = await offerEntitlementService.checkEntitlement(
        MD_ONLY_TENANT,
        'MANAGED_DEFENSE',
      );
      expect(isMDEntitled).toBe(true);
      await expect(
        offerEntitlementService.assertManagedDefenseEntitled(MD_ONLY_TENANT),
      ).resolves.not.toThrow();
    });

    it('MUST block Continuous Assurance operations for MD-only tenant with 403 Forbidden', async () => {
      const isCAEntitled = await offerEntitlementService.checkEntitlement(
        MD_ONLY_TENANT,
        'CONTINUOUS_ASSURANCE',
      );
      expect(isCAEntitled).toBe(false);

      await expect(
        offerEntitlementService.assertContinuousAssuranceEntitled(MD_ONLY_TENANT, {
          action: 'EVALUATE_SOC2_CONTROLS',
        }),
      ).rejects.toThrow(ForbiddenException);

      try {
        await offerEntitlementService.assertContinuousAssuranceEntitled(MD_ONLY_TENANT);
      } catch (err: any) {
        expect(err.getResponse()).toMatchObject({
          statusCode: 403,
          error: 'OFFER_ENTITLEMENT_REQUIRED',
          offerType: 'CONTINUOUS_ASSURANCE',
          tenantId: MD_ONLY_TENANT,
        });
      }
    });

    it('MUST reject Continuous Assurance profile creation when tenant has no CONTINUOUS_ASSURANCE entitlement', async () => {
      const dummyDto: any = {
        profileKey: 'ca-profile-1',
        commercialAccountId: 'comm-acct-md',
        contractId: '00000000-0000-4000-8000-000000000001',
        serviceTier: 'ENTERPRISE',
        recurringPricingMetric: 'COMMITTED_ASSURANCE_SCOPE',
        priceBookId: '00000000-0000-4000-8000-000000000002',
        legalEntityIds: ['le-1'],
        businessUnitIds: ['bu-1'],
        frameworkVersionIds: ['00000000-0000-4000-8000-000000000003'],
        connectorIds: ['00000000-0000-4000-8000-000000000004'],
        controlScope: { allContractedControls: true },
        evidenceRetentionPolicy: {
          customerVisible: true,
          profileRef: 'ref-1',
          historicalTreatment: 'PRESERVE_BY_ORIGINAL_POLICY',
        },
        auditorSeats: 2,
        workspaceCount: 1,
        region: 'GLOBAL',
        deploymentClass: 'CLOUD_MULTI_TENANT',
        humanObligations: {
          onboarding: { purchased: true },
          mappingReview: { purchased: true },
          evidenceQualityReview: { purchased: true },
          assessmentCycles: { purchased: true },
          auditPackageProduction: { purchased: true },
          advisorySupport: { purchased: false },
        },
        effectiveFrom: new Date(),
        reason: 'Attempting CA profile without entitlement',
      };

      await expect(
        continuousAssuranceService.createProfile(
          MD_ONLY_TENANT,
          'env-prod',
          'user-1',
          dummyDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Dual-Subscribed Tenant Operations', () => {
    it('MUST permit both Managed Defense and Continuous Assurance for dual-subscribed tenant', async () => {
      await expect(
        offerEntitlementService.assertManagedDefenseEntitled(DUAL_TENANT),
      ).resolves.not.toThrow();

      await expect(
        offerEntitlementService.assertContinuousAssuranceEntitled(DUAL_TENANT),
      ).resolves.not.toThrow();
    });

    it('MUST return all active offers for dual tenant', async () => {
      prismaMock.entitlement.findMany.mockResolvedValue([
        { offer_type: 'MANAGED_DEFENSE' },
        { offer_type: 'CONTINUOUS_ASSURANCE' },
      ]);

      const activeOffers = await offerEntitlementService.getTenantActiveOffers(DUAL_TENANT);
      expect(activeOffers).toEqual(
        expect.arrayContaining(['MANAGED_DEFENSE', 'CONTINUOUS_ASSURANCE']),
      );
    });
  });

  describe('4. Zero-Entitlement Tenant Total Block (Neither Offer Active)', () => {
    it('MUST fail closed and block BOTH Managed Defense and Continuous Assurance for a tenant with zero active entitlements', async () => {
      // 1. Assert Managed Defense is blocked
      await expect(
        offerEntitlementService.assertManagedDefenseEntitled(UNENTITLED_TENANT, {
          action: 'CREATE_DEFENSE_PROFILE',
        }),
      ).rejects.toThrow(ForbiddenException);

      // 2. Assert Continuous Assurance is blocked
      await expect(
        offerEntitlementService.assertContinuousAssuranceEntitled(UNENTITLED_TENANT, {
          action: 'CREATE_ASSURANCE_PROFILE',
        }),
      ).rejects.toThrow(ForbiddenException);

      // 3. Assert IR Retainer is blocked
      await expect(
        offerEntitlementService.assertIncidentResponseRetainerEntitled(UNENTITLED_TENANT),
      ).rejects.toThrow(ForbiddenException);

      // 4. Assert active offers list is empty
      prismaMock.entitlement.findMany.mockResolvedValue([]);
      const activeOffers = await offerEntitlementService.getTenantActiveOffers(UNENTITLED_TENANT);
      expect(activeOffers).toEqual([]);
    });
  });

  describe('5. Suspended Commercial Account Fail-Closed Behavior', () => {
    it('MUST reject all offer assertions if the parent commercial account is SUSPENDED', async () => {
      const isEntitled = await offerEntitlementService.checkEntitlement(
        SUSPENDED_TENANT,
        'MANAGED_DEFENSE',
      );
      expect(isEntitled).toBe(false);

      await expect(
        offerEntitlementService.assertManagedDefenseEntitled(SUSPENDED_TENANT),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6. Comprehensive Unentitled Matrix Block', () => {
    it('MUST fail closed and throw ForbiddenException for all offers for unentitled tenant', async () => {
      const offers: CommercialOfferType[] = [
        'MANAGED_DEFENSE',
        'CONTINUOUS_ASSURANCE',
        'INCIDENT_RESPONSE_RETAINER',
        'EXPOSURE_MANAGEMENT',
        'AI_SECURITY',
      ];

      for (const offer of offers) {
        await expect(
          offerEntitlementService.assertOfferEntitled(UNENTITLED_TENANT, offer),
        ).rejects.toThrow(ForbiddenException);
      }
    });
  });
});
