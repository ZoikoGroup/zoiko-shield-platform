import {
  Controller,
  Post,
  Param,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { RawIngestService, IngestPayloadDto, IngestionResult } from './raw-ingest.service';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';

@UseGuards(WebhookSignatureGuard)
@Controller('api/v1/ingestion/webhooks')
export class WebhookIngestController {
  private readonly logger = new Logger(WebhookIngestController.name);

  constructor(private readonly rawIngestService: RawIngestService) {}

  /**
   * Endpoint for receiving security event webhooks for a specific connector ID.
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
    this.logger.log(`Received incoming webhook for connectorId: ${connectorId}`);

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
}
