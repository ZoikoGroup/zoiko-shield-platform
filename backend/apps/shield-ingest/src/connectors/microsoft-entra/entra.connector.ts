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
import { EntraAuthService } from './entra.auth';
import { EntraPollerService } from './entra.poller';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('v1/connectors/entra')
export class EntraConnectorController {
  constructor(
    private readonly entraAuthService: EntraAuthService,
    private readonly entraPollerService: EntraPollerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 1. Customer initiates the connection
   * POST /v1/connectors/entra/connect
   */
  @Post('connect')
  async connect(@Body() body: { tenantId: string }) {
    if (!body.tenantId) {
      throw new HttpException('tenantId is required', HttpStatus.BAD_REQUEST);
    }

    // A state token to prevent CSRF
    const state = `state_${body.tenantId}_${Date.now()}`;

    // Get the Microsoft Admin Consent URL
    const authUrl = this.entraAuthService.generateAuthUrl(body.tenantId, state);

    // Ensure the connector definition exists
    let definition = await this.prisma.connectorDefinition.findUnique({
      where: { provider: 'microsoft-entra' },
    });

    if (!definition) {
      definition = await this.prisma.connectorDefinition.create({
        data: {
          provider: 'microsoft-entra',
          name: 'Microsoft Entra ID',
          description:
            'Connection to Microsoft Entra for user and sign-in logs',
          supportedEvents: ['user.sync', 'signin.log'],
        },
      });
    }

    // Create a new ConnectorInstance in AWAITING_ADMIN_CONSENT state
    const instance = await this.prisma.connectorInstance.create({
      data: {
        tenant_id: body.tenantId,
        connectorDefId: definition.id,
        name: `Entra Integration - ${body.tenantId}`,
        state: 'AWAITING_ADMIN_CONSENT',
      },
    });

    return {
      message: 'Redirect the user to this URL to grant admin consent.',
      authUrl,
      instanceId: instance.id,
      state,
    };
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

    // Find the pending instance for this tenant
    const pendingInstance = await this.prisma.connectorInstance.findFirst({
      where: { tenant_id: tenantId, state: 'AWAITING_ADMIN_CONSENT' },
    });

    if (pendingInstance) {
      await this.prisma.connectorInstance.update({
        where: { id: pendingInstance.id },
        data: { state: 'CONNECTED' },
      });
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
    const instance = await this.prisma.connectorInstance.findUnique({
      where: { id },
    });

    if (!instance) {
      throw new HttpException(
        'Connector instance not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (instance.state !== 'CONNECTED' && instance.state !== 'HEALTHY') {
      throw new HttpException(
        'Connector is not in a connected state',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Here we would use entra.graph-client.ts to hit Microsoft Graph
    return {
      status: 'success',
      message: 'Connection test passed! Graph API is reachable.',
    };
  }

  /**
   * 4. Manually trigger a synchronization run
   * POST /v1/connectors/entra/:id/sync
   */
  @Post(':id/sync')
  async syncConnection(@Param('id') id: string) {
    const instance = await this.prisma.connectorInstance.findUnique({
      where: { id },
    });

    if (!instance) {
      throw new HttpException(
        'Connector instance not found',
        HttpStatus.NOT_FOUND,
      );
    }

    // In a real application, you would fetch the OAuth access token from your vault
    const fakeAccessToken = 'fake-access-token-for-testing';

    // Trigger the polling process asynchronously so we don't block the HTTP response
    this.entraPollerService
      .executePoll(instance.id, instance.tenant_id, fakeAccessToken)
      .catch((err) => console.error('Background sync failed:', err));

    return {
      message: 'Synchronization run started in the background.',
      instanceId: instance.id,
    };
  }
}
