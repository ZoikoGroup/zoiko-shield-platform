import {
  AuditPackageClaimService,
  evaluateAuditPackageManifest,
} from './audit-package-claim.service';

const completeManifest = {
  evidenceIndex: [
    {
      evidenceId: 'evidence-1',
      completenessState: 'COMPLETE',
      freshnessState: 'CURRENT',
      integrityState: 'VERIFIED',
    },
  ],
  assessmentIndex: [
    {
      assessmentId: 'assessment-1',
      status: 'APPROVED',
      completenessState: 'COMPLETE',
      freshnessState: 'CURRENT',
      integrityState: 'VERIFIED',
      reviewedAt: '2026-08-25T00:00:00.000Z',
    },
  ],
  knownGaps: [],
  limitations: ['Limited to the stated legal entity and period.'],
  verifierProfile: {
    minVerifierVersion: '1.0.0',
    verifierSourceVersion: '1.0.0',
    treeProfile: 'ZS-MERKLE-V1',
    hashAlgorithm: 'SHA-256',
    canonicalizationProfile: 'zs-manifest-v1',
  },
};

describe('Audit package Category F2 claim gate', () => {
  it('never marks a technically complete but unfrozen package claim-eligible', () => {
    const result = evaluateAuditPackageManifest(
      completeManifest,
      'READY_FOR_REVIEW',
    );
    expect(result.claimEligibility).toBe(false);
    expect(result.eligibilityReason).toBe('PACKAGE_NOT_FROZEN');
  });

  it('fails closed on missing or stale evidence and identifies the affected source', () => {
    const result = evaluateAuditPackageManifest(
      {
        ...completeManifest,
        evidenceIndex: [
          {
            evidenceId: 'evidence-1',
            completenessState: 'MISSING',
            freshnessState: 'STALE',
            integrityState: 'VERIFIED',
          },
        ],
      },
      'FROZEN',
    );
    expect(result.claimEligibility).toBe(false);
    expect(result.completenessState).toBe('INCOMPLETE');
    expect(result.missingEvidence).toContain(
      'EVIDENCE_NOT_COMPLETE:evidence-1',
    );
  });

  it('uses bounded verification wording only after every frozen-package gate passes', () => {
    const result = evaluateAuditPackageManifest(completeManifest, 'FROZEN');
    expect(result.claimEligibility).toBe(true);
    expect(result.approvedWording).toContain('stated scope');
    expect(result.approvedWording).not.toContain('certified');
  });

  it('appends an assessment before persisting an eligible frozen-package claim', async () => {
    const operations: string[] = [];
    const prisma: any = {
      auditPackage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'package-1',
          tenant_id: 'tenant-1',
          version: 2,
          status: 'FROZEN',
        }),
        update: jest.fn(async ({ data }) => {
          operations.push('package-update');
          return { id: 'package-1', ...data };
        }),
      },
      auditPackageManifest: {
        findUnique: jest.fn().mockResolvedValue({
          package_id: 'package-1',
          manifest_core_content: JSON.stringify(completeManifest),
          manifest_core_hash: 'core-hash',
          package_envelope_hash: 'frozen-hash',
        }),
      },
      auditPackageClaimAssessment: {
        create: jest.fn(async ({ data }) => {
          operations.push('assessment-create');
          return { id: 'assessment-1', ...data };
        }),
      },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    const service = new AuditPackageClaimService(prisma);

    const result = await service.assess('tenant-1', 'package-1', 'verifier-1');

    expect(operations).toEqual(['assessment-create', 'package-update']);
    expect(result.package).toEqual(
      expect.objectContaining({
        claim_eligibility: true,
        frozen_manifest_hash: 'frozen-hash',
      }),
    );
    expect(prisma.auditPackageClaimAssessment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        package_version: 2,
        manifest_hash: 'frozen-hash',
        integrity_state: 'VERIFIED',
        claim_eligibility: true,
      }),
    });
  });
});
