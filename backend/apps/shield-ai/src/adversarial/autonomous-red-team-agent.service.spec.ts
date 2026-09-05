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

  it('should generate financial SWIFT fraud attack sequence', () => {
    const chain = service.generateAttackSequence(
      'tenant-bank-01',
      'Financial-Swift-Fraud',
      {
        targetHost: 'srv-swift-prod-01',
        targetUser: 'swift-operator@bank.com',
        intensityLevel: 'AGGRESSIVE',
      },
    );

    expect(chain.targetTenantId).toBe('tenant-bank-01');
    expect(chain.scenarioName).toBe('Financial-Swift-Fraud');
    expect(chain.intensityLevel).toBe('AGGRESSIVE');
    expect(chain.steps.map((s) => s.mitreTechnique)).toEqual([
      'T1110.001',
      'T1078',
      'T1021.002',
      'T1567',
    ]);
  });

  it('should generate kubernetes privilege escalation sequence', () => {
    const chain = service.generateAttackSequence(
      'tenant-cloud-01',
      'Kubernetes-Privilege-Escalation',
    );

    expect(chain.steps.map((s) => s.mitreTechnique)).toEqual([
      'T1190',
      'T1059.001',
      'T1003.001',
      'T1048',
    ]);
  });

  it('should execute a synthetic run and return a resilient defense posture scorecard with cryptographic attestation', () => {
    const chain = service.generateAttackSequence('tenant-fintech-1');
    const report = service.executeSyntheticRun(chain);

    expect(report.chainId).toBe(chain.chainId);
    expect(report.stepsExecuted).toBe(4);
    expect(report.stepsDetected).toBe(4);
    expect(report.coveragePercentage).toBe(100);
    expect(report.defensePostureRating).toBe('RESILIENT');
    expect(report.meanDetectionLatencyMs).toBeLessThan(150);
    expect(report.cryptographicAttestationDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(report.stepEvaluations.length).toBe(4);
  });

  it('should execute full chain via executeChain helper', () => {
    const report = service.executeChain({
      tenantId: 'tenant-enterprise-99',
      scenarioName: 'Financial-Swift-Fraud',
      intensityLevel: 'AGGRESSIVE',
    });

    expect(report.targetTenantId).toBe('tenant-enterprise-99');
    expect(report.scenarioName).toBe('Financial-Swift-Fraud');
    expect(report.intensityLevel).toBe('AGGRESSIVE');
    expect(report.stepsDetected).toBe(4);
    expect(report.defensePostureRating).toBe('RESILIENT');
  });
});

