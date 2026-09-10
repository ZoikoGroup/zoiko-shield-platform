import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  JiraIssuePayload,
  OcsfIncidentFindingEvent,
} from './jira-ticketing.types';

@Injectable()
export class JiraNormalizerService {
  normalizeIssue(
    payload: JiraIssuePayload,
    tenantId: string,
    environmentId: string,
    region: string = 'us-east-1',
  ): OcsfIncidentFindingEvent {
    const rawPayload = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const priorityMap: Record<string, { id: number; label: string }> = {
      lowest: { id: 1, label: 'LOW' },
      low: { id: 1, label: 'LOW' },
      medium: { id: 2, label: 'MEDIUM' },
      high: { id: 3, label: 'HIGH' },
      highest: { id: 4, label: 'CRITICAL' },
    };

    const severity = priorityMap[payload.priority?.toLowerCase()] || {
      id: 2,
      label: 'MEDIUM',
    };

    return {
      metadata: {
        version: '1.1.0',
        product: {
          vendor_name: 'Atlassian',
          name: 'Jira Software',
          version: '1.0',
        },
      },
      category_uid: 2, // Findings
      class_uid: 2001, // Security Finding
      activity_id: payload.status === 'Resolved' || payload.status === 'Closed' ? 2 : 1,
      severity_id: severity.id,
      severity: severity.label,
      time: payload.created || new Date().toISOString(),
      tenant_id: tenantId,
      environment_id: environmentId,
      region,
      finding_info: {
        title: `[${payload.key}] ${payload.summary}`,
        uid: payload.id || payload.key,
        desc: payload.description,
        types: [payload.issue_type],
      },
      status: payload.status,
      raw_payload_hash: hash,
    };
  }
}
