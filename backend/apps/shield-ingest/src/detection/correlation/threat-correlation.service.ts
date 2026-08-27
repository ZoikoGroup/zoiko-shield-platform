import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface SecurityTelemetryEvent {
  eventId: string;
  source: 'IDENTITY_OKTA' | 'CLOUD_GUARDDUTY' | 'EDR_CORTEX' | 'EDR_CROWDSTRIKE' | 'AUDIT_CLOUDTRAIL';
  eventTime: number;
  principalUser?: string;
  targetHost?: string;
  targetIp?: string;
  mitreTactic?: string;
  mitreTechnique?: string;
  rawSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  payload: Record<string, any>;
}

export interface CorrelatedThreatIncident {
  incidentId: string;
  tenantId: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScore: number; // 0.0 to 1.0
  correlatedEventsCount: number;
  killChainStages: string[];
  affectedEntities: {
    users: string[];
    hosts: string[];
    ips: string[];
  };
  events: SecurityTelemetryEvent[];
  recommendedPlaybook: {
    playbookKey: string;
    playbookName: string;
    requiredAuthority: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
    actions: Array<{
      actionType: string;
      target: string;
    }>;
  };
  correlationDigest: string;
  detectedAt: string;
}

@Injectable()
export class ThreatCorrelationService {
  private readonly logger = new Logger(ThreatCorrelationService.name);

  /**
   * Correlates an array of temporal multi-source security events into composite threat incidents.
   */
  correlateTelemetryStream(
    tenantId: string,
    events: SecurityTelemetryEvent[],
    windowMinutes: number = 30,
  ): CorrelatedThreatIncident[] {
    this.logger.log(`Evaluating ${events.length} telemetry events for multi-vector threat correlation...`);

    const incidents: CorrelatedThreatIncident[] = [];
    if (events.length === 0) return incidents;

    // Group events by entity pivot (user, host, or related cluster)
    const entityGroups = new Map<string, SecurityTelemetryEvent[]>();

    for (const evt of events) {
      const pivotKey = evt.principalUser || evt.targetHost || evt.targetIp || 'global-unassigned';
      if (!entityGroups.has(pivotKey)) {
        entityGroups.set(pivotKey, []);
      }
      entityGroups.get(pivotKey)!.push(evt);
    }

    for (const [pivot, groupEvents] of entityGroups.entries()) {
      if (groupEvents.length < 2) {
        // Standalone event (not a multi-vector correlated incident)
        continue;
      }

      // Check temporal window
      const timestamps = groupEvents.map((e) => e.eventTime);
      const minTime = Math.min(...timestamps);
      const maxTime = Math.max(...timestamps);
      const durationMinutes = (maxTime - minTime) / (1000 * 60);

      if (durationMinutes > windowMinutes) {
        continue; // Exceeds correlation window
      }

      const killChainStages = Array.from(
        new Set(groupEvents.map((e) => e.mitreTactic || 'Execution').filter(Boolean)),
      );

      const users = Array.from(new Set(groupEvents.map((e) => e.principalUser).filter((u): u is string => !!u)));
      const hosts = Array.from(new Set(groupEvents.map((e) => e.targetHost).filter((h): h is string => !!h)));
      const ips = Array.from(new Set(groupEvents.map((e) => e.targetIp).filter((i): i is string => !!i)));

      // Multi-stage progression escalates severity to CRITICAL
      const isMultiStage = killChainStages.length >= 2;
      const severity = isMultiStage ? 'CRITICAL' : 'HIGH';
      const confidence = Math.min(1.0, 0.65 + groupEvents.length * 0.1);

      const actions: Array<{ actionType: string; target: string }> = [];
      for (const host of hosts) {
        actions.push({ actionType: 'ISOLATE_ENDPOINT', target: host });
      }
      for (const user of users) {
        actions.push({ actionType: 'DISABLE_USER_ACCOUNT', target: user });
      }

      const incidentId = `inc-corr-${crypto.randomUUID()}`;
      const correlationDigest = crypto
        .createHash('sha256')
        .update(JSON.stringify({ tenantId, pivot, eventIds: groupEvents.map((e) => e.eventId) }))
        .digest('hex');

      incidents.push({
        incidentId,
        tenantId,
        title: `Coordinated Multi-Vector Threat Attack on [${pivot}]`,
        severity,
        confidenceScore: confidence,
        correlatedEventsCount: groupEvents.length,
        killChainStages,
        affectedEntities: { users, hosts, ips },
        events: groupEvents,
        recommendedPlaybook: {
          playbookKey: 'PB-ENTERPRISE-CONTAINMENT-01',
          playbookName: 'Multi-Vector Autonomous Host & User Containment Playbook',
          requiredAuthority: isMultiStage ? 'R1' : 'R2',
          actions,
        },
        correlationDigest,
        detectedAt: new Date().toISOString(),
      });
    }

    return incidents;
  }
}
