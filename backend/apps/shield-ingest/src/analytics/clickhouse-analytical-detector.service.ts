import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface SecurityEventRecord {
  tenantId: string;
  eventTime: string; // ISO 8601
  eventId: string;
  className: string; // e.g. 'Authentication', 'ProcessActivity', 'NetworkActivity'
  activityId: number;
  severity: number; // 1 = Low, 2 = Medium, 3 = High, 4 = Critical
  actorId: string;
  targetId: string;
  payloadJson: string;
  schemaVersion: string;
}

export interface ParameterizedQuerySpec {
  tenantId: string;
  timeRangeStart: string;
  timeRangeEnd: string;
  className?: string;
  actorId?: string;
  targetId?: string;
  minSeverity?: number;
  limit: number;
}

export interface AnalyticalDetectionFinding {
  findingId: string;
  tenantId: string;
  detectionRuleId: string;
  anomalyType: string;
  totalScannedEvents: number;
  matchedEventIds: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  queryPlan: string;
  executedAt: string;
  attestationDigest: string;
}

/**
 * ClickHouse Parameterized Analytical Detections Engine
 * Specification: Backend Build Guide §LAB 09 (ClickHouse Analytical Detections)
 */
@Injectable()
export class ClickhouseAnalyticalDetectorService {
  private readonly logger = new Logger(ClickhouseAnalyticalDetectorService.name);

  // In-memory simulated ClickHouse MergeTree storage partitioned by (tenant_id, toYYYYMM(event_time))
  private readonly mergeTreeStore = new Map<string, SecurityEventRecord[]>();

  /**
   * Ingests a batch of normalized security events into the MergeTree partitioned store.
   */
  insertEvents(events: SecurityEventRecord[]): { insertedCount: number; partitions: string[] } {
    const affectedPartitions = new Set<string>();

    for (const evt of events) {
      const yearMonth = evt.eventTime.slice(0, 7).replace('-', ''); // e.g. '202608'
      const partitionKey = `${evt.tenantId}:${yearMonth}`;
      affectedPartitions.add(partitionKey);

      if (!this.mergeTreeStore.has(partitionKey)) {
        this.mergeTreeStore.set(partitionKey, []);
      }
      this.mergeTreeStore.get(partitionKey)!.push(evt);
    }

    return { insertedCount: events.length, partitions: Array.from(affectedPartitions) };
  }

  /**
   * Executes a parameterized, tenant-scoped analytical query over partitioned MergeTree data.
   * Strictly enforces LAB 09 mandate: no ad-hoc SQL, no concatenation, no cross-tenant scans.
   */
  executeParameterizedDetection(spec: ParameterizedQuerySpec, ruleId: string): AnalyticalDetectionFinding {
    if (!spec.tenantId || spec.tenantId.trim() === '') {
      throw new Error('LAB 09 Invariant Violation: Parameterized query must specify explicit tenant_id.');
    }

    const findingId = `find-ch-${crypto.randomUUID()}`;
    const executedAt = new Date().toISOString();

    const startMs = new Date(spec.timeRangeStart).getTime();
    const endMs = new Date(spec.timeRangeEnd).getTime();

    // Query Plan construction with bind parameters
    const queryPlan = `SELECT event_id, event_time, class_name, actor_id, target_id, severity FROM security_events PREWHERE tenant_id = {tenantId:String} AND event_time BETWEEN {start:DateTime64} AND {end:DateTime64} ${spec.className ? 'AND class_name = {className:String}' : ''} ${spec.actorId ? 'AND actor_id = {actorId:String}' : ''} ORDER BY tenant_id, event_time, class_name, event_id LIMIT {limit:UInt32}`;

    let totalScanned = 0;
    const matchedEventIds: string[] = [];

    // Scan only partitions belonging to the target tenant
    for (const [partitionKey, records] of this.mergeTreeStore.entries()) {
      if (!partitionKey.startsWith(`${spec.tenantId}:`)) {
        continue; // Strict tenant boundary partition skipping
      }

      totalScanned += records.length;
      for (const rec of records) {
        const recTimeMs = new Date(rec.eventTime).getTime();
        if (recTimeMs < startMs || recTimeMs > endMs) continue;
        if (spec.className && rec.className !== spec.className) continue;
        if (spec.actorId && rec.actorId !== spec.actorId) continue;
        if (spec.targetId && rec.targetId !== spec.targetId) continue;
        if (spec.minSeverity && rec.severity < spec.minSeverity) continue;

        matchedEventIds.push(rec.eventId);
        if (matchedEventIds.length >= spec.limit) break;
      }
    }

    const isAnomalyDetected = matchedEventIds.length >= 3;
    const severity = isAnomalyDetected ? 'HIGH' : 'LOW';

    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          findingId,
          tenantId: spec.tenantId,
          ruleId,
          totalScanned,
          matchedCount: matchedEventIds.length,
          queryPlan,
          executedAt,
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ [CLICKHOUSE ANALYTICAL SCAN] Rule '${ruleId}' executed for Tenant '${spec.tenantId}': scanned ${totalScanned} records, found ${matchedEventIds.length} matches (Partition-pruned)`,
    );

    return {
      findingId,
      tenantId: spec.tenantId,
      detectionRuleId: ruleId,
      anomalyType: 'PERSISTENT_LATERAL_SCAN_BURST',
      totalScannedEvents: totalScanned,
      matchedEventIds,
      severity,
      queryPlan,
      executedAt,
      attestationDigest,
    };
  }
}
