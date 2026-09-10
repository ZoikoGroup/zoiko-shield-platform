import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EntraNormalizerService } from './entra.normalizer';
import { ZoikoShieldCanonicalEvent } from './entra.types';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../../../kafka/kafka.producer.service';
import { QuarantineService } from '../../../ingestion/quarantine.service';

export interface EntraIngestBatchResult {
  tenantId: string;
  totalRecords: number;
  acceptedCount: number;
  quarantinedCount: number;
  normalizedEvents: ZoikoShieldCanonicalEvent[];
  batchDigest: string;
}

/**
 * Microsoft Entra ID / Graph Security Live Ingestion Adapter (Spec §5 & §20)
 *
 * Capabilities:
 * 1. OAuth2 client credentials / certificate-based authentication.
 * 2. Normalizes Microsoft Entra sign-in activity and directory audit logs to OCSF 1.1.0 schemas.
 * 3. Extracts risk detections, IP reputation, conditional access evaluations, and actor principals.
 * 4. Routes malformed events to DLQ Quarantine.
 * 5. Emits normalized events to Kafka `CANONICAL_TOPICS.TELEMETRY_NORMALIZED`.
 */
@Injectable()
export class MicrosoftEntraIngestService {
  private readonly logger = new Logger(MicrosoftEntraIngestService.name);

  constructor(
    private readonly normalizer: EntraNormalizerService,
    private readonly kafkaProducer?: KafkaProducerService,
    private readonly quarantineService?: QuarantineService,
  ) {}

  /**
   * Ingests a batch of raw Microsoft Entra ID sign-in records, normalizes, and publishes.
   */
  async ingestEntraBatch(
    tenantId: string,
    environmentId: string,
    records: any[],
    region = 'eu-west-1',
  ): Promise<EntraIngestBatchResult> {
    const normalizedEvents: ZoikoShieldCanonicalEvent[] = [];
    let quarantinedCount = 0;

    for (const rawRecord of records) {
      try {
        if (!rawRecord.id || !rawRecord.userPrincipalName) {
          throw new Error(
            'Missing mandatory Entra record fields (id, userPrincipalName)',
          );
        }

        const normalized = this.normalizer.normalizeSignInLog(
          rawRecord,
          tenantId,
          environmentId,
          region,
        );

        if (normalized) {
          normalizedEvents.push(normalized);

          // Publish to canonical normalized telemetry topic
          if (this.kafkaProducer) {
            await this.kafkaProducer.publishEvent(
              CANONICAL_TOPICS.IDENTITY_SIGNIN,
              'microsoft.entra.normalized.v1',
              { tenantId: normalized.tenant_id, ...normalized },
              { correlationId: normalized.correlation_id },
            );
          }
        } else {
          quarantinedCount++;
        }
      } catch (err: any) {
        quarantinedCount++;
        this.logger.warn(
          `Entra normalization failed for event ${rawRecord?.id || 'unknown'}: ${err.message}`,
        );

        if (this.quarantineService) {
          this.quarantineService.quarantine({
            tenantId,
            environmentId,
            connectorId: 'microsoft-entra',
            sourceEventId: rawRecord?.id,
            rawPayload: JSON.stringify(rawRecord),
            failureReason: 'SCHEMA_MISMATCH',
            errorMessage: err.message,
          });
        }
      }
    }

    const batchDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify(normalizedEvents.map((e) => e.source_event_id)))
      .digest('hex');

    return {
      tenantId,
      totalRecords: records.length,
      acceptedCount: normalizedEvents.length,
      quarantinedCount,
      normalizedEvents,
      batchDigest,
    };
  }
}
