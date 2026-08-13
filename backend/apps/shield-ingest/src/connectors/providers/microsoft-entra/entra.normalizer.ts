/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { Injectable, Logger } from '@nestjs/common';
import { ZoikoShieldCanonicalEvent } from './entra.types';

@Injectable()
export class EntraNormalizerService {
  private readonly logger = new Logger(EntraNormalizerService.name);

  /**
   * Normalizes a raw Microsoft Graph OData Sign-in Log object into the
   * ZoikoShield Canonical Event format.
   */
  normalizeSignInLog(
    rawLog: any,
    tenantId: string,
    environmentId: string,
    region: string,
  ): ZoikoShieldCanonicalEvent {
    this.logger.debug(`Normalizing sign-in log: ${rawLog.id}`);

    // Map authentication result
    let authResult: ZoikoShieldCanonicalEvent['authentication_result'] =
      'UNKNOWN';
    if (rawLog.status?.errorCode === 0) {
      authResult = 'SUCCESS';
    } else if (rawLog.status?.errorCode === 50158) {
      // Challenge required
      authResult = 'CHALLENGED';
    } else if (rawLog.status?.errorCode) {
      authResult = 'FAILED';
    }

    // Map conditional access result
    let caResult: ZoikoShieldCanonicalEvent['conditional_access_result'] =
      'UNKNOWN';
    const rawCaStatus = rawLog.conditionalAccessStatus?.toLowerCase();
    if (rawCaStatus === 'success') caResult = 'SUCCESS';
    if (rawCaStatus === 'failure') caResult = 'FAILURE';
    if (rawCaStatus === 'notapplied') caResult = 'NOT_APPLIED';

    // Map risk state
    let riskState: ZoikoShieldCanonicalEvent['risk_state'] = 'UNKNOWN';
    const rawRisk = rawLog.riskLevelDuringSignIn?.toLowerCase();
    if (rawRisk === 'none') riskState = 'NONE';
    if (rawRisk === 'low') riskState = 'LOW';
    if (rawRisk === 'medium') riskState = 'MEDIUM';
    if (rawRisk === 'high') riskState = 'HIGH';

    return {
      // Metadata
      tenant_id: tenantId,
      environment_id: environmentId,
      region,
      provider: 'microsoft-entra',
      event_type: 'security.identity.signin.v1',
      source_event_id: rawLog.id || 'unknown_event_id',
      event_timestamp: rawLog.createdDateTime || new Date().toISOString(),
      processing_timestamp: new Date().toISOString(),
      correlation_id: rawLog.correlationId || rawLog.id,

      // Context
      user_identity: {
        id: rawLog.userId || 'unknown_user',
        username: rawLog.userPrincipalName || 'unknown',
        email: rawLog.userPrincipalName, // Often same as UPN
      },
      application: {
        id: rawLog.appId || 'unknown_app',
        name: rawLog.appDisplayName || 'unknown',
      },
      ip_address: rawLog.ipAddress || '0.0.0.0',

      device_information: {
        browser: rawLog.deviceDetail?.browser,
        os: rawLog.deviceDetail?.operatingSystem,
        is_compliant: rawLog.deviceDetail?.isCompliant,
        is_managed: rawLog.deviceDetail?.isManaged,
      },

      location: {
        city: rawLog.location?.city,
        state: rawLog.location?.state,
        country: rawLog.location?.countryOrRegion,
        coordinates: rawLog.location?.geoCoordinates
          ? {
              latitude: rawLog.location.geoCoordinates.latitude,
              longitude: rawLog.location.geoCoordinates.longitude,
            }
          : undefined,
      },

      // Security
      authentication_result: authResult,
      conditional_access_result: caResult,
      risk_state: riskState,

      // Versioning
      source_schema_version: 'v1.0', // Graph API version
      normalizer_version: '1.0.0',
    };
  }
}
