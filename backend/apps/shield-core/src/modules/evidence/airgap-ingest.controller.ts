import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  Headers,
  NotFoundException,
} from '@nestjs/common';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import {
  OfflineTelemetryBufferService,
  type BufferedTelemetryEvent,
} from './offline-telemetry-buffer.service';

export class BufferedTelemetryEventDto implements BufferedTelemetryEvent {
  @IsNumber()
  sequenceNumber!: number;

  @IsString()
  eventId!: string;

  @IsString()
  sourceNodeId!: string;

  @IsString()
  facilityLocation!: string;

  @IsString()
  eventType!: string;

  payload!: Record<string, unknown>;

  @IsString()
  capturedAt!: string;

  @IsString()
  nodeSignature!: string;
}

export class AirgapSyncBatchDto {
  @IsString()
  batchId!: string;

  @IsString()
  sourceNodeId!: string;

  @IsString()
  facilityLocation!: string;

  @IsNumber()
  totalEvents!: number;

  @IsNumber()
  firstSequenceNumber!: number;

  @IsNumber()
  lastSequenceNumber!: number;

  @IsOptional()
  @IsString()
  batchMerkleRoot?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BufferedTelemetryEventDto)
  events!: BufferedTelemetryEventDto[];

  @IsString()
  nodeAttestationSignature!: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/ingest/airgap')
export class AirgapIngestController {
  constructor(private readonly bufferService: OfflineTelemetryBufferService) {}

  /**
   * POST /api/v1/ingest/airgap/batch-sync
   * Ingest and cryptographically verify a batch of offline buffered telemetry from an airgap sensor node.
   */
  @Post('batch-sync')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  async syncBatch(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: AirgapSyncBatchDto,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const receipt = await this.bufferService.syncTelemetryBatch({
      ...dto,
      tenantId,
      batchMerkleRoot: dto.batchMerkleRoot || '',
    });

    return {
      statusCode: HttpStatus.OK,
      data: receipt,
    };
  }

  /**
   * GET /api/v1/ingest/airgap/batch-status/:batchId
   * Retrieve ingestion receipt and verification status for an airgap telemetry batch.
   */
  @Get('batch-status/:batchId')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  getBatchStatus(@Param('batchId') batchId: string) {
    const receipt = this.bufferService.getBatchStatus(batchId);
    if (!receipt) {
      throw new NotFoundException(`Airgap sync batch '${batchId}' not found.`);
    }

    return {
      statusCode: HttpStatus.OK,
      data: receipt,
    };
  }
}
