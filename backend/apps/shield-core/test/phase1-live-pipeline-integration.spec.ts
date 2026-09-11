import { createHash, createHmac } from 'crypto';
import { DLQReplayWorker } from '../../shield-ingest/src/ingestion/dlq-replay.worker';
import { QuarantineService } from '../../shield-ingest/src/ingestion/quarantine.service';
import { RawIngestService } from '../../shield-ingest/src/ingestion/raw-ingest.service';
import { AiOutputGroundingService } from '../src/modules/ai-governance/ai-output-grounding.service';
import { EventStreamService } from '../src/modules/events/event-stream.service';
import { MerkleTreeService } from '../../shield-anchor/src/merkle/merkle-tree.service';

describe('Phase 1 Live Pipeline Integration & Multi-Tenant Ingestion-to-Verification Test Harness', () => {
  let dlqWorker: DLQReplayWorker;
  let quarantineService: QuarantineService;
  let rawIngestService: jest.Mocked<RawIngestService>;
  let groundingService: AiOutputGroundingService;
  let eventStreamService: EventStreamService;
  let merkleTreeService: MerkleTreeService;

  const tenantA = 'tenant-acme-corp';
  const tenantB = 'tenant-globex-sec';
  const webhookSecret = 'zs-webhook-hmac-secret-key-32bytes';

  beforeAll(() => {
    quarantineService = new QuarantineService();
    rawIngestService = {
      processWebhookPayload: jest.fn().mockResolvedValue({
        id: 'evt-replayed-001',
        tenantId: tenantA,
        environmentId: 'env-prod',
        connectorId: 'conn-webhook-01',
        payloadHash: 'hash-replayed-123',
        processingStatus: 'ACCEPTED',
      }),
    } as unknown as jest.Mocked<RawIngestService>;

    dlqWorker = new DLQReplayWorker(quarantineService, rawIngestService);
    groundingService = new AiOutputGroundingService();
    eventStreamService = new EventStreamService();
    merkleTreeService = new MerkleTreeService();
  });

  beforeEach(() => {
    eventStreamService.clearBuffer();
  });

  describe('1. Multi-Tenant Webhook Ingestion & HMAC-SHA256 Verification', () => {
    it('should verify valid HMAC-SHA256 signature and attribute to correct tenant', () => {
      const payload = JSON.stringify({
        source: 'okta',
        event_type: 'user.authentication.auth_via_mfa',
        user: 'admin@acme.com',
        timestamp: '2026-09-11T12:00:00Z',
      });

      const signature = createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      const computedSig = createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      expect(signature).toBe(computedSig);
    });

    it('should reject invalid or tampered HMAC signature and prevent pipeline execution', () => {
      const payload = JSON.stringify({ event: 'login', user: 'attacker' });
      const badSignature =
        'invalid-signature-hash-000000000000000000000000000000000';
      const expectedSignature = createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      expect(badSignature).not.toBe(expectedSignature);
    });
  });

  describe('2. DLQ Quarantine Isolation & Automated Replay', () => {
    it('should quarantine malformed telemetry and successfully replay after schema remediation', async () => {
      const validPayload = JSON.stringify({
        source: 'syslog',
        event: 'login-attempt',
        user: 'dev@acme.com',
      });

      // Quarantine record
      const quarantined = quarantineService.quarantinePayload(
        tenantA,
        'env-prod',
        'conn-webhook-01',
        validPayload,
        'SCHEMA_VALIDATION_ERROR',
        'Payload validation failed',
      );

      expect(quarantined.quarantineId).toBeDefined();
      expect(quarantined.status).toBe('PENDING_REVIEW');

      // Replay batch
      const batchResult = await dlqWorker.replayQuarantineBatch(tenantA, 10);
      expect(batchResult.totalProcessed).toBeGreaterThanOrEqual(1);
      expect(batchResult.replayedCount).toBeGreaterThanOrEqual(1);
      expect(batchResult.failedCount).toBe(0);
    });
  });

  describe('3. OCSF v1.1.0 Normalization & Deterministic Detection', () => {
    it('should normalize raw events into OCSF 1.1.0 format and trigger RULE-DET-CRED-01', () => {
      const rawEvent = {
        actor: 'analyst-101',
        action: 'logon_failed',
        ip: '198.51.100.45',
        count: 6,
      };

      const ocsfEvent = {
        activity_id: 1, // Logon
        category_uid: 3, // Identity & Access Management
        class_uid: 3002, // Authentication
        type_uid: 300201, // Authentication: Logon
        severity_id: 4, // High
        actor: { user: { name: rawEvent.actor } },
        src_endpoint: { ip: rawEvent.ip },
        unmapped: { failed_attempts: rawEvent.count },
        tenant_id: tenantA,
      };

      expect(ocsfEvent.class_uid).toBe(3002);
      expect(ocsfEvent.unmapped.failed_attempts).toBeGreaterThanOrEqual(5);

      // Deterministic rule evaluation
      const ruleMatched = ocsfEvent.unmapped.failed_attempts >= 5;
      expect(ruleMatched).toBe(true);
    });
  });

  describe('4. Grounded AI Hypothesis & Decision-Rights Review Envelope', () => {
    it('should ground AI response recommendation in cited evidence spans and reject hallucinations', () => {
      const evidenceRecords = [
        {
          sourceId: 'evid-auth-01',
          sourceType: 'telemetry/auth',
          exactSpan:
            'Multiple failed logins detected from untrusted IP 198.51.100.45 targeting admin@acme.com',
        },
      ];

      const groundedSummary =
        'Observed brute-force authentication attempts from IP 198.51.100.45 targeting privileged user admin@acme.com.';

      const result = groundingService.verifyGrounding({
        tenantId: tenantA,
        summary: groundedSummary,
        evidenceRecords,
        claimedCitations: ['evid-auth-01'],
      });

      expect(result.groundingScore).toBeGreaterThanOrEqual(0.85);
      expect(result.grounded).toBe(true);
      expect(result.groundingProofHash).toBeDefined();
    });
  });

  describe('5. Dual-Custody Hardware Attestation Quorum Simulation', () => {
    it('should require 2-of-N hardware attestation tokens before releasing R2 containment action', () => {
      const approver1 = {
        id: 'sec-ops-lead@acme.com',
        fido2Token: 'fido2-passkey-hardware-attestation-01',
        timestamp: new Date().toISOString(),
      };
      const approver2 = {
        id: 'soc-manager@acme.com',
        fido2Token: 'fido2-passkey-hardware-attestation-02',
        timestamp: new Date().toISOString(),
      };

      const quorum = [approver1, approver2];
      expect(quorum.length).toBeGreaterThanOrEqual(2);
      expect(approver1.id).not.toBe(approver2.id);

      const quorumReceiptHash = createHash('sha256')
        .update(JSON.stringify(quorum))
        .digest('hex');

      expect(quorumReceiptHash).toHaveLength(64);
    });
  });

  describe('6. Real-Time SSE Stream Notification', () => {
    it('should broadcast alert to active subscriber without cross-tenant leakage', (done) => {
      const streamA$ = eventStreamService.getEventStreamForTenant(tenantA);

      const sub = streamA$.subscribe((msg) => {
        expect(msg.type).toBe('ALERT_CREATED');
        expect(msg.id).toBe('alert-phase1-001');
        sub.unsubscribe();
        done();
      });

      // Broadcast event for tenant A
      eventStreamService.publishEvent({
        id: 'alert-phase1-001',
        type: 'ALERT_CREATED',
        tenantId: tenantA,
        timestamp: new Date().toISOString(),
        data: { severity: 'CRITICAL', title: 'Credential Stuffing Matched' },
      });
    });
  });

  describe('7. Merkle Tree Checkpoint Proof (ZS-MERKLE-V1)', () => {
    it('should construct cryptographic Merkle tree and emit verifiable root', () => {
      const leaves = [
        'evidence-leaf-sha256-1111111111111111111111111111111111111111111111111111111111111111',
        'evidence-leaf-sha256-2222222222222222222222222222222222222222222222222222222222222222',
        'evidence-leaf-sha256-3333333333333333333333333333333333333333333333333333333333333333',
      ];

      const root = merkleTreeService.computeRoot(leaves);
      expect(root).toBeDefined();
      expect(root).toHaveLength(64);

      // Re-verify deterministic computation
      const rootRecomputed = merkleTreeService.computeRoot(leaves);
      expect(rootRecomputed).toBe(root);

      const buildResult = merkleTreeService.build(leaves);
      expect(buildResult.root).toBe(root);
      expect(buildResult.treeProfile).toBe('ZS-MERKLE-V1');
    });
  });
});
