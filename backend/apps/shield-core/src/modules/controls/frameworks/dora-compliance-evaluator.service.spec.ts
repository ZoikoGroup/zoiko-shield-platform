import { Test, TestingModule } from '@nestjs/testing';
import { DoraComplianceEvaluatorService } from './dora-compliance-evaluator.service';

describe('DoraComplianceEvaluatorService', () => {
  let service: DoraComplianceEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DoraComplianceEvaluatorService],
    }).compile();

    service = module.get<DoraComplianceEvaluatorService>(
      DoraComplianceEvaluatorService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return NOT_EVALUATED for unsupplied telemetry without inventing compliance', () => {
    const report = service.evaluateDoraPosture(
      'tenant-fin-01',
      'env-prod-01',
      {},
    );

    expect(report.framework).toBe('DORA_EU_2022_2554');
    expect(report.overallComplianceScore).toBeNull();
    expect(report.notEvaluatedCount).toBe(report.totalArticlesEvaluated);
    expect(report.merkleEvidenceRoot).toBeDefined();
    expect(report.evaluations.every((e) => e.status === 'NOT_EVALUATED')).toBe(
      true,
    );
  });

  it('should evaluate compliant DORA posture when verified telemetry is supplied', () => {
    const report = service.evaluateDoraPosture('tenant-fin-01', 'env-prod-01', {
      multiCloudRecoveryRtoMinutes: 60,
      multiCloudRecoveryRpoMinutes: 0,
      boundaryDefenseMfaRate: 1.0,
      ocsfDetectionPipelineLatencyMs: 250,
      automatedContainmentTested: true,
      rollbackReceiptVerificationPassRate: 1.0,
      tlptLastExerciseDaysAgo: 180,
      thirdPartyHhiIndex: 1800,
      tier1ProviderFallbackConfigured: true,
      unreportedIncidentAgeHours: 2,
    });

    expect(report.overallComplianceScore).toBe(100);
    expect(report.compliantCount).toBe(7);
    expect(report.gapCount).toBe(0);
    expect(report.notEvaluatedCount).toBe(0);
    expect(report.majorIncidentNotificationStatus.withinInitialWindow).toBe(
      true,
    );
    expect(report.merkleEvidenceRoot).toMatch(/^[a-f0-9]{64}$/i);
  });

  it('should detect gaps and flag breaches when recovery RTO or incident reporting deadline is exceeded', () => {
    const report = service.evaluateDoraPosture('tenant-fin-01', 'env-prod-01', {
      multiCloudRecoveryRtoMinutes: 240, // Exceeds 120min target
      multiCloudRecoveryRpoMinutes: 15, // Non-zero RPO
      boundaryDefenseMfaRate: 0.85,
      unreportedIncidentAgeHours: 6, // Exceeds 4h initial notification deadline
    });

    expect(report.compliantCount).toBe(0);
    expect(report.gapCount).toBe(3);
    expect(report.majorIncidentNotificationStatus.withinInitialWindow).toBe(
      false,
    );
  });
});
