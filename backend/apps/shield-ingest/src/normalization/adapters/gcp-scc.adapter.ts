/**
 * Google Cloud Security Command Center OCSF Normalization Adapter
 * Maps GCP SCC's finding shape (`category`/`resourceName`/`state`/`severity`,
 * not CloudTrail's `eventName`/`userIdentity`) into the flat NormalizedEvent
 * columns the ingestion pipeline stores.
 */
import { NormalizedOcsfEvent } from './entra.adapter';

const VALID_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

export class GcpSccOcsfAdapter {
  static normalize(payload: Record<string, any>): NormalizedOcsfEvent {
    const rawSeverity = String(payload.severity || 'MEDIUM').toUpperCase();
    const severity = VALID_SEVERITIES.has(rawSeverity) ? rawSeverity : 'MEDIUM';

    return {
      eventClass: 'SECURITY_FINDING',
      eventCategory: 'CLOUD_INFRASTRUCTURE',
      eventActivity: payload.category || 'GcpSccFinding',
      severity,
      actorUserId: undefined,
      actorEmail: undefined,
      sourceIp: undefined,
      destinationIp: undefined,
      resourceId: payload.resourceName || payload.name || undefined,
      resourceType: 'GCP_RESOURCE',
      action: payload.category || 'THREAT_DETECTED',
      outcome: 'UNKNOWN',
      rawPayload: payload,
      unmappedPayload: {
        name: payload.name,
        parent: payload.parent,
        state: payload.state,
        findingClass: payload.findingClass,
        externalUri: payload.externalUri,
      },
    };
  }
}
