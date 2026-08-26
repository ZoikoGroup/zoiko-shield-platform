import { Test, TestingModule } from '@nestjs/testing';
import { TokenBucketRateLimiterService } from './token-bucket-limiter.service';

describe('TokenBucketRateLimiterService', () => {
  let service: TokenBucketRateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenBucketRateLimiterService],
    }).compile();

    service = module.get<TokenBucketRateLimiterService>(TokenBucketRateLimiterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('allows consumption within burst capacity', () => {
    const tenantId = 'tenant-rate-01';
    const decision = service.consume(tenantId, 10, { capacity: 100, refillRatePerSec: 10 });

    expect(decision.allowed).toBe(true);
    expect(decision.remainingTokens).toBe(90);
    expect(decision.tenantId).toBe(tenantId);
  });

  it('rejects requests exceeding available tokens and provides retry-after', () => {
    const tenantId = 'tenant-rate-02';
    // Consume entire bucket
    service.consume(tenantId, 50, { capacity: 50, refillRatePerSec: 10 });

    // Next request exceeds
    const decision = service.consume(tenantId, 5, { capacity: 50, refillRatePerSec: 10 });

    expect(decision.allowed).toBe(false);
    expect(decision.remainingTokens).toBe(0);
    expect(decision.retryAfterMs).toBeGreaterThan(0);
  });

  it('refills tokens over time proportionally to refill rate', async () => {
    const tenantId = 'tenant-rate-03';
    // Consume entire bucket
    service.consume(tenantId, 20, { capacity: 20, refillRatePerSec: 100 });

    // Wait 100ms (should refill ~10 tokens)
    await new Promise((resolve) => setTimeout(resolve, 100));

    const decision = service.consume(tenantId, 5, { capacity: 20, refillRatePerSec: 100 });
    expect(decision.allowed).toBe(true);
  });

  it('resets tenant bucket state cleanly', () => {
    const tenantId = 'tenant-rate-04';
    service.consume(tenantId, 50, { capacity: 50, refillRatePerSec: 10 });
    expect(service.getActiveTenantCount()).toBe(1);

    service.reset(tenantId);
    expect(service.getActiveTenantCount()).toBe(0);

    const freshDecision = service.consume(tenantId, 10, { capacity: 50, refillRatePerSec: 10 });
    expect(freshDecision.allowed).toBe(true);
    expect(freshDecision.remainingTokens).toBe(40);
  });
});
