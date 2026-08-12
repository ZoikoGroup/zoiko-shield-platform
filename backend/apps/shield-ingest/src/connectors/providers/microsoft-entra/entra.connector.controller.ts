import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntraConnectorService } from './entra.connector';
import { EntraAuthService } from './entra.auth';
import { ConnectorSyncService } from '../../services/sync.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('v1/connectors/entra')
export class EntraConnectorController {
  constructor(
    private readonly entraConnectorService: EntraConnectorService,
    private readonly entraAuthService: EntraAuthService,
    private readonly syncService: ConnectorSyncService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 1. Customer initiates the connection
   * POST /v1/connectors/entra/connect
   */
  @Post('connect')
  async connect(@Body() body: { tenantId: string; environmentId?: string; region?: string }) {
    if (!body.tenantId) {
      throw new HttpException('tenantId is required', HttpStatus.BAD_REQUEST);
    }

    return this.entraConnectorService.connect(
      {
        connectorInstanceId: '',
        tenantId: body.tenantId,
        environmentId: body.environmentId ?? 'default-env',
        region: body.region ?? 'unspecified',
        purpose: 'security-monitoring',
        correlationId: randomUUID(),
        traceId: randomUUID(),
      },
      {},
    );
  }

  /**
   * 2. Microsoft redirects back here after consent
   * GET /v1/connectors/entra/callback
   */
  @Get('callback')
  async callback(
    @Query('admin_consent') adminConsent: string,
    @Query('tenant') entraTenantId: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
  ) {
    if (error) {
      throw new HttpException(
        `Microsoft Consent Error: ${errorDescription}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Very basic state extraction (in production, we'd look this up from a Redis cache or DB using the exact state string)
    const tenantId = state.split('_')[1];

    const isSuccess = this.entraAuthService.verifyAdminConsent(entraTenantId, adminConsent);
    if (!isSuccess) {
      throw new HttpException(
        'Admin consent was not successfully granted.',
        HttpStatus.FORBIDDEN,
      );
    }

    const pendingInstance = await this.prisma.connectorInstance.findFirst({
      where: { tenant_id: tenantId, state: 'AWAITING_ADMIN_CONSENT' },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingInstance) {
      await this.entraConnectorService.completeConsent(pendingInstance.id, entraTenantId);
    }

    return {
      message: 'Successfully connected to Microsoft Entra ID!',
      entraTenantId,
      zoikoTenantId: tenantId,
    };
  }

  /**
   * 3. Test the connection
   * POST /v1/connectors/entra/:id/test
   */
  @Post(':id/test')
  async testConnection(@Param('id') id: string) {
    const instance = await this.prisma.connectorInstance.findUnique({ where: { id } });
    if (!instance) {
      throw new HttpException('Connector instance not found', HttpStatus.NOT_FOUND);
    }

    return this.entraConnectorService.testConnection({
      connectorInstanceId: instance.id,
      tenantId: instance.tenant_id,
      environmentId: instance.environment_id,
      region: instance.source_region ?? 'unspecified',
      purpose: 'security-monitoring',
      correlationId: randomUUID(),
      traceId: randomUUID(),
    });
  }

  /**
   * 4. Manually trigger a synchronization run (scheduler also calls this path automatically)
   * POST /v1/connectors/entra/:id/sync
   */
  @Post(':id/sync')
  async syncConnection(@Param('id') id: string) {
    const instance = await this.prisma.connectorInstance.findUnique({ where: { id } });
    if (!instance) {
      throw new HttpException('Connector instance not found', HttpStatus.NOT_FOUND);
    }

    this.syncService.runSync(instance.id).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Background sync failed:', err);
    });

    return {
      message: 'Synchronization run started in the background.',
      instanceId: instance.id,
    };
  }
}
