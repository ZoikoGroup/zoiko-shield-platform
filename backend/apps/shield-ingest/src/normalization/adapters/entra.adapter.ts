/**
 * Microsoft Entra ID (Azure AD) OCSF v1.1.0 Normalization Adapter
 * Maps Entra ID signinLogs and directoryAudits into OCSF Class 1001 (AUTHENTICATION).
 * Governed by ZS-ENG-INT-001 §07 & ZS-ENG-DRS-001 §06.
 */

export interface NormalizedOcsfEvent {
  eventClass: string;
  eventCategory: string;
  eventActivity: string;
  severity: string;
  actorUserId?: string;
  actorEmail?: string;
  sourceIp?: string;
  destinationIp?: string;
  resourceId?: string;
  resourceType?: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  rawPayload: Record<string, unknown>;
  unmappedPayload?: Record<string, unknown>;
}

export class EntraOcsfAdapter {
  static normalize(payload: Record<string, any>): NormalizedOcsfEvent {
    const isSignIn = payload.eventType === 'signinLogs' || payload.userPrincipalName || payload.ipAddress;
    const isSuccess = payload.status?.errorCode === 0 || payload.result === 'SUCCESS' || payload.outcome === 'SUCCESS';

    const actorUserId = payload.userId || payload.user?.id || payload.userPrincipalName || 'usr-entra-unknown';
    const actorEmail = payload.userPrincipalName || payload.user?.email || payload.userEmail || actorUserId;
    const sourceIp = payload.ipAddress || payload.clientIp || payload.sourceIp || '0.0.0.0';

    return {
      eventClass: 'AUTHENTICATION',
      eventCategory: 'IDENTITY',
      eventActivity: isSignIn ? 'LOGIN_ATTEMPT' : 'DIRECTORY_AUDIT',
      severity: isSuccess ? 'INFORMATIONAL' : 'HIGH',
      actorUserId,
      actorEmail,
      sourceIp,
      destinationIp: payload.destinationIp || '10.0.0.1',
      resourceId: payload.appId || payload.targetResource || 'entra-tenant',
      resourceType: 'IDENTITY_PROVIDER',
      action: isSignIn ? 'LOGIN' : 'AUDIT_CHANGE',
      outcome: isSuccess ? 'SUCCESS' : 'FAILED',
      rawPayload: payload,
      unmappedPayload: {
        mfaDetail: payload.mfaDetail,
        conditionalAccessStatus: payload.conditionalAccessStatus,
        riskDetail: payload.riskDetail,
      },
    };
  }
}
