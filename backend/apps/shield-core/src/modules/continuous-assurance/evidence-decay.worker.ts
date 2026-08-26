import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EvidenceDecayWorker {
  private readonly logger = new Logger(EvidenceDecayWorker.name);
  private readonly FRESHNESS_WINDOW_DAYS = 30;

  constructor(private readonly prisma: PrismaService) {}

  async processEvidenceDecay(): Promise<{ scanned: number; decayed: number }> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - this.FRESHNESS_WINDOW_DAYS);

    const staleRecords = await this.prisma.evidenceRecord.findMany({
      where: {
        created_at: { lt: thresholdDate },
        status: { notIn: ['DECAYED', 'ARCHIVED', 'EXPIRED'] },
      },
    });

    let decayedCount = 0;
    for (const record of staleRecords) {
      await this.prisma.evidenceRecord.update({
        where: { id: record.id },
        data: { status: 'DECAYED' },
      });

      await this.prisma.commercialEvent.create({
        data: {
          event_type: 'evidence.decayed',
          tenant_id: record.tenant_id,
          actor: 'system-evidence-decay-worker',
          idempotency_key: `decay-${record.id}`,
          payload: JSON.stringify({
            evidenceId: record.id,
            evidenceKey: record.evidence_key,
            createdAt: record.created_at,
            decayedAt: new Date().toISOString(),
          }),
        },
      });
      decayedCount++;
    }

    this.logger.log(
      `EvidenceDecayWorker completed: ${staleRecords.length} scanned, ${decayedCount} marked DECAYED`,
    );

    return { scanned: staleRecords.length, decayed: decayedCount };
  }
}
