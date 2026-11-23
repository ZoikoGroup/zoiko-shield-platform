import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';
import { EmailReconciliationService } from './email-reconciliation.service';
import { requireTenantId } from '../security/tenant-context';

export class SyncEmailSourceDto {
  @IsArray()
  events!: unknown[];

  @IsOptional()
  @IsInt()
  expectedCount?: number;
}

export class RequestEmailBackfillDto {
  @IsString()
  actorId!: string;

  @IsString()
  windowStart!: string;

  @IsString()
  windowEnd!: string;

  @IsString()
  reason!: string;
}

/**
 * Internal shield-ingest Email Security endpoints protected by global WorkloadAuthGuard.
 */
@Controller('api/v1/email-ingest')
export class EmailIngestController {
  constructor(
    private readonly reconciliationService: EmailReconciliationService,
  ) {}

  @Post('sources/:connectionId/test')
  async testEmailSource(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('connectionId') connectionId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.reconciliationService.testConnection(
      tenantId,
      connectionId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('sources/:connectionId/sync')
  async syncEmailSource(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: SyncEmailSourceDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.reconciliationService.syncRecords(
      tenantId,
      connectionId,
      dto.events || [],
      { expectedCount: dto.expectedCount },
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('sources/:connectionId/health')
  async getEmailSourceHealth(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('connectionId') connectionId: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.reconciliationService.getSourceHealth(
      tenantId,
      connectionId,
    );
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('sources/:connectionId/backfills')
  async requestEmailBackfill(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: RequestEmailBackfillDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.reconciliationService.requestBackfill(
      tenantId,
      connectionId,
      dto.actorId,
      dto.windowStart,
      dto.windowEnd,
      dto.reason,
    );
    return { statusCode: HttpStatus.CREATED, data };
  }
}
