import { Injectable, Logger } from '@nestjs/common';

export interface RegulatoryControlDefinition {
  code: string;
  framework: 'SOC2_TYPE2' | 'ISO27001_2022' | 'DORA' | 'NIS2' | 'HIPAA';
  domain: string;
  title: string;
  description: string;
  automatedTestKey: string;
  evidenceRequirements: string[];
}

@Injectable()
export class RegulatoryControlsSeeder {
  private readonly logger = new Logger(RegulatoryControlsSeeder.name);

  getCanonicalFrameworkControls(): RegulatoryControlDefinition[] {
    return [
      // SOC 2 Type II
      {
        code: 'SOC2-CC6.1',
        framework: 'SOC2_TYPE2',
        domain: 'Access Control',
        title: 'Logical Access Security Controls',
        description: 'The entity implements logical access security software, infrastructure, and architectures over protected information assets.',
        automatedTestKey: 'test_mfa_enforcement_and_privileged_roles',
        evidenceRequirements: ['IDENTITY_LOGS', 'MFA_STATUS', 'ROLE_ASSIGNMENTS'],
      },
      {
        code: 'SOC2-CC6.6',
        framework: 'SOC2_TYPE2',
        domain: 'System Operations',
        title: 'Boundary Protection and Threat Prevention',
        description: 'The entity implements logical boundaries and boundary protection measures to safeguard system components.',
        automatedTestKey: 'test_edr_agent_coverage_and_isolation',
        evidenceRequirements: ['EDR_TELEMETRY', 'NETWORK_FIREWALL_LOGS'],
      },
      {
        code: 'SOC2-CC7.2',
        framework: 'SOC2_TYPE2',
        domain: 'Monitoring Activities',
        title: 'Security Incident Detection and Alerting',
        description: 'The entity monitors system components and the operational environment for anomalies and security incidents.',
        automatedTestKey: 'test_realtime_ocsf_alert_pipeline',
        evidenceRequirements: ['ALERT_RECORDS', 'CASE_TIMELINES', 'EVIDENCE_PACKAGES'],
      },

      // ISO/IEC 27001:2022
      {
        code: 'ISO27001-A.5.15',
        framework: 'ISO27001_2022',
        domain: 'Organizational Controls',
        title: 'Access Control Policy and Enforcement',
        description: 'Rules to control physical and logical access to information and other associated assets shall be established and implemented.',
        automatedTestKey: 'test_least_privilege_and_session_timeouts',
        evidenceRequirements: ['IAM_POLICIES', 'AUDIT_TRAILS'],
      },
      {
        code: 'ISO27001-A.8.16',
        framework: 'ISO27001_2022',
        domain: 'Technological Controls',
        title: 'Monitoring Activities and Log Integrity',
        description: 'Networks, systems and applications shall be monitored for abnormal behaviour and appropriate actions taken to evaluate potential information security events.',
        automatedTestKey: 'test_immutable_merkle_log_anchoring',
        evidenceRequirements: ['MERKLE_ROOT_RECEIPTS', 'WITNESS_ATTESTATIONS'],
      },

      // DORA (Digital Operational Resilience Act - EU 2022/2554)
      {
        code: 'DORA-ART9',
        framework: 'DORA',
        domain: 'ICT Risk Management',
        title: 'Protection and Prevention Capabilities',
        description: 'Financial entities shall continuously monitor and control the security and functioning of ICT systems and tools.',
        automatedTestKey: 'test_automated_containment_and_freeze_controls',
        evidenceRequirements: ['SOAR_ACTION_RECEIPTS', 'FREEZE_AUDIT_LOGS'],
      },
      {
        code: 'DORA-ART10',
        framework: 'DORA',
        domain: 'ICT Incident Management',
        title: 'Detection of Anomalous Activities',
        description: 'Financial entities shall have in place mechanisms to promptly detect anomalous activities and identify potential material ICT-related incidents.',
        automatedTestKey: 'test_high_fidelity_detection_sla',
        evidenceRequirements: ['DETECTION_EVALUATION_LOGS', 'SLA_METRIC_RECORDS'],
      },
    ];
  }
}
