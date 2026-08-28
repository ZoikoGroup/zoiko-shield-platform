import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface InFlightSecurityEvent {
  eventId: string;
  tenantId: string;
  classUid: number;
  severityId: number;
  actor: {
    userName?: string;
    processName?: string;
    sourceIp?: string;
  };
  rawPayload: Record<string, any>;
  timestampEpochMs: number;
}

export interface ThreatHuntingPredicate {
  queryId: string;
  queryName: string;
  minSeverityId?: number;
  processNamePattern?: string;
  sourceIpPattern?: string;
  userNamePattern?: string;
}

export interface ThreatHuntingMatch {
  matchId: string;
  queryId: string;
  queryName: string;
  matchingEvent: InFlightSecurityEvent;
  matchedAt: string;
  processingLatencyMs: number;
  queryDigest: string;
}

/**
 * In-Flight Zero-Copy Real-Time Threat Hunting Engine
 * Specification: ZS-SOC-FEED-001 §9 (Sub-Millisecond Stream Threat Hunting)
 */
@Injectable()
export class StreamThreatHuntingService {
  private readonly logger = new Logger(StreamThreatHuntingService.name);

  // In-Memory Circular Ring Buffer for In-Flight Events (Capacity: 10,000 recent events)
  private readonly ringBuffer: InFlightSecurityEvent[] = [];
  private readonly maxBufferSize = 10000;

  /**
   * Ingests event into streaming ring buffer.
   */
  ingestToStreamBuffer(event: InFlightSecurityEvent): void {
    if (this.ringBuffer.length >= this.maxBufferSize) {
      this.ringBuffer.shift(); // Evict oldest event
    }
    this.ringBuffer.push(event);
  }

  /**
   * Executes sub-millisecond threat hunting query against in-flight events.
   */
  executeQuery(predicate: ThreatHuntingPredicate): ThreatHuntingMatch[] {
    const startTime = Date.now();
    const matches: ThreatHuntingMatch[] = [];

    for (const event of this.ringBuffer) {
      // 1. Severity filter
      if (
        predicate.minSeverityId !== undefined &&
        event.severityId < predicate.minSeverityId
      ) {
        continue;
      }

      // 2. Process name pattern filter
      if (
        predicate.processNamePattern &&
        (!event.actor.processName ||
          !event.actor.processName
            .toLowerCase()
            .includes(predicate.processNamePattern.toLowerCase()))
      ) {
        continue;
      }

      // 3. Source IP filter
      if (
        predicate.sourceIpPattern &&
        (!event.actor.sourceIp ||
          !event.actor.sourceIp.includes(predicate.sourceIpPattern))
      ) {
        continue;
      }

      // 4. User Name filter
      if (
        predicate.userNamePattern &&
        (!event.actor.userName ||
          !event.actor.userName
            .toLowerCase()
            .includes(predicate.userNamePattern.toLowerCase()))
      ) {
        continue;
      }

      const matchId = `match-${crypto.randomUUID().slice(0, 8)}`;
      const matchedAt = new Date().toISOString();
      const processingLatencyMs = Math.max(0.1, Date.now() - startTime);

      const queryDigest = crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            matchId,
            queryId: predicate.queryId,
            eventId: event.eventId,
            matchedAt,
          }),
        )
        .digest('hex');

      matches.push({
        matchId,
        queryId: predicate.queryId,
        queryName: predicate.queryName,
        matchingEvent: event,
        matchedAt,
        processingLatencyMs,
        queryDigest,
      });
    }

    this.logger.log(
      `Threat hunting query "${predicate.queryName}" matched ${matches.length} in-flight events across ${this.ringBuffer.length} buffer entries in ${Date.now() - startTime}ms`,
    );

    return matches;
  }

  getBufferCount(): number {
    return this.ringBuffer.length;
  }
}
