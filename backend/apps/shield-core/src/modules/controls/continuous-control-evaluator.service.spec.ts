import { ContinuousControlEvaluatorService } from './continuous-control-evaluator.service';
import { RegulatoryControlsSeeder } from '../../seeds/regulatory-controls.seeder';
import { MerkleTreeService } from '../../../../shield-anchor/src/merkle/merkle-tree.service';

describe('ContinuousControlEvaluatorService', () => {
  let evaluator: ContinuousControlEvaluatorService;

  beforeEach(() => {
    const seeder = new RegulatoryControlsSeeder();
    const merkle = new MerkleTreeService();
    evaluator = new ContinuousControlEvaluatorService(seeder, merkle);
  });

  it('should evaluate framework controls with 100% compliance on healthy telemetry', async () => {
    const report = await evaluator.evaluateFrameworkControls({
      tenantId: 'tenant-acme-corp',
      environmentId: 'production',
      telemetrySnapshot: {
        mfaEnforcementRate: 1.0,
        edrCoverageRate: 1.0,
        keyRotationDaysAgo: 20,
        disasterRecoveryRtoMinutes: 10,
        unresolvedHighSeverityThreats: 0,
      },
    });

    expect(report.overallComplianceScore).toBe(100);
    expect(report.totalControlsEvaluated).toBeGreaterThan(0);
    expect(report.nonCompliantControlsCount).toBe(0);
    expect(report.merkleEvidenceRoot).toBeDefined();
    expect(report.evaluations.every((e) => e.status === 'COMPLIANT')).toBe(
      true,
    );
  });

  it('should detect compliance gaps when telemetry violates thresholds', async () => {
    const report = await evaluator.evaluateFrameworkControls({
      tenantId: 'tenant-acme-corp',
      environmentId: 'production',
      telemetrySnapshot: {
        mfaEnforcementRate: 0.85, // Failure (< 100%)
        edrCoverageRate: 0.92, // Failure (< 99%)
        keyRotationDaysAgo: 120, // Failure (> 90 days)
        disasterRecoveryRtoMinutes: 45, // Gap (> 30 mins)
        unresolvedHighSeverityThreats: 2,
      },
    });

    expect(report.overallComplianceScore).toBeLessThan(100);
    expect(report.nonCompliantControlsCount).toBeGreaterThan(0);

    const mfaEval = report.evaluations.find(
      (e) => e.controlCode === 'SOC2-CC6.1',
    );
    expect(mfaEval?.status).toBe('NON_COMPLIANT');

    const keyEval = report.evaluations.find(
      (e) => e.controlCode === 'ISO27001-A.5.15',
    );
    expect(keyEval?.status).toBe('NON_COMPLIANT');

    const doraEval = report.evaluations.find(
      (e) => e.controlCode === 'DORA-ART9',
    );
    expect(doraEval?.status).toBe('GAP_DETECTED');
  });
});
