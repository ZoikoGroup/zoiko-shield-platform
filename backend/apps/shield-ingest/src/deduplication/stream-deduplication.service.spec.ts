import { StreamDeduplicationService } from './stream-deduplication.service';

describe('StreamDeduplicationService (High-Throughput Stream Deduplication)', () => {
  let service: StreamDeduplicationService;

  beforeEach(() => {
    service = new StreamDeduplicationService();
  });

  it('1. should accept unique telemetry events and reject duplicate bursts', () => {
    const tenantId = 'tenant-acme';
    const payload = {
      host: 'PROD-DB-01',
      process: 'powershell.exe',
      command: '-enc SQBFAFgA...',
    };

    // First ingestion -> Accepted
    const check1 = service.checkAndRegister(
      tenantId,
      'EDR_PROCESS_SPAWN',
      payload,
    );
    expect(check1.isDuplicate).toBe(false);

    // Exact duplicate ingestion in same window -> Discarded
    const check2 = service.checkAndRegister(
      tenantId,
      'EDR_PROCESS_SPAWN',
      payload,
    );
    expect(check2.isDuplicate).toBe(true);

    // Different event payload -> Accepted
    const check3 = service.checkAndRegister(tenantId, 'EDR_PROCESS_SPAWN', {
      ...payload,
      host: 'PROD-WEB-02',
    });
    expect(check3.isDuplicate).toBe(false);
  });

  it('2. should maintain accurate throughput and deduplication metrics', () => {
    const tenantId = 'tenant-globex';
    const payload = { ip: '198.51.100.4', reason: 'PORT_SCAN' };

    // Send 10 identical events
    for (let i = 0; i < 10; i++) {
      service.checkAndRegister(tenantId, 'NETWORK_FIREWALL_DROP', payload);
    }

    const metrics = service.getMetrics();
    expect(metrics.totalEvaluated).toBe(10);
    expect(metrics.uniqueIngested).toBe(1);
    expect(metrics.duplicatesDiscarded).toBe(9);
    expect(metrics.deduplicationRatio).toBe(0.9); // 90% duplicate reduction
  });
});
