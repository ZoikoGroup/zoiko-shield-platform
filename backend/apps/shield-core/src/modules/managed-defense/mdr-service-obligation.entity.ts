export type CoverageTier = 'BUSINESS_HOURS_8X5' | 'EXTENDED_16X7' | 'CONTINUOUS_24X7';
export type SlaSeverityLevel = 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';
export type OperationalReadinessStatus = 'OPERATIONALLY_PROVEN' | 'CONTINGENT' | 'UNPROVEN';

export interface SlaResponseWindow {
  severity: SlaSeverityLevel;
  targetAcknowledgementMinutes: number;
  targetInvestigationMinutes: number;
  targetContainmentMinutes: number;
  financialCreditPercentage: number;
}

export interface SocStaffingSchedule {
  coverageTier: CoverageTier;
  primaryTimezone: string;
  minimumActiveAnalystsOnDuty: number;
  escalationLeadAvailable: boolean;
  tier3IncidentCommanderOnCall: boolean;
  shiftHandoffProtocolProven: boolean;
}

export interface EscalationPathNode {
  tierLevel: number;
  roleTitle: string;
  responseWindowMinutes: number;
  notificationChannels: string[];
  requiresQuorumApproval: boolean;
}

export interface MdrServiceObligation {
  id: string;
  contractId: string;
  tenantId: string;
  coverageTier: CoverageTier;
  readinessStatus: OperationalReadinessStatus;
  staffingSchedule: SocStaffingSchedule;
  slaWindows: SlaResponseWindow[];
  escalationPath: EscalationPathNode[];
  operationalProofReference?: string;
  lastReadinessAuditDate?: Date;
  verifiedBy?: string;
}

export const STANDARD_SLA_WINDOWS: SlaResponseWindow[] = [
  {
    severity: 'P1_CRITICAL',
    targetAcknowledgementMinutes: 15,
    targetInvestigationMinutes: 30,
    targetContainmentMinutes: 60,
    financialCreditPercentage: 10,
  },
  {
    severity: 'P2_HIGH',
    targetAcknowledgementMinutes: 30,
    targetInvestigationMinutes: 60,
    targetContainmentMinutes: 180,
    financialCreditPercentage: 5,
  },
  {
    severity: 'P3_MEDIUM',
    targetAcknowledgementMinutes: 120,
    targetInvestigationMinutes: 480,
    targetContainmentMinutes: 1440,
    financialCreditPercentage: 2,
  },
  {
    severity: 'P4_LOW',
    targetAcknowledgementMinutes: 480,
    targetInvestigationMinutes: 1440,
    targetContainmentMinutes: 2880,
    financialCreditPercentage: 0,
  },
];
