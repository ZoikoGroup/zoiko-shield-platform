import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { DecisionRightsService } from '../../shield-ai/src/decision-rights/decision-rights.service';
import { EvidenceAutoCreationService } from '../src/modules/evidence/evidence-auto-creation.service';
import { EvidenceService } from '../src/modules/evidence/services/evidence.service';
import { MerkleTreeService } from '../../shield-anchor/src/merkle/merkle-tree.service';
import { KafkaConsumerService } from '../src/kafka/kafka-consumer.service';
import { KafkaProducerService } from '../../shield-ai/src/kafka/kafka-producer.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { ContentHashService } from '../src/modules/evidence/hashing/content-hash.service';
import { ObjectStorageService } from '../src/modules/evidence/storage/object-storage.service';
import { EvidenceLedgerService } from '../src/modules/evidence/ledger/evidence-ledger.service';
import { EvidenceLineageService } from '../src/modules/evidence/lineage/evidence-lineage.service';
import { EvidenceRepository } from '../src/modules/evidence/repositories/evidence.repository';

describe('AI Decision Evidence Anchoring & Merkle Verification (3-Service Integration)', () => {
  let decisionRightsService: DecisionRightsService;
  let evidenceAutoCreationService: EvidenceAutoCreationService;
  let evidenceService: EvidenceService;
  let merkleTreeService: MerkleTreeService;

  const tenantId = 'tenant-ai-anchor-test';
  const environmentId = 'PRODUCTION-EU-WEST';
  const region = 'eu-west-1';

  const mockCapturedEvents: Record<
    string,
    Array<(envelope: any) => Promise<void> | void>
  > = {};
  const inMemoryStorage = new Map<string, Buffer>();
  const inMemoryEvidence: any[] = [];
  const inMemoryLedger: any[] = [];

  const mockKafkaProducer = {
    publishEvent: jest.fn(
      async (topic: string, eventType: string, payload: any, context?: any) => {
        const envelope = {
          eventId: crypto.randomUUID(),
          eventType,
          eventVersion: '1',
          tenantId: payload.tenantId,
          correlationId: context?.correlationId ?? crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          producedAt: new Date().toISOString(),
          payload,
        };
        const handlers = mockCapturedEvents[topic] || [];
        for (const handler of handlers) {
          await handler(envelope);
        }
      },
    ),
  };

  const mockKafkaConsumer = {
    registerHandler: jest.fn(
      (topic: string, handler: (envelope: any) => Promise<void> | void) => {
        if (!mockCapturedEvents[topic]) {
          mockCapturedEvents[topic] = [];
        }
        mockCapturedEvents[topic].push(handler);
      },
    ),
  };

  const mockStorageService = {
    buildObjectKey: (tId: string, eId: string) => `evidence/${tId}/${eId}.json`,
    putObject: jest.fn(async (key: string, data: Buffer) => {
      inMemoryStorage.set(key, data);
      return { key, eTag: 'etag-123' };
    }),
    deleteObject: jest.fn(async (key: string) => {
      inMemoryStorage.delete(key);
    }),
  };

  const mockPrismaService: any = {
    $transaction: jest.fn(async (callback: any) => {
      const txMock: any = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        case: {
          findFirst: jest.fn().mockResolvedValue({ id: 'case-sec-999' }),
        },
        evidenceRecord: {
          create: jest.fn(async ({ data }: any) => {
            inMemoryEvidence.push(data);
            return data;
          }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        outboxEvent: {
          create: jest.fn().mockResolvedValue({ id: 'out-1' }),
        },
        caseEvidence: {
          create: jest.fn().mockResolvedValue({ id: 'ce-1' }),
        },
        caseTimelineEntry: {
          create: jest.fn().mockResolvedValue({ id: 'ctl-1' }),
        },
        evidenceLedgerEntry: {
          findFirst: jest.fn().mockImplementation(async () => {
            return inMemoryLedger.length > 0
              ? inMemoryLedger[inMemoryLedger.length - 1]
              : null;
          }),
          create: jest.fn(async ({ data }: any) => {
            inMemoryLedger.push(data);
            return data;
          }),
        },
      };
      return callback(txMock);
    }),
  };

  beforeAll(async () => {
    merkleTreeService = new MerkleTreeService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DecisionRightsService,
          useFactory: () => new DecisionRightsService(mockKafkaProducer as any),
        },
        EvidenceAutoCreationService,
        EvidenceService,
        ContentHashService,
        EvidenceLedgerService,
        EvidenceLineageService,
        EvidenceRepository,
        OutboxService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: KafkaConsumerService, useValue: mockKafkaConsumer },
        { provide: ObjectStorageService, useValue: mockStorageService },
      ],
    }).compile();

    decisionRightsService = module.get<DecisionRightsService>(
      DecisionRightsService,
    );
    evidenceAutoCreationService = module.get<EvidenceAutoCreationService>(
      EvidenceAutoCreationService,
    );
    evidenceService = module.get<EvidenceService>(EvidenceService);

    // Trigger onModuleInit to wire Kafka subscriptions
    evidenceAutoCreationService.onModuleInit();
  });

  it('Step 1: shield-ai wraps AI recommendation into complete 10-field AiReviewEnvelope', async () => {
    const envelope = decisionRightsService.wrapInEnvelope({
      tenantId,
      environmentId,
      aiLabelAndUseCaseName: {
        aiLabel: 'Model Armor Screened AI Recommendation',
        useCaseName: 'INCIDENT_RESPONSE_RECOMMENDATION',
        modelRoute: 'gemini-1.5-pro',
      },
      sourcesAndSpans: [
        {
          sourceId: 'src-audit-log-01',
          sourceType: 'INGESTED_TELEMETRY',
          exactSpan:
            'Failed SSH auth burst (5 attempts in 3s) from 198.51.100.42',
          confidence: 0.95,
        },
      ],
      calibratedConfidenceAndUncertainty: {
        score: 0.96,
        qualitativeBand: 'HIGH',
        calibrationBasis: 'Historical Tier-A detection confidence profile',
        uncertaintyFactors: ['Residential proxy IP space'],
      },
      expectedImpactAndReversibility: {
        blastRadius: '0.05',
        isReversible: true,
        reversibilityTier: 'R1',
        compensationPlan: 'Immediate IP unblock at edge perimeter',
      },
      requiredAuthorityAndApprovals: {
        requiredRole: 'SECURITY_ANALYST',
        responseAuthorityTier: 'R1',
        dualApproverRequired: false,
      },
      payload: {
        caseId: 'case-sec-999',
        targetIp: '198.51.100.42',
        action: 'BLOCK_PERIMETER_IP',
      },
    });

    expect(envelope).toBeDefined();
    expect(envelope.envelopeId).toMatch(/^env-/);
    expect(envelope.controls.state).toBe('UNREVIEWED');
  });

  it('Step 2 & 3: Human decision records in shield-ai -> auto-consumed into shield-core EvidenceRecord', async () => {
    const envelopes = decisionRightsService.listEnvelopes(tenantId);
    expect(envelopes.length).toBeGreaterThan(0);
    const targetEnvelope = envelopes[0];

    // Human analyst rejects the proposal with mandatory rationale
    const updatedEnvelope = await decisionRightsService.recordHumanDecision(
      tenantId,
      targetEnvelope.envelopeId,
      {
        decision: 'REJECT',
        decidedBy: 'lead-analyst-bob',
        rationale:
          'IP 198.51.100.42 is an authorized regional vulnerability scanner probe.',
      },
    );

    expect(updatedEnvelope.controls.state).toBe('REJECTED');
    expect(mockKafkaProducer.publishEvent).toHaveBeenCalled();

    // Verify evidence record was automatically created by EvidenceAutoCreationService
    expect(inMemoryEvidence.length).toBe(1);
    const createdEvidence = inMemoryEvidence[0];
    expect(createdEvidence.tenant_id).toBe(tenantId);
    expect(createdEvidence.evidence_type).toBe('AI_HUMAN_DECISION_RECORD');
    expect(createdEvidence.source_object_id).toBe(targetEnvelope.envelopeId);
    expect(createdEvidence.purpose).toBe('DECISION_RECORD');
    expect(createdEvidence.content_hash).toBeDefined();
    expect(createdEvidence.content_hash.length).toBe(64);
  });

  it('Step 4 & 5: Evidence appended to Ledger and anchored in Merkle Tree (shield-anchor)', async () => {
    expect(inMemoryLedger.length).toBe(1);
    const ledgerEntry = inMemoryLedger[0];
    expect(ledgerEntry.sequence).toBe(1);
    expect(ledgerEntry.entry_hash).toBeDefined();

    const ledgerHeadHash = ledgerEntry.entry_hash;
    const manifestCoreHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ tenantId, sequence: 1 }))
      .digest('hex');

    // shield-anchor builds Merkle Tree over leaves
    const leaves = [ledgerHeadHash, manifestCoreHash];
    const merkleResult = merkleTreeService.build(leaves);

    expect(merkleResult.root).toBeDefined();
    expect(merkleResult.root.length).toBe(64);

    // Validate inclusion proof for the AI human decision leaf
    const leafProof = merkleResult.proofs[0];
    expect(leafProof).toBeDefined();
    expect(leafProof.length).toBeGreaterThan(0);

    const isVerified = merkleTreeService.verifyInclusion(
      ledgerHeadHash,
      leafProof,
      merkleResult.root,
    );
    expect(isVerified).toBe(true);
  });
});
