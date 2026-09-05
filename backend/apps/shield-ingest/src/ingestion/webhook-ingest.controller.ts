import {
  Controller,
  Post,
  Param,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import {
  RawIngestService,
  IngestPayloadDto,
  IngestionResult,
} from './raw-ingest.service';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { PublicIngress } from '../security/public-ingress.decorator';
import { CloudNormalizationBridgeService } from '../normalization/cloud-normalization-bridge.service';
import { EbpfRuntimeMonitorService } from '../ebpf/ebpf-runtime-monitor.service';

@UseGuards(WebhookSignatureGuard)
@PublicIngress()
@Controller('api/v1/ingestion/webhooks')
export class WebhookIngestController {
  private readonly logger = new Logger(WebhookIngestController.name);

  constructor(
    private readonly rawIngestService: RawIngestService,
    @Optional()
    private readonly normalizationBridge?: CloudNormalizationBridgeService,
    @Optional()
    private readonly ebpfRuntimeMonitor?: EbpfRuntimeMonitorService,
  ) {}

  /**
   * Generic endpoint for receiving security event webhooks for a specific connector ID.
   * Path: POST /api/v1/ingestion/webhooks/:connectorId
   */
  @Post(':connectorId')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleWebhook(
    @Param('connectorId') connectorId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: IngestPayloadDto,
  ): Promise<{
    statusCode: number;
    message: string;
    data: IngestionResult;
  }> {
    this.logger.log(
      `Received incoming webhook for connectorId: ${connectorId}`,
    );

    const result = await this.rawIngestService.processWebhookPayload(
      connectorId,
      headers,
      payload,
    );

    return {
      statusCode: HttpStatus.ACCEPTED,
      message:
        result.processingStatus === 'DUPLICATE_IGNORED'
          ? 'Webhook payload already processed (duplicate ignored)'
          : 'Webhook payload accepted for ingestion',
      data: result,
    };
  }

  /**
   * Dedicated endpoint for receiving AWS CloudTrail telemetry batches.
   * Path: POST /api/v1/ingestion/webhooks/cloudtrail/:connectorId
   */
  @Post('cloudtrail/:connectorId')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleCloudTrailWebhook(
    @Param('connectorId') connectorId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: IngestPayloadDto,
  ) {
    this.logger.log(
      `Received AWS CloudTrail webhook batch for connector: ${connectorId}`,
    );
    const result = await this.rawIngestService.processWebhookPayload(
      connectorId,
      headers,
      {
        ...payload,
        eventType: payload.eventType || 'aws.cloudtrail.event',
      },
    );

    if (this.normalizationBridge && payload.Records && Array.isArray(payload.Records)) {
      for (const record of payload.Records) {
        await this.normalizationBridge.normalizeCloudTrailRecord(
          record,
          result.tenantId,
          result.environmentId,
        );
      }
    }

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: 'AWS CloudTrail webhook batch accepted for ingestion and normalization',
      data: result,
    };
  }

  /**
   * Dedicated endpoint for receiving CrowdStrike Falcon detection stream.
   * Path: POST /api/v1/ingestion/webhooks/crowdstrike/:connectorId
   */
  @Post('crowdstrike/:connectorId')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleCrowdStrikeWebhook(
    @Param('connectorId') connectorId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: IngestPayloadDto,
  ) {
    this.logger.log(
      `Received CrowdStrike Falcon telemetry for connector: ${connectorId}`,
    );
    const result = await this.rawIngestService.processWebhookPayload(
      connectorId,
      headers,
      {
        ...payload,
        eventType: payload.eventType || 'crowdstrike.falcon.detection',
      },
    );

    if (this.normalizationBridge && payload.behaviors) {
      await this.normalizationBridge.normalizeCrowdStrikeDetection(
        payload as any,
        result.tenantId,
        result.environmentId,
      );
    }

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: 'CrowdStrike Falcon telemetry accepted for ingestion and normalization',
      data: result,
    };
  }

  /**
   * Dedicated endpoint for receiving Okta System Log event hooks.
   * Path: POST /api/v1/ingestion/webhooks/okta/:connectorId
   */
  @Post('okta/:connectorId')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleOktaWebhook(
    @Param('connectorId') connectorId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: IngestPayloadDto,
  ) {
    this.logger.log(`Received Okta event hook for connector: ${connectorId}`);
    const result = await this.rawIngestService.processWebhookPayload(
      connectorId,
      headers,
      {
        ...payload,
        eventType: payload.eventType || 'okta.system.log',
      },
    );

    if (this.normalizationBridge && payload.actor && payload.outcome) {
      await this.normalizationBridge.normalizeOktaEvent(
        payload as any,
        result.tenantId,
        result.environmentId,
      );
    }

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: 'Okta event hook accepted for ingestion and normalization',
      data: result,
    };
  }

  /**
   * Dedicated endpoint for receiving high-throughput Linux eBPF kernel telemetry probes.
   * Path: POST /api/v1/ingestion/webhooks/ebpf/:connectorId
   */
  @Post('ebpf/:connectorId')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleEbpfWebhook(
    @Param('connectorId') connectorId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() payload: IngestPayloadDto,
  ) {
    this.logger.log(`Received eBPF kernel probe stream for connector: ${connectorId}`);
    const result = await this.rawIngestService.processWebhookPayload(
      connectorId,
      headers,
      {
        ...payload,
        eventType: payload.eventType || 'ebpf.kernel.probe',
      },
    );

    let ebpfFinding: any = null;
    if (this.ebpfRuntimeMonitor && payload.syscall && payload.pid) {
      ebpfFinding = this.ebpfRuntimeMonitor.processEbpfProbe(payload as any);
    }

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: 'eBPF kernel probe telemetry accepted and normalized to OCSF',
      data: result,
      finding: ebpfFinding,
    };
  }
}

