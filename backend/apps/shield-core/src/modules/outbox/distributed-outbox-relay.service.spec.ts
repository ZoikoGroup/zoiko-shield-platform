import { DistributedOutboxRelayService } from './distributed-outbox-relay.service';

describe('DistributedOutboxRelayService (Reliable CDC Event Relay)', () => {
  let service: DistributedOutboxRelayService;

  beforeEach(() => {
    service = new DistributedOutboxRelayService();
  });

  it('1. should enqueue and successfully relay events to destination topics', async () => {
    service.enqueueEvent('identity.user.provisioned', 'tenant-acme', {
      userId: 'usr-101',
      email: 'sec-lead@acme.com',
    });

    service.enqueueEvent('detection.alert.created', 'tenant-acme', {
      alertId: 'alt-202',
      severity: 'CRITICAL',
    });

    const result = await service.processBatch(10);
    expect(result.claimedCount).toBe(2);
    expect(result.publishedCount).toBe(2);
    expect(result.dlqCount).toBe(0);

    const metrics = service.getMetrics();
    expect(metrics.pendingCount).toBe(0);
    expect(metrics.publishedCount).toBe(2);
  });

  it('2. should retry transient failures up to maxAttempts', async () => {
    service.enqueueEvent(
      'incident.promoted',
      'tenant-acme',
      { incId: 'inc-999' },
      3,
    );

    // Fail first 2 attempts
    let attempt = 0;
    const failTwice = () => {
      attempt++;
      return attempt <= 2;
    };

    // Iteration 1: Attempt 1 fails
    let res = await service.processBatch(10, failTwice);
    expect(res.publishedCount).toBe(0);
    expect(res.dlqCount).toBe(0);

    // Iteration 2: Attempt 2 fails
    res = await service.processBatch(10, failTwice);
    expect(res.publishedCount).toBe(0);
    expect(res.dlqCount).toBe(0);

    // Iteration 3: Attempt 3 succeeds
    res = await service.processBatch(10, failTwice);
    expect(res.publishedCount).toBe(1);
    expect(res.dlqCount).toBe(0);
  });

  it('3. should route poison events to Dead Letter Queue (DLQ) when maxAttempts exceeded', async () => {
    service.enqueueEvent(
      'action.dispatched',
      'tenant-acme',
      { poisonPayload: true },
      2,
    );

    // Always fail
    const alwaysFail = () => true;

    // Attempt 1
    await service.processBatch(10, alwaysFail);
    // Attempt 2 -> Reaches maxAttempts 2 -> Moved to DLQ
    const res = await service.processBatch(10, alwaysFail);

    expect(res.dlqCount).toBe(1);
    const metrics = service.getMetrics();
    expect(metrics.dlqCount).toBe(1);
    expect(metrics.pendingCount).toBe(0);
  });
});
