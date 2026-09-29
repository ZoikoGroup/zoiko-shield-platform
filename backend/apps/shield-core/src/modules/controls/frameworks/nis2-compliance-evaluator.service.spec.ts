import { Test, TestingModule } from '@nestjs/testing';
import { Nis2ComplianceEvaluatorService } from './nis2-compliance-evaluator.service';

describe('Nis2ComplianceEvaluatorService', () => {
  let service: Nis2ComplianceEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Nis2ComplianceEvaluatorService],
    }).compile();

    service = module.get<Nis2ComplianceEvaluatorService>(
      Nis2ComplianceEvaluatorService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return NOT_EVALUATED for unsupplied telemetry without inventing compliance', () => {
    const report = service.evaluateNis2Posture(
      'tenant-energy-01',
      'env-prod-01',
      {},
    );

    expect(report.framework).toBe('NIS2_DIRECTIVE_EU_2022_2555');
    expect(report.overallComplianceScore).toBeNull();
    expect(report.notEvaluatedCount).toBe(report.totalControlsEvaluated);
    expect(report.merkleEvidenceRoot).toBeDefined();
  });

  it('should evaluate compliant NIS2 posture when verified telemetry is supplied', () => {
    const report = service.evaluateNis2Posture(
      'tenant-energy-01',
      'env-prod-01',
      {
        entityType: 'ESSENTIAL_ENTITY',
        incidentHandlingProcessDocumented: true,
        businessContinuityTestedDaysAgo: 90,
        sbomAttestationCoverageRate: 1.0,
        vulnerabilityDisclosurePolicyActive: true,
        effectivenessAuditPassed: true,
        pqcAndKmsEncryptionEnforced: true,
        mfaEnforcementRate: 1.0,
        unreportedIncidentAgeHours: 12,
      },
    );

    expect(report.overallComplianceScore).toBe(100);
    expect(report.compliantCount).toBe(8);
    expect(report.gapCount).toBe(0);
    expect(report.notEvaluatedCount).toBe(0);
    expect(
      report.incidentNotificationStatus.withinEarlyWarning24hWindow,
    ).toBe(true);
    expect(
      report.incidentNotificationStatus.withinIncidentNotification72hWindow,
    ).toBe(true);
  });

  it('should flag breach if incident notification exceeds early warning window', () => {
    const report = service.evaluateNis2Posture(
      'tenant-energy-01',
      'env-prod-01',
      {
        unreportedIncidentAgeHours: 48, // Exceeds 24h early warning
      },
    );

    expect(
      report.incidentNotificationStatus.withinEarlyWarning24hWindow,
    ).toBe(false);
    expect(
      report.incidentNotificationStatus.withinIncidentNotification72hWindow,
    ).toBe(true);
    expect(report.evaluations.find((e) => e.controlCode === 'NIS2-ART23')?.status).toBe(
      'NON_COMPLIANT',
    );
  });
});
