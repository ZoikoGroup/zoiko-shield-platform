import { Test, TestingModule } from '@nestjs/testing';
import { CoreAssuranceEvaluatorService } from './core-assurance-evaluator.service';
import { Adr08SectorRegistryService } from './adr08-sector-registry.service';

describe('CoreAssuranceEvaluatorService & Adr08SectorRegistryService', () => {
  let coreEvaluator: CoreAssuranceEvaluatorService;
  let adr08Registry: Adr08SectorRegistryService;

  const mockTenantId = 'tenant-soc2-alpha';
  const mockEnv = 'production';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CoreAssuranceEvaluatorService, Adr08SectorRegistryService],
    }).compile();

    coreEvaluator = module.get<CoreAssuranceEvaluatorService>(
      CoreAssuranceEvaluatorService,
    );
    adr08Registry = module.get<Adr08SectorRegistryService>(
      Adr08SectorRegistryService,
    );
  });

  describe('SOC 2 Type II & ISO 27001:2022 Core Control Evaluations', () => {
    it('should evaluate SOC 2 CC6.1 Access Control as COMPLETE when 100% MFA is enforced', () => {
      const res = coreEvaluator.evaluateCoreControl({
        tenantId: mockTenantId,
        environmentId: mockEnv,
        controlId: 'SOC2-CC6.1-LOGICAL-ACCESS',
        framework: 'SOC2_TYPE2',
        evidenceDigests: ['sha256:abcd1234efgh5678'],
        observedMetrics: {
          mfaEnforcedPercent: 100,
        },
      });

      expect(res.state).toBe('COMPLETE');
      expect(res.complianceScore).toBe(100);
      expect(res.attestationDigest).toBeDefined();
    });

    it('should mark evaluation as FAILED when MFA drops below mandatory threshold', () => {
      const res = coreEvaluator.evaluateCoreControl({
        tenantId: mockTenantId,
        environmentId: mockEnv,
        controlId: 'SOC2-CC6.1-LOGICAL-ACCESS',
        framework: 'SOC2_TYPE2',
        evidenceDigests: ['sha256:abcd1234efgh5678'],
        observedMetrics: {
          mfaEnforcedPercent: 75,
        },
      });

      expect(res.state).toBe('FAILED');
      expect(res.complianceScore).toBe(75);
    });

    it('should mark evaluation as STALE when evidence records exceed 72 hours age', () => {
      const res = coreEvaluator.evaluateCoreControl({
        tenantId: mockTenantId,
        environmentId: mockEnv,
        controlId: 'ISO27001-A8.15-LOGGING',
        framework: 'ISO_27001_2022',
        evidenceDigests: ['sha256:abcd1234efgh5678'],
        observedMetrics: {
          evidenceAgeHours: 96,
        },
      });

      expect(res.state).toBe('STALE');
      expect(res.rationale).toContain('STALE');
    });

    it('should mark evaluation as INCOMPLETE when no cryptographic evidence digests are attached', () => {
      const res = coreEvaluator.evaluateCoreControl({
        tenantId: mockTenantId,
        environmentId: mockEnv,
        controlId: 'SOC2-CC7.1-VULNERABILITY-MGMT',
        framework: 'SOC2_TYPE2',
        evidenceDigests: [],
        observedMetrics: {
          unpatchedCriticalVulns: 0,
        },
      });

      expect(res.state).toBe('INCOMPLETE');
      expect(res.complianceScore).toBe(0);
    });
  });

  describe('ADR-08 Sector Registry & Deferral Rules', () => {
    it('should initialize DORA, NIS2, and PCI DSS v4.0.1 in DEFERRED_PHASE2_MIDPOINT status', () => {
      const overlays = adr08Registry.getRegisteredOverlays();
      expect(overlays).toHaveLength(3);
      for (const overlay of overlays) {
        expect(overlay.status).toBe('DEFERRED_PHASE2_MIDPOINT');
        expect(overlay.legalReviewCompleted).toBe(false);
      }
    });

    it('should allow activating a single overlay when signed pipeline is confirmed', () => {
      const activated = adr08Registry.activateSectorOverlay(
        mockTenantId,
        'DORA_EU',
        'PIPE-SIGNED-FINSERV-2026-09',
      );
      expect(activated.status).toBe('ACTIVE_SIGNED_PIPELINE');
      expect(activated.signedPipelineReference).toBe(
        'PIPE-SIGNED-FINSERV-2026-09',
      );
    });

    it('should reject activating a second overlay for the same tenant per ADR-08 single-overlay rule', () => {
      adr08Registry.activateSectorOverlay(
        mockTenantId,
        'DORA_EU',
        'PIPE-SIGNED-FINSERV-2026-09',
      );

      expect(() => {
        adr08Registry.activateSectorOverlay(
          mockTenantId,
          'NIS2_EU',
          'PIPE-SIGNED-NIS2-2026-09',
        );
      }).toThrow();
    });
  });
});
