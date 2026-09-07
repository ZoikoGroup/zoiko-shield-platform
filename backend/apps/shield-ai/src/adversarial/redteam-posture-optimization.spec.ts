import { Test, TestingModule } from '@nestjs/testing';
import { AutonomousRedTeamAgentService } from './autonomous-red-team-agent.service';
import { PlaybookOptimizerAgentService } from '../optimization/playbook-optimizer-agent.service';

describe('AutonomousRedTeamAgentService & PlaybookOptimizerAgentService (LAB 23 Adversarial Chaos & Optimization)', () => {
  let redTeamAgent: AutonomousRedTeamAgentService;
  let playbookOptimizer: PlaybookOptimizerAgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AutonomousRedTeamAgentService, PlaybookOptimizerAgentService],
    }).compile();

    redTeamAgent = module.get<AutonomousRedTeamAgentService>(
      AutonomousRedTeamAgentService,
    );
    playbookOptimizer = module.get<PlaybookOptimizerAgentService>(
      PlaybookOptimizerAgentService,
    );
  });

  describe('Autonomous Red Team Attack Simulation', () => {
    it('should generate multi-stage MITRE ATT&CK chain for Cloud-Ransomware scenario', () => {
      const tenantId = 'tenant-enterprise-sec';
      const chain = redTeamAgent.generateAttackSequence(
        tenantId,
        'Cloud-Ransomware-Exfil',
        {
          intensityLevel: 'AGGRESSIVE',
        },
      );

      expect(chain.chainId).toBeDefined();
      expect(chain.steps.length).toBe(4);
      expect(chain.steps[0].mitreTechnique).toBe('T1190');
      expect(chain.steps[1].mitreTechnique).toBe('T1059.006');
      expect(chain.steps[2].mitreTechnique).toBe('T1068');
      expect(chain.steps[3].mitreTechnique).toBe('T1048');
    });

    it('should execute synthetic dry-run, calculate MTTD, posture rating, and cryptographic attestation digest', () => {
      const report = redTeamAgent.executeChain({
        tenantId: 'tenant-bank-01',
        scenarioName: 'Financial-Swift-Fraud',
        intensityLevel: 'MEDIUM',
      });

      expect(report.stepsExecuted).toBe(4);
      expect(report.stepsDetected).toBe(4);
      expect(report.coveragePercentage).toBe(100);
      expect(report.defensePostureRating).toBe('RESILIENT');
      expect(report.meanDetectionLatencyMs).toBeLessThan(150);
      expect(report.cryptographicAttestationDigest).toHaveLength(64);
    });
  });

  describe('Playbook Optimization & Self-Tuning Agent', () => {
    it('should analyze SOAR execution trace, identify parallelizable actions, and reduce predicted MTTR', () => {
      const tenantId = 'tenant-bank-01';
      const playbookId = 'PB-CONTAIN-COMPROMISED-ACCOUNT';

      const actions = [
        {
          actionId: 'act-1',
          actionType: 'REVOKE_IAM_SESSIONS',
          dependsOn: [],
          averageDurationMs: 300,
          failureRate: 0.01,
          isIdempotent: true,
        },
        {
          actionId: 'act-2',
          actionType: 'ISOLATE_HOST_FIREWALL',
          dependsOn: [],
          averageDurationMs: 450,
          failureRate: 0.02,
          isIdempotent: true,
        },
        {
          actionId: 'act-3',
          actionType: 'NOTIFY_SOC_LEAD_SLACK',
          dependsOn: ['act-1', 'act-2'],
          averageDurationMs: 150,
          failureRate: 0.0,
          isIdempotent: true,
        },
      ];

      const report = playbookOptimizer.analyzePlaybookDag(
        playbookId,
        tenantId,
        actions,
      );

      expect(report.originalAverageDurationMs).toBe(900); // 300 + 450 + 150
      expect(report.optimizedEstimatedDurationMs).toBe(600); // max(300, 450) + 150
      expect(report.predictedMttrReductionPercentage).toBeGreaterThan(30);
      expect(report.recommendations.length).toBeGreaterThanOrEqual(1);
      expect(report.recommendations[0].type).toBe('PARALLELIZE_ACTIONS');
      expect(report.optimizedDagStructure).toHaveLength(2); // Phase 1 (parallel) -> Phase 2 (dependent)
    });
  });
});
