import { Injectable, Logger, Optional } from '@nestjs/common';
import { AlertService } from '../../alert/services/alert.service';

export interface OcsfCorrelationEvent {
  eventId: string;
  tenantId: string;
  classUid: number; // e.g., 1001 for Auth, 1007 for Process, 3002 for IAM, 6003 for API
  categoryName: string;
  activityName: string;
  severity: string;
  timestamp: Date;
  actor?: string;
  targetHost?: string;
  sourceIp?: string;
  rawPayload?: Record<string, unknown>;
}

export interface CorrelationStage {
  stageId: string;
  name: string;
  tactic: string;
  technique: string;
  matcher: (event: OcsfCorrelationEvent) => boolean;
}

export interface CompositeKillchainPattern {
  patternId: string;
  name: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  windowSeconds: number;
  stages: CorrelationStage[];
}

export interface CompositeAlertMatch {
  patternId: string;
  patternName: string;
  tenantId: string;
  entityKey: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  confidence: number;
  matchedEventIds: string[];
  stagesMatched: { stageId: string; name: string; eventId: string; timestamp: Date }[];
  firstSeen: Date;
  lastSeen: Date;
}

@Injectable()
export class CompositeCorrelationService {
  private readonly logger = new Logger(CompositeCorrelationService.name);

  // In-memory state tracking: tenantId:patternId:entityKey -> matched stages with timestamps
  private readonly activeCorrelations = new Map<
    string,
    { stageId: string; name: string; eventId: string; timestamp: Date }[]
  >();

  private readonly patterns: CompositeKillchainPattern[] = [
    {
      patternId: 'ZS-CORR-RANSOMWARE-001',
      name: 'Multi-Stage Ransomware Killchain (Initial Access -> PowerShell -> Shadow Copy Deletion)',
      description: 'Detects lateral movement followed by obfuscated script execution and volume shadow copy inhibition within 5 minutes.',
      severity: 'CRITICAL',
      windowSeconds: 300,
      stages: [
        {
          stageId: 'stage-1-initial-access',
          name: 'Initial Access / Lateral Authentication',
          tactic: 'TA0001: Initial Access',
          technique: 'T1078: Valid Accounts',
          matcher: (event) =>
            event.classUid === 1001 ||
            event.categoryName === 'AUTHENTICATION' ||
            event.activityName === 'LOGIN_ATTEMPT',
        },
        {
          stageId: 'stage-2-obfuscated-execution',
          name: 'Obfuscated PowerShell Execution',
          tactic: 'TA0002: Execution',
          technique: 'T1059.001: PowerShell',
          matcher: (event) => {
            const raw = JSON.stringify(event.rawPayload || {}).toLowerCase();
            return (
              (event.classUid === 1007 || event.categoryName === 'PROCESS_ACTIVITY') &&
              (raw.includes('powershell') || raw.includes('-enc') || raw.includes('hidden'))
            );
          },
        },
        {
          stageId: 'stage-3-shadow-copy-inhibition',
          name: 'Inhibit System Recovery / VSS Deletion',
          tactic: 'TA0040: Impact',
          technique: 'T1490: Inhibit System Recovery',
          matcher: (event) => {
            const raw = JSON.stringify(event.rawPayload || {}).toLowerCase();
            return (
              (event.classUid === 1007 || event.categoryName === 'PROCESS_ACTIVITY') &&
              (raw.includes('vssadmin') || raw.includes('shadows') || raw.includes('bcedit'))
            );
          },
        },
      ],
    },
    {
      patternId: 'ZS-CORR-CLOUD-PRIV-002',
      name: 'Cloud IAM Privilege Escalation -> Resource Exfiltration',
      description: 'Detects IAM policy modification followed by sensitive data exfiltration or secrets retrieval.',
      severity: 'CRITICAL',
      windowSeconds: 600,
      stages: [
        {
          stageId: 'stage-1-iam-priv-esc',
          name: 'IAM Policy Elevation',
          tactic: 'TA0004: Privilege Escalation',
          technique: 'T1098: Account Manipulation',
          matcher: (event) =>
            event.classUid === 3002 ||
            event.categoryName === 'IAM_POLICY_CHANGE' ||
            event.activityName === 'PUT_USER_POLICY' ||
            event.activityName === 'ATTACH_ADMIN_POLICY',
        },
        {
          stageId: 'stage-2-sensitive-exfil',
          name: 'Secrets or Data Exfiltration',
          tactic: 'TA0010: Exfiltration',
          technique: 'T1530: Data from Cloud Storage',
          matcher: (event) =>
            event.classUid === 6003 ||
            event.categoryName === 'API_ACTIVITY' ||
            event.activityName === 'GET_SECRET_VALUE' ||
            event.activityName === 'EXPORT_BUCKET',
        },
      ],
    },
    {
      patternId: 'ZS-CORR-CONTAINER-ESCAPE-003',
      name: 'eBPF Kernel Container Escape -> Root Shell -> Outbound C2',
      description: 'Detects container breakout via eBPF runtime probes followed by root process execution and outbound network beaconing.',
      severity: 'CRITICAL',
      windowSeconds: 300,
      stages: [
        {
          stageId: 'stage-1-ebpf-escape',
          name: 'eBPF Container Escape Finding',
          tactic: 'TA0004: Privilege Escalation',
          technique: 'T1611: Escape to Host',
          matcher: (event) => {
            const raw = JSON.stringify(event.rawPayload || {}).toUpperCase();
            return (
              event.classUid === 2001 ||
              event.categoryName === 'CONTAINER_RUNTIME' ||
              raw.includes('ESCAPE') ||
              raw.includes('SYS_ADMIN') ||
              raw.includes('RELEASE_AGENT')
            );
          },
        },
        {
          stageId: 'stage-2-root-execve',
          name: 'Root Process Execution / Shell Spawn',
          tactic: 'TA0002: Execution',
          technique: 'T1059.004: Unix Shell',
          matcher: (event) => {
            const raw = JSON.stringify(event.rawPayload || {}).toLowerCase();
            return (
              (event.classUid === 4001 || event.classUid === 1007 || event.categoryName === 'PROCESS_ACTIVITY') &&
              (raw.includes('/bin/sh') || raw.includes('/bin/bash') || raw.includes('execve') || raw.includes('root'))
            );
          },
        },
        {
          stageId: 'stage-3-outbound-c2',
          name: 'Outbound Network Beaconing',
          tactic: 'TA0011: Command and Control',
          technique: 'T1071.001: Web Protocols',
          matcher: (event) =>
            event.classUid === 4002 ||
            event.categoryName === 'NETWORK_ACTIVITY' ||
            event.activityName === 'OUTBOUND_CONNECT' ||
            event.activityName === 'CONNECT',
        },
      ],
    },
  ];

  constructor(@Optional() private readonly alertService?: AlertService) {}

  /**
   * Evaluates an incoming normalized OCSF event against all registered multi-stage killchain patterns.
   */
  async processEvent(event: OcsfCorrelationEvent): Promise<CompositeAlertMatch | null> {
    const entityKey = event.targetHost || event.actor || event.sourceIp || 'global-entity';

    for (const pattern of this.patterns) {
      const correlationKey = `${event.tenantId}:${pattern.patternId}:${entityKey}`;
      let history = this.activeCorrelations.get(correlationKey) || [];

      // Evict entries older than windowSeconds
      const cutoff = new Date(Date.now() - pattern.windowSeconds * 1000);
      history = history.filter((h) => h.timestamp >= cutoff);

      // Determine which stage the incoming event matches
      for (const stage of pattern.stages) {
        // Only match if stage hasn't already been satisfied recently
        const alreadyMatched = history.some((h) => h.stageId === stage.stageId);
        if (!alreadyMatched && stage.matcher(event)) {
          history.push({
            stageId: stage.stageId,
            name: stage.name,
            eventId: event.eventId,
            timestamp: event.timestamp,
          });
          this.activeCorrelations.set(correlationKey, history);
          this.logger.log(
            `[Correlation Match] Tenant ${event.tenantId} Matched Stage '${stage.name}' for Pattern '${pattern.name}'`,
          );
          break;
        }
      }

      // Check if all stages of the pattern have been satisfied
      if (history.length >= pattern.stages.length) {
        const matchedEventIds = history.map((h) => h.eventId);
        const match: CompositeAlertMatch = {
          patternId: pattern.patternId,
          patternName: pattern.name,
          tenantId: event.tenantId,
          entityKey,
          severity: pattern.severity,
          confidence: 0.96,
          matchedEventIds,
          stagesMatched: [...history],
          firstSeen: history[0].timestamp,
          lastSeen: history[history.length - 1].timestamp,
        };

        this.logger.warn(
          `🚨 [COMPOSITE ATTACK CHAIN DETECTED] Pattern: ${pattern.name} | Tenant: ${event.tenantId} | Entity: ${entityKey}`,
        );

        // Reset state upon successful full sequence completion
        this.activeCorrelations.delete(correlationKey);

        return match;
      }
    }

    return null;
  }

  /**
   * Clears state for testing and tenant isolation.
   */
  clearState(): void {
    this.activeCorrelations.clear();
  }
}
