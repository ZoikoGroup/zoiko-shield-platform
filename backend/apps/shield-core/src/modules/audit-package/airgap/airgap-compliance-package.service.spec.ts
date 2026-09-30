import { AirgapCompliancePackageService } from './airgap-compliance-package.service';

describe('AirgapCompliancePackageService', () => {
  let service: AirgapCompliancePackageService;
  let mockPrisma: any;
  let mockExportService: any;

  beforeEach(() => {
    mockPrisma = {
      auditPackage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pkg-1',
          tenant_id: 'tenant-airgap-1',
          status: 'FROZEN',
        }),
      },
    };
    mockExportService = {
      exportManifest: jest.fn().mockResolvedValue({
        packageId: 'pkg-1',
        title: 'Q3 Independent Compliance Freeze',
        merkleRoot:
          'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        evidenceIndex: [{ evidenceId: 'ev-1', sha256: 'hash-1' }],
      }),
    };
    service = new AirgapCompliancePackageService(mockPrisma, mockExportService);
  });

  it('should export standalone airgap compliance package bundle', async () => {
    const bundle = await service.exportAirgapPackage(
      'tenant-airgap-1',
      'pkg-1',
    );

    expect(bundle.bundleId).toContain('airgap-pkg-');
    expect(bundle.formatVersion).toBe('ZOIKO-AIRGAP-V1');
    expect(bundle.packageArchiveBase64).toBeDefined();
    expect(bundle.embeddedRootCertificates.length).toBeGreaterThan(0);
    expect(bundle.merkleRoot).toBeDefined();
  });
});
