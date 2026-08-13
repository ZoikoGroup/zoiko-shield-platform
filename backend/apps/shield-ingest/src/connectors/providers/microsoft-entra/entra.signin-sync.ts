/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { EntraGraphClient } from './entra.client';
import { EntraNormalizerService } from './entra.normalizer';
import { ConnectorCheckpointService } from '../../services/checkpoint.service';
import { RawIngestService } from '../../../ingestion/raw-ingest.service';
import { NormalizationService } from '../../../normalization/normalization.service';
import { KafkaProducerService, CANONICAL_TOPICS } from '../../../kafka/kafka.producer.service';

// Delayed Microsoft events can land slightly after their createdDateTime;
// re-reading a small overlap window on every poll avoids silently missing
// them at the checkpoint boundary. Duplicates are absorbed by RawEvent's
// dedup on source_event_id, not by narrowing the window.
const OVERLAP_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class EntraSignInSyncService {
  private readonly logger = new Logger(EntraSignInSyncService.name);

  constructor(
    private readonly graphClient: EntraGraphClient,
    private readonly normalizer: EntraNormalizerService,
    private readonly checkpointService: ConnectorCheckpointService,
    private readonly rawIngestService: RawIngestService,
    private readonly normalizationService: NormalizationService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * Polls the Microsoft Graph /auditLogs/signIns endpoint. Uses date
   * filters instead of delta links because sign-in logs do not support
   * delta queries. Every log is raw-stored (with dedup) BEFORE
   * normalization — previously normalization happened first and raw
   * storage never happened for this path at all.
   */
  async pollSignInLogs(
    instanceId: string,
    tenantId: string,
    environmentId: string,
    region: string,
    accessToken: string,
  ): Promise<number> {
    this.logger.log(`Starting Sign-in Log polling for Connector ${instanceId}`);

    const checkpoint = await this.checkpointService.get(instanceId, 'signIns');
    const lastFetch = checkpoint
      ? new Date(new Date(checkpoint).getTime() - OVERLAP_WINDOW_MS)
      : new Date(Date.now() - 60 * 60 * 1000);
    const now = new Date();

    const filter = `createdDateTime ge ${lastFetch.toISOString()} and createdDateTime le ${now.toISOString()}`;
    let endpoint = `/auditLogs/signIns?$filter=${encodeURIComponent(filter)}`;
    let totalProcessed = 0;

    while (endpoint) {
      this.logger.debug(`Fetching Graph URL: ${endpoint}`);
      const data = await this.graphClient.request(endpoint, accessToken);
      const logs = data.value || [];
      totalProcessed += logs.length;

      for (const log of logs) {
        const ingestResult = await this.rawIngestService.ingestRawEvent({
          tenantId,
          environmentId,
          connectorId: instanceId,
          sourceType: 'microsoft-entra',
          sourceEventId: log.id,
          occurredAt: log.createdDateTime ? new Date(log.createdDateTime) : undefined,
          payload: log,
        });

        if (ingestResult.processingStatus === 'DUPLICATE_IGNORED') {
          continue;
        }

        await this.normalizationService.normalizeRawEvent(ingestResult.id);

        // External consumers (e.g. shield-ai) expect the richer canonical
        // shape too — publish it alongside the internal NormalizedEvent.
        const canonicalEvent = this.normalizer.normalizeSignInLog(
          log,
          tenantId,
          environmentId,
          region,
        );
        await this.kafkaProducer.publishEvent(
          CANONICAL_TOPICS.IDENTITY_SIGNIN,
          canonicalEvent.event_type,
          { tenantId, instanceId, ...canonicalEvent },
          {
            correlationId: canonicalEvent.correlation_id,
            occurredAt: new Date(canonicalEvent.event_timestamp),
          },
        );
      }

      endpoint = data['@odata.nextLink'];
    }

    await this.checkpointService.set(tenantId, instanceId, 'signIns', now.toISOString());

    this.logger.log(
      `Sign-in polling completed. Total processed: ${totalProcessed}`,
    );
    return totalProcessed;
  }
}
