import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { OcsfAuthenticationEvent, OktaEventPayload } from './okta.types';

@Injectable()
export class OktaNormalizerService {
  normalizeEvent(
    event: OktaEventPayload,
    tenantId: string,
    environmentId: string,
    region: string = 'us-east-1',
  ): OcsfAuthenticationEvent {
    const rawPayload = JSON.stringify(event);
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const isSuccess = event.outcome.result === 'SUCCESS';
    const severityId = isSuccess ? 1 : 3; // 1 = Info/Low, 3 = High on failure
    const severity = isSuccess ? 'INFORMATIONAL' : 'HIGH';

    let activityId = 1; // Logon
    if (event.eventType.includes('logout') || event.eventType.includes('session.end')) {
      activityId = 2; // Logoff
    }

    return {
      metadata: {
        version: '1.1.0',
        product: {
          vendor_name: 'Okta',
          name: 'Okta Identity Cloud',
          version: '1.0',
        },
      },
      category_uid: 3, // IAM
      class_uid: 3002, // Authentication
      activity_id: activityId,
      severity_id: severityId,
      severity,
      time: event.published || new Date().toISOString(),
      tenant_id: tenantId,
      environment_id: environmentId,
      region,
      actor: {
        user: {
          uid: event.actor.id,
          name: event.actor.displayName,
          email_addr: event.actor.alternateId,
        },
      },
      src_endpoint: event.client?.ipAddress
        ? {
            ip: event.client.ipAddress,
            location: event.client.geographicalContext
              ? {
                  city: event.client.geographicalContext.city,
                  country: event.client.geographicalContext.country,
                }
              : undefined,
          }
        : undefined,
      status: isSuccess ? 'SUCCESS' : 'FAILURE',
      status_detail: event.outcome.reason || event.displayMessage,
      raw_payload_hash: hash,
    };
  }
}
