import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantOffboardingService } from '../lifecycle/tenant-offboarding.service';
import { MAX_DELETION_ATTEMPTS } from './deletion-task.service';
import { PlatformScope } from '../../../../../../libs/database/src';

const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 30 * 60_000;

function backoffDelayMs(attempt: number): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(attempt - 1, 0);
  const jitter = Math.random() * BASE_DELAY_MS;
  return Math.min(exponential + jitter, MAX_DELAY_MS);
}

/**
 * Durable progression for the destructive phase: a purge that stopped resumes
 * on its own, from its checkpoints, without anyone watching
 * (ZS-ENG-OFF-DEL-001 decision 4).
 *
 * Two things get picked up — a run waiting for its retention period to elapse,
 * and a run whose store tasks failed and whose backoff has passed. Retries are
 * bounded by the task service; once a task exhausts them it moves to
 * ENGINEERING_REVIEW and this worker deliberately leaves it alone, because at
 * that point a human has to look at it. Tenant access stays revoked the whole
 * time — a failed purge never restores it.
 */
@Injectable()
export class DeletionRetryService {
  private readonly logger = new Logger(DeletionRetryService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly offboardingService: TenantOffboardingService,
  ) {}

  @PlatformScope('scheduled job DeletionRetryService.resumeDue')
  @Cron(CronExpression.EVERY_MINUTE)
  async resumeDue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.resumeRetentionEligible();
      await this.resumeFailed();
    } finally {
      this.running = false;
    }
  }

  private async resumeRetentionEligible(): Promise<void> {
    const waiting = await this.prisma.tenantOffboardingRun.findMany({
      where: { status: 'RETENTION_WAIT' },
      take: 25,
    });
    for (const run of waiting) {
      if (!run.deletion_request_id) continue;
      const request = await this.prisma.deletionRequest.findUnique({
        where: { id: run.deletion_request_id },
      });
      if (
        !request?.retention_expires_at ||
        request.retention_expires_at.getTime() > Date.now()
      ) {
        continue;
      }
      await this.resume(run.tenant_id, run.id, 'retention period elapsed');
    }
  }

  private async resumeFailed(): Promise<void> {
    const failed = await this.prisma.tenantOffboardingRun.findMany({
      where: { status: { in: ['FAILED', 'DELETING', 'VERIFYING'] } },
      take: 25,
    });
    for (const run of failed) {
      if (!run.deletion_request_id) continue;
      const tasks = await this.prisma.deletionTask.findMany({
        where: { deletion_request_id: run.deletion_request_id },
      });
      // A task held for engineering review blocks automatic progression for
      // the whole run: nothing further may be destroyed until it is cleared.
      if (tasks.some((task) => task.status === 'ENGINEERING_REVIEW')) continue;
      const retryable = tasks.filter(
        (task) =>
          task.status !== 'COMPLETED' && task.attempt < MAX_DELETION_ATTEMPTS,
      );
      if (retryable.length === 0) continue;
      const due = retryable.every((task) => {
        if (!task.last_attempt_at) return true;
        return (
          Date.now() >=
          task.last_attempt_at.getTime() + backoffDelayMs(task.attempt)
        );
      });
      if (!due) continue;
      await this.resume(run.tenant_id, run.id, 'retrying incomplete store(s)');
    }
  }

  private async resume(
    tenantId: string,
    runId: string,
    why: string,
  ): Promise<void> {
    try {
      await this.offboardingService.resumeDeletion(tenantId, runId);
      this.logger.log(`Resumed offboarding run ${runId} (${why})`);
    } catch (err) {
      this.logger.warn(
        `Could not resume offboarding run ${runId} (${why}): ${(err as Error).message}`,
      );
    }
  }
}
