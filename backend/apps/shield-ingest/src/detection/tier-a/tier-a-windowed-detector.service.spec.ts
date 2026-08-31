import {
  TierAWindowedDetectorService,
  TierARuleContract,
} from './tier-a-windowed-detector.service';

describe('TierAWindowedDetectorService', () => {
  let detectorService: TierAWindowedDetectorService;

  const bruteForceRule: TierARuleContract = {
    ruleId: 'ZS-RULE-AUTH-BRUTEFORCE-001',
    version: '1.2.0',
    requiredSchema: 'ocsf.authentication.v1',
    partitionKeyPattern: 'tenant_id:actor_id',
    windowSeconds: 300,
    graceSeconds: 30,
    missingDataBehavior: 'INCOMPLETE',
    replaySemantics: 'DETERMINISTIC_PINNED_SNAPSHOT',
    sloClass: 'TIER_A_SUB_SECOND',
    thresholdCount: 3,
    matchPredicate: (e) => e.payload.auth_status === 'FAILED',
  };

  beforeEach(() => {
    detectorService = new TierAWindowedDetectorService();
  });

  it('should aggregate failed auth events across time window and emit MATCHED AlertCandidate', () => {
    const tenantId = 'tenant-enterprise-01';
    const actorId = 'victim.user@acme.com';

    // 1st failed attempt
    const res1 = detectorService.processStreamEvent(bruteForceRule, {
      eventId: 'evt-1',
      tenantId,
      entityKey: actorId,
      schemaName: 'ocsf.authentication.v1',
      timestamp: new Date().toISOString(),
      payload: { auth_status: 'FAILED' },
    });
    expect(res1.detectionState).toBe('SUPPRESSED_NO_MATCH');

    // 2nd failed attempt
    const res2 = detectorService.processStreamEvent(bruteForceRule, {
      eventId: 'evt-2',
      tenantId,
      entityKey: actorId,
      schemaName: 'ocsf.authentication.v1',
      timestamp: new Date().toISOString(),
      payload: { auth_status: 'FAILED' },
    });
    expect(res2.detectionState).toBe('SUPPRESSED_NO_MATCH');

    // 3rd failed attempt -> Reaches threshold 3
    const res3 = detectorService.processStreamEvent(bruteForceRule, {
      eventId: 'evt-3',
      tenantId,
      entityKey: actorId,
      schemaName: 'ocsf.authentication.v1',
      timestamp: new Date().toISOString(),
      payload: { auth_status: 'FAILED' },
    });
    expect(res3.detectionState).toBe('MATCHED');
    expect(res3.aggregatedEventCount).toBe(3);
    expect(res3.severity).toBe('CRITICAL');
  });

  it('should enforce LAB 08 rule: missing data produces explicit INCOMPLETE state, never low risk', () => {
    const tenantId = 'tenant-enterprise-01';

    const res = detectorService.processStreamEvent(
      bruteForceRule,
      {
        eventId: 'evt-degraded-1',
        tenantId,
        entityKey: 'unknown-entity',
        schemaName: 'ocsf.unrecognized.v1', // Schema mismatch
        timestamp: new Date().toISOString(),
        payload: {},
      },
      true, // Stream degraded flag
    );

    expect(res.detectionState).toBe('INCOMPLETE_MISSING_DATA');
    expect(res.severity).toBe('HIGH');
  });
});
