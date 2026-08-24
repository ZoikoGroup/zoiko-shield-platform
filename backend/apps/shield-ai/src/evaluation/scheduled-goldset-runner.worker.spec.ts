import { Test, TestingModule } from '@nestjs/testing';
import { ScheduledGoldsetRunnerWorker } from './scheduled-goldset-runner.worker';
import { EvaluationRunnerService } from './evaluation-runner.service';
import { AiKillSwitchService } from '../kill-switch/ai-kill-switch.service';
import { SafeDegradationService } from '../degradation/safe-degradation.service';

describe('ScheduledGoldsetRunnerWorker (ZS-ENG-AI-001 §19-20 AI Regression Runner)', () => {
  let worker: ScheduledGoldsetRunnerWorker;
  let evaluationRunnerMock: any;
  let killSwitchMock: any;
  let degradationMock: any;

  beforeEach(async () => {
    evaluationRunnerMock = {
      runEvaluationSuite: jest.fn(),
    };
    killSwitchMock = {
      activateKillSwitch: jest.fn(),
    };
    degradationMock = {
      resolveOperatingMode: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledGoldsetRunnerWorker,
        { provide: EvaluationRunnerService, useValue: evaluationRunnerMock },
        { provide: AiKillSwitchService, useValue: killSwitchMock },
        { provide: SafeDegradationService, useValue: degradationMock },
      ],
    }).compile();

    worker = module.get<ScheduledGoldsetRunnerWorker>(ScheduledGoldsetRunnerWorker);
  });

  it('completes clean evaluation run without triggering kill switches when all test cases pass', async () => {
    evaluationRunnerMock.runEvaluationSuite.mockResolvedValue({
      suiteKey: 'ALL_ACTIVE_ROUTES',
      evaluatedAt: new Date(),
      totalTestCases: 2,
      passedCount: 2,
      criticalFailureCount: 0,
      meanGroundingScore: 0.95,
      meanCitationPrecision: 1.0,
      releaseDecision: 'APPROVED',
      blockingReasons: [],
    });

    const report = await worker.executeScheduledEvaluation();

    expect(report.releaseDecision).toBe('APPROVED');
    expect(killSwitchMock.activateKillSwitch).not.toHaveBeenCalled();
    expect(degradationMock.resolveOperatingMode).not.toHaveBeenCalled();
  });

  it('autonomously activates AI kill switch and drops to deterministic fallback when zero-tolerance failure occurs', async () => {
    evaluationRunnerMock.runEvaluationSuite.mockResolvedValue({
      suiteKey: 'ALL_ACTIVE_ROUTES',
      evaluatedAt: new Date(),
      totalTestCases: 2,
      passedCount: 1,
      criticalFailureCount: 1,
      meanGroundingScore: 0.4,
      meanCitationPrecision: 0.5,
      releaseDecision: 'BLOCKED',
      blockingReasons: ['Cross-tenant disclosure detected: leaked customer PII'],
    });

    const report = await worker.executeScheduledEvaluation();

    expect(report.releaseDecision).toBe('BLOCKED');
    expect(killSwitchMock.activateKillSwitch).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'GLOBAL',
        targetId: '*',
        activatedBy: 'SCHEDULED_GOLDSET_RUNNER_AUTONOMOUS',
      }),
    );
    expect(degradationMock.resolveOperatingMode).toHaveBeenCalledWith(
      'MODEL_UNAVAILABLE',
      'Automated evaluation failure',
    );
  });
});
