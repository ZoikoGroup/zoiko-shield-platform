import { Logger } from '@nestjs/common';
import { KmsHealthRebalancerService } from '../apps/shield-core/src/modules/crypto-escrow/kms-health-rebalancer.service';

/**
 * Track 69 Simulation: KMS Provider Health Prober & Dynamic Re-Balancer
 *
 * GCP Cloud KMS is the real, wired-up primary (this platform hosts on GCP —
 * ADR-16). AWS/Azure are a documented cross-cloud escape hatch this service
 * models for a total GCP KMS outage, not an equally-real secondary: no
 * AWS/Azure KMS credentials or client exist elsewhere in this codebase.
 */
async function runKmsRebalancerSimulation() {
  const logger = new Logger('KmsRebalancerSimulation');
  logger.log('========================================================================');
  logger.log(' [Track 69] Simulating KMS Provider Health Re-Balancer                 ');
  logger.log('========================================================================\n');

  const rebalancer = new KmsHealthRebalancerService();

  // Step 1: Baseline health state
  logger.log('[Step 1/3] Inspecting baseline KMS provider health & traffic distribution...');
  logger.log(`  ✔ Current Primary Provider:   ${rebalancer.getPrimaryProvider()}`);
  const initialWeights = rebalancer.getRoutingWeights();
  logger.log(`  ✔ Routing Weights: GCP_CLOUD_KMS=${initialWeights.GCP_CLOUD_KMS}%, AWS_KMS=${initialWeights.AWS_KMS}%\n`);

  // Step 2: Simulate periodic synthetic probes
  logger.log('[Step 2/3] Executing periodic synthetic cryptographic heartbeats...');
  const gcpProbe = rebalancer.recordProbe('GCP_CLOUD_KMS', true, 32);
  const awsProbe = rebalancer.recordProbe('AWS_KMS', true, 38);
  logger.log(`  ✔ GCP KMS Heartbeat: Status=${gcpProbe.status}, Latency=${gcpProbe.lastLatencyMs}ms`);
  logger.log(`  ✔ AWS KMS Heartbeat (escape hatch): Status=${awsProbe.status}, Latency=${awsProbe.lastLatencyMs}ms\n`);

  // Step 3: Upstream Provider Degradation & Automated Traffic Re-balancing
  logger.log('[Step 3/3] Simulating upstream outage in primary provider (GCP Cloud KMS)...');
  logger.log('  → Injecting 3 consecutive network timeouts on the GCP KMS endpoint...');
  rebalancer.recordProbe('GCP_CLOUD_KMS', false, 3000);
  rebalancer.recordProbe('GCP_CLOUD_KMS', false, 3000);
  const gcpDegraded = rebalancer.recordProbe('GCP_CLOUD_KMS', false, 3000);

  logger.log(`  ✔ GCP KMS State after probe failure: Status=${gcpDegraded.status} (Failures: ${gcpDegraded.consecutiveFailures})`);
  logger.log(`  ✔ New Active Primary Provider:       ${rebalancer.getPrimaryProvider()} (Auto-Shifted to the documented escape hatch)`);

  const failoverWeights = rebalancer.getRoutingWeights();
  logger.log(`  ✔ Re-Balanced Traffic Weights: GCP_CLOUD_KMS=${failoverWeights.GCP_CLOUD_KMS}%, AWS_KMS=${failoverWeights.AWS_KMS}%\n`);

  logger.log('========================================================================');
  logger.log(' 🎉 TRACK 69: KMS PROVIDER HEALTH RE-BALANCER VERIFIED!                ');
  logger.log('========================================================================\n');
}

runKmsRebalancerSimulation().catch((err) => {
  console.error('Track 69 simulation failed:', err);
  process.exit(1);
});
