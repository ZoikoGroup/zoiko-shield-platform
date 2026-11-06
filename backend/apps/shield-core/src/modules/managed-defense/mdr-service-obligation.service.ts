import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type CoverageTier,
  type EscalationPathNode,
  MdrServiceObligation,
  OperationalReadinessStatus,
  type SocStaffingSchedule,
  STANDARD_SLA_WINDOWS,
} from './mdr-service-obligation.entity';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const COVERAGE_TIERS: CoverageTier[] = [
  'BUSINESS_HOURS_8X5',
  'EXTENDED_16X7',
  'CONTINUOUS_24X7',
];

// Runtime shapes of the SocStaffingSchedule / EscalationPathNode interfaces,
// so the global ValidationPipe (whitelist: true) validates the nested objects
// instead of passing unchecked data into the obligation register.
export class SocStaffingScheduleDto implements SocStaffingSchedule {
  @IsIn(COVERAGE_TIERS)
  coverageTier!: CoverageTier;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  primaryTimezone!: string;

  @IsInt()
  @Min(0)
  minimumActiveAnalystsOnDuty!: number;

  @IsBoolean()
  escalationLeadAvailable!: boolean;

  @IsBoolean()
  tier3IncidentCommanderOnCall!: boolean;

  @IsBoolean()
  shiftHandoffProtocolProven!: boolean;
}

export class EscalationPathNodeDto implements EscalationPathNode {
  @IsInt()
  @Min(1)
  tierLevel!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  roleTitle!: string;

  @IsInt()
  @Min(0)
  responseWindowMinutes!: number;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  notificationChannels!: string[];

  @IsBoolean()
  requiresQuorumApproval!: boolean;
}

export class RegisterObligationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  contractId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  tenantId!: string;

  @IsIn(COVERAGE_TIERS)
  coverageTier!: CoverageTier;

  @IsDefined()
  @ValidateNested()
  @Type(() => SocStaffingScheduleDto)
  staffingSchedule!: SocStaffingSchedule;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => EscalationPathNodeDto)
  escalationPath?: EscalationPathNode[];

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  operationalProofRef?: string;
}

export class VerifyReadinessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  contractId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  auditorId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  proofDocumentRef!: string;

  @IsBoolean()
  passed24x7ShiftAudit!: boolean;
}

@Injectable()
export class MdrServiceObligationService {
  private readonly logger = new Logger(MdrServiceObligationService.name);

  // In-memory / DB synced store of contractual service obligations
  private readonly obligations = new Map<string, MdrServiceObligation>();

  constructor() {
    // Seed default baseline obligation for demo/contract validation
    const defaultObligation: MdrServiceObligation = {
      id: 'obl-default-001',
      contractId: 'contract-core-001',
      tenantId: '00000000-0000-4000-8000-000000000001',
      coverageTier: 'CONTINUOUS_24X7',
      readinessStatus: 'OPERATIONALLY_PROVEN',
      staffingSchedule: {
        coverageTier: 'CONTINUOUS_24X7',
        primaryTimezone: 'UTC',
        minimumActiveAnalystsOnDuty: 3,
        escalationLeadAvailable: true,
        tier3IncidentCommanderOnCall: true,
        shiftHandoffProtocolProven: true,
      },
      slaWindows: STANDARD_SLA_WINDOWS,
      escalationPath: [
        {
          tierLevel: 1,
          roleTitle: 'Tier 1 SOC Triage Analyst',
          responseWindowMinutes: 15,
          notificationChannels: ['SECOPS_PAGER', 'AUTOMATED_DISPATCH'],
          requiresQuorumApproval: false,
        },
        {
          tierLevel: 2,
          roleTitle: 'Tier 2 Incident Responder / Forensic Investigator',
          responseWindowMinutes: 30,
          notificationChannels: ['SLACK_WAR_ROOM', 'VOICE_ESCALATION'],
          requiresQuorumApproval: false,
        },
        {
          tierLevel: 3,
          roleTitle: 'Principal Security Architect / Incident Commander',
          responseWindowMinutes: 60,
          notificationChannels: ['EXECUTIVE_HOTLINE', 'TWO_MAN_QUORUM_SYSTEM'],
          requiresQuorumApproval: true,
        },
      ],
      operationalProofReference:
        'evidence://soc/q3-24x7-shift-audit-attestation-v1',
      lastReadinessAuditDate: new Date(),
      verifiedBy: 'SecOps-Compliance-Lead',
    };

    this.obligations.set(defaultObligation.contractId, defaultObligation);
  }

  /**
   * Rule SVC-01 Operational Gate:
   * Asserts that a 24/7 SOC claim can only be made if the obligation is OPERATIONALLY_PROVEN.
   */
  assert24x7ClaimPermitted(contractId: string): void {
    const obligation = this.obligations.get(contractId);
    if (!obligation) {
      throw new NotFoundException(
        `No MDR Service Obligation recorded for contract '${contractId}'`,
      );
    }

    if (
      obligation.coverageTier === 'CONTINUOUS_24X7' &&
      obligation.readinessStatus !== 'OPERATIONALLY_PROVEN'
    ) {
      this.logger.warn(
        `Rule SVC-01 Violation: Attempted 24/7 SOC claim for unproven contract '${contractId}'`,
      );
      throw new ConflictException(
        `Rule SVC-01 Enforcement: 24/7 SOC claim prohibited for contract '${contractId}' until shift staffing and escalation economics are operationally proven (current status: ${obligation.readinessStatus}).`,
      );
    }
  }

  /**
   * Retrieve obligation details for a contract.
   */
  getObligation(contractId: string): MdrServiceObligation {
    const obligation = this.obligations.get(contractId);
    if (!obligation) {
      throw new NotFoundException(
        `MDR Service Obligation for contract '${contractId}' not found`,
      );
    }
    return obligation;
  }

  /**
   * Register or update contractual MDR service obligations.
   */
  registerObligation(dto: RegisterObligationDto): MdrServiceObligation {
    const isProven =
      dto.operationalProofRef &&
      dto.staffingSchedule.shiftHandoffProtocolProven;
    const readinessStatus: OperationalReadinessStatus = isProven
      ? 'OPERATIONALLY_PROVEN'
      : 'CONTINGENT';

    const obligation: MdrServiceObligation = {
      id: `obl-${Date.now()}`,
      contractId: dto.contractId,
      tenantId: dto.tenantId,
      coverageTier: dto.coverageTier,
      readinessStatus,
      staffingSchedule: dto.staffingSchedule,
      slaWindows: STANDARD_SLA_WINDOWS,
      escalationPath: dto.escalationPath || [
        {
          tierLevel: 1,
          roleTitle: 'Tier 1 SOC Analyst',
          responseWindowMinutes: 15,
          notificationChannels: ['SECOPS_PAGER'],
          requiresQuorumApproval: false,
        },
      ],
      operationalProofReference: dto.operationalProofRef,
      lastReadinessAuditDate: isProven ? new Date() : undefined,
    };

    this.obligations.set(dto.contractId, obligation);
    return obligation;
  }

  /**
   * Verify and attest operational readiness proof.
   */
  verifyOperationalReadiness(dto: VerifyReadinessDto): MdrServiceObligation {
    const obligation = this.obligations.get(dto.contractId);
    if (!obligation) {
      throw new NotFoundException(
        `MDR Service Obligation for contract '${dto.contractId}' not found`,
      );
    }

    if (!dto.passed24x7ShiftAudit) {
      obligation.readinessStatus = 'UNPROVEN';
    } else {
      obligation.readinessStatus = 'OPERATIONALLY_PROVEN';
      obligation.operationalProofReference = dto.proofDocumentRef;
      obligation.lastReadinessAuditDate = new Date();
      obligation.verifiedBy = dto.auditorId;
    }

    this.obligations.set(dto.contractId, obligation);
    return obligation;
  }
}
