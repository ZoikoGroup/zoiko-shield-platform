import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';

// Ingest
import { AwsCloudTrailIngestService } from '../../shield-ingest/src/connectors/providers/aws-cloudtrail/aws-cloudtrail-ingest.service';
import { AwsCloudTrailNormalizerService } from '../../shield-ingest/src/connectors/providers/aws-cloudtrail/aws-cloudtrail.normalizer';
import { MicrosoftEntraIngestService } from '../../shield-ingest/src/connectors/providers/microsoft-entra/microsoft-entra-ingest.service';
import { EntraNormalizerService } from '../../shield-ingest/src/connectors/providers/microsoft-entra/entra.normalizer';

// Core
import { ContinuousAssuranceCollectorService } from '../src/modules/continuous-assurance/continuous-assurance-collector.service';
import { ComplianceDriftMonitorService } from '../src/modules/continuous-assurance/compliance-drift-monitor.service';
import { EvidenceService } from '../src/modules/evidence/services/evidence.service';
import { ContentHashService } from '../src/modules/evidence/hashing/content-hash.service';
import { EvidenceLedgerService } from '../src/modules/evidence/ledger/evidence-ledger.service';
import { EvidenceLineageService } from '../src/modules/evidence/lineage/evidence-lineage.service';
import { EvidenceRepository } from '../src/modules/evidence/repositories/evidence.repository';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { KafkaConsumerService } from '../src/kafka/kafka-consumer.service';
import { ObjectStorageService } from '../src/modules/evidence/storage/object-storage.service';

// AI
import { DecisionRightsService } from '../../shield-ai/src/decision-rights/decision-rights.service';

// Action
import { DualCustodyApprovalsService } from '../../shield-action/src/approvals/dual-custody-approvals.service';
import { LiveActionExecutorService } from '../../shield-action/src/executors/live-action-executor.service';
import { AutomatedRollbackOrchestratorService } from '../../shield-action/src/executors/automated-rollback-orchestrator.service';

// Anchor
import { MerkleTreeService } from '../../shield-anchor/src/merkle/merkle-tree.service';

describe('Phase 1 Live Pipeline Integration (Ingest -> Core Assurance -> AI Envelope -> Dual-Custody SOAR -> Anchor)', () => {
  let awsIngestService: AwsCloudTrailIngestService;
  let entraIngestService: MicrosoftEntraIngestService;
  let awsNormalizer: AwsCloudTrailNormalizerService;
  let entraNormalizer: EntraNormalizerService;
  let assuranceCollector: ContinuousAssuranceCollectorService;
  let driftMonitor: ComplianceDriftMonitorService;
  let evidenceService: EvidenceService;
  let decisionRightsService: DecisionRightsService;
  let dualCustodyService: DualCustodyApprovalsService;
  let liveExecutor: LiveActionExecutorService;
  let rollbackOrchestrator: AutomatedRollbackOrchestratorService;
  let merkleTreeService: MerkleTreeService;

  const tenantId = 'tenant-p1-mvp-corp';
  const environmentId = 'PRODUCTION-AWS-US-EAST';
  const region = 'us-east-1';

  const mockKafkaEvents: { topic: string; eventType: string; payload: any }[] =
    [];
  const inMemoryEvidence: any[] = [];
  const inMemoryLedger: any[] = [];
  const inMemoryStorage = new Map<string, Buffer>();

  const mockKafkaProducer = {
    publishEvent: jest.fn(
      async (topic: string, eventType: string, payload: any, context?: any) => {
        mockKafkaEvents.push({ topic, eventType, payload });
      },
    ),
  };

  const mockStorageService = {
    buildObjectKey: (tId: string, eId: string) => `evidence/${tId}/${eId}.json`,
    putObject: jest.fn(async (key: string, data: Buffer) => {
      inMemoryStorage.set(key, data);
      return { key, eTag: 'etag-p1-test' };
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
          findFirst: jest.fn().mockResolvedValue({ id: 'case-p1-sec-101' }),
        },
        evidenceRecord: {
          create: jest.fn(async ({ data }: any) => {
            inMemoryEvidence.push(data);
            return data;
          }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        outboxEvent: {
          create: jest.fn().mockResolvedValue({ id: 'outbox-p1-1' }),
        },
        caseEvidence: {
          create: jest.fn().mockResolvedValue({ id: 'ce-p1-1' }),
        },
        caseTimelineEntry: {
          create: jest.fn().mockResolvedValue({ id: 'ctl-p1-1' }),
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
    awsNormalizer = new AwsCloudTrailNormalizerService();
    entraNormalizer = new EntraNormalizerService();
    dualCustodyService = new DualCustodyApprovalsService();
    liveExecutor = new LiveActionExecutorService(dualCustodyService);
    rollbackOrchestrator = new AutomatedRollbackOrchestratorService();
    driftMonitor = new ComplianceDriftMonitorService(mockKafkaProducer as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AwsCloudTrailIngestService,
          useFactory: () =>
            new AwsCloudTrailIngestService(
              awsNormalizer,
              mockKafkaProducer as any,
            ),
        },
        {
          provide: MicrosoftEntraIngestService,
          useFactory: () =>
            new MicrosoftEntraIngestService(
              entraNormalizer,
              mockKafkaProducer as any,
            ),
        },
        {
          provide: DecisionRightsService,
          useFactory: () => new DecisionRightsService(mockKafkaProducer as any),
        },
        EvidenceService,
        ContentHashService,
        EvidenceLedgerService,
        EvidenceLineageService,
        EvidenceRepository,
        OutboxService,
        {
          provide: ContinuousAssuranceCollectorService,
          useFactory: (evService: EvidenceService) =>
            new ContinuousAssuranceCollectorService(
              evService,
              mockKafkaProducer as any,
            ),
          inject: [EvidenceService],
        },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ObjectStorageService, useValue: mockStorageService },
        {
          provide: KafkaConsumerService,
          useValue: { registerHandler: jest.fn() },
        },
      ],
    }).compile();

    awsIngestService = module.get<AwsCloudTrailIngestService>(
      AwsCloudTrailIngestService,
    );
    entraIngestService = module.get<MicrosoftEntraIngestService>(
      MicrosoftEntraIngestService,
    );
    assuranceCollector = module.get<ContinuousAssuranceCollectorService>(
      ContinuousAssuranceCollectorService,
    );
    evidenceService = module.get<EvidenceService>(EvidenceService);
    decisionRightsService = module.get<DecisionRightsService>(
      DecisionRightsService,
    );
  });

  it('Stage 1: Ingest Live AWS CloudTrail & Microsoft Entra Telemetry with OCSF 1.1.0 Normalization', async () => {
    // 1. AWS CloudTrail Ingestion with SigV4 Verification
    const secretKey = 'us-east-1-secret-key';
    const rawCloudTrailBody =
      '{"eventID":"evt-aws-001","eventName":"ConsoleLogin"}';
    const sigV4Header = crypto
      .createHmac('sha256', secretKey)
      .update(rawCloudTrailBody)
      .digest('hex');

    const isSigV4Valid = awsIngestService.verifySigV4Auth(
      rawCloudTrailBody,
      sigV4Header,
      secretKey,
    );
    expect(isSigV4Valid).toBe(true);

    const cloudTrailRecord = {
      eventVersion: '1.08',
      eventID: 'evt-aws-001',
      userIdentity: {
        type: 'IAMUser',
        principalId: 'AIDAEXAMPLEUSER',
        arn: 'arn:aws:iam::123456789012:user/alice',
        userName: 'alice',
      },
      eventTime: new Date().toISOString(),
      eventSource: 'signin.amazonaws.com',
      eventName: 'ConsoleLogin',
      awsRegion: 'us-east-1',
      sourceIPAddress: '203.0.113.195',
      errorMessage: 'Failed authentication',
      responseElements: { ConsoleLogin: 'Failure' },
    };

    const awsResult = await awsIngestService.ingestCloudTrailBatch(
      tenantId,
      environmentId,
      [cloudTrailRecord as any],
      region,
    );

    expect(awsResult.acceptedCount).toBe(1);
    expect(awsResult.quarantinedCount).toBe(0);
    expect(awsResult.normalizedEvents.length).toBe(1);
    expect(awsResult.normalizedEvents[0].provider).toBe('aws-cloudtrail');
    expect(awsResult.normalizedEvents[0].event_type).toBe(
      'aws.signin.ConsoleLogin',
    );
    expect(awsResult.normalizedEvents[0].network.source_ip).toBe(
      '203.0.113.195',
    );
    expect(awsResult.batchDigest).toBeDefined();

    // 2. Microsoft Entra Ingestion
    const entraRecord = {
      id: 'entra-sign-in-audit-001',
      createdDateTime: new Date().toISOString(),
      userPrincipalName: 'bob@partner.com',
      userId: 'user-entra-bob-1',
      appDisplayName: 'ZoikoShield Portal',
      ipAddress: '198.51.100.77',
      status: {
        errorCode: 50126,
        failureReason: 'Invalid username or password',
      },
      location: {
        city: 'Frankfurt',
        countryOrRegion: 'DE',
      },
    };

    const entraResult = await entraIngestService.ingestEntraBatch(
      tenantId,
      environmentId,
      [entraRecord],
      'eu-west-1',
    );

    expect(entraResult.acceptedCount).toBe(1);
    expect(entraResult.quarantinedCount).toBe(0);
    expect(entraResult.normalizedEvents[0].provider).toBe('microsoft-entra');
    expect(entraResult.normalizedEvents[0].event_type).toBe(
      'security.identity.signin.v1',
    );
    expect(entraResult.normalizedEvents[0].authentication_result).toBe(
      'FAILED',
    );
    expect(entraResult.normalizedEvents[0].ip_address).toBe('198.51.100.77');
    expect(mockKafkaProducer.publishEvent).toHaveBeenCalled();
  });

  it('Stage 2: Continuous Assurance Collector evaluates SOC 2 / HIPAA & records Immutable Evidence', async () => {
    const cycleResult = await assuranceCollector.runEvaluationCycle(
      tenantId,
      environmentId,
      region,
      {
        mfaEnforcementRate: 100,
        standingAdminCount: 2,
        tls13Percentage: 100,
        unencryptedDatastoresCount: 0,
        accessReviewOverdueDays: 0,
        terminatedUserAccessActive: 0,
      },
    );

    expect(cycleResult.evaluatedControlsCount).toBe(3); // SOC 2, ISO 27001, HIPAA
    expect(cycleResult.passedCount).toBe(3);
    expect(cycleResult.overallScore).toBe(100);
    expect(cycleResult.evidenceIds.length).toBe(3);
    expect(inMemoryEvidence.length).toBe(3);
    expect(inMemoryLedger.length).toBe(3);

    const soc2Record = inMemoryEvidence.find(
      (e) => e.source_object_id && e.source_object_id.includes('SOC2-CC6.1'),
    );
    expect(soc2Record).toBeDefined();
    expect(soc2Record.tenant_id).toBe(tenantId);
    expect(soc2Record.purpose).toBe('COMPLIANCE_EVALUATION');
    expect(soc2Record.content_hash).toBeDefined();
    expect(soc2Record.content_hash.length).toBe(64);

    // Verify SLA drift monitor
    const driftResult = await driftMonitor.evaluateComplianceDrift(tenantId, {
      ingestionLatencyMs: 1200,
      complianceScore: 100,
      activeConnectorCount: 2,
      unmanagedAdminCount: 0,
    });

    expect(driftResult.status).toBe('COMPLIANT');
    expect(driftResult.activeAlarms.length).toBe(0);
  });

  it('Stage 3: Threat Detection wraps incident in 10-Field AiReviewEnvelope requiring Dual-Custody Approval', async () => {
    const envelope = decisionRightsService.wrapInEnvelope({
      tenantId,
      environmentId,
      aiLabelAndUseCaseName: {
        aiLabel: 'Model Armor Screened AI SOAR Agent',
        useCaseName: 'ANOMALOUS_FAILED_LOGINS_PERIMETER_CONTAINMENT',
        modelRoute: 'gemini-1.5-pro',
      },
      sourcesAndSpans: [
        {
          sourceId: 'src-aws-cloudtrail-001',
          sourceType: 'INGESTED_TELEMETRY',
          exactSpan: 'ConsoleLogin Failure burst from 203.0.113.195',
          confidence: 0.98,
        },
      ],
      calibratedConfidenceAndUncertainty: {
        score: 0.97,
        qualitativeBand: 'HIGH',
        calibrationBasis: 'Historical CloudTrail brute force signature',
        uncertaintyFactors: ['Public Tor exit node candidate'],
      },
      expectedImpactAndReversibility: {
        blastRadius: '0.01',
        isReversible: true,
        reversibilityTier: 'R2',
        compensationPlan: 'Automated perimeter security group rule retraction',
      },
      requiredAuthorityAndApprovals: {
        requiredRole: 'SECURITY_ENGINEER',
        responseAuthorityTier: 'R2',
        dualApproverRequired: true,
      },
      payload: {
        caseId: 'case-p1-sec-101',
        actionType: 'BLOCK_PERIMETER_IP',
        targetIp: '203.0.113.195',
        parameters: { cidr: '203.0.113.195/32', firewallRule: 'DENY_INBOUND' },
      },
    });

    expect(envelope.envelopeId).toMatch(/^env-/);
    expect(envelope.requiredAuthorityAndApprovals.dualApproverRequired).toBe(
      true,
    );
    expect(envelope.controls.state).toBe('UNREVIEWED');

    // First Approver signs off in AI Decision Rights
    const reviewedEnvelope = await decisionRightsService.recordHumanDecision(
      tenantId,
      envelope.envelopeId,
      {
        decision: 'ACCEPT',
        decidedBy: 'sec-lead-alice',
        rationale:
          'Confirmed high-frequency brute force attempt on AWS root console.',
      },
    );

    expect(reviewedEnvelope.controls.state).toBe('ACCEPTED');
  });

  it('Stage 4: Two-Man Rule Dual-Custody Quorum Enforcement & Live Action Execution', async () => {
    // 1. Initiator initiates approval for R2 live action
    const approvalReq = dualCustodyService.initiateApproval(
      tenantId,
      'cmd-block-001',
      'BLOCK_PERIMETER_IP',
      '203.0.113.195',
      'R2',
      'sec-lead-alice',
      'SECURITY_ENGINEER',
      900,
    );

    expect(approvalReq.status).toBe('PENDING_APPROVAL');
    expect(approvalReq.approvalId).toBeDefined();

    // 2. Segregation of duties violation check (Initiator cannot approve themselves)
    expect(() =>
      dualCustodyService.approveRequest(
        approvalReq.approvalId,
        'sec-lead-alice',
        'SECURITY_ENGINEER',
      ),
    ).toThrow(/Dual-custody segregation violation/);

    // 3. Second Approver approves
    const approvedReq = dualCustodyService.approveRequest(
      approvalReq.approvalId,
      'soc-director-carol',
      'SECURITY_ADMIN',
    );
    expect(approvedReq.status).toBe('APPROVED');
    expect(
      dualCustodyService.validateExecutionAuthority(approvalReq.approvalId),
    ).toBe(true);

    // 4. Live Non-Destructive Action Execution
    const executionReceipt = await liveExecutor.executeAction({
      tenantId,
      environmentId,
      actionType: 'BLOCK_PERIMETER_IP',
      targetRef: '203.0.113.195',
      authorityLevel: 'R2',
      approvalRef: approvalReq.approvalId,
      parameters: { ttlSeconds: 3600 },
      isSimulation: false,
    });

    expect(executionReceipt.receiptId).toMatch(/^rcpt-/);
    expect(executionReceipt.targetRef).toBe('203.0.113.195');
    expect(executionReceipt.status).toBe('EXECUTED');
    expect(executionReceipt.rollbackCapability.supported).toBe(true);
    expect(executionReceipt.signature).toBeDefined();
    expect(executionReceipt.signature.length).toBe(64);

    // 5. Automated Compensation Rollback
    const rollbackResult =
      await rollbackOrchestrator.executeRollback(executionReceipt);

    expect(rollbackResult.status).toBe('REVERTED');
    expect(rollbackResult.compensatingAction).toBe('REMOVE_WAF_IP_RULE');
    expect(rollbackResult.stateRestorationProof).toBeDefined();
    expect(rollbackResult.stateRestorationProof.length).toBe(64);
  });

  it('Stage 5: Cryptographic Merkle Tree Anchoring across all Ingest, Assurance & SOAR Receipts', async () => {
    // Collect leaf hashes across the entire pipeline
    const leaf1_assuranceSoc2 = inMemoryLedger[0].entry_hash;
    const leaf2_assuranceIso = inMemoryLedger[1].entry_hash;
    const leaf3_assuranceHipaa = inMemoryLedger[2].entry_hash;
    const leaf4_telemetryIngest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          tenantId,
          source: 'AWS_CLOUDTRAIL',
          targetIp: '203.0.113.195',
        }),
      )
      .digest('hex');
    const leaf5_soarActionReceipt = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          tenantId,
          actionId: 'cmd-block-001',
          status: 'SUCCESS',
        }),
      )
      .digest('hex');

    const allLeaves = [
      leaf1_assuranceSoc2,
      leaf2_assuranceIso,
      leaf3_assuranceHipaa,
      leaf4_telemetryIngest,
      leaf5_soarActionReceipt,
    ];

    // Merkle Tree generation in shield-anchor
    const merkleResult = merkleTreeService.build(allLeaves);

    expect(merkleResult.root).toBeDefined();
    expect(merkleResult.root.length).toBe(64);
    expect(Object.keys(merkleResult.proofs).length).toBe(5);

    // Cryptographic inclusion verification for every single pipeline stage
    allLeaves.forEach((leafHash, index) => {
      const proof = merkleResult.proofs[index];
      const isValid = merkleTreeService.verifyInclusion(
        leafHash,
        proof,
        merkleResult.root,
      );
      expect(isValid).toBe(true);
    });
  });
});
