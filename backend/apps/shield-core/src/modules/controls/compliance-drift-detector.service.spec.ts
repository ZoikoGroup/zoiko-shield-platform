import { Test, TestingModule } from '@nestjs/testing';
import {
  ComplianceDriftDetectorService,
  ComplianceDriftRecord,
} from './compliance-drift-detector.service';
import { FrameworkAssessmentReport } from './continuous-control-evaluator.service';

describe('ComplianceDriftDetectorService', () => {
  let service: ComplianceDriftDetectorService;
  const tenantId = 'tenant-enterprise-bank';
  const environmentId = 'env-prod-cell-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplianceDriftDetectorService],
    }).compile();

    service = module.get<ComplianceDriftDetectorService>(
      ComplianceDriftDetectorService,
    );
    service.clearState();
  });

  const mockReport = (
    overallScore: number,
    evaluations: Array<{
      controlCode: string;
      status: 'COMPLIANT' | 'NON_COMPLIANT' | 'GAP_DETECTED';
    }>,
  ): FrameworkAssessmentReport => ({
    assessmentId: 'asmt-test-01',
    tenantId,
    environmentId,
    overallComplianceScore: overallScore,
    totalControlsEvaluated: evaluations.length,
    compliantControlsCount: evaluations.filter((e) => e.status === 'COMPLIANT')
      .length,
    nonCompliantControlsCount: evaluations.filter(
      (e) => e.status !== 'COMPLIANT',
    ).length,
    evaluations: evaluations.map((e) => ({
      controlCode: e.controlCode,
      framework: 'SOC2',
      title: 'Test Control',
      status: e.status,
      complianceScore: e.status === 'COMPLIANT' ? 100 : 50,
      evidenceDigest: 'digest-test',
      details: { reason: 'Test evaluation detail' },
      evaluatedAt: new Date().toISOString(),
    })),
    merkleEvidenceRoot: 'root-merkle-test',
    assessedAt: new Date().toISOString(),
  });

  describe('Baseline Establishment & Normal Posture', () => {
    it('establishes initial baseline and reports NORMAL severity for 100% compliance', () => {
      const report = mockReport(100, [
        { controlCode: 'SOC2-CC6.1', status: 'COMPLIANT' },
        { controlCode: 'ISO27001-A.5.15', status: 'COMPLIANT' },
      ]);

      const drift = service.detectDrift(report);

      expect(drift.severity).toBe('NORMAL');
      expect(drift.baselineScore).toBe(100);
      expect(drift.currentScore).toBe(100);
      expect(drift.driftPercentage).toBe(0);
      expect(drift.driftedControls).toHaveLength(0);
      expect(drift.evidenceDigest).toBeDefined();
    });
  });

  describe('Warning Drift Detection', () => {
    it('detects WARNING when a non-critical control degrades from baseline', () => {
      // 1. Establish baseline at 100%
      service.setBaseline(tenantId, environmentId, 100);

      // 2. Report degrades to 90% with 1 non-compliant control
      const report = mockReport(90, [
        { controlCode: 'SOC2-CC6.1', status: 'COMPLIANT' },
        { controlCode: 'ISO27001-A.5.15', status: 'NON_COMPLIANT' },
      ]);

      const drift = service.detectDrift(report, { targetSlaThreshold: 85.0 });

      expect(drift.severity).toBe('WARNING');
      expect(drift.driftPercentage).toBe(10);
      expect(drift.driftedControls).toHaveLength(1);
      expect(drift.driftedControls[0].controlCode).toBe('ISO27001-A.5.15');
      expect(drift.recommendation).toContain(
        'Investigate minor compliance drift',
      );
    });
  });

  describe('Critical SLA Breach Detection', () => {
    it('triggers CRITICAL_SLA_BREACH when overall score drops below contractual threshold', () => {
      service.setBaseline(tenantId, environmentId, 100);

      const report = mockReport(75, [
        { controlCode: 'SOC2-CC6.1', status: 'NON_COMPLIANT' },
        { controlCode: 'SOC2-CC6.6', status: 'NON_COMPLIANT' },
        { controlCode: 'ISO27001-A.5.15', status: 'NON_COMPLIANT' },
      ]);

      const drift = service.detectDrift(report, { targetSlaThreshold: 90.0 });

      expect(drift.severity).toBe('CRITICAL_SLA_BREACH');
      expect(drift.driftPercentage).toBe(25);
      expect(drift.driftedControls).toHaveLength(3);
      expect(drift.recommendation).toContain('Immediate remediation required');
    });

    it('triggers CRITICAL_SLA_BREACH when evidence freshness SLA is severely breached', () => {
      const report = mockReport(95, [
        { controlCode: 'SOC2-CC6.1', status: 'COMPLIANT' },
        { controlCode: 'ISO27001-A.5.15', status: 'COMPLIANT' },
      ]);

      const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
      const freshnessChecks = [
        {
          tenantId,
          controlCode: 'SOC2-CC6.1',
          lastEvidenceTimestamp: twoDaysAgo,
          maxFreshnessSeconds: 3600, // 1 hour max
        },
        {
          tenantId,
          controlCode: 'ISO27001-A.5.15',
          lastEvidenceTimestamp: twoDaysAgo,
          maxFreshnessSeconds: 3600,
        },
      ];

      const drift = service.detectDrift(report, {
        targetSlaThreshold: 90.0,
        freshnessChecks,
      });

      expect(drift.severity).toBe('CRITICAL_SLA_BREACH');
      expect(drift.staleEvidenceControls).toContain('SOC2-CC6.1');
      expect(drift.staleEvidenceControls).toContain('ISO27001-A.5.15');
    });
  });

  describe('Drift History & Tenant Isolation', () => {
    it('tracks independent drift history per tenant', () => {
      const tenantA = 'tenant-a';
      const tenantB = 'tenant-b';

      const reportA = {
        ...mockReport(80, [{ controlCode: 'C1', status: 'NON_COMPLIANT' }]),
        tenantId: tenantA,
      };
      const reportB = {
        ...mockReport(100, [{ controlCode: 'C1', status: 'COMPLIANT' }]),
        tenantId: tenantB,
      };

      service.detectDrift(reportA);
      service.detectDrift(reportB);

      const historyA = service.getDriftHistory(tenantA);
      const historyB = service.getDriftHistory(tenantB);

      expect(historyA).toHaveLength(1);
      expect(historyA[0].severity).toBe('CRITICAL_SLA_BREACH');

      expect(historyB).toHaveLength(1);
      expect(historyB[0].severity).toBe('NORMAL');
    });
  });
});
