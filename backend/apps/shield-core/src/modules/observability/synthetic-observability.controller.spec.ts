import { SyntheticObservabilityController } from './synthetic-observability.controller';
import { SyntheticJourneyService } from './synthetic-journey.service';
import { GameDayRunnerService } from './game-day-runner.service';

describe('SyntheticObservabilityController (Spec §27 API)', () => {
  let controller: SyntheticObservabilityController;
  let syntheticService: SyntheticJourneyService;
  let gameDayService: GameDayRunnerService;

  beforeEach(() => {
    syntheticService = new SyntheticJourneyService();
    gameDayService = new GameDayRunnerService();
    controller = new SyntheticObservabilityController(syntheticService, gameDayService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET status returns canary posture and game day posture', () => {
    const res = controller.getSyntheticStatus('tenant-zoiko-canary-01');

    expect(res).toBeDefined();
    expect(res.canaryPosture.canaryTenantId).toBe('tenant-zoiko-canary-01');
    expect(res.gameDayPosture.isGameDayScheduleCompliant).toBe(true);
  });

  it('POST probe triggers on-demand synthetic journey', () => {
    const res = controller.triggerSyntheticProbe({ canaryTenantId: 'tenant-zoiko-canary-01', region: 'eu-west-1' });

    expect(res).toBeDefined();
    expect(res.status).toBe('HEALTHY');
    expect(res.stagesPassed).toBe(6);
  });

  it('POST gameday/execute triggers specified game day exercise', () => {
    const res = controller.triggerGameDayExercise({
      scenario: 'GD_01_DEPENDENCY_LOSS',
      exercisedBy: 'soc-lead@zoiko.com',
    });

    expect(res).toBeDefined();
    expect(res.status).toBe('PASSED');
    expect(res.scenario).toBe('GD_01_DEPENDENCY_LOSS');
  });

  it('GET gameday/annex-p/:exerciseId returns formal Annex P report', () => {
    const triggered = controller.triggerGameDayExercise({
      scenario: 'GD_03_REGIONAL_FAILURE',
      exercisedBy: 'sre-lead@zoiko.com',
    });

    const report = controller.getAnnexPReport(triggered.exerciseId);
    expect(report.annexVersion).toBe('Annex-P-v1.0');
    expect(report.scenario).toBe('GD_03_REGIONAL_FAILURE');
    expect(report.failureClass).toBe('Regional failure');
    expect(report.orrInputRatification.eligibleForProductionReleaseGate).toBe(true);
  });
});
