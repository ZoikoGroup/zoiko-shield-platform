import { ExternalAuditorWorkspaceService } from './external-auditor-workspace.service';

describe('ExternalAuditorWorkspaceService', () => {
  let service: ExternalAuditorWorkspaceService;
  let mockPrisma: any;
  let mockExportService: any;

  beforeEach(() => {
    mockPrisma = {
      auditPackage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pkg-01',
            purpose: 'DORA Article 6 ICT Risk Review',
            status: 'FROZEN',
            created_at: new Date().toISOString(),
            audit_cycle_reference: 'CYCLE-2026-Q3',
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'pkg-01',
          purpose: 'DORA Article 6 ICT Risk Review',
          status: 'FROZEN',
          tenant_id: 'tenant-auditor-1',
        }),
      },
    };
    mockExportService = {
      exportManifest: jest.fn().mockResolvedValue({
        packageId: 'pkg-01',
        evidenceIndex: [
          {
            evidenceId: 'ev-1',
            evidenceType: 'BACKUP_RECOVERY_PROOF',
            sha256:
              'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          },
        ],
      }),
    };
    service = new ExternalAuditorWorkspaceService(
      mockPrisma,
      mockExportService,
    );
  });

  it('should return auditor workspace summary', async () => {
    const summary =
      await service.getAuditorWorkspaceSummary('tenant-auditor-1');
    expect(summary.auditorRole).toBe('AUDITOR_EXTERNAL');
    expect(summary.totalAuditPackages).toBe(1);
    expect(summary.frozenImmutablePackages).toBe(1);
  });

  it('should generate verified Merkle path proof', async () => {
    const proof = await service.getMerklePathProof(
      'tenant-auditor-1',
      'leaf-hash-12345',
    );
    expect(proof.isRootVerified).toBe(true);
    expect(proof.path.length).toBe(2);
    expect(proof.merkleRoot).toBeDefined();
  });

  it('should generate immutable dual-signed freeze certificate', async () => {
    const cert = await service.generateImmutableFreezeCertificate(
      'tenant-auditor-1',
      'pkg-01',
    );
    expect(cert.freezeStatus).toBe('IMMUTABLE_FROZEN_NOTARIZED');
    expect(cert.dualSignedAttestation.algorithm).toContain('PQC-ML-DSA');
  });
});
