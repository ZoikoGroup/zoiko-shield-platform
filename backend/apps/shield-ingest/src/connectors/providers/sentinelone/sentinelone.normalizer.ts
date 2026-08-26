import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { SentinelOneThreatPayload, OcsfSecurityFindingEvent } from './sentinelone.types';

@Injectable()
export class SentinelOneNormalizerService {
  normalizeThreat(
    payload: SentinelOneThreatPayload,
    tenantId: string,
    environmentId: string,
    region: string = 'GLOBAL',
  ): OcsfSecurityFindingEvent {
    const rawPayload = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const score = payload.threatInfo.confidenceScore ?? 50;
    let severity = { id: 2, label: 'MEDIUM' };
    if (score >= 90) {
      severity = { id: 4, label: 'CRITICAL' };
    } else if (score >= 70) {
      severity = { id: 3, label: 'HIGH' };
    } else if (score < 40) {
      severity = { id: 1, label: 'LOW' };
    }

    const attacks: Array<{ tactic: { name: string }; technique: { name: string } }> = [];
    if (payload.indicators) {
      for (const ind of payload.indicators) {
        const tacticName = ind.tactics?.[0]?.name || 'Execution';
        const techniqueName = ind.techniques?.[0]?.name || 'Unknown';
        attacks.push({
          tactic: { name: tacticName },
          technique: { name: techniqueName },
        });
      }
    }

    const hashes: Array<{ algorithm: 'SHA-256' | 'SHA-1' | 'MD5'; value: string }> = [];
    if (payload.threatInfo.sha256) {
      hashes.push({ algorithm: 'SHA-256', value: payload.threatInfo.sha256 });
    }
    if (payload.threatInfo.sha1) {
      hashes.push({ algorithm: 'SHA-1', value: payload.threatInfo.sha1 });
    }
    if (payload.threatInfo.md5) {
      hashes.push({ algorithm: 'MD5', value: payload.threatInfo.md5 });
    }

    return {
      metadata: {
        version: '1.1.0',
        product: {
          vendor_name: 'SentinelOne',
          name: 'SentinelOne Singularity',
          version: payload.agentDetectionInfo.agentVersion || '1.0',
        },
      },
      category_uid: 2, // Findings
      class_uid: 2001, // Security Finding
      activity_id: 1, // Create / Alert
      severity_id: severity.id,
      severity: severity.label,
      time: payload.threatInfo.createdAt || new Date().toISOString(),
      tenant_id: tenantId,
      environment_id: environmentId,
      region,
      finding: {
        uid: payload.threatInfo.threatId || payload.id,
        title: payload.threatInfo.threatName || 'SentinelOne Threat Detection',
        desc: `Classification: ${payload.threatInfo.classification}. Mitigation: ${payload.threatInfo.mitigationStatus}`,
        confidence_score: score,
        status: payload.threatInfo.incidentStatus.toUpperCase(),
        types: [payload.threatInfo.classification || 'MALWARE'],
      },
      device: {
        uid: payload.agentDetectionInfo.agentId,
        hostname: payload.agentDetectionInfo.agentComputerName,
        ip: payload.agentDetectionInfo.agentIp,
        os: payload.agentDetectionInfo.agentOsName,
      },
      process: payload.threatInfo.filePath
        ? {
            name: payload.threatInfo.filePath,
            cmd_line: payload.threatInfo.commandLine,
            file: {
              name: payload.threatInfo.filePath,
              hashes,
            },
          }
        : undefined,
      actor: payload.threatInfo.processUser
        ? {
            user: {
              name: payload.threatInfo.processUser,
            },
          }
        : undefined,
      attacks: attacks.length > 0 ? attacks : undefined,
      raw_payload_hash: hash,
    };
  }
}
