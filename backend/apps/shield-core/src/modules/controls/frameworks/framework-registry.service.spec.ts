import { ConflictException } from '@nestjs/common';
import { FrameworkRegistryService } from './framework-registry.service';

describe('FrameworkRegistryService Category F1 release gates', () => {
  let prisma: any;
  let hash: any;
  let approvals: any;
  let service: FrameworkRegistryService;

  beforeEach(() => {
    prisma = {
      framework: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      frameworkVersion: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      commercialApproval: { update: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(prisma)),
    };
    hash = {
      hashCanonicalJson: jest.fn().mockReturnValue({ contentHash: 'hash-1' }),
    };
    approvals = { requestApproval: jest.fn(), decideApproval: jest.fn() };
    service = new FrameworkRegistryService(prisma, hash, approvals);
  });

  it('does not submit framework content with incomplete rights/review evidence', async () => {
    prisma.frameworkVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      release_status: 'DRAFT',
      approval_id: null,
      content_license_status: 'PENDING',
      display_rights: false,
      mapping_test_status: 'NOT_RUN',
      framework: { key: 'iso27001' },
    });

    await expect(
      service.submitVersion('version-1', 'maker-1', 'Release content'),
    ).rejects.toThrow(ConflictException);
    expect(approvals.requestApproval).not.toHaveBeenCalled();
  });

  it('submits complete content to maker-checker instead of publishing directly', async () => {
    prisma.frameworkVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      version: '2026',
      content_hash: 'hash-1',
      release_status: 'DRAFT',
      approval_id: null,
      content_license_status: 'LICENSED',
      display_rights: true,
      mapping_test_status: 'PASSED',
      source_reference: 'source-1',
      source_version: '2026',
      license_reference: 'license-1',
      legal_interpretation_ref: 'legal-1',
      sme_review_ref: 'sme-1',
      mapping_test_report_ref: 'mapping-1',
      approved_claim_wording: 'Supports evidence mapping.',
      framework: { key: 'iso27001' },
    });
    approvals.requestApproval.mockResolvedValue({ id: 'approval-1' });
    prisma.frameworkVersion.update.mockResolvedValue({
      id: 'version-1',
      release_status: 'PENDING_APPROVAL',
    });

    const result = await service.submitVersion(
      'version-1',
      'maker-1',
      'Release content',
    );

    expect(result.release_status).toBe('PENDING_APPROVAL');
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        changeType: 'ASSURANCE_CONTENT_RELEASE',
        objectType: 'FrameworkVersion',
      }),
      prisma,
    );
  });
});
