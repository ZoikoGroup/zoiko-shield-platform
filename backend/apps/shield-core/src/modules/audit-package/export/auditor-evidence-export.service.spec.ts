import { Test, TestingModule } from '@nestjs/testing';
import { AuditorEvidenceExportService } from './auditor-evidence-export.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('AuditorEvidenceExportService', () => {
  let service: AuditorEvidenceExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditorEvidenceExportService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AuditorEvidenceExportService>(
      AuditorEvidenceExportService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generates a verified auditor export package with SOC 2 & ISO 27001:2022 controls', async () => {
    const result = await service.generateAuditorExport({
      tenantId: 'tenant-audit-corp',
      requestedBy: 'auditor-lead@kpmg-sample.com',
    });

    expect(result.packageId).toBeDefined();
    expect(result.tenantId).toBe('tenant-audit-corp');
    expect(result.overallCompliancePosture).toBe('AUDITOR_VERIFIED');
    expect(result.totalControlsEvaluated).toBe(8);
    expect(result.controls.map((c) => c.controlId)).toEqual(
      expect.arrayContaining([
        'CC6.1',
        'CC6.6',
        'CC7.1',
        'CC7.2',
        'A.5.15',
        'A.8.7',
        'A.8.16',
        'A.8.24',
      ]),
    );
    expect(result.merkleRoot).toHaveLength(64);
    // Honest: a digest, and explicitly unsigned - no fake signature fields.
    expect(result.manifestDigestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.signatureStatus).toBe('UNSIGNED');
    expect((result as any).pqcSignatureDilithium3).toBeUndefined();
    expect(result.knownLimitations.disclosures.join(' ')).toMatch(
      /not cryptographically signed/,
    );
    expect(result.chainOfCustodyAuditTrail).toHaveLength(2);
  });
});
