import { BatchMerkleCheckpointerService, EvidenceLeaf } from '../../../shield-anchor/src/merkle/batch-merkle-checkpointer.service';
import { StreamDeduplicationService } from '../../../shield-ingest/src/deduplication/stream-deduplication.service';

describe('Checkpoint 9 - Restore Reconciliation Integration Suite (IC-08)', () => {
  let checkpointer: BatchMerkleCheckpointerService;
  let deduplicator: StreamDeduplicationService;

  const TENANT_ID = '11111111-1111-4000-8000-000000000001';

  beforeEach(() => {
    checkpointer = new BatchMerkleCheckpointerService();
    deduplicator = new StreamDeduplicationService();
  });

  describe('1. Cold-Start Manifest Replay & Merkle Root Reconciliation', () => {
    it('should reconstruct identical Merkle root from backed-up outbox event sequence', () => {
      const originalEvents: EvidenceLeaf[] = [
        {
          evidenceId: 'ev-replay-001',
          tenantId: TENANT_ID,
          eventType: 'USER_LOGIN',
          payloadDigest: 'sha256_login_event_digest_001',
          timestamp: '2026-09-16T10:00:00.000Z',
        },
        {
          evidenceId: 'ev-replay-002',
          tenantId: TENANT_ID,
          eventType: 'S3_BUCKET_ENCRYPTED',
          payloadDigest: 'sha256_s3_encryption_event_digest_002',
          timestamp: '2026-09-16T10:05:00.000Z',
        },
        {
          evidenceId: 'ev-replay-003',
          tenantId: TENANT_ID,
          eventType: 'FIREWALL_RULE_UPDATED',
          payloadDigest: 'sha256_firewall_rule_digest_003',
          timestamp: '2026-09-16T10:10:00.000Z',
        },
      ];

      // Step 1: Compute primary checkpoint
      const primaryCheckpoint = checkpointer.buildEpochCheckpoint(originalEvents);

      // Step 2: Simulate complete database restore and replaying outbox manifest
      const restoredCheckpointer = new BatchMerkleCheckpointerService();
      const restoredCheckpoint = restoredCheckpointer.buildEpochCheckpoint(originalEvents);

      expect(restoredCheckpoint.merkleRoot).toBe(primaryCheckpoint.merkleRoot);
      expect(restoredCheckpoint.leafCount).toBe(primaryCheckpoint.leafCount);

      // Step 3: Verify inclusion proofs on restored instance match primary
      const primaryProof = checkpointer.generateInclusionProof(primaryCheckpoint.epochNumber, 1);
      const restoredProof = restoredCheckpointer.generateInclusionProof(restoredCheckpoint.epochNumber, 1);

      expect(restoredProof.leafHash).toBe(primaryProof.leafHash);
      expect(restoredCheckpointer.verifyInclusionProof(primaryProof)).toBe(true);
    });
  });

  describe('2. Idempotent Telemetry Re-Ingestion During Disaster Recovery', () => {
    it('should discard duplicate re-injected telemetry events using stream deduplication', () => {
      const replayEvent = {
        eventId: 'evt-disaster-recovery-99',
        srcIp: '192.168.1.100',
        action: 'ALLOW',
      };

      // First ingestion attempt
      const result1 = deduplicator.checkAndRegister(TENANT_ID, 'INGEST_FIREWALL', replayEvent);
      expect(result1.isDuplicate).toBe(false);

      // Duplicate re-injected replay attempt during restore
      const result2 = deduplicator.checkAndRegister(TENANT_ID, 'INGEST_FIREWALL', replayEvent);
      expect(result2.isDuplicate).toBe(true);

      const metrics = deduplicator.getMetrics();
      expect(metrics.totalEvaluated).toBe(2);
      expect(metrics.uniqueIngested).toBe(1);
      expect(metrics.duplicatesDiscarded).toBe(1);
    });
  });
});
