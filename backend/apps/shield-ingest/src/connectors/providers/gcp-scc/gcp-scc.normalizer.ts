import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { GcpSccFindingPayload, OcsfCloudFindingEvent } from './gcp-scc.types';

@Injectable()
export class GcpSccNormalizerService {
  normalizeFinding(
    payload: GcpSccFindingPayload,
    tenantId: string,
    environmentId: string,
    region: string = 'us-central1',
  ): OcsfCloudFindingEvent {
    const rawPayload = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const severityMap: Record<string, { id: number; label: string }> = {
      CRITICAL: { id: 4, label: 'CRITICAL' },
      HIGH: { id: 3, label: 'HIGH' },
      MEDIUM: { id: 2, label: 'MEDIUM' },
      LOW: { id: 1, label: 'LOW' },
    };

    const severity = severityMap[payload.severity] || {
      id: 2,
      label: 'MEDIUM',
    };

    const categoryParts = (payload.category || '').split(':');
    const tactic = categoryParts[0]?.trim() || 'Cloud Security Finding';
    const technique = categoryParts[1]?.trim() || payload.category || 'Unknown';

    return {
      metadata: {
        version: '1.1.0',
        product: {
          vendor_name: 'Google Cloud',
          name: 'Google Cloud Security Command Center',
          version: '1.0',
        },
      },
      category_uid: 2, // Findings
      class_uid: 2001, // Security Finding
      activity_id: 1, // Create / Alert
      severity_id: severity.id,
      severity: severity.label,
      time: payload.eventTime || payload.createTime || new Date().toISOString(),
      tenant_id: tenantId,
      environment_id: environmentId,
      region,
      finding: {
        uid: payload.name,
        title: payload.category || 'GCP SCC Security Finding',
        desc: `GCP SCC Finding: ${payload.category} on resource ${payload.resourceName}`,
        confidence_score: payload.severity === 'CRITICAL' ? 95 : 75,
        status: payload.state === 'ACTIVE' ? 'New' : 'Resolved',
        types: [payload.findingClass || 'THREAT', payload.category],
      },
      cloud: {
        provider: 'GCP',
        resource_name: payload.resourceName,
      },
      attacks: [
        {
          tactic: { name: tactic },
          technique: { name: technique },
        },
      ],
      raw_payload_hash: hash,
    };
  }
}
