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

  describe('deterministic replay', () => {
    /**
     * "Deterministic replay" is asserted on the semantic decision fields only
     * (detectionState, aggregatedEventCount, severity, evidenceReferences,
     * partitionKey). candidateId/attestationDigest/emittedAt are allowed to
     * differ between runs — they embed crypto.randomUUID()/Date.now(), which
     * are inherently per-call, not part of the rule's decision.
     */
    const fixedTimestamps = [
      '2026-09-07T08:00:00.000Z',
      '2026-09-07T08:00:10.000Z',
      '2026-09-07T08:00:20.000Z',
    ];
    const buildEventSequence = (tenantId: string, entityKey: string) =>
      fixedTimestamps.map((timestamp, i) => ({
        eventId: `evt-${i + 1}`,
        tenantId,
        entityKey,
        schemaName: 'ocsf.authentication.v1',
        timestamp,
        payload: { auth_status: 'FAILED' },
      }));

    it('produces bit-identical semantic decisions between an independent live run and an independent historical replay run over the same fixed event sequence', () => {
      const tenantId = 'tenant-replay-check';
      const entityKey = 'victim.replay@acme.com';
      const events = buildEventSequence(tenantId, entityKey);

      // Two independent instances: the service is stateful (in-memory
      // eventWindows keyed by windowKey), so determinism must hold across
      // two separate windows fed the identical sequence, not just repeated
      // calls on the same instance.
      const liveInstance = new TierAWindowedDetectorService();
      const replayInstance = new TierAWindowedDetectorService();

      const liveResults = events.map((e) =>
        liveInstance.processStreamEvent(bruteForceRule, e),
      );
      const replayResults = events.map((e) =>
        replayInstance.processStreamEvent(bruteForceRule, e),
      );

      liveResults.forEach((live, i) => {
        const replay = replayResults[i];
        expect(replay.detectionState).toBe(live.detectionState);
        expect(replay.aggregatedEventCount).toBe(live.aggregatedEventCount);
        expect(replay.severity).toBe(live.severity);
        expect(replay.evidenceReferences).toEqual(live.evidenceReferences);
        expect(replay.partitionKey).toBe(live.partitionKey);
      });

      // The final event reaches the threshold in both runs identically.
      expect(liveResults[2].detectionState).toBe('MATCHED');
      expect(replayResults[2].detectionState).toBe('MATCHED');

      // These fields are explicitly NOT required to match — documenting why,
      // rather than silently ignoring them.
      expect(liveResults[2].candidateId).not.toBe(replayResults[2].candidateId);
    });

    it('replays an INCOMPLETE_MISSING_DATA decision identically as well', () => {
      const tenantId = 'tenant-replay-incomplete';
      const event = {
        eventId: 'evt-degraded-1',
        tenantId,
        entityKey: 'unknown-entity',
        schemaName: 'ocsf.unrecognized.v1',
        timestamp: '2026-09-07T08:00:00.000Z',
        payload: {},
      };

      const live = new TierAWindowedDetectorService().processStreamEvent(
        bruteForceRule,
        event,
        true,
      );
      const replay = new TierAWindowedDetectorService().processStreamEvent(
        bruteForceRule,
        event,
        true,
      );

      expect(replay.detectionState).toBe('INCOMPLETE_MISSING_DATA');
      expect(replay.detectionState).toBe(live.detectionState);
      expect(replay.severity).toBe(live.severity);
    });
  });
});
