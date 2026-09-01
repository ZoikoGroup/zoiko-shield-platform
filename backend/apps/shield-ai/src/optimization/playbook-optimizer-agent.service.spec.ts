import { Test, TestingModule } from '@nestjs/testing';
import {
  PlaybookOptimizerAgentService,
  ActionExecutionMetric,
} from './playbook-optimizer-agent.service';

describe('PlaybookOptimizerAgentService', () => {
  let service: PlaybookOptimizerAgentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlaybookOptimizerAgentService],
    }).compile();

    service = module.get<PlaybookOptimizerAgentService>(PlaybookOptimizerAgentService);
  });

  it('should analyze sequential playbook actions and recommend parallel execution grouping', () => {
    const mockActions: ActionExecutionMetric[] = [
      {
        actionId: 'act-revoke-iam',
        actionType: 'REVOKE_IAM_SESSION',
        dependsOn: [],
        averageDurationMs: 250,
        failureRate: 0.01,
        isIdempotent: true,
      },
      {
        actionId: 'act-block-egress',
        actionType: 'BLOCK_EGRESS_FIREWALL',
        dependsOn: [],
        averageDurationMs: 300,
        failureRate: 0.02,
        isIdempotent: true,
      },
      {
        actionId: 'act-isolate-edr',
        actionType: 'EDR_HOST_ISOLATE',
        dependsOn: [],
        averageDurationMs: 200,
        failureRate: 0.01,
        isIdempotent: true,
      },
      {
        actionId: 'act-notify-soc',
        actionType: 'NOTIFY_SOC_LEAD',
        dependsOn: ['act-revoke-iam', 'act-block-egress'],
        averageDurationMs: 150,
        failureRate: 0.0,
        isIdempotent: true,
      },
    ];

    const report = service.analyzePlaybookDag(
      'PB-RANSOMWARE-AUTO-CONTAIN',
      'tenant-bank-1',
      mockActions,
    );

    expect(report.playbookId).toBe('PB-RANSOMWARE-AUTO-CONTAIN');
    expect(report.originalAverageDurationMs).toBe(900); // 250 + 300 + 200 + 150
    expect(report.predictedMttrReductionPercentage).toBeGreaterThan(30);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations[0].type).toBe('PARALLELIZE_ACTIONS');
    expect(report.optimizedDagStructure[0].parallelActions.length).toBe(3);
  });
});
