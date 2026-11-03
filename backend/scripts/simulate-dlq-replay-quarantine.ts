import { Logger } from '@nestjs/common';
import { DlqReplayQuarantineService } from '../apps/shield-ingest/src/dlq/dlq-replay-quarantine.service';
import { PrismaService } from '../apps/shield-ingest/src/prisma/prisma.service';
import { KafkaProducerService } from '../apps/shield-ingest/src/kafka/kafka.producer.service';

/**
 * Track 64: Dead-Letter Queue replay & poison message quarantine against the
 * real stack. Requires DATABASE_URL (ingest.DlqMessage migrated) and a
 * reachable Kafka broker.
 */
async function runDlqReplaySimulation() {
  const logger = new Logger('DlqReplaySimulation');
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required: DLQ state is persisted in ingest.DlqMessage.');
  }

  const prisma = new PrismaService();
  const kafka = new KafkaProducerService();
  await prisma.$connect();
  await kafka.onModuleInit();
  const dlqService = new DlqReplayQuarantineService(prisma, kafka);
  const tenantId = 'tenant-enterprise-financial-group';

  try {
    logger.log('[Step 1/4] Quarantining poison messages...');
    const corrupt = await dlqService.quarantineMessage(
      tenantId,
      'telemetry.edr.events',
      { processName: 'mimikatz.exe', isCorrupt: true },
      'Corrupt binary payload in string field',
      'PARSER_CORRUPT_BYTES',
      3,
      { kind: 'KAFKA', kafka: { topic: 'telemetry.edr.events' } },
    );
    const missingTs = await dlqService.quarantineMessage(
      tenantId,
      'telemetry.syslog.events',
      { host: 'srv-finance-gateway-01', event: 'AUTH_FAIL', missingTimestamp: true },
      'Missing mandatory RFC 3339 timestamp',
      'SCHEMA_VALIDATION_ERROR',
      3,
      { kind: 'KAFKA', kafka: { topic: 'telemetry.syslog.events' } },
    );
    logger.log(`  ✔ Quarantined ${corrupt.messageId} and ${missingTs.messageId}`);

    logger.log('[Step 2/4] Listing quarantined messages...');
    const active = await dlqService.listQuarantined(tenantId);
    active.forEach((msg) =>
      logger.log(`  ✔ ${msg.messageId} | ${msg.topic} | ${msg.errorCode}`),
    );

    logger.log('[Step 3/4] Replaying the repairable message back to Kafka...');
    const replay = await dlqService.replayMessage(tenantId, missingTs.messageId, (payload) => ({
      ...payload,
      timestamp: new Date().toISOString(),
      missingTimestamp: false,
    }));
    logger.log(`  ✔ Replay status=${replay.status} success=${replay.success}${replay.error ? ` error=${replay.error}` : ''}`);

    logger.log('[Step 4/4] Purging the unrecoverable message (kept as an auditable PURGED row)...');
    const purged = await dlqService.purgeQuarantined(tenantId, corrupt.messageId);
    logger.log(`  ✔ Purged=${purged}`);

    const metrics = await dlqService.getMetrics(tenantId);
    logger.log(
      `  ✔ Metrics total=${metrics.totalQuarantined} active=${metrics.activeQuarantined} recovered=${metrics.replayedSuccess} failed=${metrics.replayedFailed}`,
    );
    if (!replay.success) process.exitCode = 1;
  } finally {
    await kafka.onModuleDestroy();
    await prisma.$disconnect();
  }
}

runDlqReplaySimulation().catch((err) => {
  console.error('Track 64 simulation failed:', err);
  process.exit(1);
});
