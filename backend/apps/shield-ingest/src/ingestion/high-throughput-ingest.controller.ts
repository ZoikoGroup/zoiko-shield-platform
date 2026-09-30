import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { PublicIngress } from '../security/public-ingress.decorator';
import {
  HighThroughputBatchBufferService,
  BufferedTelemetryEvent,
} from './high-throughput-batch-buffer.service';

export class IngestBatchStreamDto {
  events!: BufferedTelemetryEvent[];
}

@UseGuards(WebhookSignatureGuard)
@PublicIngress()
@Controller('api/v1/ingest/stream')
export class HighThroughputIngestController {
  private readonly logger = new Logger(HighThroughputIngestController.name);

  constructor(
    private readonly batchBufferService: HighThroughputBatchBufferService,
  ) {}

  /**
   * POST /api/v1/ingest/stream/batch
   * Ingest a batch of raw telemetry events with lock-free micro-buffering and dynamic backpressure.
   */
  @Post('batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestBatch(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() dto: IngestBatchStreamDto,
  ) {
    const tenantId = tenantIdHeader || 'tenant-default';
    const rawEvents = Array.isArray(dto?.events) ? dto.events : [];

    this.logger.log(
      `Received batch stream ingest request with ${rawEvents.length} events for tenant ${tenantId}`,
    );

    const result = await this.batchBufferService.ingestBatch(
      tenantId,
      rawEvents,
    );

    return {
      statusCode: HttpStatus.ACCEPTED,
      message: 'Batch stream processed through high-throughput buffer',
      data: result,
    };
  }

  /**
   * GET /api/v1/ingest/stream/metrics
   * Query real-time buffer metrics, queue occupancy, and backpressure state.
   */
  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  getMetrics() {
    const stats = this.batchBufferService.getBufferStats();
    return {
      statusCode: HttpStatus.OK,
      data: stats,
    };
  }
}
