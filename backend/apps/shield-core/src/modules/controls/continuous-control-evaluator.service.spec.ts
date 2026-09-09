import { ContinuousControlEvaluatorService } from './continuous-control-evaluator.service';
import { RegulatoryControlsSeeder } from '../../seeds/regulatory-controls.seeder';

describe('ContinuousControlEvaluatorService', () => {
  let evaluator: ContinuousControlEvaluatorService;

  beforeEach(() => {
    const seeder = new RegulatoryControlsSeeder();
    evaluator = new ContinuousControlEvaluatorService(seeder);
  });

  it('should evaluate framework controls with 100% compliance on healthy telemetry', async () => {
    const report = await evaluator.evaluateFrameworkControls({
      tenantId: 'tenant-acme-corp',
      environmentId: 'production',
      telemetrySnapshot: {
        mfaEnforcementRate: 1.0,
        edrCoverageRate: 1.0,
        vulnerabilitySlaBreachCount: 0,
        ocsfPipelineLatencyMs: 250,
        keyRotationDaysAgo: 20,
        malwareDefinitionsAgeHours: 2,
        unresolvedHighSeverityThreats: 0,
        pqcDualSignEnforced: true,
        disasterRecoveryRtoMinutes: 10,
      },
    });

    expect(report.overallComplianceScore).toBe(100);
    expect(report.totalControlsEvaluated).toBe(10);
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
        vulnerabilitySlaBreachCount: 3, // Failure (> 0)
        ocsfPipelineLatencyMs: 1500, // Failure (> 1000ms)
        keyRotationDaysAgo: 120, // Failure (> 90 days)
        malwareDefinitionsAgeHours: 48, // Failure (> 24h)
        unresolvedHighSeverityThreats: 2, // Failure (> 0)
        pqcDualSignEnforced: false, // Failure (PQC disabled)
        disasterRecoveryRtoMinutes: 45, // Gap (> 30 mins)
      },
    });

    expect(report.overallComplianceScore).toBeLessThan(100);
    expect(report.nonCompliantControlsCount).toBeGreaterThan(0);

    const mfaEval = report.evaluations.find(
      (e) => e.controlCode === 'SOC2-CC6.1',
    );
    expect(mfaEval?.status).toBe('NON_COMPLIANT');

    const edrEval = report.evaluations.find(
      (e) => e.controlCode === 'SOC2-CC6.6',
    );
    expect(edrEval?.status).toBe('NON_COMPLIANT');

    const vulnEval = report.evaluations.find(
      (e) => e.controlCode === 'SOC2-CC7.1',
    );
    expect(vulnEval?.status).toBe('NON_COMPLIANT');

    const keyEval = report.evaluations.find(
      (e) => e.controlCode === 'ISO27001-A.5.15',
    );
    expect(keyEval?.status).toBe('NON_COMPLIANT');

    const pqcEval = report.evaluations.find(
      (e) => e.controlCode === 'ISO27001-A.8.24',
    );
    expect(pqcEval?.status).toBe('NON_COMPLIANT');

    const doraEval = report.evaluations.find(
      (e) => e.controlCode === 'DORA-ART9',
    );
    expect(doraEval?.status).toBe('GAP_DETECTED');
  });
});

