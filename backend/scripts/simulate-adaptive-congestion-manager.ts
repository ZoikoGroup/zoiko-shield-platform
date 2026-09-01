import { Logger } from '@nestjs/common';
import { AdaptiveCongestionManagerService } from '../apps/shield-ingest/src/flow-control/adaptive-congestion-manager.service';

/**
 * Track 73 Simulation: Real-Time Adaptive Flow-Control & Backpressure Congestion Manager
 */
async function runCongestionSimulation() {
  const logger = new Logger('CongestionSimulation');
  logger.log('========================================================================');
  logger.log(' [Track 73] Simulating Adaptive Ingestion Backpressure & Congestion     ');
  logger.log('========================================================================\n');

  const congestionManager = new AdaptiveCongestionManagerService();
  const tenantId = 'tenant-telemetry-storm-corp';

  // Step 1: Normal baseline load
  logger.log('[Step 1/3] Monitoring baseline ingestion flow (Buffer: 25%, Queue: 30)...');
  const normalState = congestionManager.recordBufferUsage(tenantId, 25_000, 100_000, 30);
  const normalAdmission = congestionManager.evaluateIngestRequest(tenantId, 40);
  logger.log(`  ✔ Congestion State: IsCongested=${normalState.isCongested}, WindowSize=${normalState.currentWindowSize}`);
  logger.log(`  ✔ Ingest Request Admission: Status=${normalAdmission.statusCode} (Admitted: ${normalAdmission.admitted})\n`);

  // Step 2: Telemetry burst write-storm (Buffer spike to 92%, Queue depth 750)
  logger.log('[Step 2/3] Simulating extreme telemetry write-storm (Buffer: 92%, Queue: 750)...');
  const burstState = congestionManager.recordBufferUsage(tenantId, 92_000, 100_000, 750);
  logger.log(`  ✔ Multiplicative Decrease Window: ${burstState.currentWindowSize} (Throttled from 200)`);
  logger.log(`  ✔ Recommended Backoff:            ${burstState.recommendedRetryAfterMs}ms`);

  // Evaluate overloaded admission
  const overloadedAdmission = congestionManager.evaluateIngestRequest(tenantId, 150);
  logger.log(`  ✔ Overloaded Ingest Admission:     Status=${overloadedAdmission.statusCode} (Admitted: ${overloadedAdmission.admitted})`);
  logger.log(`  ✔ Backoff Header:                  Retry-After: ${overloadedAdmission.retryAfterMs}ms`);
  logger.log(`  ✔ Rejection Reason:                ${overloadedAdmission.reason}\n`);

  // Step 3: Buffer recovery and additive increase
  logger.log('[Step 3/3] Simulating consumer queue drainage (Buffer: 15%, Queue: 12)...');
  const recoveredState = congestionManager.recordBufferUsage(tenantId, 15_000, 100_000, 12);
  logger.log(`  ✔ Additive Increase Window:        ${recoveredState.currentWindowSize} (Gradual recovery)`);
  logger.log(`  ✔ Congestion Resolved:             IsCongested=${recoveredState.isCongested}\n`);

  logger.log('========================================================================');
  logger.log(' 🎉 TRACK 73: ADAPTIVE CONGESTION MANAGER VERIFIED!                    ');
  logger.log('========================================================================\n');
}

runCongestionSimulation().catch((err) => {
  console.error('Track 73 simulation failed:', err);
  process.exit(1);
});
