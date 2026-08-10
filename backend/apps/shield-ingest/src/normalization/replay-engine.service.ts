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

    let rawPayloadObject: Record<string, any> = {};
    try {
      rawPayloadObject = JSON.parse(quarantined.rawPayload);
    } catch (e) {
      rawPayloadObject = { rawText: quarantined.rawPayload };
    }

    // Execute normalization on quarantined payload
    const normResult = await this.normalizationService.normalizePayload(
      quarantined.tenant_id,
      eventId, // rawEventId reference
      'WEBHOOK',
      rawPayloadObject,
    );

    return {
      quarantinedId: eventId,
      status: 'REPROCESSED',
      normalizationResult: normResult,
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
        tenant_id: rule.tenant_id,
        recorded_at: { gte: start, lte: end },
      },
    });

    let matchedCount = 0;
    for (const evt of events) {
      const matchResult = await this.detectionEngineService.evaluateRuleAgainstEvent(
        rule.id,
        evt.id,
      );
      if (matchResult.matched) matchedCount++;
    }

    return {
      detectionId,
      eventsEvaluated: events.length,
      matchedCount,
      replayTimeframe: { start, end },
    };
  }
}
