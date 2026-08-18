import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { EntraConnectorService } from './entra.connector';
import { EntraAuthService } from './entra.auth';
import { ConnectorSyncService } from '../../services/sync.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PublicIngress } from '../../../security/public-ingress.decorator';
import {
  requireEnvironmentId,
  requireRegion,
  requireTenantId,
} from '../../../security/tenant-context';

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
  async connect(
    @Body() body: { tenantId: string; environmentId: string; region: string },
  ) {
    return this.entraConnectorService.connect(
      {
        connectorInstanceId: '',
        tenantId: requireTenantId(body.tenantId),
        environmentId: requireEnvironmentId(body.environmentId),
        region: requireRegion(body.region),
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
  @PublicIngress()
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

    const stateRecord = await this.prisma.connectorOauthState.findFirst({
      where: {
        state_hash: createHash('sha256')
          .update(state || '')
          .digest('hex'),
        consumed_at: null,
        expires_at: { gt: new Date() },
      },
    });
    if (!stateRecord) {
      throw new HttpException(
        'OAuth state is invalid, expired, or already used',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isSuccess = this.entraAuthService.verifyAdminConsent(
      entraTenantId,
      adminConsent,
    );
    if (!isSuccess) {
      throw new HttpException(
        'Admin consent was not successfully granted.',
        HttpStatus.FORBIDDEN,
      );
    }

    const pendingInstance = await this.prisma.connectorInstance.findFirst({
      where: {
        id: stateRecord.instance_id,
        tenant_id: stateRecord.tenant_id,
        state: 'AWAITING_ADMIN_CONSENT',
      },
    });

    if (!pendingInstance)
      throw new HttpException(
        'Pending connector instance not found',
        HttpStatus.NOT_FOUND,
      );
    await this.prisma.connectorOauthState.update({
      where: { id: stateRecord.id },
      data: { consumed_at: new Date() },
    });
    await this.entraConnectorService.completeConsent(
      pendingInstance.id,
      entraTenantId,
    );

    return {
      message: 'Successfully connected to Microsoft Entra ID!',
      entraTenantId,
      zoikoTenantId: stateRecord.tenant_id,
    };
  }

  /**
   * 3. Test the connection
   * POST /v1/connectors/entra/:id/test
   */
  @Post(':id/test')
  async testConnection(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const instance = await this.prisma.connectorInstance.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!instance) {
      throw new HttpException(
        'Connector instance not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.entraConnectorService.testConnection({
      connectorInstanceId: instance.id,
      tenantId: instance.tenant_id,
      environmentId: instance.environment_id,
      region: requireRegion(instance.source_region),
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
  async syncConnection(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('id') id: string,
  ) {
    const tenantId = requireTenantId(headerTenantId);
    const instance = await this.prisma.connectorInstance.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!instance) {
      throw new HttpException(
        'Connector instance not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const syncRun = await this.syncService.runSync(instance.id);

    return {
      message: 'Synchronization run completed.',
      instanceId: instance.id,
      syncRun,
    };
  }
}
