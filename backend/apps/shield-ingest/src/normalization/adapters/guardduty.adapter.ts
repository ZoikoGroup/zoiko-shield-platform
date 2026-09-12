/**
 * Amazon GuardDuty OCSF v1.1.0 Normalization Adapter
 * Maps GuardDuty findings (a distinct shape from CloudTrail audit records -
 * `type`/`severity`/`resource`/`service`, not `eventName`/`userIdentity`)
 * into the flat NormalizedEvent columns the ingestion pipeline stores.
 */
import { NormalizedOcsfEvent } from './entra.adapter';

const SEVERITY_LABELS: Record<number, string> = {
  1: 'LOW',
  2: 'LOW',
  3: 'LOW',
  4: 'MEDIUM',
  5: 'MEDIUM',
  6: 'MEDIUM',
  7: 'HIGH',
  8: 'HIGH',
  9: 'CRITICAL',
  10: 'CRITICAL',
};

export class GuardDutyOcsfAdapter {
  static normalize(payload: Record<string, any>): NormalizedOcsfEvent {
    const roundedSeverity = Math.min(
      10,
      Math.max(1, Math.round(payload.severity ?? 5)),
    );
    const severity = SEVERITY_LABELS[roundedSeverity] || 'MEDIUM';

    const instanceId = payload.resource?.instanceDetails?.instanceId;
    const accessKeyUserName = payload.resource?.accessKeyDetails?.userName;
    const accessKeyId = payload.resource?.accessKeyDetails?.accessKeyId;

    return {
      eventClass: 'SECURITY_FINDING',
      eventCategory: 'CLOUD_THREAT_DETECTION',
      eventActivity: payload.type || 'GuardDutyFinding',
      severity,
      actorUserId: accessKeyUserName || accessKeyId || undefined,
      actorEmail: undefined,
      sourceIp:
        payload.service?.action?.networkConnectionAction?.remoteIpDetails
          ?.ipAddressV4 ||
        payload.service?.action?.awsApiCallAction?.remoteIpDetails
          ?.ipAddressV4 ||
        undefined,
      destinationIp: undefined,
      resourceId: instanceId || accessKeyId || payload.arn || undefined,
      resourceType: instanceId
        ? 'AWS_EC2_INSTANCE'
        : accessKeyId
          ? 'AWS_IAM_ACCESS_KEY'
          : undefined,
      action: payload.type || 'THREAT_DETECTED',
      outcome: 'UNKNOWN',
      rawPayload: payload,
      unmappedPayload: {
        title: payload.title,
        description: payload.description,
        region: payload.region,
        accountId: payload.accountId,
        arn: payload.arn,
      },
    };
  }
}
