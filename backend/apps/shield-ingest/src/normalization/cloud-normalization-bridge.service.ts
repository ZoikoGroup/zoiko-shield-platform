import { Injectable, Logger } from '@nestjs/common';
import { OktaNormalizerService } from '../connectors/providers/okta/okta.normalizer';
import { AwsCloudTrailNormalizerService } from '../connectors/providers/aws-cloudtrail/aws-cloudtrail.normalizer';
import { CrowdStrikeNormalizerService } from '../connectors/providers/crowdstrike/crowdstrike.normalizer';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { OktaEventPayload } from '../connectors/providers/okta/okta.types';
import { CloudTrailRawRecord } from '../connectors/providers/aws-cloudtrail/aws-cloudtrail.types';
import { CrowdStrikeDetectionPayload } from '../connectors/providers/crowdstrike/crowdstrike.types';

export interface CloudNormalizationResult {
  provider: 'okta' | 'aws-cloudtrail' | 'crowdstrike';
  tenantId: string;
  environmentId: string;
  ocsfClassUid: number;
  rawPayloadHash: string;
  normalizedPayload: Record<string, any>;
  timestamp: string;
}

@Injectable()
export class CloudNormalizationBridgeService {
  private readonly logger = new Logger(CloudNormalizationBridgeService.name);

  constructor(
    private readonly oktaNormalizer: OktaNormalizerService,
    private readonly cloudTrailNormalizer: AwsCloudTrailNormalizerService,
    private readonly crowdStrikeNormalizer: CrowdStrikeNormalizerService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * Normalizes Okta System Log event into canonical OCSF 3002 (Authentication).
   */
  async normalizeOktaEvent(
    event: OktaEventPayload,
    tenantId: string,
    environmentId: string,
    region: string = 'us-east-1',
  ): Promise<CloudNormalizationResult> {
    const ocsfEvent = this.oktaNormalizer.normalizeEvent(
      event,
      tenantId,
      environmentId,
      region,
    );

    await this.emitNormalizedEvent('telemetry.normalized.v1', {
      provider: 'okta',
      tenantId,
      environmentId,
      event: ocsfEvent,
    });

    return {
      provider: 'okta',
      tenantId,
      environmentId,
      ocsfClassUid: ocsfEvent.class_uid,
      rawPayloadHash: ocsfEvent.raw_payload_hash,
      normalizedPayload: ocsfEvent,
      timestamp: ocsfEvent.time,
    };
  }

  /**
   * Normalizes AWS CloudTrail record into canonical OCSF 3002/6003 (Cloud API / IAM).
   */
  async normalizeCloudTrailRecord(
    record: CloudTrailRawRecord,
    tenantId: string,
    environmentId: string,
    region: string = 'us-east-1',
  ): Promise<CloudNormalizationResult> {
    const ocsfEvent = this.cloudTrailNormalizer.normalizeRecord(
      record,
      tenantId,
      environmentId,
      region,
    );

    await this.emitNormalizedEvent('telemetry.normalized.v1', {
      provider: 'aws-cloudtrail',
      tenantId,
      environmentId,
      event: ocsfEvent,
    });

    return {
      provider: 'aws-cloudtrail',
      tenantId,
      environmentId,
      ocsfClassUid: 6003,
      rawPayloadHash: ocsfEvent.raw_payload_hash,
      normalizedPayload: ocsfEvent,
      timestamp: ocsfEvent.event_timestamp,
    };
  }

  /**
   * Normalizes CrowdStrike Falcon detection payload into canonical OCSF 1007 (Process Activity).
   */
  async normalizeCrowdStrikeDetection(
    payload: CrowdStrikeDetectionPayload,
    tenantId: string,
    environmentId: string,
    region: string = 'us-east-1',
  ): Promise<CloudNormalizationResult> {
    const ocsfEvent = this.crowdStrikeNormalizer.normalizeDetection(
      payload,
      tenantId,
      environmentId,
      region,
    );

    await this.emitNormalizedEvent('telemetry.normalized.v1', {
      provider: 'crowdstrike',
      tenantId,
      environmentId,
      event: ocsfEvent,
    });

    return {
      provider: 'crowdstrike',
      tenantId,
      environmentId,
      ocsfClassUid: ocsfEvent.class_uid,
      rawPayloadHash: ocsfEvent.raw_payload_hash,
      normalizedPayload: ocsfEvent,
      timestamp: ocsfEvent.time,
    };
  }

  private async emitNormalizedEvent(topic: string, data: any): Promise<void> {
    try {
      await this.kafkaProducer.emit(topic, data);
    } catch (err) {
      this.logger.warn(`Kafka publish to ${topic} deferred: ${err}`);
    }
  }
}
