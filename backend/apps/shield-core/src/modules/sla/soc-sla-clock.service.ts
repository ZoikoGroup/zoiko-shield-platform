import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type SocCoverageTier = 'BUSINESS_HOURS' | 'EXTENDED_HOURS' | '24_7';

export type SocSlaClockStatus = 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'BREACHED';

export interface TriageClockRecord {
  caseId: string;
  tenantId: string;
  severity: string;
  coverageTier: string;
  targetResponseMinutes: number;
  status: SocSlaClockStatus;
  startedAt: Date;
  pausedAt?: Date;
  totalPausedMs: number;
  stoppedAt?: Date;
  activeTriageDurationMinutes?: number;
  pauseReason?: string;
  breachedAt?: Date;
}

const TARGET_RESPONSE_MINUTES: Record<string, number> = {
  CRITICAL: 15,
  HIGH: 60,
  MEDIUM: 240,
  LOW: 1440,
};

/**
 * ZS-COM-BILL-001 §9 E1, §16 L1 & Criteria SVC-01, SVC-04:
 * SOC investigation triage response clock.
 *
 * Persisted in the CaseSlaClock table rather than an in-memory Map: a clock
 * that forgets every elapsed minute on restart cannot support a breach
 * claim, and the spec requires start/pause/resume/breach to be
 * machine-readable and evidence-logged.
 *
 * Target response windows: CRITICAL 15m, HIGH 60m, MEDIUM 240m, LOW 1440m.
 * Paused time never counts toward the target - net active time is what's
 * measured against it.
 */
@Injectable()
export class SocSlaClockService {
  private readonly logger = new Logger(SocSlaClockService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toRecord(row: {
    case_id: string;
    tenant_id: string;
    severity: string;
    coverage_tier: string;
    target_response_minutes: number;
    status: string;
    started_at: Date;
    paused_at: Date | null;
    pause_reason: string | null;
    total_paused_ms: number;
    stopped_at: Date | null;
    active_triage_minutes: number | null;
    breached_at: Date | null;
  }): TriageClockRecord {
    return {
      caseId: row.case_id,
      tenantId: row.tenant_id,
      severity: row.severity,
      coverageTier: row.coverage_tier,
      targetResponseMinutes: row.target_response_minutes,
      status: row.status as SocSlaClockStatus,
      startedAt: row.started_at,
      pausedAt: row.paused_at ?? undefined,
      pauseReason: row.pause_reason ?? undefined,
      totalPausedMs: row.total_paused_ms,
      stoppedAt: row.stopped_at ?? undefined,
      activeTriageDurationMinutes: row.active_triage_minutes ?? undefined,
      breachedAt: row.breached_at ?? undefined,
    };
  }

  private async requireClock(caseId: string) {
    const row = await this.prisma.caseSlaClock.findUnique({
      where: { case_id: caseId },
    });
    if (!row) {
      throw new NotFoundException(
        `Triage clock for case '${caseId}' not found`,
      );
    }
    return row;
  }

  /** Idempotent: re-triaging a case does not restart an already-running clock. */
  async startTriageClock(params: {
    caseId: string;
    tenantId: string;
    severity: string;
    coverageTier?: SocCoverageTier;
  }): Promise<TriageClockRecord> {
    const existing = await this.prisma.caseSlaClock.findUnique({
      where: { case_id: params.caseId },
    });
    if (existing) {
      return this.toRecord(existing);
    }

    const tier = params.coverageTier ?? '24_7';
    const targetMinutes = TARGET_RESPONSE_MINUTES[params.severity] ?? 60;

    const row = await this.prisma.caseSlaClock.create({
      data: {
        case_id: params.caseId,
        tenant_id: params.tenantId,
        severity: params.severity,
        coverage_tier: tier,
        target_response_minutes: targetMinutes,
        status: 'RUNNING',
        started_at: new Date(),
        total_paused_ms: 0,
      },
    });

    this.logger.log(
      `Started SOC triage clock for case '${params.caseId}' (severity ${params.severity}, target ${targetMinutes}m, tier ${tier})`,
    );
    return this.toRecord(row);
  }

  async pauseClock(caseId: string, reason: string): Promise<TriageClockRecord> {
    const row = await this.requireClock(caseId);
    if (row.status !== 'RUNNING') {
      return this.toRecord(row);
    }

    const updated = await this.prisma.caseSlaClock.update({
      where: { case_id: caseId },
      data: {
        status: 'PAUSED',
        paused_at: new Date(),
        pause_reason: reason,
      },
    });

    this.logger.log(
      `Paused SOC triage clock for case '${caseId}'. Reason: ${reason}`,
    );
    return this.toRecord(updated);
  }

  async resumeClock(caseId: string): Promise<TriageClockRecord> {
    const row = await this.requireClock(caseId);
    if (row.status !== 'PAUSED') {
      return this.toRecord(row);
    }

    const pausedMs = row.paused_at
      ? Date.now() - row.paused_at.getTime()
      : 0;

    const updated = await this.prisma.caseSlaClock.update({
      where: { case_id: caseId },
      data: {
        status: 'RUNNING',
        paused_at: null,
        pause_reason: null,
        total_paused_ms: row.total_paused_ms + pausedMs,
      },
    });

    this.logger.log(`Resumed SOC triage clock for case '${caseId}'`);
    return this.toRecord(updated);
  }

  async stopClock(caseId: string): Promise<{
    clock: TriageClockRecord;
    isBreached: boolean;
    activeTriageMinutes: number;
  }> {
    const row = await this.requireClock(caseId);
    const now = new Date();

    // A clock stopped while paused still owes that final pause interval.
    const trailingPauseMs =
      row.status === 'PAUSED' && row.paused_at
        ? now.getTime() - row.paused_at.getTime()
        : 0;
    const totalPausedMs = row.total_paused_ms + trailingPauseMs;

    const totalElapsedMs = now.getTime() - row.started_at.getTime();
    const netActiveMs = Math.max(0, totalElapsedMs - totalPausedMs);
    const activeTriageMinutes = Math.round(netActiveMs / (60 * 1000));
    const isBreached = activeTriageMinutes > row.target_response_minutes;

    const updated = await this.prisma.caseSlaClock.update({
      where: { case_id: caseId },
      data: {
        status: isBreached ? 'BREACHED' : 'COMPLETED',
        stopped_at: now,
        paused_at: null,
        total_paused_ms: totalPausedMs,
        active_triage_minutes: activeTriageMinutes,
        breached_at: isBreached ? now : null,
      },
    });

    this.logger.log(
      `Stopped SOC triage clock for case '${caseId}'. Net triage ${activeTriageMinutes}m against a ${row.target_response_minutes}m target (${updated.status})`,
    );

    return {
      clock: this.toRecord(updated),
      isBreached,
      activeTriageMinutes,
    };
  }

  async getClock(caseId: string): Promise<TriageClockRecord | undefined> {
    const row = await this.prisma.caseSlaClock.findUnique({
      where: { case_id: caseId },
    });
    return row ? this.toRecord(row) : undefined;
  }

  /**
   * A clock that has blown its target while still running is already
   * breached — waiting for someone to stop the case before admitting it
   * would let a breach hide behind an open case indefinitely.
   */
  async markBreachedIfOverdue(caseId: string): Promise<TriageClockRecord> {
    const row = await this.requireClock(caseId);
    if (row.status !== 'RUNNING') {
      return this.toRecord(row);
    }

    const now = new Date();
    const netActiveMs = Math.max(
      0,
      now.getTime() - row.started_at.getTime() - row.total_paused_ms,
    );
    const activeTriageMinutes = Math.round(netActiveMs / (60 * 1000));
    if (activeTriageMinutes <= row.target_response_minutes) {
      return this.toRecord(row);
    }

    const updated = await this.prisma.caseSlaClock.update({
      where: { case_id: caseId },
      data: {
        status: 'BREACHED',
        breached_at: now,
        active_triage_minutes: activeTriageMinutes,
      },
    });

    this.logger.warn(
      `SOC triage clock for case '${caseId}' breached its ${row.target_response_minutes}m target (${activeTriageMinutes}m active)`,
    );
    return this.toRecord(updated);
  }
}
