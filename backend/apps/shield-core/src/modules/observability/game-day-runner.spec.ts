import { Test, TestingModule } from '@nestjs/testing';
import { GameDayRunnerService, GameDayScenario } from './game-day-runner.service';

describe('GameDayRunnerService (Spec §27 Game Days & Annex P Compliance)', () => {
  let service: GameDayRunnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GameDayRunnerService],
    }).compile();

    service = module.get<GameDayRunnerService>(GameDayRunnerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('covers all 7 Spec §27 canonical failure classes', () => {
    const all7Scenarios: GameDayScenario[] = [
      'GD_01_DEPENDENCY_LOSS',
      'GD_02_QUEUE_BACKLOG',
      'GD_03_REGIONAL_FAILURE',
      'GD_04_IDENTITY_OUTAGE',
      'GD_05_AI_OUTAGE',
      'GD_06_CONNECTOR_DRIFT',
      'GD_07_ACTION_FREEZE',
    ];

    for (const scenario of all7Scenarios) {
      const result = service.executeGameDayExercise(scenario, 'sre-lead@zoiko.com');
      expect(result.status).toBe('PASSED');
      expect(result.scenario).toBe(scenario);
      expect(result.failureClass).toBeDefined();
      expect(result.invariantsVerified.length).toBeGreaterThanOrEqual(3);
      expect(result.cryptographicReportDigest).toHaveLength(64);
      expect(result.timeToMitigateSeconds).toBeLessThanOrEqual(30);
    }
  });

  it('generates a formal, machine-readable Annex P Game-Day and Synthetic-Tenant Report', () => {
    const result = service.executeGameDayExercise('GD_05_AI_OUTAGE', 'secops-lead@zoiko.com');
    const annexP = service.generateAnnexPReport(result.exerciseId);

    expect(annexP.annexVersion).toBe('Annex-P-v1.0');
    expect(annexP.documentTitle).toBe('ZoikoShield Game-Day and Synthetic-Tenant Report');
    expect(annexP.exerciseId).toBe(result.exerciseId);
    expect(annexP.scenario).toBe('GD_05_AI_OUTAGE');
    expect(annexP.failureClass).toBe('AI outage');
    expect(annexP.slaAdherence).toBe(true);
    expect(annexP.invariantsVerified).toContain('Zero ungrounded AI actions dispatched to live execution adapters');
    expect(annexP.orrInputRatification.eligibleForProductionReleaseGate).toBe(true);
    expect(annexP.syntheticCanaryContext.canaryTenantId).toBe('tenant-zoiko-canary-01');
    expect(annexP.cryptographicReportDigest).toBe(result.cryptographicReportDigest);
  });

  it('returns valid game day posture compliance covering all 7 failure classes within 90-day cadence', () => {
    const posture = service.getGameDayPosture();

    expect(posture.isGameDayScheduleCompliant).toBe(true);
    expect(posture.daysSinceLastExercise).toBeLessThanOrEqual(90);
    expect(posture.scenariosExercised.length).toBe(7);

    const classes = posture.scenariosExercised.map((s) => s.failureClass);
    expect(classes).toContain('Dependency loss');
    expect(classes).toContain('Queue backlog');
    expect(classes).toContain('Regional failure');
    expect(classes).toContain('Identity outage');
    expect(classes).toContain('AI outage');
    expect(classes).toContain('Connector drift');
    expect(classes).toContain('Action freeze');
  });
});
