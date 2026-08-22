import { Test, TestingModule } from '@nestjs/testing';
import { AiObservabilityMetricsService } from './ai-observability-metrics.service';

describe('AiObservabilityMetricsService (ZS-ENG-AI-001 §22 Metrics & SLOs)', () => {
  let service: AiObservabilityMetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiObservabilityMetricsService],
    }).compile();

    service = module.get<AiObservabilityMetricsService>(
      AiObservabilityMetricsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('tracks request eligibility rate accurately', () => {
    service.recordRequest(true);
    service.recordRequest(true);
    service.recordRequest(false);

    const metrics = service.getMetricsSnapshot();
    expect(metrics.ai_request_eligible_rate).toBe(0.67);
  });

  it('tracks grounding claim rate and citation failures', () => {
    service.recordGrounding(10, 9);
    service.recordCitationFailure();

    const metrics = service.getMetricsSnapshot();
    expect(metrics.ai_grounded_claim_rate).toBe(0.9);
    expect(metrics.ai_retrieval_citation_failure).toBe(1);
  });

  it('records zero-tolerance critical failures and increments count', () => {
    service.recordCriticalFailure('Fabricated evidence claim');
    const metrics = service.getMetricsSnapshot();
    expect(metrics.ai_critical_failure_count).toBe(1);
  });

  it('calculates cost per outcome and provider concentration', () => {
    service.recordOutcomeCost(0.04);
    service.recordOutcomeCost(0.06);
    service.recordCallLatency(120, 'provider_openai');
    service.recordCallLatency(80, 'provider_anthropic');

    const metrics = service.getMetricsSnapshot();
    expect(metrics.ai_cost_per_outcome_usd).toBe(0.05);
    expect(metrics.ai_provider_concentration['provider_openai']).toBe(0.5);
    expect(metrics.ai_provider_concentration['provider_anthropic']).toBe(0.5);
  });
});
