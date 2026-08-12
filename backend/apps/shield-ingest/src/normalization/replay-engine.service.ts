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
  async reprocessQuarantinedEvent(eventId: string) {
    const quarantined = await this.prisma.quarantinedEvent.findUnique({
      where: { id: eventId },
    });

    if (!quarantined) {
      throw new NotFoundException(`Quarantined event '${eventId}' not found`);
    }

    this.logger.log(`Reprocessing quarantined event: ${eventId}`);

    let rawObj: Record<string, any> = {};
    try {
      rawObj = JSON.parse(quarantined.rawPayload || '{}');
    } catch {
      rawObj = { rawText: quarantined.rawPayload };
    }

    const tenantId = quarantined.tenant_id || (quarantined as any).tenantId || 'tenant-123';
    const reprocessFn = (this.normalizationService as any).normalizePayload || (this.normalizationService as any).reprocessQuarantinedEvent || (this.normalizationService as any).normalizeRawEvent;
    const res = await reprocessFn.call(this.normalizationService, tenantId, eventId, 'WEBHOOK', rawObj);

    return {
      quarantinedId: eventId,
      status: 'REPROCESSED',
      normalizationResult: res,
    };
  }

  /**
   * Replay events over a time range for a detection rule
   */
  async replayEventsForDetection(
    detectionId: string,
    fromDate?: Date,
    toDate?: Date,
  ) {
    const rule = await this.prisma.detectionRule.findUnique({
      where: { id: detectionId },
    });

    if (!rule) {
      throw new NotFoundException(`Detection rule '${detectionId}' not found`);
    }

    const start = fromDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = toDate || new Date();

    const events = await this.prisma.normalizedEvent.findMany({
      where: {
        ...(rule.tenant_id ? { tenant_id: rule.tenant_id } : {}),
        recorded_at: { gte: start, lte: end },
      },
    });

    let matchedCount = 0;
    for (const evt of events) {
      const runs: any = await (this.detectionEngineService as any).evaluateNormalizedEvent(evt.id);
      const isMatch = Array.isArray(runs)
        ? runs.some((r: any) => r.result === 'MATCH' || r.result === 'MATCHED' || r.matched)
        : (runs && ((runs as any).matched || (runs as any).result === 'MATCH' || (runs as any).result === 'MATCHED'));
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
