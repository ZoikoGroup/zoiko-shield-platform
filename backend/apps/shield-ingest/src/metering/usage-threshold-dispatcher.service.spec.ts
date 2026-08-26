import { Test, TestingModule } from '@nestjs/testing';
import { UsageThresholdDispatcherService } from './usage-threshold-dispatcher.service';

describe('UsageThresholdDispatcherService (ZS-COM-BILL-001 MET-03 Threshold & Surge Safety)', () => {
  let service: UsageThresholdDispatcherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsageThresholdDispatcherService],
    }).compile();

    service = module.get<UsageThresholdDispatcherService>(
      UsageThresholdDispatcherService,
    );
  });

  it('dispatches 75% threshold warning when volume crosses 75% of quota', () => {
    const event = service.evaluateUsageThreshold(
      'tenant-001',
      'TELEMETRY_GB',
      760,
      1000,
    );

    expect(event).not.toBeNull();
    expect(event?.thresholdTier).toBe('75_PERCENT');
    expect(event?.utilizationPercentage).toBe(76.0);
    expect(event?.actionRequired).toBe('NOTIFY_ADMIN');
  });

  it('dispatches progressive 90% threshold warning when volume increases', () => {
    // 75% first
    service.evaluateUsageThreshold('tenant-001', 'TELEMETRY_GB', 750, 1000);

    // 90% next
    const event90 = service.evaluateUsageThreshold(
      'tenant-001',
      'TELEMETRY_GB',
      920,
      1000,
    );
    expect(event90).not.toBeNull();
    expect(event90?.thresholdTier).toBe('90_PERCENT');
    expect(event90?.utilizationPercentage).toBe(92.0);
  });

  it('dispatches 100% threshold with SURGE_SAFE_CONTINUATION to prevent dropping critical logs', () => {
    const event100 = service.evaluateUsageThreshold(
      'tenant-002',
      'TELEMETRY_GB',
      1050,
      1000,
    );

    expect(event100).not.toBeNull();
    expect(event100?.thresholdTier).toBe('100_PERCENT_REACHED');
    expect(event100?.actionRequired).toBe('SURGE_SAFE_CONTINUATION');
  });

  it('deduplicates alerts so the same tier is not dispatched multiple times in the same window', () => {
    const firstCall = service.evaluateUsageThreshold(
      'tenant-003',
      'TELEMETRY_GB',
      780,
      1000,
    );
    expect(firstCall).not.toBeNull();

    const secondCall = service.evaluateUsageThreshold(
      'tenant-003',
      'TELEMETRY_GB',
      790,
      1000,
    );
    expect(secondCall).toBeNull(); // Deduplicated
  });

  it('guarantees critical security logs are never dropped during surge periods (§8 D4)', () => {
    const isAllowed = service.isSurgeSafeIngestionAllowed('tenant-003', true);
    expect(isAllowed).toBe(true);
  });
});
