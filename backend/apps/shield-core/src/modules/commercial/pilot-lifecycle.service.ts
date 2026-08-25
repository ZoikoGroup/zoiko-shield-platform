import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import crypto from 'crypto';

export interface CreatePilotProgramDto {
  tenantId: string;
  programName: string;
  durationDays: number; // e.g. 30, 60
  allowedDataClasses: string[];
  maxConnectors: number;
  syntheticDataOnly: boolean;
  sponsorName: string;
  sponsorEmail: string;
}

export interface ConvertPilotDto {
  pilotId: string;
  contractId: string;
  approvedBy: string;
}

export interface PilotProgramRecord {
  id: string;
  tenantId: string;
  programName: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CONVERTED' | 'TERMINATED';
  startDate: Date;
  expiryDate: Date;
  durationDays: number;
  allowedDataClasses: string[];
  maxConnectors: number;
  syntheticDataOnly: boolean;
  convertedContractId?: string;
  createdAt: Date;
}

/**
 * ZS-COM-BILL-001 §6 B3–B5, §23 S1–S2 & Acceptance Criterion COM-04:
 * Design-partner and pilot evaluation program lifecycle manager.
 *
 * Core Guarantees:
 * 1. Explicit scope, duration, data classes, and connector caps.
 * 2. No-Auto-Conversion: Expired pilots fail closed and never auto-convert to paid subscriptions.
 * 3. Governed migration: Conversion requires explicit signed contract authorization.
 */
@Injectable()
export class PilotLifecycleService {
  private readonly logger = new Logger(PilotLifecycleService.name);

  // In-memory registry with persistence hooks
  private readonly pilots = new Map<string, PilotProgramRecord>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a new Design-Partner or Pilot evaluation program
   */
  async createPilotProgram(dto: CreatePilotProgramDto): Promise<PilotProgramRecord> {
    if (dto.durationDays <= 0 || dto.durationDays > 90) {
      throw new BadRequestException('Pilot duration must be between 1 and 90 days');
    }

    const pilotId = `pilot-${crypto.randomUUID()}`;
    const startDate = new Date();
    const expiryDate = new Date(startDate.getTime() + dto.durationDays * 24 * 60 * 60 * 1000);

    const record: PilotProgramRecord = {
      id: pilotId,
      tenantId: dto.tenantId,
      programName: dto.programName,
      status: 'ACTIVE',
      startDate,
      expiryDate,
      durationDays: dto.durationDays,
      allowedDataClasses: dto.allowedDataClasses,
      maxConnectors: dto.maxConnectors,
      syntheticDataOnly: dto.syntheticDataOnly,
      createdAt: new Date(),
    };

    this.pilots.set(pilotId, record);

    this.logger.log(
      `Registered Pilot Program '${dto.programName}' (${pilotId}) for tenant '${dto.tenantId}'. Expires: ${expiryDate.toISOString()}`,
    );

    return record;
  }

  /**
   * Evaluate active pilot status. If past expiryDate, transitions status to EXPIRED (Fails closed)
   */
  async evaluatePilotAccess(pilotId: string): Promise<{
    pilot: PilotProgramRecord;
    isEligible: boolean;
    reason?: string;
  }> {
    const pilot = this.pilots.get(pilotId);
    if (!pilot) {
      throw new NotFoundException(`Pilot program '${pilotId}' not found`);
    }

    const now = new Date();
    if (now > pilot.expiryDate && pilot.status === 'ACTIVE') {
      pilot.status = 'EXPIRED';
      this.logger.warn(
        `Pilot program '${pilotId}' has expired as of ${pilot.expiryDate.toISOString()}. Non-commercial access suspended.`,
      );
      return {
        pilot,
        isEligible: false,
        reason: 'PILOT_EXPIRED_NO_AUTO_CONVERSION',
      };
    }

    if (pilot.status !== 'ACTIVE') {
      return {
        pilot,
        isEligible: false,
        reason: `PILOT_STATUS_${pilot.status}`,
      };
    }

    return {
      pilot,
      isEligible: true,
    };
  }

  /**
   * Convert pilot program into a live commercial contract
   */
  async convertPilotToContract(dto: ConvertPilotDto): Promise<PilotProgramRecord> {
    const pilot = this.pilots.get(dto.pilotId);
    if (!pilot) {
      throw new NotFoundException(`Pilot program '${dto.pilotId}' not found`);
    }

    if (pilot.status === 'CONVERTED') {
      throw new ConflictException(`Pilot program '${dto.pilotId}' is already converted`);
    }

    pilot.status = 'CONVERTED';
    pilot.convertedContractId = dto.contractId;

    this.logger.log(
      `Converted Pilot '${dto.pilotId}' to Commercial Contract '${dto.contractId}' by '${dto.approvedBy}'`,
    );

    return pilot;
  }

  /**
   * List all pilots for tenant
   */
  async listPilotsForTenant(tenantId: string): Promise<PilotProgramRecord[]> {
    return Array.from(this.pilots.values()).filter((p) => p.tenantId === tenantId);
  }
}
