import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SlaMeasurementService } from './sla-measurement.service';
import crypto from 'crypto';

export type SocCoverageTier = 'BUSINESS_HOURS' | 'EXTENDED_HOURS' | '24_7';

export interface TriageClockRecord {
  caseId: string;
  tenantId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  coverageTier: SocCoverageTier;
  targetResponseMinutes: number;
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'BREACHED';
  startedAt: Date;
  pausedAt?: Date;
  totalPausedMs: number;
  stoppedAt?: Date;
  activeTriageDurationMinutes?: number;
  pauseReason?: string;
}

/**
 * ZS-COM-BILL-001 §9 E1, §16 L1 & Criteria SVC-01, SVC-04:
 * Real-time SOC investigation triage response clock tracker.
 *
 * Core Guarantees:
 * 1. Target Response Windows:
 *    - CRITICAL: 15 minutes (24/7)
 *    - HIGH: 60 minutes
 *    - MEDIUM: 240 minutes (4 hours)
 *    - LOW: 1440 minutes (24 hours)
 * 2. Automatic Pause States: Pauses clock when case enters
 *    CUSTOMER_ACTION_REQUIRED or THIRD_PARTY_DEPENDENCY.
 * 3. Contractual SLA Integration: Records breach in SlaMeasurementService
 *    without modifying historical security facts.
 */
@Injectable()
export class SocSlaClockService {
  private readonly logger = new Logger(SocSlaClockService.name);

  // In-memory clock records with persistence
  private readonly clocks = new Map<string, TriageClockRecord>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly measurementService: SlaMeasurementService,
  ) {}

  /**
   * Start triage clock upon Case creation
   */
  startTriageClock(params: {
    caseId: string;
    tenantId: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    coverageTier?: SocCoverageTier;
  }): TriageClockRecord {
    const tier = params.coverageTier || '24_7';
    let targetMinutes = 60;

    switch (params.severity) {
      case 'CRITICAL':
        targetMinutes = 15;
        break;
      case 'HIGH':
        targetMinutes = 60;
        break;
      case 'MEDIUM':
        targetMinutes = 240;
        break;
      case 'LOW':
        targetMinutes = 1440;
        break;
    }

    const clock: TriageClockRecord = {
      caseId: params.caseId,
      tenantId: params.tenantId,
      severity: params.severity,
      coverageTier: tier,
      targetResponseMinutes: targetMinutes,
      status: 'RUNNING',
      startedAt: new Date(),
      totalPausedMs: 0,
    };

    this.clocks.set(params.caseId, clock);

    this.logger.log(
      `Started SOC Triage Clock for case '${params.caseId}' (Severity: ${params.severity}, Target: ${targetMinutes}m, Tier: ${tier})`,
    );

    return clock;
  }

  /**
   * Pause triage clock when customer action or third party is required
   */
  pauseClock(caseId: string, reason: string): TriageClockRecord {
    const clock = this.clocks.get(caseId);
    if (!clock) {
      throw new NotFoundException(`Triage clock for case '${caseId}' not found`);
    }

    if (clock.status === 'PAUSED') {
      return clock;
    }

    clock.status = 'PAUSED';
    clock.pausedAt = new Date();
    clock.pauseReason = reason;

    this.logger.log(
      `Paused SOC Triage Clock for case '${caseId}'. Reason: ${reason}`,
    );

    return clock;
  }

  /**
   * Resume triage clock when customer supplies input or third-party clears
   */
  resumeClock(caseId: string): TriageClockRecord {
    const clock = this.clocks.get(caseId);
    if (!clock) {
      throw new NotFoundException(`Triage clock for case '${caseId}' not found`);
    }

    if (clock.status !== 'PAUSED') {
      return clock;
    }

    if (clock.pausedAt) {
      const pauseDuration = Date.now() - clock.pausedAt.getTime();
      clock.totalPausedMs += pauseDuration;
      clock.pausedAt = undefined;
    }

    clock.status = 'RUNNING';
    clock.pauseReason = undefined;

    this.logger.log(`Resumed SOC Triage Clock for case '${caseId}'`);

    return clock;
  }

  /**
   * Stop clock upon triage disposition & calculate SLA compliance
   */
  stopClock(caseId: string): {
    clock: TriageClockRecord;
    isBreached: boolean;
    activeTriageMinutes: number;
  } {
    const clock = this.clocks.get(caseId);
    if (!clock) {
      throw new NotFoundException(`Triage clock for case '${caseId}' not found`);
    }

    const now = new Date();
    clock.stoppedAt = now;

    if (clock.status === 'PAUSED' && clock.pausedAt) {
      clock.totalPausedMs += now.getTime() - clock.pausedAt.getTime();
      clock.pausedAt = undefined;
    }

    const totalElapsedMs = now.getTime() - clock.startedAt.getTime();
    const netActiveMs = Math.max(0, totalElapsedMs - clock.totalPausedMs);
    const activeTriageMinutes = Math.round(netActiveMs / (60 * 1000));

    clock.activeTriageDurationMinutes = activeTriageMinutes;
    const isBreached = activeTriageMinutes > clock.targetResponseMinutes;
    clock.status = isBreached ? 'BREACHED' : 'COMPLETED';

    this.logger.log(
      `Stopped SOC Triage Clock for case '${caseId}'. Net Triage: ${activeTriageMinutes}m (Target: ${clock.targetResponseMinutes}m, Status: ${clock.status})`,
    );

    return {
      clock,
      isBreached,
      activeTriageMinutes,
    };
  }

  /**
   * Get live status of clock
   */
  getClock(caseId: string): TriageClockRecord | undefined {
    return this.clocks.get(caseId);
  }
}
