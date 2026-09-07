import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface ClickHouseQueryPlan {
  query: string;
  params: Record<string, unknown>;
  tenantId: string;
  partitionKey: string;
  pscEndpoint: string;
}

export interface SecurityEventRecord {
  tenantId: string;
  eventTime: string;
  eventId: string;
  className: string;
  activityId: number;
  severity: number;
  actorId: string;
  targetId: string;
  payloadJson: string;
  schemaVersion: string;
}

export interface AnalyticalDetectionResult {
  ruleId: string;
  tenantId: string;
  matchedEventCount: number;
  targetEntity: string;
  severity: 'HIGH' | 'CRITICAL' | 'MEDIUM';
  queryDigest: string;
  executedAt: string;
}

@Injectable()
export class ClickHouseDetectorService {
  private readonly logger = new Logger(ClickHouseDetectorService.name);
  private readonly pscEndpoint =
    'clickhouse-psc.prod.zoikoshield.internal:8443';

  /**
   * Generates a safe, parameterized ClickHouse analytical detection query.
   * Guarantees:
   * 1. Mandatory tenant_id filter bound in query parameters.
   * 2. No string concatenation of tenant input into SQL query text.
   * 3. Partitions by (tenant_id, toYYYYMM(event_time)).
   */
  buildAnalyticalQueryPlan(
    tenantId: string,
    timeRange: { start: string; end: string },
    actorId?: string,
    minSeverity = 3,
  ): ClickHouseQueryPlan {
    if (!tenantId || tenantId.trim() === '') {
      throw new BadRequestException('MANDATORY_TENANT_ID_REQUIRED');
    }

    // Prohibit raw SQL injection tokens or LLM free-text queries
    if (
      tenantId.includes("'") ||
      tenantId.includes(';') ||
      tenantId.includes('--')
    ) {
      throw new BadRequestException('ILLEGAL_CHARACTERS_IN_TENANT_IDENTIFIER');
    }

    const query = `
      SELECT
        tenant_id,
        actor_id,
        target_id,
        count() AS event_count,
        max(severity) AS max_severity
      FROM security_events
      WHERE tenant_id = {tenantId:String}
        AND event_time >= {startTime:DateTime64(3,'UTC')}
        AND event_time <= {endTime:DateTime64(3,'UTC')}
        AND severity >= {minSeverity:UInt8}
        ${actorId ? 'AND actor_id = {actorId:String}' : ''}
      GROUP BY tenant_id, actor_id, target_id
      HAVING event_count >= {threshold:UInt32}
      ORDER BY event_count DESC
    `.trim();

    const params: Record<string, unknown> = {
      tenantId,
      startTime: timeRange.start,
      endTime: timeRange.end,
      minSeverity,
      threshold: 5,
    };

    if (actorId) {
      params.actorId = actorId;
    }

    const date = new Date(timeRange.start);
    const yyyymm = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const partitionKey = `${tenantId}:${yyyymm}`;

    return {
      query,
      params,
      tenantId,
      partitionKey,
      pscEndpoint: this.pscEndpoint,
    };
  }

  /**
   * Simulates execution against ClickHouse Private Service Connect.
   */
  executeTierBDetection(
    plan: ClickHouseQueryPlan,
    mockDataset: SecurityEventRecord[] = [],
  ): AnalyticalDetectionResult {
    // Enforce tenant partition match
    const tenantEvents = mockDataset.filter(
      (e) =>
        e.tenantId === plan.tenantId &&
        e.severity >= Number(plan.params.minSeverity ?? 1),
    );

    const queryDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ query: plan.query, params: plan.params }))
      .digest('hex');

    this.logger.log(
      `✔ ClickHouse Tier-B query executed for tenant '${plan.tenantId}' via PSC [Partition: ${plan.partitionKey}]`,
    );

    return {
      ruleId: 'rule-ch-persistence-anomaly-01',
      tenantId: plan.tenantId,
      matchedEventCount: tenantEvents.length,
      targetEntity: tenantEvents[0]?.targetId || 'target-infrastructure',
      severity: tenantEvents.length > 10 ? 'CRITICAL' : 'HIGH',
      queryDigest,
      executedAt: new Date().toISOString(),
    };
  }
}
