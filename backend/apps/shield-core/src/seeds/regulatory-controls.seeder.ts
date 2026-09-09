import { Injectable, Logger } from '@nestjs/common';

export interface RegulatoryControlDefinition {
  code: string;
  framework: 'SOC2_TYPE2' | 'ISO27001_2022' | 'DORA' | 'NIS2' | 'HIPAA';
  domain: string;
  title: string;
  description: string;
  automatedTestKey: string;
  evidenceRequirements: string[];
  phaseScope?: 'PHASE_0_G1' | 'PHASE_2_DEFERRED_OVERLAY';
}

@Injectable()
export class RegulatoryControlsSeeder {
  private readonly logger = new Logger(RegulatoryControlsSeeder.name);

  getCanonicalFrameworkControls(): RegulatoryControlDefinition[] {
    return [
      // ==========================================================
      // SOC 2 Type II (Trust Services Criteria) - Phase 0/G1
      // ==========================================================
      {
        code: 'SOC2-CC6.1',
        framework: 'SOC2_TYPE2',
        domain: 'Logical Access Security',
        title: 'Logical Access Points & Privilege Boundaries',
        description:
          'The entity implements logical access security software, infrastructure, and architectures over protected information assets.',
        automatedTestKey: 'test_mfa_enforcement_and_privileged_roles',
        evidenceRequirements: [
          'IDENTITY_LOGS',
          'MFA_STATUS',
          'ROLE_ASSIGNMENTS',
        ],
        phaseScope: 'PHASE_0_G1',
      },
      {
        code: 'SOC2-CC6.6',
        framework: 'SOC2_TYPE2',
        domain: 'Boundary Defense & Operations',
        title: 'Boundary Protection & Host Isolation',
        description:
          'The entity implements logical boundaries and boundary protection measures to safeguard system components against unauthorized access.',
        automatedTestKey: 'test_edr_agent_coverage_and_isolation',
        evidenceRequirements: ['EDR_TELEMETRY', 'NETWORK_FIREWALL_LOGS'],
        phaseScope: 'PHASE_0_G1',
      },
      {
        code: 'SOC2-CC7.1',
        framework: 'SOC2_TYPE2',
        domain: 'Vulnerability Management',
        title: 'Vulnerability Identification & Patch Cadence',
        description:
          'The entity uses detection and vulnerability monitoring procedures to identify and remediate security vulnerabilities.',
        automatedTestKey: 'test_vulnerability_scan_and_sbom_provenance',
        evidenceRequirements: ['SBOM_MANIFESTS', 'VULN_SCAN_RESULTS'],
        phaseScope: 'PHASE_0_G1',
      },
      {
        code: 'SOC2-CC7.2',
        framework: 'SOC2_TYPE2',
        domain: 'Monitoring Activities',
        title: 'Security Incident Detection & Telemetry Pipeline',
        description:
          'The entity monitors system components and the operational environment for anomalies and security incidents.',
        automatedTestKey: 'test_realtime_ocsf_alert_pipeline',
        evidenceRequirements: [
          'ALERT_RECORDS',
          'CASE_TIMELINES',
          'EVIDENCE_PACKAGES',
        ],
        phaseScope: 'PHASE_0_G1',
      },

      // ==========================================================
      // ISO/IEC 27001:2022 (Current Standard) - Phase 0/G1
      // ==========================================================
      {
        code: 'ISO27001-A.5.15',
        framework: 'ISO27001_2022',
        domain: 'Organizational Controls',
        title: 'Access Control Policy & Identity Boundaries',
        description:
          'Rules to control physical and logical access to information and other associated assets shall be established and implemented.',
        automatedTestKey: 'test_least_privilege_and_session_timeouts',
        evidenceRequirements: ['IAM_POLICIES', 'AUDIT_TRAILS'],
        phaseScope: 'PHASE_0_G1',
      },
      {
        code: 'ISO27001-A.8.7',
        framework: 'ISO27001_2022',
        domain: 'Technological Controls',
        title: 'Protection Against Malware',
        description:
          'Protection against malware shall be implemented and supported by appropriate user awareness and automated endpoint security agents.',
        automatedTestKey: 'test_edr_antimalware_coverage',
        evidenceRequirements: ['EDR_SIGNATURES', 'HOST_ISOLATION_RECEIPTS'],
        phaseScope: 'PHASE_0_G1',
      },
      {
        code: 'ISO27001-A.8.16',
        framework: 'ISO27001_2022',
        domain: 'Technological Controls',
        title: 'Monitoring Activities & Log Integrity',
        description:
          'Networks, systems and applications shall be monitored for abnormal behaviour and appropriate actions taken to evaluate potential information security events.',
        automatedTestKey: 'test_immutable_merkle_log_anchoring',
        evidenceRequirements: ['MERKLE_ROOT_RECEIPTS', 'WITNESS_ATTESTATIONS'],
        phaseScope: 'PHASE_0_G1',
      },
      {
        code: 'ISO27001-A.8.24',
        framework: 'ISO27001_2022',
        domain: 'Technological Controls',
        title: 'Use of Cryptography & Post-Quantum Algorithms',
        description:
          'Rules for the effective use of cryptography, including cryptographic key management and dual-signing, shall be defined and implemented.',
        automatedTestKey: 'test_pqc_dilithium3_and_kms_rotation',
        evidenceRequirements: ['KMS_ROTATION_AUDIT', 'PQC_SIGNATURE_PROOFS'],
        phaseScope: 'PHASE_0_G1',
      },

      // ==========================================================
      // Regulatory Overlays (ADR-08: Strictly Deferred to Phase 2 Midpoint)
      // ==========================================================
      {
        code: 'DORA-ART9',
        framework: 'DORA',
        domain: 'ICT Risk Management (Overlay [derived])',
        title: 'Protection and Prevention Capabilities [derived]',
        description:
          'Financial entities shall continuously monitor and control the security and functioning of ICT systems and tools.',
        automatedTestKey: 'test_automated_containment_and_freeze_controls',
        evidenceRequirements: ['SOAR_ACTION_RECEIPTS', 'FREEZE_AUDIT_LOGS'],
        phaseScope: 'PHASE_2_DEFERRED_OVERLAY',
      },
      {
        code: 'DORA-ART10',
        framework: 'DORA',
        domain: 'ICT Incident Management (Overlay [derived])',
        title: 'Detection of Anomalous Activities [derived]',
        description:
          'Financial entities shall have in place mechanisms to promptly detect anomalous activities and identify potential material ICT-related incidents.',
        automatedTestKey: 'test_high_fidelity_detection_sla',
        evidenceRequirements: [
          'DETECTION_EVALUATION_LOGS',
          'SLA_METRIC_RECORDS',
        ],
        phaseScope: 'PHASE_2_DEFERRED_OVERLAY',
      },
    ];
  }
}
