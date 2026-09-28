import { Test, TestingModule } from '@nestjs/testing';
import { AutonomousRedTeamAgentService } from './autonomous-red-team-agent.service';
import { PlaybookOptimizerAgentService } from '../optimization/playbook-optimizer-agent.service';
import { TierAWindowedDetectorService } from '../../../shield-ingest/src/detection/tier-a/tier-a-windowed-detector.service';

describe('AutonomousRedTeamAgentService & PlaybookOptimizerAgentService (LAB 23 Adversarial Chaos & Optimization)', () => {
  let redTeamAgent: AutonomousRedTeamAgentService;
  let playbookOptimizer: PlaybookOptimizerAgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutonomousRedTeamAgentService,
        PlaybookOptimizerAgentService,
        TierAWindowedDetectorService,
      ],
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

    it('should execute synthetic dry-run against the real Tier-A detector, calculate MTTD, posture rating, and cryptographic attestation digest', () => {
      // Financial-Swift-Fraud's 4 built-in steps each contain their
      // technique's real detection marker (hydra/rockyou, sudo -u *_admin,
      // smbclient, rclone sync), so the real detector genuinely matches all 4
      // — this is no longer true by construction of a hardcoded `true`.
      const report = redTeamAgent.executeChain({
        tenantId: 'tenant-bank-01',
        scenarioName: 'Financial-Swift-Fraud',
        intensityLevel: 'MEDIUM',
      });

      expect(report.stepsExecuted).toBe(4);
      expect(report.stepsDetected).toBe(4);
      expect(report.coveragePercentage).toBe(100);
      expect(report.defensePostureRating).toBe('RESILIENT');
      expect(report.cryptographicAttestationDigest).toHaveLength(64);
    });

    it('should report genuine detection gaps for steps whose payload matches no real detection rule (proof the posture can fail)', () => {
      const chain = redTeamAgent.generateAttackSequence(
        'tenant-gap-test',
        'Kubernetes-Privilege-Escalation',
        { intensityLevel: 'LOW' },
      );
      // Replace the payloads with content that contains no technique marker
      // at all — a real, undetected novel variant.
      const blindedChain = {
        ...chain,
        steps: chain.steps.map((step) => ({
          ...step,
          syntheticPayload: 'echo "totally benign, no markers here"',
        })),
      };

      const report = redTeamAgent.executeSyntheticRun(blindedChain);

      expect(report.stepsDetected).toBe(0);
      expect(report.stepsDetected).toBeLessThan(report.stepsExecuted);
      expect(report.coveragePercentage).toBe(0);
      expect(report.defensePostureRating).toBe('VULNERABLE');
      expect(report.stepEvaluations.every((e) => e.detected === false)).toBe(
        true,
      );
      expect(
        report.stepEvaluations.every((e) => e.ruleMatched === undefined),
      ).toBe(true);
    });

    it('should detect exactly the steps whose payload matches their technique marker, in a mixed chain', () => {
      const chain = redTeamAgent.generateAttackSequence(
        'tenant-mixed-test',
        'Kubernetes-Privilege-Escalation',
        { intensityLevel: 'LOW' },
      );
      // Blind only the first step; leave the rest as real, matching payloads.
      const mixedChain = {
        ...chain,
        steps: chain.steps.map((step, i) =>
          i === 0 ? { ...step, syntheticPayload: 'echo "no marker"' } : step,
        ),
      };

      const report = redTeamAgent.executeSyntheticRun(mixedChain);

      expect(report.stepEvaluations[0].detected).toBe(false);
      expect(
        report.stepEvaluations.slice(1).every((e) => e.detected === true),
      ).toBe(true);
      expect(report.stepsDetected).toBe(mixedChain.steps.length - 1);
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
