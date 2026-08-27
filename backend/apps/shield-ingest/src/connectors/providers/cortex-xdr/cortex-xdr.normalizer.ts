import { Injectable, Logger } from '@nestjs/common';
import { CortexXdrIncident, CortexXdrAlert } from './cortex-xdr.types';

export interface OcsfSecurityFinding {
  class_uid: number; // 2001 for Security Finding
  category_uid: number; // 2 for Findings
  activity_id: number; // 1 for Create
  severity_id: number; // 1 (Info), 2 (Low), 3 (Med), 4 (High), 5 (Critical)
  time: number;
  metadata: {
    product: {
      vendor_name: string;
      name: string;
      version: string;
    };
    version: string;
    correlation_id: string;
  };
  finding: {
    uid: string;
    title: string;
    desc: string;
    types: string[];
    severity: string;
    attacks?: Array<{
      tactic: { name: string };
      technique: { name: string };
    }>;
  };
  device?: {
    hostname: string;
    ip: string;
  };
  user?: {
    name: string;
  };
  process?: {
    name: string;
    cmd_line?: string;
    file?: {
      hashes: Array<{
        algorithm: string;
        value: string;
      }>;
    };
  };
  raw_data: string;
}

@Injectable()
export class CortexXdrNormalizerService {
  private readonly logger = new Logger(CortexXdrNormalizerService.name);

  private mapSeverityToOcsf(severity: string): { id: number; name: string } {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return { id: 5, name: 'CRITICAL' };
      case 'high':
        return { id: 4, name: 'HIGH' };
      case 'medium':
        return { id: 3, name: 'MEDIUM' };
      case 'low':
      default:
        return { id: 2, name: 'LOW' };
    }
  }

  normalizeIncident(incident: CortexXdrIncident): OcsfSecurityFinding[] {
    const findings: OcsfSecurityFinding[] = [];
    const baseSev = this.mapSeverityToOcsf(incident.severity);

    for (const alert of incident.alerts ?? []) {
      const alertSev = this.mapSeverityToOcsf(alert.severity);

      const finding: OcsfSecurityFinding = {
        class_uid: 2001,
        category_uid: 2,
        activity_id: 1,
        severity_id: alertSev.id,
        time: alert.event_timestamp || incident.creation_time || Date.now(),
        metadata: {
          product: {
            vendor_name: 'Palo Alto Networks',
            name: 'Cortex XDR',
            version: '3.8',
          },
          version: '1.1.0',
          correlation_id: incident.incident_id,
        },
        finding: {
          uid: alert.alert_id,
          title: alert.name || incident.description,
          desc: alert.description || incident.description,
          types: [alert.category || 'MALWARE_THREAT'],
          severity: alertSev.name,
          attacks: this.extractMitreAttacks(alert),
        },
        device: {
          hostname: alert.host_name || incident.hosts?.[0] || 'unknown-host',
          ip: alert.host_ip || '0.0.0.0',
        },
        user: {
          name: alert.user_name || incident.users?.[0] || 'SYSTEM',
        },
        process: alert.causality_actor_process_image_name
          ? {
              name: alert.causality_actor_process_image_name,
              cmd_line: alert.causality_actor_process_command_line,
              file: alert.causality_actor_process_sha256
                ? {
                    hashes: [
                      {
                        algorithm: 'SHA-256',
                        value: alert.causality_actor_process_sha256,
                      },
                    ],
                  }
                : undefined,
            }
          : undefined,
        raw_data: JSON.stringify(alert),
      };

      findings.push(finding);
    }

    if (findings.length === 0) {
      // If incident had no nested alerts, create single finding for the incident itself
      findings.push({
        class_uid: 2001,
        category_uid: 2,
        activity_id: 1,
        severity_id: baseSev.id,
        time: incident.creation_time || Date.now(),
        metadata: {
          product: {
            vendor_name: 'Palo Alto Networks',
            name: 'Cortex XDR',
            version: '3.8',
          },
          version: '1.1.0',
          correlation_id: incident.incident_id,
        },
        finding: {
          uid: incident.incident_id,
          title: `Cortex XDR Incident #${incident.incident_id}: ${incident.description}`,
          desc: incident.description,
          types: ['INCIDENT_SUMMARY'],
          severity: baseSev.name,
        },
        device: {
          hostname: incident.hosts?.[0] || 'multi-host',
          ip: '0.0.0.0',
        },
        user: {
          name: incident.users?.[0] || 'SYSTEM',
        },
        raw_data: JSON.stringify(incident),
      });
    }

    return findings;
  }

  private extractMitreAttacks(alert: CortexXdrAlert) {
    const attacks: Array<{ tactic: { name: string }; technique: { name: string } }> = [];
    const tactics = alert.mitre_tactic_id_and_name ?? [];
    const techniques = alert.mitre_technique_id_and_name ?? [];

    const maxLen = Math.max(tactics.length, techniques.length);
    for (let i = 0; i < maxLen; i++) {
      attacks.push({
        tactic: { name: tactics[i] || 'Execution' },
        technique: { name: techniques[i] || 'Command and Scripting Interpreter' },
      });
    }

    return attacks.length > 0 ? attacks : undefined;
  }
}
