import { ConflictException } from '@nestjs/common';
import { RetentionPolicyService } from './retention-policy.service';

/**
 * Retention eligibility is a hard gate that approval does not satisfy
 * (ZS-ENG-OFF-DEL-001 §3.1). The standard sets engineering behavior, not the
 * schedule, so the duration has to come from a recorded policy — and when
 * there is none, the answer is "we cannot establish eligibility", never
 * "delete now".
 */
describe('RetentionPolicyService', () => {
  const TENANT_ID = 'tenant-retention-1';
  let prisma: any;
  let service: RetentionPolicyService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    prisma = {
      tenantRetentionPolicy: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    service = new RetentionPolicyService(prisma);
    delete process.env.TENANT_RETENTION_DEFAULT_DAYS;
    delete process.env.TENANT_RETENTION_DEFAULT_AUTHORITY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('prefers the tenant’s own recorded policy over any default', async () => {
    process.env.TENANT_RETENTION_DEFAULT_DAYS = '30';
    prisma.tenantRetentionPolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      basis: 'CONTRACTUAL',
      authority: 'MSA schedule 4',
      period_days: 365,
    });

    const resolved = await service.resolve(TENANT_ID);

    expect(resolved).toEqual({
      policyId: 'policy-1',
      basis: 'CONTRACTUAL',
      authority: 'MSA schedule 4',
      periodDays: 365,
    });
  });

  it('refuses to establish eligibility when nothing authoritative says how long', async () => {
    await expect(service.resolve(TENANT_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('never silently treats a missing policy as "delete immediately"', async () => {
    // The dangerous failure mode would be resolving to 0 days.
    await expect(service.resolve(TENANT_ID)).rejects.toThrow(
      /eligibility cannot be established/,
    );
  });

  it('accepts a deliberately configured platform default as a last resort', async () => {
    process.env.TENANT_RETENTION_DEFAULT_DAYS = '90';

    const resolved = await service.resolve(TENANT_ID);

    expect(resolved.basis).toBe('PLATFORM_DEFAULT');
    expect(resolved.periodDays).toBe(90);
    expect(resolved.policyId).toBeNull();
  });

  it('rejects a malformed configured default rather than guessing', async () => {
    process.env.TENANT_RETENTION_DEFAULT_DAYS = 'ninety';

    await expect(service.resolve(TENANT_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('runs the retention clock from access removal, not from approval', () => {
    const accessRemovedAt = new Date('2026-01-01T00:00:00.000Z');

    const expiry = service.expiryFrom(accessRemovedAt, 90);

    expect(expiry.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('refuses to record a negative or fractional retention period', async () => {
    await expect(
      service.record({
        tenantId: TENANT_ID,
        basis: 'STATUTORY',
        authority: 'GDPR art. 17',
        periodDays: -1,
        createdBy: 'dpo-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
