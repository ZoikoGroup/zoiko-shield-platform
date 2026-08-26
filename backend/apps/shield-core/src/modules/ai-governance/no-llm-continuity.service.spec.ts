import { ContentHashService } from '../evidence/hashing/content-hash.service';
import { NoLlmContinuityService } from './no-llm-continuity.service';

describe('NoLlmContinuityService (Category H continuity)', () => {
  let prisma: any;
  let authorization: any;
  let service: NoLlmContinuityService;

  beforeEach(() => {
    prisma = {
      deterministicContinuityEvent: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'continuity-1',
          ...data,
        })),
      },
      freeze: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    authorization = { evaluate: jest.fn() };
    service = new NoLlmContinuityService(
      prisma,
      authorization,
      new ContentHashService(),
    );
  });

  const evaluate = (operation: any, facts: Record<string, unknown>) =>
    service.evaluate({
      tenantId: 'tenant-1',
      environmentId: 'prod',
      actorId: 'actor-1',
      operation,
      facts,
    });

  it('returns INDETERMINATE rather than guessing when detection facts are incomplete', async () => {
    const result = await evaluate('DETECTION_EVALUATION', {
      requiredFactsComplete: false,
    });

    expect(result.outcome).toBe('INDETERMINATE');
    expect(result.result).toEqual(
      expect.objectContaining({ match: null, humanReviewRequired: true }),
    );
    expect(prisma.deterministicContinuityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ llm_used: false }),
    });
  });

  it('evaluates complete signals and hashes evidence deterministically without an LLM', async () => {
    const detection = await evaluate('DETECTION_EVALUATION', {
      requiredFactsComplete: true,
      signalScore: 91,
      threshold: 80,
    });
    const firstHash = await evaluate('EVIDENCE_INTEGRITY', {
      evidence: { b: 2, a: 1 },
    });
    const secondHash = await evaluate('EVIDENCE_INTEGRITY', {
      evidence: { a: 1, b: 2 },
    });

    expect(detection.outcome).toBe('MATCH');
    expect((firstHash.result as any).contentHash).toBe(
      (secondHash.result as any).contentHash,
    );
    expect(firstHash.llmUsed).toBe(false);
  });

  it('delegates authorization to the deterministic authorization authority', async () => {
    authorization.evaluate.mockResolvedValue({
      authorizationDecisionId: 'authorization-1',
      decision: 'PERMIT',
      reasonCode: 'ALL_REQUIREMENTS_SATISFIED',
      obligations: [],
    });

    const result = await evaluate('AUTHORIZATION', {
      action: 'case:read',
      resourceType: 'CASE',
      resourceId: 'case-1',
    });

    expect(result.outcome).toBe('PERMIT');
    expect(authorization.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        environmentId: 'prod',
        action: 'case:read',
      }),
    );
    expect(prisma.deterministicContinuityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        authorization_ref: 'authorization-1',
      }),
    });
  });

  it('denies response authority above R1 and when a tenant freeze is active', async () => {
    const elevated = await evaluate('RESPONSE_SAFETY', {
      authorityLevel: 'R2',
      reversible: true,
      rollbackActionType: 'UNISOLATE_HOST',
    });
    prisma.freeze.findFirst.mockResolvedValue({ id: 'freeze-1' });
    const frozen = await evaluate('RESPONSE_SAFETY', {
      authorityLevel: 'R1',
      reversible: true,
      rollbackActionType: 'UNISOLATE_HOST',
    });

    expect(elevated.outcome).toBe('DENY');
    expect(frozen.outcome).toBe('DENY');
    expect(frozen.reason).toContain('freeze');
  });

  it('returns recorded case facts with explicit limitations when AI is unavailable', async () => {
    const result = await evaluate('CORE_CASE_FALLBACK', {
      useCase: 'RESPONSE_RECOMMENDATION',
      caseId: 'case-1',
      title: 'Credential access',
      status: 'INVESTIGATING',
      severity: 'HIGH',
      priority: 'P1',
    });

    expect(result.outcome).toBe('DETERMINISTIC_FALLBACK');
    expect(result.result).toEqual(
      expect.objectContaining({
        recommendation: 'HUMAN_REVIEW_REQUIRED_NO_AUTOMATED_RESPONSE',
        conclusion: null,
        modelUsed: false,
      }),
    );
  });
});
