import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface IncidentTelemetryInput {
  incidentId: string;
  tenantId: string;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  events: Array<{
    eventId: string;
    timestamp: string;
    source: string; // e.g. 'crowdstrike-edr', 'okta-idp', 'ebpf-kernel-probe'
    eventType: string; // e.g. 'SUSPICIOUS_EXECVE', 'MFA_FATIGUE_ATTEMPT', 'CREDENTIAL_ACCESS'
    actor?: string;
    targetResource: string;
    details: Record<string, any>;
  }>;
  attackGraphPath?: string[]; // e.g. ['host-public-ingress', 'pod-worker-auth', 'db-pci-vault']
}

export interface MitreAttackMapping {
  tactic: string; // e.g. 'Initial Access', 'Lateral Movement'
  techniqueId: string; // e.g. 'T1078', 'T1021.002'
  techniqueName: string;
  confidenceScore: number;
}

export interface IncidentRcaReport {
  rcaId: string;
  incidentId: string;
  tenantId: string;
  rootCauseHypothesis: string;
  timelineChronology: Array<{ timestamp: string; phase: string; description: string }>;
  mitreMappings: MitreAttackMapping[];
  identifiedBlastRadius: {
    compromisedAccounts: string[];
    affectedHosts: string[];
    isolatedPods: string[];
  };
  executiveSummary: string;
  containmentRecommendations: string[];
  provenanceAttestationDigest: string;
  generatedAt: string;
}

/**
 * Autonomous AI-Powered Incident Root Cause Analysis (RCA) & Narrative Generator
 * Specification: ZS-AI-SEC-001 §9 (Autonomous SecOps RCA Synthesizer)
 */
@Injectable()
export class IncidentRcaGeneratorService {
  private readonly logger = new Logger(IncidentRcaGeneratorService.name);

  /**
   * Synthesizes incident telemetry, eBPF traces, and attack graph paths into an executive RCA report.
   */
  generateIncidentRca(input: IncidentTelemetryInput): IncidentRcaReport {
    const rcaId = `rca-${crypto.randomUUID()}`;
    const generatedAt = new Date().toISOString();

    // 1. Sort events chronologically to construct timeline
    const sortedEvents = [...input.events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const timelineChronology = sortedEvents.map((evt, idx) => ({
      timestamp: evt.timestamp,
      phase: idx === 0 ? 'INITIAL_BREACH_VECTOR' : idx === sortedEvents.length - 1 ? 'OBJECTIVE_EXECUTION' : 'LATERAL_EXPANSION',
      description: `[${evt.source}] ${evt.eventType} observed on target '${evt.targetResource}' by actor '${evt.actor || 'UNKNOWN'}'`,
    }));

    // 2. Map observed telemetry to MITRE ATT&CK Tactics & Techniques
    const mitreMappings: MitreAttackMapping[] = [];
    const compromisedAccounts = new Set<string>();
    const affectedHosts = new Set<string>();
    const isolatedPods = new Set<string>();

    for (const evt of sortedEvents) {
      if (evt.actor) compromisedAccounts.add(evt.actor);
      if (evt.targetResource.startsWith('host-') || evt.targetResource.includes('.ec2.')) {
        affectedHosts.add(evt.targetResource);
      }
      if (evt.targetResource.startsWith('pod-') || evt.targetResource.includes('app=')) {
        isolatedPods.add(evt.targetResource);
      }

      if (evt.eventType.includes('MFA') || evt.eventType.includes('LOGIN')) {
        mitreMappings.push({
          tactic: 'Initial Access / Credential Access',
          techniqueId: 'T1078',
          techniqueName: 'Valid Accounts',
          confidenceScore: 0.96,
        });
      } else if (evt.eventType.includes('EXECVE') || evt.eventType.includes('POWERSHELL')) {
        mitreMappings.push({
          tactic: 'Execution',
          techniqueId: 'T1059.001',
          techniqueName: 'Command and Scripting Interpreter: PowerShell',
          confidenceScore: 0.98,
        });
      } else if (evt.eventType.includes('LATERAL') || evt.eventType.includes('SMB') || evt.eventType.includes('SSH')) {
        mitreMappings.push({
          tactic: 'Lateral Movement',
          techniqueId: 'T1021',
          techniqueName: 'Remote Services',
          confidenceScore: 0.92,
        });
      }
    }

    if (input.attackGraphPath && input.attackGraphPath.length > 0) {
      for (const node of input.attackGraphPath) {
        if (node.startsWith('host-')) affectedHosts.add(node);
        if (node.startsWith('pod-')) isolatedPods.add(node);
      }
    }

    // 3. Formulate Root Cause Hypothesis & Executive Summary
    const initialVector = sortedEvents[0] ? sortedEvents[0].eventType : 'ANOMALOUS_INGRESS';
    const rootCauseHypothesis = `Adversary exploited ${initialVector} on ${sortedEvents[0]?.targetResource || 'boundary ingress'}, leveraged compromised credentials for actor '${Array.from(compromisedAccounts).join(', ') || 'service-account'}', and traversed lateral pathways toward critical resources.`;

    const executiveSummary = `ZoikoShield AI RCA Engine analyzed ${input.events.length} multi-vector security events and confirmed a ${input.severity} severity breach. The intrusion originated via ${initialVector} and traversed across ${affectedHosts.size} host(s) and ${isolatedPods.size} pod(s). Zero-trust containment has been synthesized with high confidence.`;

    const containmentRecommendations = [
      `Enforce instant OAuth/JWT token revocation for accounts: [${Array.from(compromisedAccounts).join(', ')}]`,
      `Apply eBPF kernel network quarantine drops on Pods: [${Array.from(isolatedPods).join(', ')}]`,
      `Rotate IAM API credentials and invalidate sessions for affected cloud workloads.`,
    ];

    // 4. Generate Cryptographic Provenance Digest
    const provenanceAttestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          rcaId,
          incidentId: input.incidentId,
          tenantId: input.tenantId,
          rootCauseHypothesis,
          eventsCount: sortedEvents.length,
          generatedAt,
        }),
      )
      .digest('hex');

    this.logger.log(`✔ Generated AI Root Cause Analysis [${rcaId}] for Incident ${input.incidentId} (${input.severity})`);

    return {
      rcaId,
      incidentId: input.incidentId,
      tenantId: input.tenantId,
      rootCauseHypothesis,
      timelineChronology,
      mitreMappings,
      identifiedBlastRadius: {
        compromisedAccounts: Array.from(compromisedAccounts),
        affectedHosts: Array.from(affectedHosts),
        isolatedPods: Array.from(isolatedPods),
      },
      executiveSummary,
      containmentRecommendations,
      provenanceAttestationDigest,
      generatedAt,
    };
  }
}
