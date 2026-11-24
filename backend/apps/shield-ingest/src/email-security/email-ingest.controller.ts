import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EmailReconciliationService } from './email-reconciliation.service';
import { ZoikoMailEventService } from './zoiko-mail-event.service';
import { requireTenantId } from '../security/tenant-context';
import { PublicIngress } from '../security/public-ingress.decorator';

/**
 * shield-core resolves and refreshes the tenant's OAuth token from its vault
 * and passes a short-lived access token per call. Ingest never stores or logs
 * it. Events and coverage denominators are NOT accepted from the caller.
 */
export class TestEmailSourceDto {
  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class SyncEmailSourceDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @IsOptional()
  @IsString()
  cursor?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPages?: number;
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
    private readonly zoikoMailEvents: ZoikoMailEventService,
  ) {}

  @Post('sources/:connectionId/test')
  async testEmailSource(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: TestEmailSourceDto,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const data = await this.reconciliationService.testConnection(
      tenantId,
      connectionId,
      dto?.accessToken,
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
    const data = await this.reconciliationService.syncFromProvider(
      tenantId,
      connectionId,
      {
        accessToken: dto.accessToken,
        cursor: dto.cursor ?? null,
        maxPages: dto.maxPages,
      },
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

  /**
   * Zoiko Mail -> ZoikoShield signed security events (EW06). Zoiko Mail is a
   * separate product, not a Shield workload, and cannot name a Shield tenant
   * (it only holds an opaque tenant_binding_id), so this route is excluded from
   * the workload guard. It is authenticated by the envelope HMAC signature,
   * producer allowlist, freshness window and event_id replay receipt, and is
   * disabled unless EMAIL_ZOIKO_MAIL_INTEGRATION_ENABLED=true.
   */
  @PublicIngress()
  @Post('mail-events')
  async ingestZoikoMailEvent(@Body() body: Record<string, unknown>) {
    const data = await this.zoikoMailEvents.ingest(body);
    return {
      statusCode: data.duplicate ? HttpStatus.OK : HttpStatus.ACCEPTED,
      data,
    };
  }
}
