import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';

export interface DetectionRuleContract {
  ruleId: string;
  version: string;
  requiredSchema: string;
  partitionKey: string;
  windowSeconds: number;
  graceSeconds: number;
  missingDataBehavior: 'INCOMPLETE' | 'ERROR';
  sloClass: 'TIER_A_STREAM' | 'TIER_B_ANALYTICS';
}

export interface SecurityTelemetryEvent {
  eventId: string;
  tenantId: string;
  entityKey: string;
  timestamp: string;
  activityId: number;
  threatScore: number;
}

export interface AlertCandidate {
  alertCandidateId: string;
  ruleId: string;
  ruleVersion: string;
  tenantId: string;
  entityKey: string;
  aggregatedThreatScore: number;
  evidenceEvents: string[];
  deterministicHash: string;
}

describe('LAB 08 — Tier-A Detection & Deterministic Replay Engine', () => {
  const sampleRule: DetectionRuleContract = {
    ruleId: 'rule-brute-force-auth-01',
    version: '1.2.0',
    requiredSchema: 'ocsf.authentication.v1',
    partitionKey: 'tenant_id:entity_key',
    windowSeconds: 300,
    graceSeconds: 60,
    missingDataBehavior: 'INCOMPLETE', // Must be INCOMPLETE, never silently low risk!
    sloClass: 'TIER_A_STREAM',
  };

  function executeDetectionEngine(
    rule: DetectionRuleContract,
    events: SecurityTelemetryEvent[],
  ): AlertCandidate | null {
    // 1. Group by tenant key partition
    const tenantId = events[0]?.tenantId;
    const entityKey = events[0]?.entityKey;
    if (!tenantId || !entityKey) return null;

    // 2. Window aggregate & threshold evaluation
    const matchingEvents = events.filter(
      (e) => e.tenantId === tenantId && e.entityKey === entityKey,
    );
    const aggregatedScore = matchingEvents.reduce(
      (acc, curr) => acc + curr.threatScore,
      0,
    );

    if (aggregatedScore < 50) return null;

    // 3. Construct deterministic alert candidate hash
    const eventIds = matchingEvents.map((e) => e.eventId).sort();
    const deterministicPayload = `${rule.ruleId}|${rule.version}|${tenantId}|${entityKey}|${aggregatedScore}|${eventIds.join(',')}`;
    const deterministicHash = crypto
      .createHash('sha256')
      .update(deterministicPayload)
      .digest('hex');

    return {
      alertCandidateId: `alt-cand-${deterministicHash.slice(0, 16)}`,
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      tenantId,
      entityKey,
      aggregatedThreatScore: aggregatedScore,
      evidenceEvents: eventIds,
      deterministicHash,
    };
  }

  describe('LAB 08 Rule Contract Invariants', () => {
    it('should validate mandatory rule contract fields and forbid SILENT_LOW_RISK missing data behavior', () => {
      expect(sampleRule.ruleId).toBeDefined();
      expect(sampleRule.version).toBeDefined();
      expect(sampleRule.partitionKey).toBe('tenant_id:entity_key');
      expect(sampleRule.windowSeconds).toBeGreaterThan(0);
      expect(sampleRule.missingDataBehavior).toBe('INCOMPLETE');
      expect(sampleRule.missingDataBehavior).not.toBe('SILENT_LOW_RISK' as any);
    });
  });

  describe('Deterministic Replay Verification', () => {
    it('should produce identical alert candidates between live execution and historical replay', () => {
      const fixedEventsFixture: SecurityTelemetryEvent[] = [
        {
          eventId: 'evt-auth-fail-001',
          tenantId: 'tenant-alpha',
          entityKey: 'user-finance-analyst-1',
          timestamp: '2026-09-07T08:00:00Z',
          activityId: 101,
          threatScore: 20,
        },
        {
          eventId: 'evt-auth-fail-002',
          tenantId: 'tenant-alpha',
          entityKey: 'user-finance-analyst-1',
          timestamp: '2026-09-07T08:01:00Z',
          activityId: 101,
          threatScore: 20,
        },
        {
          eventId: 'evt-auth-fail-003',
          tenantId: 'tenant-alpha',
          entityKey: 'user-finance-analyst-1',
          timestamp: '2026-09-07T08:02:00Z',
          activityId: 101,
          threatScore: 20,
        },
      ];

      // Live run
      const liveAlert = executeDetectionEngine(sampleRule, fixedEventsFixture);
      expect(liveAlert).not.toBeNull();
      expect(liveAlert!.aggregatedThreatScore).toBe(60);

      // Replay run over same fixture
      const replayAlert = executeDetectionEngine(
        sampleRule,
        fixedEventsFixture,
      );
      expect(replayAlert).not.toBeNull();

      // Invariant: alert hash and evidence linkage must be identical
      expect(replayAlert!.deterministicHash).toBe(liveAlert!.deterministicHash);
      expect(replayAlert!.alertCandidateId).toBe(liveAlert!.alertCandidateId);
      expect(replayAlert!.evidenceEvents).toEqual(liveAlert!.evidenceEvents);
    });
  });
});
