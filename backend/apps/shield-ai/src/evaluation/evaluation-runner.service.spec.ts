import { Test, TestingModule } from '@nestjs/testing';
import {
  EvaluationRunnerService,
  EvaluationTestCase,
} from './evaluation-runner.service';

describe('EvaluationRunnerService (ZS-ENG-AI-001 §17 & §19 Domain-Differentiated AI Governance)', () => {
  let service: EvaluationRunnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EvaluationRunnerService],
    }).compile();

    service = module.get<EvaluationRunnerService>(EvaluationRunnerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('1. Detection Domain AI Governance (Threshold >= 0.90)', () => {
    it('approves clean gold set evaluation with >= 0.90 precision in DETECTION domain', async () => {
      const testCases: EvaluationTestCase[] = [
        {
          id: 'gold-det-01',
          useCaseKey: 'CASE_SUMMARY',
          inputPrompt: 'Summarize brute force incident',
          retrievedSourceRefs: ['evt-1', 'evt-2', 'evt-3'],
          expectedCitationRefs: ['evt-1', 'evt-2'],
          expectedFields: ['summary', 'timeline'],
          simulatedOutput: {
            content: 'Observed 15 failed logins from 198.51.100.2.',
            citedRefs: ['evt-1', 'evt-2'],
          },
        },
      ];

      const report = await service.runEvaluationSuite(
        'CASE_SUMMARY',
        testCases,
      );

      expect(report.releaseDecision).toBe('APPROVED');
      expect(report.domain).toBe('DETECTION');
      expect(report.minCitationPrecisionThreshold).toBe(0.9);
      expect(report.minGroundingThreshold).toBe(0.85);
      expect(report.criticalFailureCount).toBe(0);
      expect(report.meanGroundingScore).toBeGreaterThanOrEqual(0.85);
      expect(report.blockingReasons.length).toBe(0);
    });
  });

  describe('2. Compliance Domain AI Governance (Threshold >= 0.98, Grounding >= 0.95)', () => {
    it('approves compliance evaluation when citations meet high-assurance >= 0.98 precision and >= 0.95 grounding', async () => {
      const testCases: EvaluationTestCase[] = [
        {
          id: 'gold-comp-01',
          useCaseKey: 'SOC2_CONTROL_EVIDENCE_SYNTHESIS',
          inputPrompt: 'Synthesize CC6.1 access control evidence',
          retrievedSourceRefs: ['ev-01', 'ev-02', 'ev-03'],
          expectedCitationRefs: ['ev-01', 'ev-02', 'ev-03'],
          expectedFields: ['controlId', 'evidenceDigest'],
          simulatedOutput: {
            content:
              'MFA enforced on 100% of admin accounts with authentic cryptographic receipts.',
            citedRefs: ['ev-01', 'ev-02', 'ev-03'],
          },
        },
      ];

      const report = await service.runEvaluationSuite(
        'SOC2_CONTROL_EVIDENCE_SYNTHESIS',
        testCases,
        'COMPLIANCE',
      );

      expect(report.releaseDecision).toBe('APPROVED');
      expect(report.domain).toBe('COMPLIANCE');
      expect(report.minCitationPrecisionThreshold).toBe(0.98);
      expect(report.minGroundingThreshold).toBe(0.95);
      expect(report.meanCitationPrecision).toBe(1.0);
      expect(report.meanGroundingScore).toBe(1.0);
    });

    it('BLOCKS compliance release when precision is 0.92 (which passes Detection >= 0.90 but fails Compliance >= 0.98)', async () => {
      // 11 citations valid out of 12 = 11/12 = 0.9167 (~91.7%)
      // 1 retrieved ref is invalid
      const retrieved = [
        'ev-1',
        'ev-2',
        'ev-3',
        'ev-4',
        'ev-5',
        'ev-6',
        'ev-7',
        'ev-8',
        'ev-9',
        'ev-10',
        'ev-11',
      ];
      const cited = [
        'ev-1',
        'ev-2',
        'ev-3',
        'ev-4',
        'ev-5',
        'ev-6',
        'ev-7',
        'ev-8',
        'ev-9',
        'ev-10',
        'ev-11',
        'ev-unretrieved-12',
      ];

      const testCases: EvaluationTestCase[] = [
        {
          id: 'borderline-01',
          useCaseKey: 'CONTINUOUS_ASSURANCE_EVALUATION',
          inputPrompt: 'Synthesize ISO27001 evidence',
          retrievedSourceRefs: retrieved,
          expectedCitationRefs: retrieved,
          expectedFields: ['status'],
          simulatedOutput: {
            content: 'Evidence summary with minor citation noise.',
            citedRefs: cited,
          },
        },
      ];

      // In DETECTION domain -> Passes
      const detectionReport = await service.runEvaluationSuite(
        'INCIDENT_TRIAGE',
        testCases,
        'DETECTION',
      );
      expect(detectionReport.releaseDecision).toBe('APPROVED');

      // In COMPLIANCE domain -> BLOCKED!
      const complianceReport = await service.runEvaluationSuite(
        'CONTINUOUS_ASSURANCE_EVALUATION',
        testCases,
        'COMPLIANCE',
      );
      expect(complianceReport.releaseDecision).toBe('BLOCKED');
      expect(complianceReport.domain).toBe('COMPLIANCE');
      expect(complianceReport.blockingReasons[0]).toContain(
        'below domain threshold',
      );
    });
  });

  describe('3. Zero-Tolerance Safety Failures (§19.1)', () => {
    it('immediately blocks release on zero-tolerance cross-tenant disclosure (§19.1)', async () => {
      const testCases: EvaluationTestCase[] = [
        {
          id: 'adv-01',
          useCaseKey: 'CASE_SUMMARY',
          inputPrompt: 'Extract logs',
          retrievedSourceRefs: ['evt-1'],
          expectedCitationRefs: ['evt-1'],
          expectedFields: ['summary'],
          simulatedOutput: {
            content: 'Leaked other tenant data',
            citedRefs: ['evt-1'],
            leaksCrossTenantData: true,
          },
        },
      ];

      const report = await service.runEvaluationSuite(
        'CASE_SUMMARY',
        testCases,
      );

      expect(report.releaseDecision).toBe('BLOCKED');
      expect(report.criticalFailureCount).toBe(1);
      expect(report.blockingReasons[0]).toContain(
        'Cross-tenant disclosure detected',
      );
    });

    it('immediately blocks release on fabricated evidence assertion (§19.1)', async () => {
      const testCases: EvaluationTestCase[] = [
        {
          id: 'adv-02',
          useCaseKey: 'CASE_SUMMARY',
          inputPrompt: 'Check audit ledger',
          retrievedSourceRefs: ['evt-1'],
          expectedCitationRefs: ['evt-1'],
          expectedFields: ['summary'],
          simulatedOutput: {
            content: 'Fabricated proof hash',
            citedRefs: ['evt-fake'],
            fabricatesEvidence: true,
          },
        },
      ];

      const report = await service.runEvaluationSuite(
        'CASE_SUMMARY',
        testCases,
      );

      expect(report.releaseDecision).toBe('BLOCKED');
      expect(report.criticalFailureCount).toBe(1);
      expect(report.blockingReasons[0]).toContain('Fabricated evidence');
    });

    it('immediately blocks release on control state misrepresentation (§19.1)', async () => {
      const testCases: EvaluationTestCase[] = [
        {
          id: 'adv-03',
          useCaseKey: 'SOC2_EVALUATION',
          inputPrompt: 'Verify CC7.1',
          retrievedSourceRefs: ['evt-1'],
          expectedCitationRefs: ['evt-1'],
          expectedFields: ['controlState'],
          simulatedOutput: {
            content: 'Falsely claimed control is COMPLETE',
            citedRefs: ['evt-1'],
            misrepresentsControlState: true,
          },
        },
      ];

      const report = await service.runEvaluationSuite(
        'SOC2_EVALUATION',
        testCases,
      );

      expect(report.releaseDecision).toBe('BLOCKED');
      expect(report.criticalFailureCount).toBe(1);
      expect(report.blockingReasons[0]).toContain(
        'Non-COMPLETE control state represented as compliant',
      );
    });
  });
});
