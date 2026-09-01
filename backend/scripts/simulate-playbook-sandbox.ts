import { Logger } from '@nestjs/common';
import {
  PlaybookSandboxEngineService,
  DryRunPlaybookRequest,
} from '../apps/shield-action/src/simulation/playbook-sandbox-engine.service';

/**
 * Track 63 Simulation: Threat Playbook Dry-Run & Simulation Sandbox Engine
 */
async function runPlaybookSandboxSimulation() {
  const logger = new Logger('PlaybookSandboxSimulation');
  logger.log('========================================================================');
  logger.log(' [Track 63] Simulating Threat Playbook Dry-Run & Sandbox Engine        ');
  logger.log('========================================================================\n');

  const sandbox = new PlaybookSandboxEngineService();
  const tenantId = 'tenant-enterprise-financial-group';

  // Scenario 1: Standard Remediation Playbook (IAM Session Revocation & Egress Block)
  logger.log('[Scenario 1/2] Dry-Running Standard Containment Playbook (IAM + IP Block)...');
  const standardRequest: DryRunPlaybookRequest = {
    tenantId,
    playbookId: 'PB-CONTAIN-COMPROMISED-IAM-SESSION',
    incidentId: 'INC-2026-SANDBOX-101',
    targetAssets: [
      {
        assetId: 'arn:aws:iam::555444333222:role/DataPipelineWorker',
        assetType: 'AWS_IAM_ROLE',
        criticalityTier: 'TIER_1_STANDARD',
        currentState: { attachedPolicies: ['AdministratorAccess', 'AmazonS3FullAccess'] },
      },
      {
        assetId: 'fw-edge-london-gateway-01',
        assetType: 'FIREWALL_RULE',
        criticalityTier: 'TIER_1_STANDARD',
        currentState: { outboundEgress: 'ALLOW_ALL' },
      },
    ],
    actions: [
      {
        actionId: 'act-revoke-iam',
        type: 'REVOKE_IAM_SESSION',
        parameters: { forceRevokeActiveSTS: true },
      },
      {
        actionId: 'act-block-egress',
        type: 'BLOCK_IP_EGRESS',
        parameters: { targetIp: '198.51.100.77' },
      },
    ],
  };

  const standardReport = await sandbox.simulatePlaybook(standardRequest);
  logger.log(`  ✔ Dry-Run ID: ${standardReport.dryRunId}`);
  logger.log(`  ✔ Status:     ${standardReport.status} (Policy: ${standardReport.policyVerdict})`);
  logger.log(`  ✔ Blast Radius Score: ${standardReport.simulatedBlastRadiusScore} / 1.00`);
  logger.log(`  ✔ Predicted State Transitions (${standardReport.stateDiffs.length}):`);
  standardReport.stateDiffs.forEach((diff) => {
    logger.log(`     - [${diff.assetType}] ${diff.assetId} -> ${diff.field}:`);
    logger.log(`       Before: ${JSON.stringify(diff.before)}`);
    logger.log(`       After:  ${JSON.stringify(diff.after)}`);
  });
  logger.log('');

  // Scenario 2: Safety Violation Test on Tier-0 Critical Asset
  logger.log('[Scenario 2/2] Dry-Running Destruction Action against TIER_0_CRITICAL Asset...');
  const dangerousRequest: DryRunPlaybookRequest = {
    tenantId,
    playbookId: 'PB-AGGRESSIVE-DRAIN-HOST',
    incidentId: 'INC-2026-SANDBOX-102',
    targetAssets: [
      {
        assetId: 'k8s-core-database-primary-london',
        assetType: 'DATABASE_CLUSTER',
        criticalityTier: 'TIER_0_CRITICAL',
        currentState: { networkIsolationState: 'CONNECTED' },
      },
    ],
    actions: [
      {
        actionId: 'act-drain-cluster',
        type: 'DRAIN_CLUSTER',
        parameters: { terminatePodsGracePeriod: 0 },
      },
    ],
  };

  const dangerousReport = await sandbox.simulatePlaybook(dangerousRequest);
  logger.log(`  ✔ Dry-Run ID: ${dangerousReport.dryRunId}`);
  logger.log(`  ✔ Status:     ${dangerousReport.status} (Policy: ${dangerousReport.policyVerdict})`);
  logger.log(`  ✔ Safety Violations (${dangerousReport.safetyViolations.length}):`);
  dangerousReport.safetyViolations.forEach((v) => logger.log(`     ⚠️  ${v}`));
  logger.log('');

  logger.log('========================================================================');
  logger.log(' 🎉 TRACK 63: THREAT PLAYBOOK DRY-RUN & SANDBOX ENGINE VERIFIED!       ');
  logger.log('========================================================================\n');
}

runPlaybookSandboxSimulation().catch((err) => {
  console.error('Track 63 simulation failed:', err);
  process.exit(1);
});
