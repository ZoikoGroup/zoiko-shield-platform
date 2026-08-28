import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuditPackageValidatorService } from './audit-package-validator.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { AuditPackageService } from '../audit-package.service';
import { AuditPackageStateMachineService } from '../audit-package-state-machine.service';

describe('AuditPackageValidatorService', () => {
  let service: AuditPackageValidatorService;
  let prisma: any;
  let auditPackageService: any;
  let stateMachine: any;

  const tenantId = 'tenant-demo';
  const packageId = 'pkg-001';

  beforeEach(async () => {
    prisma = {
      auditPackageManifest: {
        findUnique: jest.fn(),
        update: jest.fn().mockReturnValue(Promise.resolve({})),
      },
      auditPackage: {
        update: jest.fn().mockReturnValue(Promise.resolve({})),
      },
      riskAcceptance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest
        .fn()
        .mockImplementation((promises) => Promise.all(promises)),
    };

    auditPackageService = {
      assertTenantOwnership: jest.fn().mockResolvedValue({
        id: packageId,
        tenant_id: tenantId,
        status: 'BUILT',
        claim_eligibility: 'ELIGIBLE',
      }),
    };

    stateMachine = {
      assertValidTransition: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditPackageValidatorService,
        ContentHashService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditPackageService, useValue: auditPackageService },
        { provide: AuditPackageStateMachineService, useValue: stateMachine },
      ],
    }).compile();

    service = module.get<AuditPackageValidatorService>(
      AuditPackageValidatorService,
    );
  });

  it('should throw NotFoundException if manifest does not exist', async () => {
    prisma.auditPackageManifest.findUnique.mockResolvedValue(null);

    await expect(service.validate(tenantId, packageId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should validate a complete and verified manifest successfully', async () => {
    const validManifestCore = {
      scope: {
        frameworkVersionIds: ['fw-soc2'],
        legalEntityScope: 'le-1',
      },
      verifierProfile: {
        minVerifierVersion: '1.0.0',
        verifierSourceVersion: '1.0.0',
        treeProfile: 'ZS-MERKLE-V1',
        hashAlgorithm: 'SHA-256',
        canonicalizationProfile: 'zs-manifest-v1',
      },
      evidenceIndex: [
        {
          evidenceId: 'ev-1',
          contentHash: 'hash-1',
          completenessState: 'COMPLETE',
          freshnessState: 'CURRENT',
          integrityState: 'VERIFIED',
        },
      ],
      assessmentIndex: [
        {
          assessmentId: 'asm-1',
          status: 'COMPLIANT',
          completenessState: 'COMPLETE',
          freshnessState: 'CURRENT',
          integrityState: 'VERIFIED',
          reviewedAt: new Date().toISOString(),
        },
      ],
      riskIndex: [],
      limitations: [],
      knownGaps: [],
    };

    prisma.auditPackageManifest.findUnique.mockResolvedValue({
      package_id: packageId,
      manifest_core_content: JSON.stringify(validManifestCore),
    });

    const result = await service.validate(tenantId, packageId);

    expect(result.ready).toBe(true);
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.claimEligibility).toBe(false);
    expect(result.eligibilityReason).toBe('PACKAGE_NOT_FROZEN');
  });

  it('should flag blocking issues if evidence is unverified or assessments incomplete', async () => {
    const invalidManifestCore = {
      scope: null,
      evidenceIndex: [
        {
          evidenceId: 'ev-1',
          contentHash: 'hash-1',
          integrityState: 'TAMPERED',
        },
      ],
      assessmentIndex: [
        {
          assessmentId: 'asm-1',
          status: 'EVIDENCE_INCOMPLETE',
          reviewedAt: null,
        },
      ],
      riskIndex: [],
      limitations: [],
      completenessState: 'INCOMPLETE',
      freshnessState: 'CURRENT',
      integrityState: 'COMPROMISED',
      verifierCompatibility: 'COMPATIBLE',
      claimEligibility: false,
      eligibilityReason: 'Tampered evidence detected',
    };

    prisma.auditPackageManifest.findUnique.mockResolvedValue({
      package_id: packageId,
      manifest_core_content: JSON.stringify(invalidManifestCore),
    });

    const result = await service.validate(tenantId, packageId);

    expect(result.ready).toBe(false);
    expect(result.blockingIssues.length).toBeGreaterThan(0);
    expect(result.blockingIssues).toContain('Scope is not populated');
    expect(result.blockingIssues).toContain(
      'One or more evidence items are not integrity-VERIFIED',
    );
    expect(result.blockingIssues).toContain(
      'One or more assessments in scope have EVIDENCE_INCOMPLETE status',
    );
  });
});
