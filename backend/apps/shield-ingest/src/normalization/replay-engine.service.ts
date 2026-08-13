import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizationService } from './normalization.service';
import { DetectionEngineService } from '../detection/detection-engine.service';

@Injectable()
export class ReplayEngineService {
  private readonly logger = new Logger(ReplayEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizationService: NormalizationService,
    private readonly detectionEngineService: DetectionEngineService,
  ) {}

  /**
   * Reprocess a quarantined event after schema/mapping update
   */
  async reprocessQuarantinedEvent(tenantId: string, eventId: string) {
    this.logger.log(`Reprocessing quarantined event: ${eventId}`);
    return this.normalizationService.reprocessQuarantinedEvent(tenantId, eventId);
  }

  /**
   * Replay events over a time range for a detection rule
   */
  async replayEventsForDetection(
    tenantId: string,
    detectionId: string,
    fromDate?: Date,
    toDate?: Date,
  ) {
    const rule = await this.prisma.detectionRule.findFirst({
      where: {
        id: detectionId,
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
    });

    if (!rule) {
      throw new NotFoundException(`Detection rule '${detectionId}' not found`);
    }

    const start = fromDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = toDate || new Date();

    const events = await this.prisma.normalizedEvent.findMany({
      where: {
        tenant_id: tenantId,
        recorded_at: { gte: start, lte: end },
      },
    });

    let matchedCount = 0;
    for (const evt of events) {
      const runs = await this.detectionEngineService.evaluateNormalizedEvent(evt.id);
      const isMatch = Array.isArray(runs)
        ? runs.some((run) => run.result === 'MATCH' || run.result === 'MATCHED')
        : false;
      if (isMatch) matchedCount++;
    }

    return {
      detectionId,
      eventsEvaluated: events.length,
      matchedCount,
      replayTimeframe: { start, end },
    };
  }
}
