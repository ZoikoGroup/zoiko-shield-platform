import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { CrowdStrikeDetectionPayload, OcsfProcessActivityEvent } from './crowdstrike.types';

@Injectable()
export class CrowdStrikeNormalizerService {
  normalizeDetection(
    payload: CrowdStrikeDetectionPayload,
    tenantId: string,
    environmentId: string,
    region: string = 'us-east-1',
  ): OcsfProcessActivityEvent {
    const rawPayload = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const primaryBehavior = payload.behaviors[0] || {
      cmdline: 'unknown',
      filename: 'unknown',
      sha256: '',
      user_name: 'unknown',
      tactic: 'Execution',
      technique: 'Command and Scripting Interpreter',
    };

    const severityMap: Record<number, { id: number; label: string }> = {
      1: { id: 1, label: 'LOW' },
      2: { id: 2, label: 'MEDIUM' },
      3: { id: 3, label: 'HIGH' },
      4: { id: 4, label: 'CRITICAL' },
      5: { id: 4, label: 'CRITICAL' },
    };

    const severity = severityMap[payload.max_severity] || { id: 3, label: 'HIGH' };

    const attacks = payload.behaviors.map((b) => ({
      tactic: { name: b.tactic },
      technique: { name: b.technique },
    }));

    return {
      metadata: {
        version: '1.1.0',
        product: {
          vendor_name: 'CrowdStrike',
          name: 'CrowdStrike Falcon',
          version: '1.0',
        },
      },
      category_uid: 1, // System Activity
      class_uid: 1007, // Process Activity
      activity_id: 1, // Launch
      severity_id: severity.id,
      severity: severity.label,
      time: payload.created_timestamp || new Date().toISOString(),
      tenant_id: tenantId,
      environment_id: environmentId,
      region,
      device: {
        uid: payload.device.device_id,
        hostname: payload.device.hostname,
        ip: payload.device.local_ip,
        os: payload.device.os_version,
      },
      process: {
        name: primaryBehavior.filename,
        cmd_line: primaryBehavior.cmdline,
        file: {
          name: primaryBehavior.filename,
          hashes: primaryBehavior.sha256
            ? [
                {
                  algorithm: 'SHA-256',
                  value: primaryBehavior.sha256,
                },
              ]
            : [],
        },
      },
      actor: {
        user: {
          name: primaryBehavior.user_name,
        },
      },
      attacks: attacks.length > 0 ? attacks : undefined,
      raw_payload_hash: hash,
    };
  }
}
