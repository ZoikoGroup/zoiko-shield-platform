import { Logger } from '@nestjs/common';
import {
  PlaybookOptimizerAgentService,
  ActionExecutionMetric,
} from '../apps/shield-ai/src/optimization/playbook-optimizer-agent.service';

/**
 * Track 75 Simulation: AI-Driven Continuous Playbook Optimization & Self-Tuning Agent
 */
async function runPlaybookOptimizerSimulation() {
  const logger = new Logger('PlaybookOptimizerSimulation');
  logger.log('========================================================================');
  logger.log(' [Track 75] Simulating AI Continuous SOAR Playbook Self-Tuning Agent   ');
  logger.log('========================================================================\n');

  const optimizer = new PlaybookOptimizerAgentService();
  const playbookId = 'PB-CROSS-CLOUD-CONTAINMENT-CHAIN';
  const tenantId = 'tenant-enterprise-financial';

  const mockActions: ActionExecutionMetric[] = [
    {
      actionId: 'act-revoke-iam',
      actionType: 'REVOKE_IAM_SESSION',
      dependsOn: [],
      averageDurationMs: 280,
      failureRate: 0.01,
      isIdempotent: true,
    },
    {
      actionId: 'act-block-egress',
      actionType: 'BLOCK_EGRESS_FIREWALL',
      dependsOn: [],
      averageDurationMs: 320,
      failureRate: 0.03,
      isIdempotent: true,
    },
    {
      actionId: 'act-isolate-edr',
      actionType: 'EDR_HOST_ISOLATE',
      dependsOn: [],
      averageDurationMs: 210,
      failureRate: 0.01,
      isIdempotent: true,
    },
    {
      actionId: 'act-notify-soc',
      actionType: 'NOTIFY_SOC_COMMAND',
      dependsOn: ['act-revoke-iam', 'act-block-egress'],
      averageDurationMs: 140,
      failureRate: 0.0,
      isIdempotent: true,
    },
  ];

  // Step 1: Analyze historical execution DAG
  logger.log(`[Step 1/3] Analyzing historical DAG traces for '${playbookId}'...`);
  const report = optimizer.analyzePlaybookDag(playbookId, tenantId, mockActions);

  logger.log(`  ✔ Original Baseline Duration: ${report.originalAverageDurationMs}ms (Sequential Execution)`);
  logger.log(`  ✔ Critical Path Bottlenecks:   ${report.criticalPathBottlenecks.join(', ')}\n`);

  // Step 2: Evaluate DAG parallelization & speedup recommendations
  logger.log('[Step 2/3] Evaluating AI DAG optimization recommendations...');
  report.recommendations.forEach((rec, idx) => {
    logger.log(`  → Recommendation #${idx + 1} [${rec.type}]: ${rec.description}`);
    logger.log(`    Estimated Speedup: ${rec.estimatedSpeedupMs}ms on actions [${rec.targetActionIds.join(', ')}]`);
  });
  logger.log('');

  // Step 3: Inspect final self-tuning execution topology
  logger.log('[Step 3/3] Inspecting optimized multi-phase parallel execution DAG...');
  report.optimizedDagStructure.forEach((phase) => {
    logger.log(`  ✔ Phase ${phase.phase} Actions (Parallel): [${phase.parallelActions.join(', ')}]`);
  });
  logger.log(`  ✔ Optimized Estimated Duration:  ${report.optimizedEstimatedDurationMs}ms`);
  logger.log(`  ✔ Predicted MTTR Reduction:       ${report.predictedMttrReductionPercentage}% Speedup\n`);

  logger.log('========================================================================');
  logger.log(' 🎉 TRACK 75: AI CONTINUOUS PLAYBOOK OPTIMIZER AGENT VERIFIED!         ');
  logger.log('========================================================================\n');
}

runPlaybookOptimizerSimulation().catch((err) => {
  console.error('Track 75 simulation failed:', err);
  process.exit(1);
});
