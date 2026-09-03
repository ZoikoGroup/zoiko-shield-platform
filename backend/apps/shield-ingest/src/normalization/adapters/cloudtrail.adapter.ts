/**
 * AWS CloudTrail & GuardDuty OCSF v1.1.0 Normalization Adapter
 * Maps AWS CloudTrail audit logs and GuardDuty findings into OCSF Class 4001 (SECURITY_FINDING) / CLOUD_AUDIT.
 * Governed by ZS-ENG-INT-001 §07 & ZS-ENG-DRS-001 §06.
 */
import { NormalizedOcsfEvent } from './entra.adapter';

export class CloudTrailOcsfAdapter {
  static normalize(payload: Record<string, any>): NormalizedOcsfEvent {
    const isFinding = payload.detailType === 'GuardDuty Finding' || payload.findingType || payload.type;
    const errorCode = payload.errorCode || payload.errorMessage;
    const outcome = errorCode ? 'FAILED' : 'SUCCESS';

    const actorUserId =
      payload.userIdentity?.arn ||
      payload.userIdentity?.userName ||
      payload.actorUserId ||
      'arn:aws:iam::account:root';
    const actorEmail = payload.userIdentity?.sessionContext?.sessionIssuer?.userName || actorUserId;
    const sourceIp = payload.sourceIPAddress || payload.sourceIp || '0.0.0.0';

    const eventName = payload.eventName || payload.findingType || 'AWS_API_CALL';
    const isPrivilegeEscalation =
      eventName.includes('AttachRolePolicy') ||
      eventName.includes('PutUserPolicy') ||
      eventName.includes('CreateAccessKey') ||
      payload.severity >= 7;

    return {
      eventClass: isFinding ? 'SECURITY_FINDING' : 'CLOUD_AUDIT',
      eventCategory: 'CLOUD_INFRASTRUCTURE',
      eventActivity: eventName,
      severity: isPrivilegeEscalation ? 'HIGH' : isFinding ? 'MEDIUM' : 'INFORMATIONAL',
      actorUserId,
      actorEmail,
      sourceIp,
      destinationIp: payload.destinationIp || '169.254.169.254',
      resourceId: payload.requestParameters?.roleName || payload.resources?.[0]?.ARN || payload.awsRegion || 'aws-resource',
      resourceType: 'AWS_IAM_ROLE',
      action: eventName,
      outcome,
      rawPayload: payload,
      unmappedPayload: {
        awsRegion: payload.awsRegion,
        eventSource: payload.eventSource,
        userAgent: payload.userAgent,
        requestParameters: payload.requestParameters,
      },
    };
  }
}
