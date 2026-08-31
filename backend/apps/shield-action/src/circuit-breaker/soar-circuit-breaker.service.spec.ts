import { SoarCircuitBreakerService } from './soar-circuit-breaker.service';

describe('SoarCircuitBreakerService', () => {
  let circuitBreaker: SoarCircuitBreakerService;

  beforeEach(() => {
    circuitBreaker = new SoarCircuitBreakerService();
  });

  it('should allow actions when error rate and blast radius are within bounds', () => {
    const tenantId = 'tenant-corp-01';
    const playbookId = 'pb-isolate-endpoint';

    const check = circuitBreaker.canExecuteAction(tenantId, playbookId, 'host-prod-01', 5);
    expect(check.isActionAllowed).toBe(true);
    expect(check.state).toBe('CLOSED');

    circuitBreaker.recordActionOutcome({
      actionId: 'act-01',
      playbookId,
      tenantId,
      targetResource: 'host-prod-01',
      status: 'SUCCESS',
      durationMs: 120,
    });
  });

  it('should trip to OPEN when error rate exceeds threshold', () => {
    const tenantId = 'tenant-corp-01';
    const playbookId = 'pb-revoke-iam';

    // 3 consecutive failures
    circuitBreaker.recordActionOutcome({ actionId: 'act-1', playbookId, tenantId, targetResource: 'role-1', status: 'FAILED', durationMs: 50 });
    circuitBreaker.recordActionOutcome({ actionId: 'act-2', playbookId, tenantId, targetResource: 'role-2', status: 'FAILED', durationMs: 50 });
    const status = circuitBreaker.recordActionOutcome({ actionId: 'act-3', playbookId, tenantId, targetResource: 'role-3', status: 'FAILED', durationMs: 50 });

    expect(status.state).toBe('OPEN');
    expect(status.isActionAllowed).toBe(false);

    const check = circuitBreaker.canExecuteAction(tenantId, playbookId, 'role-4');
    expect(check.isActionAllowed).toBe(false);
    expect(check.state).toBe('OPEN');
  });

  it('should trip when blast radius limit of distinct targets is exceeded', () => {
    const tenantId = 'tenant-corp-01';
    const playbookId = 'pb-quarantine-subnet';

    // Max limit = 2 targets
    circuitBreaker.recordActionOutcome({ actionId: 'act-1', playbookId, tenantId, targetResource: 'pod-1', status: 'SUCCESS', durationMs: 50 });
    circuitBreaker.recordActionOutcome({ actionId: 'act-2', playbookId, tenantId, targetResource: 'pod-2', status: 'SUCCESS', durationMs: 50 });

    // Attempting 3rd target when limit is 2
    const check = circuitBreaker.canExecuteAction(tenantId, playbookId, 'pod-3', 2);
    expect(check.isActionAllowed).toBe(false);
    expect(check.state).toBe('OPEN');
  });
});
