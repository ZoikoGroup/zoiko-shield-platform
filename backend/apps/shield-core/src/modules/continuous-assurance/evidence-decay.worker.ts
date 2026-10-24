import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EvidenceDecayWorker {
  private readonly logger = new Logger(EvidenceDecayWorker.name);
  private readonly FRESHNESS_WINDOW_DAYS = 30;
  private readonly BATCH_SIZE = 500;

  constructor(private readonly prisma: PrismaService) {}

  async processEvidenceDecay(): Promise<{ scanned: number; decayed: number }> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - this.FRESHNESS_WINDOW_DAYS);
    const where = {
      created_at: { lt: thresholdDate },
      freshness_state: { notIn: ['DECAYED', 'ARCHIVED', 'EXPIRED'] },
    };

    let scanned = 0;
    let decayedCount = 0;
    // Each batch is marked DECAYED in one UPDATE (dropping it out of `where`)
    // with its events in one INSERT, atomically, so memory stays bounded.
    for (;;) {
      const batch = await this.prisma.evidenceRecord.findMany({
        where,
        select: {
          id: true,
          tenant_id: true,
          evidence_type: true,
          source_object_id: true,
          created_at: true,
        },
        take: this.BATCH_SIZE,
      });
      if (batch.length === 0) break;
      scanned += batch.length;

      const decayedAt = new Date().toISOString();
      const [updated] = await this.prisma.$transaction([
        this.prisma.evidenceRecord.updateMany({
          where: { id: { in: batch.map((record) => record.id) } },
          data: { freshness_state: 'DECAYED' },
        }),
        this.prisma.commercialEvent.createMany({
          data: batch.map((record) => ({
            event_type: 'evidence.decayed',
            tenant_id: record.tenant_id,
            actor: 'system-evidence-decay-worker',
            idempotency_key: `decay-${record.id}`,
            payload: JSON.stringify({
              evidenceId: record.id,
              evidenceType: record.evidence_type,
              sourceObjectId: record.source_object_id,
              createdAt: record.created_at,
              decayedAt,
            }),
          })),
          skipDuplicates: true,
        }),
      ]);
      decayedCount += updated.count;

      // Nothing updated means the same rows would come back: stop, don't spin.
      if (updated.count === 0 || batch.length < this.BATCH_SIZE) break;
    }

    this.logger.log(
      `EvidenceDecayWorker completed: ${scanned} scanned, ${decayedCount} marked DECAYED`,
    );

    return { scanned, decayed: decayedCount };
  }
}
