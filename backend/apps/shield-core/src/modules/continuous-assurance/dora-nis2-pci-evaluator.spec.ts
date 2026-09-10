import { Test, TestingModule } from '@nestjs/testing';
import {
  DoraNis2PciEvaluatorService,
  SectorControlEvaluationInput,
} from './dora-nis2-pci-evaluator.service';

describe('DoraNis2PciEvaluatorService', () => {
  let service: DoraNis2PciEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DoraNis2PciEvaluatorService],
    }).compile();

    service = module.get<DoraNis2PciEvaluatorService>(DoraNis2PciEvaluatorService);
  });

  it('should evaluate DORA Art 10 Backup & Resilience control as PASS when RTO < 60s and RPO = 0s', () => {
    const input: SectorControlEvaluationInput = {
      tenantId: 'tenant-bank-01',
      environmentId: 'prod-eu-west-1',
      controlId: 'DORA-ART10-BACKUP-RESILIENCE',
      framework: 'DORA_EU',
      evidenceDigests: ['sha256-evidence-digest-01'],
      observedMetrics: {
        rtoActualSeconds: 42,
        rpoActualSeconds: 0,
      },
    };

    const result = service.evaluateSectorControl(input);

    expect(result.result).toBe('PASS');
    expect(result.complianceScore).toBeGreaterThanOrEqual(90);
    expect(result.controlTitle).toContain('DORA Art 10');
    expect(result.attestationDigest).toBeDefined();
    expect(result.disclaimer).toContain('does not constitute statutory certification');
  });

  it('should evaluate DORA Art 10 as FAIL if RTO exceeds 60s SLA', () => {
    const input: SectorControlEvaluationInput = {
      tenantId: 'tenant-bank-01',
      environmentId: 'prod-eu-west-1',
      controlId: 'DORA-ART10-BACKUP-RESILIENCE',
      framework: 'DORA_EU',
      evidenceDigests: ['sha256-evidence-digest-01'],
      observedMetrics: {
        rtoActualSeconds: 120, // Breached
        rpoActualSeconds: 0,
      },
    };

    const result = service.evaluateSectorControl(input);

    expect(result.result).toBe('FAIL');
    expect(result.complianceScore).toBeLessThan(50);
  });

  it('should evaluate NIS2 Art 21 Supply Chain Early Warning as PASS when reporting latency < 24h', () => {
    const input: SectorControlEvaluationInput = {
      tenantId: 'tenant-bank-01',
      environmentId: 'prod-eu-west-1',
      controlId: 'NIS2-ART21-SUPPLY-CHAIN-EARLY-WARNING',
      framework: 'NIS2_EU',
      evidenceDigests: ['sha256-evidence-digest-02'],
      observedMetrics: {
        incidentReportingHours: 6,
      },
    };

    const result = service.evaluateSectorControl(input);

    expect(result.result).toBe('PASS');
    expect(result.complianceScore).toBe(100);
  });

  it('should evaluate PCI DSS v4.0 Req 10.2 as PASS when Merkle epoch is anchored', () => {
    const input: SectorControlEvaluationInput = {
      tenantId: 'tenant-bank-01',
      environmentId: 'prod-eu-west-1',
      controlId: 'PCI-DSS-REQ10.2-AUDIT-IMMUTABILITY',
      framework: 'PCI_DSS_V4',
      evidenceDigests: ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      observedMetrics: {
        merkleEpochAnchored: true,
      },
    };

    const result = service.evaluateSectorControl(input);

    expect(result.result).toBe('PASS');
    expect(result.complianceScore).toBe(100);
  });
});
