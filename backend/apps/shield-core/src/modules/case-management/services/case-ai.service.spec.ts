import { ServiceUnavailableException } from '@nestjs/common';
import { CaseAiService } from './case-ai.service';

describe('CaseAiService deterministic continuity', () => {
  let caseService: any;
  let timeline: any;
  let evidence: any;
  let authorization: any;
  let shieldAi: any;
  let continuity: any;
  let service: CaseAiService;

  beforeEach(() => {
    caseService = {
      assertTenantOwnership: jest.fn().mockResolvedValue({
        id: 'case-1',
        tenant_id: 'tenant-1',
        environment_id: 'prod',
        region: 'eu-west-2',
        title: 'Credential access',
        status: 'INVESTIGATING',
        severity: 'HIGH',
        priority: 'P1',
      }),
    };
    timeline = { append: jest.fn().mockResolvedValue({ id: 'timeline-1' }) };
    evidence = {
      createEvidence: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
    };
    authorization = {
      evaluate: jest.fn().mockResolvedValue({
        authorizationDecisionId: 'authorization-1',
        decision: 'PERMIT',
        reasonCode: 'ALL_REQUIREMENTS_SATISFIED',
        obligations: [],
      }),
    };
    shieldAi = { requestUseCase: jest.fn(), reviewOutput: jest.fn() };
    continuity = {
      evaluate: jest.fn().mockResolvedValue({
        continuityEventId: 'continuity-1',
        inputHash: 'a'.repeat(64),
        outputHash: 'b'.repeat(64),
        result: {
          caseId: 'case-1',
          useCase: 'CASE_SUMMARY',
          title: 'Credential access',
          status: 'INVESTIGATING',
          severity: 'HIGH',
          priority: 'P1',
          conclusion: null,
          limitations: ['AI_UNAVAILABLE', 'Recorded facts only'],
          modelUsed: false,
        },
      }),
    };
    service = new CaseAiService(
      caseService,
      timeline,
      evidence,
      authorization,
      shieldAi,
      continuity,
    );
  });

  it('returns and evidences a factual no-LLM fallback when shield-ai is unavailable', async () => {
    shieldAi.requestUseCase.mockRejectedValue(
      new ServiceUnavailableException('AI_UNAVAILABLE'),
    );

    const result = await service.invoke({
      tenantId: 'tenant-1',
      environmentId: 'prod',
      caseId: 'case-1',
      useCaseSlug: 'summary',
      actorId: 'analyst-1',
    });

    expect(continuity.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'CORE_CASE_FALLBACK',
        facts: expect.objectContaining({ useCase: 'CASE_SUMMARY' }),
      }),
    );
    expect(result.aiOutput).toEqual(
      expect.objectContaining({
        deterministic: true,
        llmUsed: false,
        continuityEventId: 'continuity-1',
      }),
    );
    expect(evidence.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceType: 'DETERMINISTIC_FALLBACK',
        producingService: 'shield-core',
      }),
    );
    expect(timeline.append).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('fallback') }),
    );
  });

  it('does not convert a policy denial into an availability fallback', async () => {
    shieldAi.requestUseCase.mockRejectedValue(
      new ServiceUnavailableException('POLICY_DENIED'),
    );

    await expect(
      service.invoke({
        tenantId: 'tenant-1',
        environmentId: 'prod',
        caseId: 'case-1',
        useCaseSlug: 'summary',
        actorId: 'analyst-1',
      }),
    ).rejects.toThrow('POLICY_DENIED');

    expect(continuity.evaluate).not.toHaveBeenCalled();
    expect(evidence.createEvidence).not.toHaveBeenCalled();
  });
});
