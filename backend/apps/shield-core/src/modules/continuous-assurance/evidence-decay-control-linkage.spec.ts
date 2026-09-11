import { Test, TestingModule } from '@nestjs/testing';
import { CoreAssuranceEvaluatorService } from './core-assurance-evaluator.service';
import { AuditorEvidenceExportService } from '../audit-package/export/auditor-evidence-export.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Evidence Decay to Control Degradation Linkage & Auditor Export Disclosures', () => {
  let evaluatorService: CoreAssuranceEvaluatorService;
  let exportService: AuditorEvidenceExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoreAssuranceEvaluatorService,
        AuditorEvidenceExportService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    evaluatorService = module.get<CoreAssuranceEvaluatorService>(
      CoreAssuranceEvaluatorService,
    );
    exportService = module.get<AuditorEvidenceExportService>(
      AuditorEvidenceExportService,
    );
  });

  describe('CoreAssuranceEvaluatorService Evidence Freshness Checks', () => {
    it('1. should mark control COMPLETE when evidence is fresh (e.g. 2 hours old)', () => {
      const result = evaluatorService.evaluateCoreControl({
        tenantId: 'tenant-acme-bank',
        environmentId: 'prod-eu-west-1',
        controlId: 'SOC2-CC6.1-LOGICAL-ACCESS',
        framework: 'SOC2_TYPE2',
        evidenceDigests: ['sha256-proof-1', 'sha256-proof-2'],
        observedMetrics: {
          mfaEnforcedPercent: 100,
          evidenceAgeHours: 2,
        },
      });

      expect(result.state).toBe('COMPLETE');
      expect(result.complianceScore).toBe(100);
      expect(result.attestationDigest).toBeDefined();
    });

    it('2. should degrade control to STALE and cap score at 50 when evidence is older than 72 hours', () => {
      const result = evaluatorService.evaluateCoreControl({
        tenantId: 'tenant-acme-bank',
        environmentId: 'prod-eu-west-1',
        controlId: 'SOC2-CC6.1-LOGICAL-ACCESS',
        framework: 'SOC2_TYPE2',
        evidenceDigests: ['sha256-proof-stale'],
        observedMetrics: {
          mfaEnforcedPercent: 100,
          evidenceAgeHours: 96, // Decayed past 72h SLA
        },
      });

      expect(result.state).toBe('STALE');
      expect(result.complianceScore).toBe(50);
      expect(result.rationale).toContain('Evidence records are 96 hours old (threshold: 72h)');
      expect(result.disclaimer).toBeDefined();
    });
  });

  describe('AuditorEvidenceExportService Honest Limitations & Decay Disclosures', () => {
    it('3. should generate clean AUDITOR_VERIFIED package when all evidence is fresh and compliant', async () => {
      const exportPackage = await exportService.generateAuditorExport({
        tenantId: 'tenant-acme-bank',
        requestedBy: 'compliance-officer@acme.com',
      });

      expect(exportPackage.overallCompliancePosture).toBe('AUDITOR_VERIFIED');
      expect(exportPackage.knownLimitations.staleEvidenceCount).toBe(0);
      expect(exportPackage.knownLimitations.staleEvidenceRecords).toHaveLength(0);
      expect(exportPackage.knownLimitations.disclosures[0]).toContain('All continuous telemetry streams are fresh');
      expect(exportPackage.pqcSignatureDilithium3).toBeDefined();
      expect(exportPackage.classicalSignatureEd25519).toBeDefined();
    });

    it('4. should downgrade overall posture to REVIEW_REQUIRED and disclose stale evidence records', async () => {
      const exportPackage = await exportService.generateAuditorExport({
        tenantId: 'tenant-acme-bank',
        requestedBy: 'external-auditor@pwc.com',
        evidenceDecayRecords: [
          {
            evidenceId: 'ev-edr-crowdstrike-991',
            controlId: 'CC6.6',
            ageHours: 84,
            freshnessStatus: 'STALE',
            decayWarning: 'EDR host telemetry has not refreshed in 84 hours (exceeds 72h SLA)',
          },
        ],
      });

      expect(exportPackage.overallCompliancePosture).toBe('REVIEW_REQUIRED');
      expect(exportPackage.knownLimitations.staleEvidenceCount).toBe(1);
      expect(exportPackage.knownLimitations.staleEvidenceRecords[0].evidenceId).toBe('ev-edr-crowdstrike-991');
      expect(exportPackage.knownLimitations.disclosures.some((d) => d.includes('Disclosed 1 evidence record(s)'))).toBe(true);
      expect(exportPackage.merkleRoot).toHaveLength(64);
    });

    it('5. should downgrade overall posture to REVIEW_REQUIRED when custom controls contain DEGRADED controls', async () => {
      const exportPackage = await exportService.generateAuditorExport({
        tenantId: 'tenant-acme-bank',
        requestedBy: 'internal-secops@acme.com',
        customControls: [
          {
            framework: 'SOC2_TYPE_II',
            controlId: 'CC7.1',
            title: 'Vulnerability Management & Patch Cadence',
            status: 'DEGRADED',
            evaluatedAt: new Date(),
            evidenceRecordIds: ['ev-vuln-001'],
            merkleLeafHashes: ['hash-1'],
            evaluatorVersion: 'v2.1.0',
            chainOfCustodyHash: 'custody-1',
          },
        ],
      });

      expect(exportPackage.overallCompliancePosture).toBe('REVIEW_REQUIRED');
      expect(exportPackage.knownLimitations.disclosures.some((d) => d.includes('DEGRADED status'))).toBe(true);
    });
  });
});
