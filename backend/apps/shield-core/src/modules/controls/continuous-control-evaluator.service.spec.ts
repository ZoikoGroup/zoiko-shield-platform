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

  it('reports every control as NOT_EVALUATED when no telemetry was supplied', async () => {
    const report = await evaluator.evaluateFrameworkControls({
      tenantId: 'tenant-acme-corp',
      environmentId: 'production',
    });

    // The previous behaviour was a 100% compliance report across every
    // framework, assembled from a hard-coded perfect snapshot.
    expect(report.overallComplianceScore).toBeNull();
    expect(report.totalControlsEvaluated).toBe(0);
    expect(report.notEvaluatedControlsCount).toBe(report.totalControls);
    expect(report.compliantControlsCount).toBe(0);
    expect(report.evaluations.every((e) => e.status === 'NOT_EVALUATED')).toBe(
      true,
    );
    expect(report.evaluations.every((e) => e.complianceScore === null)).toBe(
      true,
    );
  });

  it('evaluates only the controls whose telemetry is present', async () => {
    const report = await evaluator.evaluateFrameworkControls({
      tenantId: 'tenant-acme-corp',
      environmentId: 'production',
      telemetrySnapshot: { mfaEnforcementRate: 1.0 },
    });

    const mfa = report.evaluations.find((e) => e.controlCode === 'SOC2-CC6.1');
    expect(mfa?.status).toBe('COMPLIANT');

    const edr = report.evaluations.find((e) => e.controlCode === 'SOC2-CC6.6');
    expect(edr?.status).toBe('NOT_EVALUATED');
    expect(edr?.details.missingMetrics).toEqual(['edrCoverageRate']);

    // One measured control, all passing — the score describes what was
    // measured and the report names what was not.
    expect(report.overallComplianceScore).toBe(100);
    expect(report.totalControlsEvaluated).toBe(1);
    expect(report.notEvaluatedControlCodes).toContain('SOC2-CC6.6');
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
