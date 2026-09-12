import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { AzureActivityLogEvent, OcsfCloudAuditEvent } from './azure-monitor.types';

const LEVEL_SEVERITY: Record<string, { id: number; label: string }> = {
  Critical: { id: 4, label: 'CRITICAL' },
  Error: { id: 3, label: 'HIGH' },
  Warning: { id: 2, label: 'MEDIUM' },
  Informational: { id: 1, label: 'INFORMATIONAL' },
};

@Injectable()
export class AzureMonitorNormalizerService {
  normalizeEvent(
    event: AzureActivityLogEvent,
    tenantId: string,
    environmentId: string,
    defaultRegion: string = 'eu-west-1',
  ): OcsfCloudAuditEvent {
    const rawPayload = JSON.stringify(event);
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');
    const severity = LEVEL_SEVERITY[event.level] || {
      id: 1,
      label: 'INFORMATIONAL',
    };

    return {
      metadata: {
        version: '1.1.0',
        product: {
          vendor_name: 'Microsoft',
          name: 'Azure Monitor Activity Log',
          version: '1.0',
        },
      },
      category_uid: 3,
      class_uid: 3005,
      activity_id: 1,
      severity_id: severity.id,
      severity: severity.label,
      time: event.eventTimestamp || new Date().toISOString(),
      tenant_id: tenantId,
      environment_id: environmentId,
      region: defaultRegion,
      actor: {
        user: event.caller,
      },
      cloud: {
        provider: 'Azure',
        subscription_id: event.subscriptionId,
        resource_id: event.resourceId,
      },
      action: event.operationName?.value || 'AZURE_ACTIVITY',
      outcome: event.status?.value === 'Succeeded' ? 'SUCCESS' : 'FAILED',
      raw_payload_hash: hash,
    };
  }
}
