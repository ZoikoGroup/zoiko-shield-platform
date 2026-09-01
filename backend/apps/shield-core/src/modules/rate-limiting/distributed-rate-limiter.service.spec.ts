import { DistributedRateLimiterService } from './distributed-rate-limiter.service';

describe('DistributedRateLimiterService (Token-Bucket Multi-Tenant Protection)', () => {
  let rateLimiter: DistributedRateLimiterService;

  beforeEach(() => {
    rateLimiter = new DistributedRateLimiterService();
  });

  it('1. should allow requests within the allocated capacity', async () => {
    const tenantId = 'tenant-standard-01';
    const res = await rateLimiter.consume(tenantId, 'STANDARD', 10);

    expect(res.allowed).toBe(true);
    expect(res.remainingTokens).toBe(990);
    expect(res.limit).toBe(1000);
    expect(res.tenantTier).toBe('STANDARD');
  });

  it('2. should reject requests when bucket capacity is exhausted', async () => {
    const tenantId = 'tenant-free-01';
    // Consume full free tier capacity (60)
    const firstRes = await rateLimiter.consume(tenantId, 'FREE', 60);
    expect(firstRes.allowed).toBe(true);
    expect(firstRes.remainingTokens).toBe(0);

    // Immediate next request should be blocked
    const blockedRes = await rateLimiter.consume(tenantId, 'FREE', 1);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.remainingTokens).toBe(0);
    expect(blockedRes.resetSeconds).toBeGreaterThanOrEqual(1);
  });

  it('3. should support enterprise tier high-concurrency burst limits', async () => {
    const tenantId = 'tenant-enterprise-01';
    const res = await rateLimiter.consume(tenantId, 'ENTERPRISE', 5000);

    expect(res.allowed).toBe(true);
    expect(res.remainingTokens).toBe(5000);
    expect(res.limit).toBe(10000);
  });

  it('4. should reset bucket upon administrative replenishment', async () => {
    const tenantId = 'tenant-exhausted-01';
    await rateLimiter.consume(tenantId, 'FREE', 60);
    expect((await rateLimiter.consume(tenantId, 'FREE', 1)).allowed).toBe(
      false,
    );

    rateLimiter.resetBucket(tenantId);
    const freshRes = await rateLimiter.consume(tenantId, 'FREE', 1);
    expect(freshRes.allowed).toBe(true);
    expect(freshRes.remainingTokens).toBe(59);
  });
});
