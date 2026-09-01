import { Test, TestingModule } from '@nestjs/testing';
import { AutonomousRedTeamAgentService } from './autonomous-red-team-agent.service';

describe('AutonomousRedTeamAgentService', () => {
  let service: AutonomousRedTeamAgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AutonomousRedTeamAgentService],
    }).compile();

    service = module.get<AutonomousRedTeamAgentService>(
      AutonomousRedTeamAgentService,
    );
  });

  it('should generate a 4-stage synthetic MITRE attack sequence', () => {
    const chain = service.generateAttackSequence('tenant-fintech-1');
    expect(chain.targetTenantId).toBe('tenant-fintech-1');
    expect(chain.steps.length).toBe(4);
    expect(chain.steps.map((s) => s.mitreTechnique)).toEqual([
      'T1190',
      'T1059.006',
      'T1068',
      'T1048',
    ]);
  });

  it('should execute a synthetic run and return a resilient defense posture scorecard', () => {
    const chain = service.generateAttackSequence('tenant-fintech-1');
    const report = service.executeSyntheticRun(chain);

    expect(report.chainId).toBe(chain.chainId);
    expect(report.stepsExecuted).toBe(4);
    expect(report.stepsDetected).toBe(4);
    expect(report.coveragePercentage).toBe(100);
    expect(report.defensePostureRating).toBe('RESILIENT');
    expect(report.meanDetectionLatencyMs).toBeLessThan(150);
  });
});
