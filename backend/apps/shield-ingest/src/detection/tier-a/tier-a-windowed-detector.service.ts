import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface TierARuleContract {
  ruleId: string;
  version: string;
  requiredSchema: string; // e.g. 'ocsf.authentication.v1'
  partitionKeyPattern: 'tenant_id:actor_id' | 'tenant_id:target_host';
  windowSeconds: number;
  graceSeconds: number;
  missingDataBehavior: 'INCOMPLETE'; // Mandatory per LAB 08
  replaySemantics: 'DETERMINISTIC_PINNED_SNAPSHOT';
  sloClass: 'TIER_A_SUB_SECOND';
  thresholdCount: number;
  matchPredicate: (event: NormalizedStreamEvent) => boolean;
}

export interface NormalizedStreamEvent {
  eventId: string;
  tenantId: string;
  entityKey: string; // e.g. actor email or hostname
  schemaName: string;
  timestamp: string; // ISO 8601
  payload: Record<string, any>;
}

export interface AlertCandidate {
  candidateId: string;
  ruleId: string;
  ruleVersion: string;
  tenantId: string;
  partitionKey: string;
  windowStart: string;
  windowEnd: string;
  detectionState: 'MATCHED' | 'INCOMPLETE_MISSING_DATA' | 'SUPPRESSED_NO_MATCH';
  aggregatedEventCount: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidenceReferences: string[];
  emittedAt: string;
  attestationDigest: string;
}

/**
 * Deterministic Tier-A Windowed Stream Detector & Missing-Data Policy
 * Specification: Backend Build Guide §LAB 08 (Provision Kafka and Implement Tier-A Detection)
 */
@Injectable()
export class TierAWindowedDetectorService {
  private readonly logger = new Logger(TierAWindowedDetectorService.name);

  // In-memory sliding time windows partitioned by `${tenantId}:${ruleId}:${entityKey}`
  private readonly eventWindows = new Map<string, NormalizedStreamEvent[]>();

  /**
   * Processes a stream event through windowed aggregation and evaluates against Tier-A rule contract.
   */
  processStreamEvent(
    rule: TierARuleContract,
    event: NormalizedStreamEvent,
    isStreamDegradedOrMissingContext = false,
  ): AlertCandidate {
    const candidateId = `alert-cand-${crypto.randomUUID()}`;
    const emittedAt = new Date().toISOString();
    const partitionKey = `${event.tenantId}:${event.entityKey}`;
    const windowKey = `${event.tenantId}:${rule.ruleId}:${event.entityKey}`;

    // LAB 08 Binding Invariant: Missing data must produce explicit INCOMPLETE state, never silently low risk.
    if (isStreamDegradedOrMissingContext || !event.entityKey || event.schemaName !== rule.requiredSchema) {
      this.logger.warn(
        `⚠️ [TIER-A DETECTOR INCOMPLETE] Rule '${rule.ruleId}' encountered missing/degraded data stream for partition '${partitionKey}'. State: INCOMPLETE_MISSING_DATA`,
      );

      const attestationDigest = crypto
        .createHash('sha256')
        .update(JSON.stringify({ candidateId, ruleId: rule.ruleId, state: 'INCOMPLETE_MISSING_DATA', emittedAt }))
        .digest('hex');

      return {
        candidateId,
        ruleId: rule.ruleId,
        ruleVersion: rule.version,
        tenantId: event.tenantId,
        partitionKey,
        windowStart: new Date(Date.now() - rule.windowSeconds * 1000).toISOString(),
        windowEnd: emittedAt,
        detectionState: 'INCOMPLETE_MISSING_DATA',
        aggregatedEventCount: 0,
        severity: 'HIGH', // Flag incomplete states with high urgency for human triage
        evidenceReferences: [event.eventId],
        emittedAt,
        attestationDigest,
      };
    }

    if (!this.eventWindows.has(windowKey)) {
      this.eventWindows.set(windowKey, []);
    }
    const windowEvents = this.eventWindows.get(windowKey)!;

    // Append event and prune events outside the window + grace period
    windowEvents.push(event);
    const eventTimeMs = new Date(event.timestamp).getTime();
    const windowThresholdMs = eventTimeMs - (rule.windowSeconds + rule.graceSeconds) * 1000;

    const activeEvents = windowEvents.filter((e) => new Date(e.timestamp).getTime() >= windowThresholdMs);
    this.eventWindows.set(windowKey, activeEvents);

    // Apply rule predicate filter
    const matchedEvents = activeEvents.filter((e) => rule.matchPredicate(e));
    const isMatched = matchedEvents.length >= rule.thresholdCount;

    const detectionState = isMatched ? 'MATCHED' : 'SUPPRESSED_NO_MATCH';
    const severity = isMatched ? 'CRITICAL' : 'LOW';

    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          candidateId,
          ruleId: rule.ruleId,
          partitionKey,
          detectionState,
          matchedCount: matchedEvents.length,
          emittedAt,
        }),
      )
      .digest('hex');

    if (isMatched) {
      this.logger.warn(
        `🚨 [TIER-A ALERT CANDIDATE] Rule '${rule.ruleId}' MATCHED on partition '${partitionKey}' (${matchedEvents.length} events >= threshold ${rule.thresholdCount})`,
      );
    }

    return {
      candidateId,
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      tenantId: event.tenantId,
      partitionKey,
      windowStart: new Date(windowThresholdMs).toISOString(),
      windowEnd: emittedAt,
      detectionState,
      aggregatedEventCount: matchedEvents.length,
      severity,
      evidenceReferences: matchedEvents.map((e) => e.eventId),
      emittedAt,
      attestationDigest,
    };
  }
}
