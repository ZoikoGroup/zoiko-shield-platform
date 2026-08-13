import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { ExportBuilderService } from '../builders/export-builder.service';
import { ExportManifestService } from '../manifests/export-manifest.service';

/** Async worker (spec §55/PHASE 9) — no real job queue exists this pass, so a cron sweep plays that role, same pattern as OutboxPublisherService. */
@Injectable()
export class ExportWorkerService {
  private readonly logger = new Logger(ExportWorkerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly builderService: ExportBuilderService,
    private readonly manifestService: ExportManifestService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processQueued(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.prisma.exportJob.findMany({
        where: { status: 'REQUESTED' },
        take: 5,
      });
      for (const job of jobs) {
        await this.run(job.id).catch((err) =>
          this.logger.error(
            `ExportJob ${job.id} failed: ${(err as Error).message}`,
          ),
        );
      }
    } finally {
      this.running = false;
    }
  }

  async run(jobId: string): Promise<void> {
    const job = await this.prisma.exportJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    await this.prisma.exportJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING', started_at: new Date() },
    });
    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId: job.tenant_id,
        topic: CANONICAL_TOPICS.EXPORT_STARTED,
        eventType: 'export.started',
        payload: { jobId: job.id },
      }),
    });

    const requestedScope: string[] = JSON.parse(job.requested_scope);
    const { artifacts, unavailableScopes } =
      await this.builderService.buildArtifacts(
        job.tenant_id,
        job.id,
        requestedScope,
      );

    await this.prisma.exportJob.update({
      where: { id: job.id },
      data: { status: 'VERIFYING', progress: 90 },
    });
    const { completenessState } = await this.manifestService.build({
      tenantId: job.tenant_id,
      exportJobId: job.id,
      purpose: job.purpose,
      artifacts,
      unavailableScopes,
    });

    const finalStatus = completenessState === 'COMPLETE' ? 'READY' : 'PARTIAL';
    await this.prisma.exportJob.update({
      where: { id: job.id },
      data: { status: finalStatus, progress: 100, completed_at: new Date() },
    });
    await this.prisma.outboxEvent.create({
      data: this.outbox.build({
        tenantId: job.tenant_id,
        topic:
          finalStatus === 'READY'
            ? CANONICAL_TOPICS.EXPORT_READY
            : CANONICAL_TOPICS.EXPORT_PARTIAL,
        eventType: finalStatus === 'READY' ? 'export.ready' : 'export.partial',
        payload: { jobId: job.id },
      }),
    });
  }
}
