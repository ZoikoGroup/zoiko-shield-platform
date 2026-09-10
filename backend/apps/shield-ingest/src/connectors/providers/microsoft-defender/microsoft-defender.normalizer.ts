import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import {
  MicrosoftDefenderAlertPayload,
  OcsfSecurityFindingEvent,
} from './microsoft-defender.types';

@Injectable()
export class MicrosoftDefenderNormalizerService {
  normalizeAlert(
    payload: MicrosoftDefenderAlertPayload,
    tenantId: string,
    environmentId: string,
    region: string = 'GLOBAL',
  ): OcsfSecurityFindingEvent {
    const rawPayload = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const severityMap: Record<string, { id: number; label: string }> = {
      Informational: { id: 1, label: 'INFORMATIONAL' },
      Low: { id: 2, label: 'LOW' },
      Medium: { id: 3, label: 'MEDIUM' },
      High: { id: 4, label: 'HIGH' },
    };

    const severity = severityMap[payload.severity] || {
      id: 3,
      label: 'MEDIUM',
    };

    const attacks: Array<{
      tactic: { name: string };
      technique: { name: string };
    }> = [];

    if (payload.mitreTechniques && payload.mitreTechniques.length > 0) {
      for (const tech of payload.mitreTechniques) {
        attacks.push({
          tactic: { name: payload.category || 'Security Alert' },
          technique: { name: tech },
        });
      }
    }

    const primaryUser = payload.loggedOnUsers?.[0];

    return {
      metadata: {
        version: '1.1.0',
        product: {
          vendor_name: 'Microsoft',
          name: 'Microsoft Defender for Endpoint',
          version: '1.0',
        },
      },
      category_uid: 2, // Findings
      class_uid: 2001, // Security Finding
      activity_id: 1, // Create / Alert
      severity_id: severity.id,
      severity: severity.label,
      time: payload.alertCreationTime || new Date().toISOString(),
      tenant_id: tenantId,
      environment_id: environmentId,
      region,
      finding: {
        uid: payload.id,
        title: payload.title,
        desc: payload.description,
        confidence_score: payload.severity === 'High' ? 90 : 70,
        status: payload.status,
        types: [payload.category || 'Endpoint Alert'],
      },
      device:
        payload.machineId || payload.computerDnsName
          ? {
              uid: payload.machineId,
              hostname: payload.computerDnsName,
            }
          : undefined,
      actor: primaryUser
        ? {
            user: {
              name: primaryUser.accountName,
              domain: primaryUser.domainName,
            },
          }
        : undefined,
      attacks: attacks.length > 0 ? attacks : undefined,
      raw_payload_hash: hash,
    };
  }
}
