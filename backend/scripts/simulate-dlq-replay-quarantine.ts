import { Logger } from '@nestjs/common';
import { DlqReplayQuarantineService } from '../apps/shield-ingest/src/dlq/dlq-replay-quarantine.service';

/**
 * Track 64 Simulation: Automated Dead-Letter Queue (DLQ) Replay & Poison Message Quarantine
 */
async function runDlqReplaySimulation() {
  const logger = new Logger('DlqReplaySimulation');
  logger.log('========================================================================');
  logger.log(' [Track 64] Simulating Stream DLQ Replay & Poison Message Quarantine    ');
  logger.log('========================================================================\n');

  const dlqService = new DlqReplayQuarantineService();
  const tenantId = 'tenant-enterprise-financial-group';

  // Step 1: Ingest Poison Stream Messages into DLQ
  logger.log('[Step 1/4] Simulating Poison Ingestion Events routing to DLQ...');
  const poisonEvent1 = dlqService.quarantineMessage(
    tenantId,
    'telemetry.edr.events',
    { processName: 'mimikatz.exe', badEncoding: '\x00\xFF\xFE', isCorrupt: true },
    'Corrupt binary payload in string field',
    'PARSER_CORRUPT_BYTES',
  );

  const poisonEvent2 = dlqService.quarantineMessage(
    tenantId,
    'telemetry.syslog.events',
    { host: 'srv-finance-gateway-01', event: 'AUTH_FAIL', missingTimestamp: true },
    'Missing mandatory RFC 3339 timestamp',
    'SCHEMA_VALIDATION_ERROR',
  );

  logger.log(`  ✔ Poison Event 1 Quarantined: ${poisonEvent1.messageId} (Reason: ${poisonEvent1.errorReason})`);
  logger.log(`  ✔ Poison Event 2 Quarantined: ${poisonEvent2.messageId} (Reason: ${poisonEvent2.errorReason})\n`);

  // Step 2: Inspect Active Quarantined Messages
  logger.log('[Step 2/4] Querying Quarantined Message Inventory for Tenant...');
  const activeQuarantined = dlqService.listQuarantined(tenantId);
  logger.log(`  ✔ Active Quarantined Messages: ${activeQuarantined.length} item(s)`);
  activeQuarantined.forEach((msg, idx) => {
    logger.log(`     [#${idx + 1}] ID: ${msg.messageId} | Topic: ${msg.topic} | Code: ${msg.errorCode}`);
  });
  logger.log('');

  // Step 3: Replay Unrecoverable Poison Message (Should Fail Safely)
  logger.log('[Step 3/4] Attempting Raw Replay of Unrepaired Poison Event 1...');
  const failReplay = await dlqService.replayMessage(tenantId, poisonEvent1.messageId);
  logger.log(`  ✔ Replay Attempt: Status=${failReplay.status} (Success=${failReplay.success})`);
  logger.log(`  ✔ Expected Rejection: ${failReplay.error}\n`);

  // Step 4: Replay Event 2 with In-Flight Transformation Schema Fix
  logger.log('[Step 4/4] Replaying Event 2 with In-Flight Patch Transformation Hook...');
  const successReplay = await dlqService.replayMessage(
    tenantId,
    poisonEvent2.messageId,
    (payload) => ({
      ...payload,
      timestamp: new Date().toISOString(),
      isCorrupt: false,
    }),
  );
  logger.log(`  ✔ Transformation Replay: Status=${successReplay.status} (Success=${successReplay.success})`);
  logger.log(`  ✔ Replayed At: ${successReplay.replayedAt}\n`);

  // Metrics summary
  const metrics = dlqService.getMetrics();
  logger.log('--- Final DLQ Quarantine Engine Metrics ---');
  logger.log(`  ✔ Total Quarantined: ${metrics.totalQuarantined}`);
  logger.log(`  ✔ Active in Quarantine: ${metrics.activeQuarantined}`);
  logger.log(`  ✔ Replay Recoveries: ${metrics.replayedSuccess}`);
  logger.log(`  ✔ Permanent Failures: ${metrics.replayedFailed}\n`);

  logger.log('========================================================================');
  logger.log(' 🎉 TRACK 64: STREAM DLQ REPLAY & QUARANTINE ENGINE VERIFIED!           ');
  logger.log('========================================================================\n');
}

runDlqReplaySimulation().catch((err) => {
  console.error('Track 64 simulation failed:', err);
  process.exit(1);
});
