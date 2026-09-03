import { Test, TestingModule } from '@nestjs/testing';
import { RedTeamScenarioGeneratorService } from './red-team-scenario-generator.service';

describe('RedTeamScenarioGeneratorService', () => {
  let service: RedTeamScenarioGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedTeamScenarioGeneratorService],
    }).compile();

    service = module.get<RedTeamScenarioGeneratorService>(
      RedTeamScenarioGeneratorService,
    );
  });

  it('should generate multi-stage ransomware staging scenario with OCSF events', () => {
    const scenario = service.generateScenario({
      tenantId: 'tenant-demo-44',
      scenarioType: 'RANSOMWARE_STAGING',
      targetHost: 'srv-db-01',
      targetUser: 'victim.user@acme.corp',
    });

    expect(scenario).toBeDefined();
    expect(scenario.scenarioId).toMatch(/^redteam-/);
    expect(scenario.stages.length).toBe(3);
    expect(scenario.expectedDetectionRules).toContain('ZS-PROC-001');
    expect(scenario.stages[1].simulatedOcsfEvent.eventClass).toBe('PROCESS_ACTIVITY');
    expect(scenario.purpleTeamExerciseDigest).toHaveLength(64);
  });

  it('should generate cloud privilege escalation scenario', () => {
    const scenario = service.generateScenario({
      tenantId: 'tenant-demo-44',
      scenarioType: 'CLOUD_IAM_PRIVILEGE_ESCALATION',
    });

    expect(scenario.stages.length).toBe(2);
    expect(scenario.expectedDetectionRules).toContain('ZS-CLOUD-001');
  });
});
