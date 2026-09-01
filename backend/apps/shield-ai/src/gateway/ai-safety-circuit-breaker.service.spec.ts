import {
  AiSafetyCircuitBreakerService,
  ThreatInvestigationInput,
} from './ai-safety-circuit-breaker.service';

describe('AiSafetyCircuitBreakerService (Multi-Model Resilient Fallback)', () => {
  let service: AiSafetyCircuitBreakerService;

  const mockInput: ThreatInvestigationInput = {
    tenantId: 'tenant-acme-bank',
    incidentId: 'INC-2026-001',
    severity: 'CRITICAL',
    evidenceIds: ['evi-01', 'evi-02'],
    rawSummary: 'Multiple failed SSH root logins from unknown IP',
  };

  beforeEach(() => {
    service = new AiSafetyCircuitBreakerService();
  });

  it('1. should route to Primary Provider (Vertex AI Gemini) during normal operations', async () => {
    const res = await service.investigateThreat(mockInput);

    expect(res.providerUsed).toBe('VERTEX_AI_GEMINI');
    expect(res.mitreTTPs).toContain('T1110.004');
    expect(res.circuitState).toBe('CLOSED');
  });

  it('2. should fallback to Secondary Provider (Azure OpenAI) when Vertex AI fails', async () => {
    service.simulateVertexFailure = true;

    const res = await service.investigateThreat(mockInput);

    expect(res.providerUsed).toBe('AZURE_OPENAI');
    expect(res.mitreTTPs).toContain('T1110.001');
  });

  it('3. should fallback to Deterministic Rule Engine when all cloud LLMs fail', async () => {
    service.simulateVertexFailure = true;
    service.simulateAzureFailure = true;

    const res = await service.investigateThreat(mockInput);

    expect(res.providerUsed).toBe('DETERMINISTIC_FALLBACK');
    expect(res.mitreTTPs).toContain('T1059.001');
    expect(res.recommendedPlaybooks).toContain(
      'soar.playbook.isolate_edr_host',
    );
  });

  it('4. should trip circuit breaker to OPEN on repeated failures', async () => {
    service.simulateVertexFailure = true;
    service.simulateAzureFailure = true;

    // Trigger 2 failures
    await service.investigateThreat(mockInput);
    await service.investigateThreat(mockInput);

    const circuitStatus = service.getCircuitState();
    expect(circuitStatus.state).toBe('OPEN');
  });
});
