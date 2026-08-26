import { Test, TestingModule } from '@nestjs/testing';
import { AiDecisionLedgerService } from './ai-decision-ledger.service';

describe('AiDecisionLedgerService (ZS-ENG-AI-001 §29 Example D)', () => {
  let service: AiDecisionLedgerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiDecisionLedgerService],
    }).compile();

    service = module.get<AiDecisionLedgerService>(AiDecisionLedgerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates immutable cryptographic decision record with SHA-256 hashes and evidence ID', () => {
    const contextPayload = JSON.stringify({
      eventId: 'evt-100',
      user: 'victim@acme.com',
    });
    const outputContent = 'Observed anomalous credential spray attack.';

    const record = service.createDecisionRecord({
      tenantId: 'tenant-1',
      actorId: 'user-analyst-1',
      useCaseId: 'AI-UC-INVESTIGATION-SUMMARY',
      policyVersions: ['ai-policy-v1', 'tenant-policy-v2'],
      promptProfile: { id: 'pp-investigation', version: 1 },
      contextPayload,
      outputContent,
      sources: [{ id: 'evt-100', version: 1, span: 'victim@acme.com' }],
      modelRoute: 'route-secure-text-v3',
      validation: { schema: 'pass', grounding: 'pass', citations: 'pass' },
      tools: [],
    });

    expect(record.requestId).toBeDefined();
    expect(record.evidenceId).toBeDefined();
    expect(record.contextManifestHash).toBeDefined();
    expect(record.outputHash).toBeDefined();
    expect(record.cost.amountUsd).toBeGreaterThanOrEqual(0);

    const verified = service.verifyIntegrity(
      record,
      contextPayload,
      outputContent,
    );
    expect(verified).toBe(true);
  });

  it('attaches human decision to decision trace', () => {
    const contextPayload = '{}';
    const outputContent = 'Proposed alert priority: P1';

    const record = service.createDecisionRecord({
      tenantId: 'tenant-1',
      actorId: 'user-analyst-1',
      useCaseId: 'AI-UC-INVESTIGATION-SUMMARY',
      policyVersions: ['v1'],
      promptProfile: { id: 'pp-1', version: 1 },
      contextPayload,
      outputContent,
      sources: [],
      modelRoute: 'mock',
      validation: { schema: 'pass', grounding: 'pass', citations: 'pass' },
    });

    const updated = service.attachHumanDecision('tenant-1', record.requestId, {
      state: 'APPROVED',
      actor: 'senior-analyst-99',
      reason: 'Confirmed true positive via external firewall telemetry',
    });

    expect(updated.humanDecision?.state).toBe('APPROVED');
    expect(updated.humanDecision?.actor).toBe('senior-analyst-99');
  });
});
