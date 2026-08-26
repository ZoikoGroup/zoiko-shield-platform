import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { GuardDutyFinding, OcsfSecurityFinding } from './aws-guardduty.types';

@Injectable()
export class AwsGuardDutyNormalizerService {
  normalizeFinding(
    finding: GuardDutyFinding,
    tenantId: string,
    environmentId: string,
    defaultRegion: string = 'us-east-1',
  ): OcsfSecurityFinding {
    const rawPayload = JSON.stringify(finding);
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const severityMap: { [key: number]: { id: number; label: string } } = {
      1: { id: 1, label: 'LOW' },
      2: { id: 1, label: 'LOW' },
      3: { id: 1, label: 'LOW' },
      4: { id: 2, label: 'MEDIUM' },
      5: { id: 2, label: 'MEDIUM' },
      6: { id: 2, label: 'MEDIUM' },
      7: { id: 3, label: 'HIGH' },
      8: { id: 3, label: 'HIGH' },
      9: { id: 4, label: 'CRITICAL' },
      10: { id: 4, label: 'CRITICAL' },
    };

    const roundedSeverity = Math.min(
      10,
      Math.max(1, Math.round(finding.severity)),
    );
    const severityInfo = severityMap[roundedSeverity] || {
      id: 2,
      label: 'MEDIUM',
    };

    const resources = [];
    if (finding.resource?.instanceDetails) {
      resources.push({
        uid: finding.resource.instanceDetails.instanceId,
        type: 'Instance',
        region: finding.region || defaultRegion,
      });
    }
    if (finding.resource?.accessKeyDetails) {
      resources.push({
        uid: finding.resource.accessKeyDetails.accessKeyId,
        name: finding.resource.accessKeyDetails.userName,
        type: 'AccessKey',
      });
    }

    return {
      metadata: {
        version: '1.1.0',
        product: {
          vendor_name: 'AWS',
          name: 'Amazon GuardDuty',
          version: finding.schemaVersion || '2.0',
        },
      },
      category_uid: 2, // Findings
      class_uid: 2001, // Security Finding
      activity_id: 1, // Create
      severity_id: severityInfo.id,
      severity: severityInfo.label,
      time: finding.createdAt || new Date().toISOString(),
      tenant_id: tenantId,
      environment_id: environmentId,
      region: finding.region || defaultRegion,
      finding: {
        uid: finding.id,
        title: finding.title,
        desc: finding.description,
        types: [finding.type],
        src_url: finding.arn,
      },
      resources: resources.length > 0 ? resources : undefined,
      raw_payload_hash: hash,
    };
  }
}
