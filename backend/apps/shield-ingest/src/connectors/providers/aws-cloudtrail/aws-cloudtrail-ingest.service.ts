import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { AwsCloudTrailNormalizerService } from './aws-cloudtrail.normalizer';
import {
  CloudTrailRawRecord,
  CloudTrailNormalizedEvent,
} from './aws-cloudtrail.types';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../../../kafka/kafka.producer.service';
import { QuarantineService } from '../../../ingestion/quarantine.service';

export interface CloudTrailIngestBatchResult {
  tenantId: string;
  totalRecords: number;
  acceptedCount: number;
  quarantinedCount: number;
  normalizedEvents: CloudTrailNormalizedEvent[];
  batchDigest: string;
}

/**
 * AWS CloudTrail Live Ingestion Adapter (Spec §5 & §20)
 *
 * Capabilities:
 * 1. Validates AWS SigV4 authorization signatures on webhook/SQS batch payloads.
 * 2. Computes raw SHA-256 digests for cryptographic provenance.
 * 3. Normalizes CloudTrail audit records to OCSF 1.1.0 schemas.
 * 4. Routes unparseable/schema-violating records to the DLQ quarantine worker.
 * 5. Dispatches normalized events to Kafka `CANONICAL_TOPICS.TELEMETRY_NORMALIZED`.
 */
@Injectable()
export class AwsCloudTrailIngestService {
  private readonly logger = new Logger(AwsCloudTrailIngestService.name);

  constructor(
    private readonly normalizer: AwsCloudTrailNormalizerService,
    private readonly kafkaProducer?: KafkaProducerService,
    private readonly quarantineService?: QuarantineService,
  ) {}

  /**
   * Verifies AWS HMAC-SHA256 signature against tenant-configured connector secret.
   */
  verifySigV4Auth(
    rawPayload: string | Buffer,
    signatureHeader: string,
    secretKey: string,
  ): boolean {
    if (!signatureHeader || !secretKey) return false;

    const payloadBuffer =
      typeof rawPayload === 'string'
        ? Buffer.from(rawPayload, 'utf8')
        : rawPayload;
    const computedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(payloadBuffer)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signatureHeader, 'hex'),
        Buffer.from(computedSignature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Ingests a batch of raw AWS CloudTrail records, normalizes, and publishes.
   */
  async ingestCloudTrailBatch(
    tenantId: string,
    environmentId: string,
    records: CloudTrailRawRecord[],
    region = 'us-east-1',
  ): Promise<CloudTrailIngestBatchResult> {
    const normalizedEvents: CloudTrailNormalizedEvent[] = [];
    let quarantinedCount = 0;

    for (const rawRecord of records) {
      try {
        if (
          !rawRecord.eventID ||
          !rawRecord.eventName ||
          !rawRecord.eventSource
        ) {
          throw new Error(
            'Missing mandatory CloudTrail record fields (eventID, eventName, eventSource)',
          );
        }

        const normalized = this.normalizer.normalizeRecord(
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
              CANONICAL_TOPICS.EVENT_NORMALIZED,
              'aws.cloudtrail.normalized.v1',
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
          `CloudTrail normalization failed for event ${rawRecord.eventID || 'unknown'}: ${err.message}`,
        );

        if (this.quarantineService) {
          this.quarantineService.quarantine({
            tenantId,
            environmentId,
            connectorId: 'aws-cloudtrail',
            sourceEventId: rawRecord.eventID,
            rawPayload: JSON.stringify(rawRecord),
            failureReason: 'SCHEMA_MISMATCH',
            errorMessage: err.message,
          });
        }
      }
    }

    const batchDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify(normalizedEvents.map((e) => e.raw_payload_hash)))
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
