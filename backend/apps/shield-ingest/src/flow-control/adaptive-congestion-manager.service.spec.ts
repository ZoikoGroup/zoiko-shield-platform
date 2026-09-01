import { Test, TestingModule } from '@nestjs/testing';
import { AdaptiveCongestionManagerService } from './adaptive-congestion-manager.service';

describe('AdaptiveCongestionManagerService', () => {
  let service: AdaptiveCongestionManagerService;
  const tenantId = 'tenant-high-throughput-fintech';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdaptiveCongestionManagerService],
    }).compile();

    service = module.get<AdaptiveCongestionManagerService>(AdaptiveCongestionManagerService);
  });

  it('should maintain healthy admission under normal buffer utilization', () => {
    // 20% buffer utilization, queue depth 20
    const state = service.recordBufferUsage(tenantId, 20_000, 100_000, 20);
    expect(state.isCongested).toBe(false);
    expect(state.recommendedRetryAfterMs).toBe(0);

    const decision = service.evaluateIngestRequest(tenantId, 50);
    expect(decision.admitted).toBe(true);
    expect(decision.statusCode).toBe(200);
  });

  it('should trigger multiplicative decrease and return 429 when buffer capacity exceeds 80%', () => {
    // 90% buffer utilization, queue depth 600
    const state = service.recordBufferUsage(tenantId, 90_000, 100_000, 600);
    expect(state.isCongested).toBe(true);
    expect(state.currentWindowSize).toBe(100); // 200 * 0.5 = 100
    expect(state.recommendedRetryAfterMs).toBeGreaterThan(1000);

    // Attempting to push with 120 in flight (> window 100)
    const decision = service.evaluateIngestRequest(tenantId, 120);
    expect(decision.admitted).toBe(false);
    expect(decision.statusCode).toBe(429);
    expect(decision.retryAfterMs).toBe(state.recommendedRetryAfterMs);
  });

  it('should perform additive increase as buffer drains and traffic stabilizes', () => {
    // Congest first
    service.recordBufferUsage(tenantId, 90_000, 100_000, 600);
    const congestedState = service.getCongestionState(tenantId);
    expect(congestedState?.currentWindowSize).toBe(100);

    // Drain buffer
    const recoveredState = service.recordBufferUsage(tenantId, 10_000, 100_000, 10);
    expect(recoveredState.isCongested).toBe(false);
    expect(recoveredState.currentWindowSize).toBe(110); // 100 + 10 = 110
  });
});
